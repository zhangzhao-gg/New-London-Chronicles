/* ================================================================
   005 — heartbeat 写日志 + end_session 去日志

   1. rpc_session_heartbeat：collect/convert/build·work 正常心跳写 city_logs
   2. rpc_end_session：手动停止不再写汇总日志（heartbeat 已逐条记录）
   ================================================================ */

create or replace function public.rpc_session_heartbeat(
  p_user_id uuid,
  p_session_id uuid
)
returns table (
  session_id uuid,
  task_type text,
  contribution jsonb,
  task_ended boolean,
  building_completed boolean,
  completed_building_name text,
  remaining_minutes integer,
  end_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_template public.task_templates%rowtype;
  v_instance public.task_instances%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_output integer := 0;
  v_raw_food_cost integer := 0;
  v_new_remaining integer := 0;
  v_building_name text;
  v_participants_label text;
  v_username text;
begin
  select *
  into v_session
  from public.sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Session not found.');
  end if;

  if v_session.status <> 'active' then
    perform public.rpc_raise('CONFLICT', 'Only active sessions can send heartbeat.');
  end if;

  /* ── 防御路径：无任务 → 仅 tick counters ── */
  if v_session.task_template_id is null then
    update public.sessions
    set total_heartbeats = total_heartbeats + 1,
        total_minutes = total_minutes + 10,
        last_heartbeat_at = v_now
    where id = v_session.id;

    return query
    select
      v_session.id,
      'free'::text,
      public.rpc_contribution_json(10, 0, 0, 0, 0, 0),
      false,
      false,
      null::text,
      0,
      null::text;
    return;
  end if;

  /* ── 加载 template ── */
  select *
  into v_template
  from public.task_templates
  where id = v_session.task_template_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  /* ── 查询用户名（用于日志） ── */
  select username::text into v_username
  from public.users
  where id = p_user_id;

  /* ── 重入守卫：任务已解绑 ── */
  if v_session.task_unbind_reason is not null then
    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
      true,
      v_session.task_unbind_reason = 'task_completed',
      null::text,
      0,
      v_session.task_unbind_reason;
    return;
  end if;

  /* ── collect ── */
  if v_template.type = 'collect' then
    v_output := v_template.output_per_heartbeat;

    perform 1
    from public.city_resources
    where id = 1
    for update;

    update public.city_resources
    set coal = coal + case when v_template.output_resource = 'coal' then v_output else 0 end,
        wood = wood + case when v_template.output_resource = 'wood' then v_output else 0 end,
        steel = steel + case when v_template.output_resource = 'steel' then v_output else 0 end,
        raw_food = raw_food + case when v_template.output_resource = 'raw_food' then v_output else 0 end,
        food_supply = food_supply + case when v_template.output_resource = 'food_supply' then v_output else 0 end,
        updated_at = v_now
    where id = 1;

    update public.sessions
    set total_heartbeats = total_heartbeats + 1,
        total_minutes = total_minutes + 10,
        last_heartbeat_at = v_now
    where id = v_session.id;

    insert into public.city_logs (user_label, action_desc)
    values (
      v_username,
      format('采集了%s%s%s。',
        v_output,
        public.rpc_resource_unit(v_template.output_resource),
        public.rpc_resource_label(v_template.output_resource)
      )
    );

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(
        10,
        case when v_template.output_resource = 'coal' then v_output else 0 end,
        case when v_template.output_resource = 'wood' then v_output else 0 end,
        case when v_template.output_resource = 'steel' then v_output else 0 end,
        case when v_template.output_resource = 'raw_food' then v_output else 0 end,
        case when v_template.output_resource = 'food_supply' then v_output else 0 end
      ),
      false,
      false,
      null::text,
      0,
      null::text;
    return;
  end if;

  /* ── convert ── */
  if v_template.type = 'convert' then
    v_raw_food_cost := coalesce((v_template.heartbeat_cost ->> 'raw_food')::integer, 0);
    v_output := v_template.output_per_heartbeat;

    perform 1
    from public.city_resources
    where id = 1
      and raw_food >= v_raw_food_cost
    for update;

    if not found then
      perform public.rpc_unbind_task(p_user_id, p_session_id, 'resource_exhausted');

      return query
      select
        v_session.id,
        v_template.type,
        public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
        true,
        false,
        null::text,
        0,
        'resource_exhausted'::text;
      return;
    end if;

    update public.city_resources
    set raw_food = raw_food - v_raw_food_cost,
        food_supply = food_supply + v_output,
        updated_at = v_now
    where id = 1;

    update public.sessions
    set total_heartbeats = total_heartbeats + 1,
        total_minutes = total_minutes + 10,
        last_heartbeat_at = v_now
    where id = v_session.id;

    insert into public.city_logs (user_label, action_desc)
    values (
      v_username,
      format('加工了%s份食物配给（消耗%s份生食材）。', v_output, v_raw_food_cost)
    );

    -- 检查下次是否还够
    if (select raw_food from public.city_resources where id = 1) < v_raw_food_cost then
      perform public.rpc_unbind_task(p_user_id, p_session_id, 'resource_exhausted');

      return query
      select
        v_session.id,
        v_template.type,
        public.rpc_contribution_json(10, 0, 0, 0, -v_raw_food_cost, v_output),
        true,
        false,
        null::text,
        0,
        'resource_exhausted'::text;
      return;
    end if;

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(10, 0, 0, 0, -v_raw_food_cost, v_output),
      false,
      false,
      null::text,
      0,
      null::text;
    return;
  end if;

  /* ── build / work ── */
  if v_session.task_instance_id is null then
    perform public.rpc_raise('CONFLICT', 'Task instance is required for build and work sessions.');
  end if;

  select *
  into v_instance
  from public.task_instances
  where id = v_session.task_instance_id
  for update;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task instance not found.');
  end if;

  -- 实例已被其他人完成
  if v_instance.status = 'completed' then
    select b.name
    into v_building_name
    from public.buildings b
    where b.instance_id = v_instance.id;

    perform public.rpc_unbind_task(p_user_id, p_session_id, 'task_completed');

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
      true,
      v_template.type = 'build',
      v_building_name,
      0,
      'task_completed'::text;
    return;
  end if;

  -- 正常推进
  v_output := v_template.output_per_heartbeat;
  v_new_remaining := greatest(v_instance.remaining_minutes - v_output, 0);

  update public.task_instances
  set progress_minutes = progress_minutes + v_output,
      remaining_minutes = v_new_remaining,
      status = case when v_new_remaining = 0 then 'completed' else status end,
      completed_at = case when v_new_remaining = 0 then v_now else completed_at end
  where id = v_instance.id;

  update public.sessions
  set total_heartbeats = total_heartbeats + 1,
      total_minutes = total_minutes + v_output,
      last_heartbeat_at = v_now
  where id = v_session.id;

  insert into public.city_logs (user_label, action_desc)
  values (
    v_username,
    case
      when v_new_remaining = 0 then format('完成了%s的建设！', v_template.name)
      else format('推进了%s的建设（剩余%s分钟）。', v_template.name, v_new_remaining)
    end
  );

  -- 建造完成
  if v_new_remaining = 0 then
    if v_template.type = 'build' then
      v_participants_label := public.rpc_participants_label(v_instance.id);
      v_building_name := v_participants_label || '的' || public.rpc_building_base_name(v_template.name);

      insert into public.buildings (
        instance_id, name, participants_label, completed_at, slot_id, district
      ) values (
        v_instance.id,
        v_building_name,
        v_participants_label,
        v_now,
        coalesce(v_instance.slot_id, 'unknown-slot'),
        v_template.district
      )
      on conflict (instance_id) do update
      set name = excluded.name,
          participants_label = excluded.participants_label,
          completed_at = excluded.completed_at,
          slot_id = excluded.slot_id,
          district = excluded.district;
    end if;

    perform public.rpc_unbind_task(p_user_id, p_session_id, 'task_completed');

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(10, 0, 0, 0, 0, 0),
      true,
      v_template.type = 'build',
      v_building_name,
      v_new_remaining,
      'task_completed'::text;
    return;
  end if;

  return query
  select
    v_session.id,
    v_template.type,
    public.rpc_contribution_json(10, 0, 0, 0, 0, 0),
    false,
    false,
    null::text,
    v_new_remaining,
    null::text;
end;
$$;


/* ================================================================
   PART 2 — 重写 rpc_end_session
   手动停止不再写 city_logs（heartbeat 已逐条记录）
   同步移除 timer_completed 验证（客户端只发 manual_stop）
   ================================================================ */

create or replace function public.rpc_end_session(
  p_user_id uuid,
  p_session_id uuid,
  p_end_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_template public.task_templates%rowtype;
  v_username text;
  v_now timestamptz := timezone('utc', now());
  v_end_reason text;
  v_resource text;
  v_amount integer;
  v_narrative text;
  v_building_name text;
  v_participants_label text;
  v_building_completed boolean := false;
  v_has_task boolean;
begin
  if p_end_reason is not null and p_end_reason <> 'manual_stop' then
    perform public.rpc_raise('VALIDATION_ERROR', 'endReason must be manual_stop.');
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Session not found.');
  end if;

  select username::text
  into v_username
  from public.users
  where id = v_session.user_id;

  v_has_task := v_session.task_template_id is not null;

  if v_has_task then
    select *
    into v_template
    from public.task_templates
    where id = v_session.task_template_id;

    if not found then
      v_has_task := false;
    end if;
  end if;

  if v_session.status <> 'ended' then
    v_end_reason := coalesce(v_session.end_reason, p_end_reason, 'manual_stop');

    update public.sessions
    set status = 'ended',
        ended_at = coalesce(ended_at, v_now),
        end_reason = v_end_reason
    where id = v_session.id;

    v_session.status := 'ended';
    v_session.ended_at := coalesce(v_session.ended_at, v_now);
    v_session.end_reason := v_end_reason;
  else
    v_end_reason := coalesce(v_session.end_reason, 'manual_stop');
  end if;

  /* ── 叙事生成（仅用于客户端 toast，不写日志） ── */
  if not v_has_task then
    v_resource := 'focus';
    v_amount := greatest(
      extract(epoch from (coalesce(v_session.ended_at, v_now) - v_session.started_at))::integer / 60,
      0
    );
    v_narrative := format(
      '%s完成了一次自由专注，共计%s分钟。',
      v_username,
      v_amount
    );
  elsif v_template.type in ('collect', 'convert') then
    v_resource := coalesce(v_template.output_resource, 'progress');
    v_amount := v_session.total_heartbeats * v_template.output_per_heartbeat;
    v_narrative := format(
      '%s完成了%s，为新伦敦贡献了%s%s%s。',
      v_username,
      v_template.name,
      v_amount,
      public.rpc_resource_unit(v_resource),
      public.rpc_resource_label(v_resource)
    );
  else
    v_resource := 'progress';
    v_amount := v_session.total_minutes;
    v_narrative := format(
      '%s完成了%s，为新伦敦贡献了%s分钟施工进度。',
      v_username,
      v_template.name,
      v_amount
    );
  end if;

  if v_has_task and v_template.type = 'build' and v_session.task_instance_id is not null then
    select b.name, b.participants_label
    into v_building_name, v_participants_label
    from public.buildings b
    where b.instance_id = v_session.task_instance_id;

    v_building_completed := v_building_name is not null;
  end if;

  /* 不再写 city_logs — heartbeat 已逐条记录贡献 */

  return jsonb_build_object(
    'sessionId', v_session.id,
    'endReason', v_end_reason,
    'resource', v_resource,
    'amount', v_amount,
    'narrative', v_narrative,
    'buildingCompleted', v_building_completed,
    'buildingName', v_building_name,
    'participantsLabel', v_participants_label
  );
end;
$$;
