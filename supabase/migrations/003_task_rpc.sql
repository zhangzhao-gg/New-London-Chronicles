/*
 [INPUT]: docs/02-database-schema.md、docs/03-api-contracts.md、docs/04-modules.md 中 M04 的 RPC 与写接口规则
 [OUTPUT]: 创建任务参与、自动分配、开始、心跳、结束所需的 `public.rpc_*` 数据库函数
 [POS]: 位于 supabase/migrations，紧随 `002_seed_task_templates.sql` 执行
 [PROTOCOL]: 变更时更新此头部，然后检查 supabase/migrations/CLAUDE.md 与 /CLAUDE.md
*/

begin;

create or replace function public.rpc_raise(p_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using message = p_code, detail = p_message;
end;
$$;

create or replace function public.rpc_resource_label(p_resource text)
returns text
language sql
immutable
as $$
  select case p_resource
    when 'coal' then '煤炭'
    when 'wood' then '木材'
    when 'steel' then '钢材'
    when 'raw_food' then '生食材'
    when 'food_supply' then '食物配给'
    when 'progress' then '施工进度'
    else p_resource
  end;
$$;

create or replace function public.rpc_resource_unit(p_resource text)
returns text
language sql
immutable
as $$
  select case p_resource
    when 'coal' then '单位'
    when 'wood' then '单位'
    when 'steel' then '单位'
    when 'raw_food' then '份'
    when 'food_supply' then '份'
    when 'progress' then '分钟'
    else '单位'
  end;
$$;

create or replace function public.rpc_building_base_name(p_task_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(p_task_name, '^建造', '');
$$;

create or replace function public.rpc_participants_label(p_instance_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    string_agg(u.username::text, '&' order by tp.joined_at asc, u.username::text asc),
    '无名工队'
  )
  from public.task_participants tp
  join public.users u on u.id = tp.user_id
  where tp.instance_id = p_instance_id;
$$;

create or replace function public.rpc_contribution_json(
  p_minutes integer,
  p_coal integer,
  p_wood integer,
  p_steel integer,
  p_raw_food integer,
  p_food_supply integer
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'minutes', p_minutes,
    'resources', jsonb_build_object(
      'coal', p_coal,
      'wood', p_wood,
      'steel', p_steel,
      'rawFood', p_raw_food,
      'foodSupply', p_food_supply
    )
  );
$$;

create or replace function public.rpc_join_task(
  p_user_id uuid,
  p_template_id uuid,
  p_instance_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.task_templates%rowtype;
  v_session_id uuid;
  v_required_raw_food integer;
begin
  select *
  into v_template
  from public.task_templates
  where id = p_template_id
    and enabled = true;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  if exists (
    select 1
    from public.sessions
    where user_id = p_user_id
      and status in ('pending', 'active')
  ) then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
  end if;

  if v_template.code = 'medical-shift' then
    perform public.rpc_raise('NO_PATIENTS', 'No patients available.');
  end if;

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

    insert into public.task_participants (user_id, instance_id)
    values (p_user_id, p_instance_id)
    on conflict (user_id, instance_id) do nothing;
  end if;

  insert into public.sessions (
    user_id,
    task_template_id,
    task_instance_id,
    status
  ) values (
    p_user_id,
    p_template_id,
    p_instance_id,
    'pending'
  )
  returning id into v_session_id;

  return v_session_id;
exception
  when unique_violation then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
end;
$$;

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

  if v_session.status = 'active' then
    return;
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
  v_session_end_reason text;
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

  select *
  into v_template
  from public.task_templates
  where id = v_session.task_template_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  if v_session.end_reason in ('resource_exhausted', 'building_completed', 'timeout') then
    select b.name
    into v_building_name
    from public.buildings b
    where b.instance_id = v_session.task_instance_id;

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
      true,
      v_session.end_reason = 'building_completed',
      v_building_name,
      0,
      v_session.end_reason;
    return;
  end if;

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
      null,
      0,
      null;
    return;
  end if;

  if v_template.type = 'convert' then
    v_raw_food_cost := coalesce((v_template.heartbeat_cost ->> 'raw_food')::integer, 0);
    v_output := v_template.output_per_heartbeat;

    perform 1
    from public.city_resources
    where id = 1
      and raw_food >= v_raw_food_cost
    for update;

    if not found then
      update public.sessions
      set end_reason = 'resource_exhausted'
      where id = v_session.id;

      return query
      select
        v_session.id,
        v_template.type,
        public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
        true,
        false,
        null,
        0,
        'resource_exhausted';
      return;
    end if;

    update public.city_resources
    set raw_food = raw_food - v_raw_food_cost,
        food_supply = food_supply + v_output,
        updated_at = v_now
    where id = 1;

    update public.sessions as s
    set total_heartbeats = total_heartbeats + 1,
        total_minutes = total_minutes + 10,
        last_heartbeat_at = v_now,
        end_reason = case
          when (select raw_food from public.city_resources where id = 1) < v_raw_food_cost then 'resource_exhausted'
          else null
        end
    where id = v_session.id
    returning s.end_reason into v_session_end_reason;

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(10, 0, 0, 0, -v_raw_food_cost, v_output),
      v_session_end_reason = 'resource_exhausted',
      false,
      null,
      0,
      v_session_end_reason;
    return;
  end if;

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

  if v_instance.status = 'completed' then
    update public.sessions
    set end_reason = 'building_completed'
    where id = v_session.id;

    select b.name
    into v_building_name
    from public.buildings b
    where b.instance_id = v_instance.id;

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
      true,
      v_template.type = 'build',
      v_building_name,
      0,
      'building_completed';
    return;
  end if;

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
      last_heartbeat_at = v_now,
      end_reason = case when v_new_remaining = 0 then 'building_completed' else null end
  where id = v_session.id;

  if v_new_remaining = 0 and v_template.type = 'build' then
    v_participants_label := public.rpc_participants_label(v_instance.id);
    v_building_name := v_participants_label || '的' || public.rpc_building_base_name(v_template.name);

    insert into public.buildings (
      instance_id,
      name,
      participants_label,
      completed_at,
      slot_id,
      district
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

  return query
  select
    v_session.id,
    v_template.type,
    public.rpc_contribution_json(10, 0, 0, 0, 0, 0),
    v_new_remaining = 0,
    v_new_remaining = 0 and v_template.type = 'build',
    v_building_name,
    v_new_remaining,
    case when v_new_remaining = 0 then 'building_completed' else null end;
end;
$$;

create or replace function public.rpc_end_session(
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

  select username::text
  into v_username
  from public.users
  where id = v_session.user_id;

  select *
  into v_template
  from public.task_templates
  where id = v_session.task_template_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  if v_session.status <> 'ended' then
    v_end_reason := coalesce(v_session.end_reason, 'timer_completed');
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

  if v_template.type in ('collect', 'convert') then
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

  if v_template.type = 'build' and v_session.task_instance_id is not null then
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

create or replace function public.rpc_assign_next_task(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_resources public.city_resources%rowtype;
  v_template public.task_templates%rowtype;
  v_instance public.task_instances%rowtype;
  v_session_id uuid;
  v_lowest_resource text := 'coal';
  v_lowest_amount integer := 0;
begin
  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'User not found.');
  end if;

  if not v_user.auto_assign then
    perform public.rpc_raise('FORBIDDEN', 'Auto assign is disabled.');
  end if;

  if exists (
    select 1
    from public.sessions
    where user_id = p_user_id
      and status in ('pending', 'active')
  ) then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
  end if;

  select *
  into v_resources
  from public.city_resources
  where id = 1
  for update;

  if v_resources.food_supply = 0 then
    if v_resources.raw_food > 0 then
      select *
      into v_template
      from public.task_templates
      where code = 'cookhouse-shift';
    else
      select *
      into v_template
      from public.task_templates
      where code = 'hunt';
    end if;
  else
    select ti.*
    into v_instance
    from public.task_instances ti
    join public.task_templates tt on tt.id = ti.template_id
    where ti.status = 'active'
      and tt.type = 'build'
    order by ti.created_at asc
    limit 1;

    if found then
      select *
      into v_template
      from public.task_templates
      where id = v_instance.template_id;
    else
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
        select *
        into v_template
        from public.task_templates
        where code = 'hunt';
      else
        select *
        into v_template
        from public.task_templates
        where type = 'collect'
          and output_resource = v_lowest_resource;
      end if;
    end if;
  end if;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'No assignable task found.');
  end if;

  v_session_id := public.rpc_join_task(
    p_user_id,
    v_template.id,
    case when v_template.type in ('build', 'work') then v_instance.id else null end
  );

  return jsonb_build_object(
    'sessionId', v_session_id,
    'templateId', v_template.id,
    'instanceId', case when v_template.type in ('build', 'work') then v_instance.id else null end,
    'taskName', v_template.name,
    'taskType', v_template.type,
    'district', v_template.district
  );
end;
$$;

commit;
