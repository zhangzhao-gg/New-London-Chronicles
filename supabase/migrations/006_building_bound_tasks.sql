/*
 [INPUT]: 005 的 heartbeat/end RPC、004 的 bind/unbind/assign/start RPC、003 的 join/assign RPC、001 的 schema
 [OUTPUT]: 建筑绑定任务系统 — schema 变更 + 预置建筑种子 + 5 个 RPC 重写
 [POS]: 位于 supabase/migrations，紧随 005_heartbeat_city_logs.sql 执行
 [PROTOCOL]: 变更时更新此头部，然后检查 supabase/migrations/CLAUDE.md 与 /CLAUDE.md
*/

begin;

/* ================================================================
   PART 1 — Schema: 建筑与任务的双向绑定
   ================================================================ */

-- 建造模板声明建成后自动生成什么运营模板
alter table public.task_templates
  add column if not exists spawns_template_id uuid references public.task_templates(id);

-- 运营实例归属哪栋建筑
alter table public.task_instances
  add column if not exists building_id uuid references public.buildings(id);

-- 预置建筑无建造历史，允许 null
alter table public.buildings
  alter column instance_id drop not null;

-- 建筑地理位置（纯展示风味文本，可自定义）
alter table public.buildings
  add column if not exists location text;

create index if not exists task_instances_building_id_idx
  on public.task_instances (building_id)
  where building_id is not null;

/* ================================================================
   PART 2 — 链接 build → operational 模板
   ================================================================ */

update public.task_templates
set spawns_template_id = (select id from public.task_templates where code = 'hunt')
where code = 'build-hunters-hut';

update public.task_templates
set spawns_template_id = (select id from public.task_templates where code = 'cookhouse-shift')
where code = 'build-cookhouse';

update public.task_templates
set spawns_template_id = (select id from public.task_templates where code = 'medical-shift')
where code = 'build-medical-post';

/* ================================================================
   PART 3 — 预置建筑 + 运营实例种子
   ================================================================ */

do $$
declare
  v_bid uuid;
  v_tid uuid;
  v_exists boolean;
begin
  /* ── 煤堆 ── */
  select exists(select 1 from public.buildings where slot_id = 'resource-01') into v_exists;
  if not v_exists then
    insert into public.buildings (instance_id, name, participants_label, completed_at, slot_id, district, location)
    values (null, '煤堆', '新伦敦', '2025-01-01T00:00:00Z', 'resource-01', 'resource', '锅炉房后方的露天堆场')
    returning id into v_bid;

    select id into v_tid from public.task_templates where code = 'collect-coal';

    insert into public.task_instances (template_id, status, progress_minutes, remaining_minutes, slot_id, building_id)
    values (v_tid, 'active', 0, 0, 'resource-01', v_bid);
  end if;

  /* ── 木材堆 ── */
  select exists(select 1 from public.buildings where slot_id = 'resource-02') into v_exists;
  if not v_exists then
    insert into public.buildings (instance_id, name, participants_label, completed_at, slot_id, district, location)
    values (null, '木材堆', '新伦敦', '2025-01-01T00:00:00Z', 'resource-02', 'resource', '北城墙边的储木场')
    returning id into v_bid;

    select id into v_tid from public.task_templates where code = 'collect-wood';

    insert into public.task_instances (template_id, status, progress_minutes, remaining_minutes, slot_id, building_id)
    values (v_tid, 'active', 0, 0, 'resource-02', v_bid);
  end if;

  /* ── 废铁堆 ── */
  select exists(select 1 from public.buildings where slot_id = 'resource-03') into v_exists;
  if not v_exists then
    insert into public.buildings (instance_id, name, participants_label, completed_at, slot_id, district, location)
    values (null, '废铁堆', '新伦敦', '2025-01-01T00:00:00Z', 'resource-03', 'resource', '铁轨尽头的废弃车厢旁')
    returning id into v_bid;

    select id into v_tid from public.task_templates where code = 'collect-steel';

    insert into public.task_instances (template_id, status, progress_minutes, remaining_minutes, slot_id, building_id)
    values (v_tid, 'active', 0, 0, 'resource-03', v_bid);
  end if;

  /* ── 猎人小屋 ── */
  select exists(select 1 from public.buildings where slot_id = 'food-01') into v_exists;
  if not v_exists then
    insert into public.buildings (instance_id, name, participants_label, completed_at, slot_id, district, location)
    values (null, '猎人小屋', '新伦敦', '2025-01-01T00:00:00Z', 'food-01', 'food', '南门外雪松林边缘')
    returning id into v_bid;

    select id into v_tid from public.task_templates where code = 'hunt';

    insert into public.task_instances (template_id, status, progress_minutes, remaining_minutes, slot_id, building_id)
    values (v_tid, 'active', 0, 0, 'food-01', v_bid);
  end if;

  /* ── 伙房 ── */
  select exists(select 1 from public.buildings where slot_id = 'food-02') into v_exists;
  if not v_exists then
    insert into public.buildings (instance_id, name, participants_label, completed_at, slot_id, district, location)
    values (null, '伙房', '新伦敦', '2025-01-01T00:00:00Z', 'food-02', 'food', '中央广场西侧炊烟巷')
    returning id into v_bid;

    select id into v_tid from public.task_templates where code = 'cookhouse-shift';

    insert into public.task_instances (template_id, status, progress_minutes, remaining_minutes, slot_id, building_id)
    values (v_tid, 'active', 0, 0, 'food-02', v_bid);
  end if;

  /* ── 回填 location（建筑已存在但 location 为空时修补） ── */
  update public.buildings set location = '锅炉房后方的露天堆场'   where slot_id = 'resource-01' and location is null;
  update public.buildings set location = '北城墙边的储木场'       where slot_id = 'resource-02' and location is null;
  update public.buildings set location = '铁轨尽头的废弃车厢旁'   where slot_id = 'resource-03' and location is null;
  update public.buildings set location = '南门外雪松林边缘'       where slot_id = 'food-01'     and location is null;
  update public.buildings set location = '中央广场西侧炊烟巷'     where slot_id = 'food-02'     and location is null;
end $$;

/* ================================================================
   PART 4 — 重写 rpc_join_task
   所有任务类型统一要求 instance_id
   ================================================================ */

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

  /* ── 统一校验：所有类型都需要 instance_id ── */
  if p_instance_id is null then
    perform public.rpc_raise('VALIDATION_ERROR', 'instanceId is required.');
  end if;

  perform 1
  from public.task_instances
  where id = p_instance_id
    and template_id = p_template_id
    and status = 'active';

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task instance not found.');
  end if;

  /* ── convert 额外校验：原材料充足 ── */
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

  /* ── 统一加入参与者 ── */
  insert into public.task_participants (user_id, instance_id)
  values (p_user_id, p_instance_id)
  on conflict (user_id, instance_id) do nothing;

  /* ── 创建 session ── */
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

/* ================================================================
   PART 5 — 重写 rpc_bind_task
   所有任务类型统一要求 instance_id
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
  v_building_name text;
  v_building_slot_id text;
  v_building_location text;
  v_now timestamptz := timezone('utc', now());
begin
  /* 1. 校验 session */
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

  /* 2. 校验 template */
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

  /* 3. 统一校验 instance_id */
  if p_instance_id is null then
    perform public.rpc_raise('VALIDATION_ERROR', 'instanceId is required.');
  end if;

  perform 1
  from public.task_instances
  where id = p_instance_id
    and template_id = p_template_id
    and status = 'active';

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task instance not found.');
  end if;

  /* convert 额外校验 */
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

  /* 统一加入参与者 */
  insert into public.task_participants (user_id, instance_id)
  values (p_user_id, p_instance_id)
  on conflict (user_id, instance_id) do nothing;

  /* 4. build 资源预扣（session 已 active 时） */
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

  /* 5. 解析建筑 */
  select b.name, b.slot_id, b.location
  into v_building_name, v_building_slot_id, v_building_location
  from public.buildings b
  join public.task_instances ti on ti.building_id = b.id
  where ti.id = p_instance_id;

  /* 6. 绑定任务 */
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
    'district', v_template.district,
    'buildingName', v_building_name,
    'buildingSlotId', v_building_slot_id,
    'buildingLocation', v_building_location
  );
end;
$$;

/* ================================================================
   PART 6 — 辅助：查找最优可分配任务
   食物紧急 → 建造中 → 最缺资源采集
   ================================================================ */

create or replace function public.rpc_find_best_task(
  out found_template_id uuid,
  out found_instance_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resources public.city_resources%rowtype;
  v_lowest_resource text := 'coal';
  v_lowest_amount integer := 0;
begin
  select * into v_resources
  from public.city_resources
  where id = 1
  for update;

  /* ── 优先级 1：食物紧急 ── */
  if v_resources.food_supply = 0 then
    if v_resources.raw_food > 0 then
      select ti.template_id, ti.id into found_template_id, found_instance_id
      from public.task_instances ti
      join public.task_templates tt on tt.id = ti.template_id
      where ti.status = 'active'
        and tt.code = 'cookhouse-shift'
        and ti.building_id is not null
      order by ti.created_at asc
      limit 1;
    else
      select ti.template_id, ti.id into found_template_id, found_instance_id
      from public.task_instances ti
      join public.task_templates tt on tt.id = ti.template_id
      where ti.status = 'active'
        and tt.code = 'hunt'
        and ti.building_id is not null
      order by ti.created_at asc
      limit 1;
    end if;
  end if;

  /* ── 优先级 2：进行中的建造任务 ── */
  if found_template_id is null then
    select ti.template_id, ti.id into found_template_id, found_instance_id
    from public.task_instances ti
    join public.task_templates tt on tt.id = ti.template_id
    where ti.status = 'active'
      and tt.type = 'build'
    order by ti.created_at asc
    limit 1;
  end if;

  /* ── 优先级 3：最缺资源的采集 ── */
  if found_template_id is null then
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
      select ti.template_id, ti.id into found_template_id, found_instance_id
      from public.task_instances ti
      join public.task_templates tt on tt.id = ti.template_id
      where ti.status = 'active'
        and tt.code = 'hunt'
        and ti.building_id is not null
      order by ti.created_at asc
      limit 1;
    else
      select ti.template_id, ti.id into found_template_id, found_instance_id
      from public.task_instances ti
      join public.task_templates tt on tt.id = ti.template_id
      where ti.status = 'active'
        and tt.type = 'collect'
        and tt.output_resource = v_lowest_resource
        and ti.building_id is not null
      order by ti.created_at asc
      limit 1;
    end if;
  end if;

  if found_template_id is null or found_instance_id is null then
    perform public.rpc_raise('NOT_FOUND', 'No assignable task found.');
  end if;
end;
$$;

/* ================================================================
   PART 7 — 重写 rpc_assign_next_task
   通过 rpc_find_best_task 查找 → rpc_join_task 创建 session
   ================================================================ */

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
  v_template_id uuid;
  v_instance_id uuid;
  v_template public.task_templates%rowtype;
  v_session_id uuid;
  v_building_name text;
  v_building_slot_id text;
  v_building_location text;
begin
  select * into v_user
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
    select 1 from public.sessions
    where user_id = p_user_id and status in ('pending', 'active')
  ) then
    perform public.rpc_raise('CONFLICT', 'User already has a live session.');
  end if;

  select * into v_template_id, v_instance_id
  from public.rpc_find_best_task();

  select * into v_template
  from public.task_templates
  where id = v_template_id;

  v_session_id := public.rpc_join_task(p_user_id, v_template_id, v_instance_id);

  select b.name, b.slot_id, b.location
  into v_building_name, v_building_slot_id, v_building_location
  from public.buildings b
  join public.task_instances ti on ti.building_id = b.id
  where ti.id = v_instance_id;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'templateId', v_template.id,
    'instanceId', v_instance_id,
    'taskName', v_template.name,
    'taskType', v_template.type,
    'district', v_template.district,
    'buildingName', v_building_name,
    'buildingSlotId', v_building_slot_id,
    'buildingLocation', v_building_location
  );
end;
$$;

/* ================================================================
   PART 8 — 重写 rpc_assign_next_task_to_session
   通过 rpc_find_best_task 查找 → rpc_bind_task 绑定（含 buildingName）
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
  v_template_id uuid;
  v_instance_id uuid;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active';

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Active session not found.');
  end if;

  select * into v_user
  from public.users
  where id = p_user_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'User not found.');
  end if;

  if not v_user.auto_assign then
    perform public.rpc_raise('FORBIDDEN', 'Auto assign is disabled.');
  end if;

  select * into v_template_id, v_instance_id
  from public.rpc_find_best_task();

  return public.rpc_bind_task(p_user_id, p_session_id, v_template_id, v_instance_id);
end;
$$;

/* ================================================================
   PART 9 — 重写 rpc_session_heartbeat
   基于 005 版本，追加建造完成时自动生成运营实例
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
  v_new_building_id uuid;
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

  /* ── 无任务 → 仅 tick ── */
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

  select *
  into v_template
  from public.task_templates
  where id = v_session.task_template_id;

  if not found then
    perform public.rpc_raise('NOT_FOUND', 'Task template not found.');
  end if;

  select username::text into v_username
  from public.users
  where id = p_user_id;

  /* ── 重入守卫 ── */
  if v_session.task_unbind_reason is not null then
    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(0, 0, 0, 0, 0, 0),
      true,
      v_template.type = 'build' and v_session.task_unbind_reason = 'task_completed',
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

  v_output := least(v_template.output_per_heartbeat, v_instance.remaining_minutes);
  v_new_remaining := v_instance.remaining_minutes - v_output;

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
      when v_new_remaining = 0 and v_template.type = 'build' then format('完成了%s的建设！', v_template.name)
      when v_new_remaining = 0 then format('完成了%s！', v_template.name)
      when v_template.type = 'build' then format('推进了%s的建设（剩余%s分钟）。', v_template.name, v_new_remaining)
      else format('推进了%s（剩余%s分钟）。', v_template.name, v_new_remaining)
    end
  );

  /* ── 建造完成 ── */
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
          district = excluded.district
      returning id into v_new_building_id;

      /* ── 自动生成运营实例 ── */
      if v_template.spawns_template_id is not null and v_new_building_id is not null then
        insert into public.task_instances (
          template_id, status, progress_minutes, remaining_minutes, slot_id, building_id
        ) values (
          v_template.spawns_template_id,
          'active',
          0,
          0,
          coalesce(v_instance.slot_id, 'unknown-slot'),
          v_new_building_id
        );
      end if;
    end if;

    perform public.rpc_unbind_task(p_user_id, p_session_id, 'task_completed');

    return query
    select
      v_session.id,
      v_template.type,
      public.rpc_contribution_json(v_output, 0, 0, 0, 0, 0),
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
    public.rpc_contribution_json(v_output, 0, 0, 0, 0, 0),
    false,
    false,
    null::text,
    v_new_remaining,
    null::text;
end;
$$;

/* ================================================================
   PART 10 — 清理遗留 collect/convert session（无 instance 的）
   ================================================================ */

update public.sessions
set status = 'ended',
    ended_at = timezone('utc', now()),
    end_reason = 'manual_stop'
where status in ('pending', 'active')
  and task_template_id in (
    select id from public.task_templates where type in ('collect', 'convert')
  )
  and task_instance_id is null;

commit;
