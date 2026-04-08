/*
 [INPUT]: 003_task_rpc.sql 中的 5 个 RPC、001_create_tables.sql 中的 sessions 表定义
 [OUTPUT]: 解耦专注与任务：schema 变更 + 4 个新 RPC + 3 个 RPC 重写
 [POS]: 位于 supabase/migrations，紧随 003_task_rpc.sql 执行
 [PROTOCOL]: 变更时更新此头部，然后检查 supabase/migrations/CLAUDE.md 与 /CLAUDE.md
*/

begin;

/* ================================================================
   PART 1 — Schema: 解除根耦合
   ================================================================ */

-- sessions.task_template_id: NOT NULL → NULLABLE
-- 允许无任务的纯专注 session
alter table public.sessions
  alter column task_template_id drop not null;

-- 记录任务解绑原因（任务完成 / 资源耗尽 / 手动解绑）
alter table public.sessions
  add column task_unbind_reason text
  check (
    task_unbind_reason is null
    or task_unbind_reason in ('task_completed', 'resource_exhausted', 'manual_unbind')
  );

/* ================================================================
   PART 2 — 新 RPC: rpc_create_free_session
   创建无任务的 pending session
   ================================================================ */

create or replace function public.rpc_create_free_session(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  -- 唯一活跃 session 约束（与 rpc_join_task 一致）
  if exists (
    select 1
    from public.sessions
    where user_id = p_user_id
      and status in ('pending', 'active')
  ) then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
  end if;

  insert into public.sessions (
    user_id,
    task_template_id,
    task_instance_id,
    status
  ) values (
    p_user_id,
    null,
    null,
    'pending'
  )
  returning id into v_session_id;

  return v_session_id;
exception
  when unique_violation then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
end;
$$;

/* ================================================================
   PART 3 — 新 RPC: rpc_bind_task
   给已有 session 绑定 / 切换任务
   关键：session 已 active 且绑 build → 立即扣 build_cost
   ================================================================ */

create or replace function public.rpc_bind_task(
  p_user_id uuid,
  p_session_id uuid,
  p_template_id uuid,
  p_instance_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_template public.task_templates%rowtype;
  v_build_coal integer;
  v_build_wood integer;
  v_build_steel integer;
  v_required_raw_food integer;
  v_now timestamptz := timezone('utc', now());
begin
  -- 1. 校验 session
  select *
  into v_session
  from public.sessions
  where id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Session not found.');
  end if;

  if v_session.status = 'ended' then
    perform public.rpc_raise('CONFLICT', 'Session already ended.');
  end if;

  -- 2. 校验 template
  select *
  into v_template
  from public.task_templates
  where id = p_template_id
    and enabled = true;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  if v_template.code = 'medical-shift' then
    perform public.rpc_raise('NO_PATIENTS', 'No patients available.');
  end if;

  -- 3. 类型校验
  if v_template.type in ('collect', 'convert') then
    if p_instance_id is not null then
      perform public.rpc_raise('VALIDATION_ERROR', 'instanceId must be null for collect or convert tasks.');
    end if;

    if v_template.type = 'convert' then
      v_required_raw_food := coalesce((v_template.heartbeat_cost ->> 'raw_food')::integer, 0);

      perform 1
      from public.city_resources
      where id = 1
        and raw_food >= v_required_raw_food;

      if not found then
        perform public.rpc_raise('INSUFFICIENT_RESOURCE', 'Not enough raw food.');
      end if;
    end if;
  else
    -- build / work: 必须有 instance
    if p_instance_id is null then
      perform public.rpc_raise('VALIDATION_ERROR', 'instanceId is required for build or work tasks.');
    end if;

    perform 1
    from public.task_instances
    where id = p_instance_id
      and template_id = p_template_id
      and status = 'active';

    if not found then
      perform public.rpc_raise('NOT_FOUND', 'Task instance not found.');
    end if;

    -- 加入参与者
    insert into public.task_participants (user_id, instance_id)
    values (p_user_id, p_instance_id)
    on conflict (user_id, instance_id) do nothing;
  end if;

  -- 4. 关键：session 已 active 且绑 build → 立即扣 build_cost
  if v_session.status = 'active' and v_template.type = 'build' then
    v_build_coal := coalesce((v_template.build_cost ->> 'coal')::integer, 0);
    v_build_wood := coalesce((v_template.build_cost ->> 'wood')::integer, 0);
    v_build_steel := coalesce((v_template.build_cost ->> 'steel')::integer, 0);

    perform 1
    from public.city_resources
    where id = 1
      and coal >= v_build_coal
      and wood >= v_build_wood
      and steel >= v_build_steel
    for update;

    if not found then
      perform public.rpc_raise('INSUFFICIENT_RESOURCE', 'Not enough city resources to start build.');
    end if;

    update public.city_resources
    set coal = coal - v_build_coal,
        wood = wood - v_build_wood,
        steel = steel - v_build_steel,
        updated_at = v_now
    where id = 1;
  end if;

  -- 5. 绑定任务
  update public.sessions
  set task_template_id = p_template_id,
      task_instance_id = p_instance_id,
      task_unbind_reason = null,
      end_reason = null,
      last_heartbeat_at = v_now
  where id = v_session.id;

  return jsonb_build_object(
    'templateId', v_template.id,
    'instanceId', p_instance_id,
    'taskName', v_template.name,
    'taskType', v_template.type,
    'district', v_template.district
  );
end;
$$;

/* ================================================================
   PART 4 — 新 RPC: rpc_unbind_task
   解绑任务，写 city_log（如果是 task_completed）
   ================================================================ */

create or replace function public.rpc_unbind_task(
  p_user_id uuid,
  p_session_id uuid,
  p_unbind_reason text default 'manual_unbind'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_template public.task_templates%rowtype;
  v_username text;
  v_resource text;
  v_amount integer;
  v_action_desc text;
begin
  if p_unbind_reason not in ('task_completed', 'resource_exhausted', 'manual_unbind') then
    perform public.rpc_raise('VALIDATION_ERROR', 'Invalid unbind reason.');
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

  if v_session.status <> 'active' then
    perform public.rpc_raise('CONFLICT', 'Session is not active.');
  end if;

  if v_session.task_template_id is null then
    perform public.rpc_raise('CONFLICT', 'No task bound to this session.');
  end if;

  -- 写 city_log（任务完成或资源耗尽时记录）
  if p_unbind_reason in ('task_completed', 'resource_exhausted') then
    select username::text
    into v_username
    from public.users
    where id = v_session.user_id;

    select *
    into v_template
    from public.task_templates
    where id = v_session.task_template_id;

    if found then
      if v_template.type in ('collect', 'convert') then
        v_resource := coalesce(v_template.output_resource, 'progress');
        v_amount := v_session.total_heartbeats * v_template.output_per_heartbeat;
        v_action_desc := format(
          '完成了%s，为新伦敦贡献了%s%s%s。',
          v_template.name,
          v_amount,
          public.rpc_resource_unit(v_resource),
          public.rpc_resource_label(v_resource)
        );
      else
        v_amount := v_session.total_minutes;
        v_action_desc := format(
          '完成了%s，为新伦敦贡献了%s分钟施工进度。',
          v_template.name,
          v_amount
        );
      end if;

      insert into public.city_logs (user_label, action_desc)
      values (v_username, v_action_desc);
    end if;
  end if;

  -- 解绑
  update public.sessions
  set task_template_id = null,
      task_instance_id = null,
      task_unbind_reason = p_unbind_reason,
      end_reason = null
  where id = v_session.id;
end;
$$;

/* ================================================================
   PART 5 — 新 RPC: rpc_assign_next_task_to_session
   复用 assign-next 优先级，绑定到现有 session
   ================================================================ */

create or replace function public.rpc_assign_next_task_to_session(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_user public.users%rowtype;
  v_resources public.city_resources%rowtype;
  v_template public.task_templates%rowtype;
  v_instance public.task_instances%rowtype;
  v_lowest_resource text := 'coal';
  v_lowest_amount integer := 0;
  v_bind_result jsonb;
begin
  -- 校验 session
  select *
  into v_session
  from public.sessions
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active';

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Active session not found.');
  end if;

  -- 校验用户 auto_assign
  select *
  into v_user
  from public.users
  where id = p_user_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'User not found.');
  end if;

  if not v_user.auto_assign then
    perform public.rpc_raise('FORBIDDEN', 'Auto assign is disabled.');
  end if;

  -- 读取资源
  select *
  into v_resources
  from public.city_resources
  where id = 1
  for update;

  -- 优先级逻辑（与 rpc_assign_next_task 一致）
  if v_resources.food_supply = 0 then
    if v_resources.raw_food > 0 then
      select * into v_template
      from public.task_templates
      where code = 'cookhouse-shift';
    else
      select * into v_template
      from public.task_templates
      where code = 'hunt';
    end if;
  else
    -- 尝试现有建造实例
    select ti.*
    into v_instance
    from public.task_instances ti
    join public.task_templates tt on tt.id = ti.template_id
    where ti.status = 'active'
      and tt.type = 'build'
    order by ti.created_at asc
    limit 1;

    if found then
      select * into v_template
      from public.task_templates
      where id = v_instance.template_id;
    else
      -- 最低资源采集
      v_lowest_amount := v_resources.coal;

      if v_resources.wood < v_lowest_amount then
        v_lowest_resource := 'wood';
        v_lowest_amount := v_resources.wood;
      end if;

      if v_resources.steel < v_lowest_amount then
        v_lowest_resource := 'steel';
        v_lowest_amount := v_resources.steel;
      end if;

      if v_resources.raw_food < v_lowest_amount then
        v_lowest_resource := 'raw_food';
      end if;

      if v_lowest_resource = 'raw_food' then
        select * into v_template
        from public.task_templates
        where code = 'hunt';
      else
        select * into v_template
        from public.task_templates
        where type = 'collect'
          and output_resource = v_lowest_resource;
      end if;
    end if;
  end if;

  if v_template.id is null then
    perform public.rpc_raise('NOT_FOUND', 'No assignable task found.');
  end if;

  -- 调用 rpc_bind_task
  v_bind_result := public.rpc_bind_task(
    p_user_id,
    p_session_id,
    v_template.id,
    case when v_template.type in ('build', 'work') then v_instance.id else null end
  );

  return v_bind_result;
end;
$$;

/* ================================================================
   PART 6 — 重写 rpc_session_heartbeat
   核心行为变更：任务完成时 unbind 而非结束 session
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

  /* ── 重入守卫：任务已解绑（上一次 heartbeat 完成了任务） ── */
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
      -- 资源耗尽 → unbind 任务，session 继续
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

    -- 检查下次是否还够
    if (select raw_food from public.city_resources where id = 1) < v_raw_food_cost then
      -- 下次 heartbeat 将不够 → 提前 unbind
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

    -- unbind 任务，session 继续
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
   PART 7 — 重写 rpc_start_session
   taskless 时跳过资源预扣
   ================================================================ */

create or replace function public.rpc_start_session(
  p_user_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_template public.task_templates%rowtype;
  v_instance public.task_instances%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_build_coal integer;
  v_build_wood integer;
  v_build_steel integer;
  v_build_raw_food integer;
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

  if v_session.status = 'ended' then
    perform public.rpc_raise('CONFLICT', 'Session already ended.');
  end if;

  -- 幂等：已 active 直接返回
  if v_session.status = 'active' then
    return;
  end if;

  -- taskless session → 直接启动，无需资源校验
  if v_session.task_template_id is null then
    update public.sessions
    set status = 'active',
        started_at = coalesce(started_at, v_now),
        last_heartbeat_at = coalesce(last_heartbeat_at, v_now),
        end_reason = null
    where id = v_session.id;
    return;
  end if;

  -- 有任务 → 原有逻辑
  select *
  into v_template
  from public.task_templates
  where id = v_session.task_template_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  if v_template.code = 'medical-shift' then
    perform public.rpc_raise('NO_PATIENTS', 'No patients available.');
  end if;

  if v_session.task_instance_id is not null then
    select *
    into v_instance
    from public.task_instances
    where id = v_session.task_instance_id
    for update;

    if not found or v_instance.status <> 'active' then
      perform public.rpc_raise('CONFLICT', 'Task instance is no longer active.');
    end if;
  end if;

  if v_template.type = 'build' then
    v_build_coal := coalesce((v_template.build_cost ->> 'coal')::integer, 0);
    v_build_wood := coalesce((v_template.build_cost ->> 'wood')::integer, 0);
    v_build_steel := coalesce((v_template.build_cost ->> 'steel')::integer, 0);

    perform 1
    from public.city_resources
    where id = 1
      and coal >= v_build_coal
      and wood >= v_build_wood
      and steel >= v_build_steel
    for update;

    if not found then
      perform public.rpc_raise('INSUFFICIENT_RESOURCE', 'Not enough city resources to start build.');
    end if;

    update public.city_resources
    set coal = coal - v_build_coal,
        wood = wood - v_build_wood,
        steel = steel - v_build_steel,
        updated_at = v_now
    where id = 1;
  elsif v_template.type = 'convert' then
    v_build_raw_food := coalesce((v_template.heartbeat_cost ->> 'raw_food')::integer, 0);

    perform 1
    from public.city_resources
    where id = 1
      and raw_food >= v_build_raw_food
    for update;

    if not found then
      perform public.rpc_raise('INSUFFICIENT_RESOURCE', 'Not enough raw food to start convert task.');
    end if;
  end if;

  update public.sessions
  set status = 'active',
      started_at = coalesce(started_at, v_now),
      last_heartbeat_at = coalesce(last_heartbeat_at, v_now),
      end_reason = null
  where id = v_session.id;
end;
$$;

/* ================================================================
   PART 8 — 重写 rpc_end_session
   taskless 时生成自由专注叙事
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
  v_action_desc text;
  v_building_name text;
  v_participants_label text;
  v_building_completed boolean := false;
  v_should_insert_log boolean := false;
  v_requested_end_reason text;
  v_has_task boolean;
begin
  if p_end_reason is not null and p_end_reason not in ('timer_completed', 'manual_stop') then
    perform public.rpc_raise('VALIDATION_ERROR', 'endReason must be timer_completed or manual_stop.');
  end if;

  v_requested_end_reason := p_end_reason;

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
    v_end_reason := coalesce(v_session.end_reason, v_requested_end_reason, 'timer_completed');
    v_should_insert_log := true;

    update public.sessions
    set status = 'ended',
        ended_at = coalesce(ended_at, v_now),
        end_reason = v_end_reason
    where id = v_session.id;

    v_session.status := 'ended';
    v_session.ended_at := coalesce(v_session.ended_at, v_now);
    v_session.end_reason := v_end_reason;
  else
    v_end_reason := coalesce(v_session.end_reason, 'timer_completed');
  end if;

  /* ── 叙事生成 ── */
  if not v_has_task then
    -- 自由专注叙事（客户端跳过 heartbeat API，total_minutes 不可靠，用时间戳差值）
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
    v_action_desc := format(
      '完成了一次自由专注，共计%s分钟。',
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
    v_action_desc := format(
      '完成了%s，为新伦敦贡献了%s%s%s。',
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
    v_action_desc := format(
      '完成了%s，为新伦敦贡献了%s分钟施工进度。',
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

  if v_should_insert_log then
    insert into public.city_logs (user_label, action_desc)
    values (v_username, v_action_desc);
  end if;

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

commit;
