# 02 - Database Schema

## 1. 设计修正

原始草图有三个必须消掉的结构问题：

1. `task_templates.cost_resource + cost_amount` 无法表达“15 木材 + 5 钢材”这类多资源成本
2. `sessions` 只有 `task_instance_id`，无法表示采集任务，因为采集任务没有实例
3. `sessions.status = active | ended` 无法区分“已加入未开始”和“真正进行中”

最终 schema 在保留草图字段的同时补充：

- `task_templates.build_cost jsonb`
- `task_templates.heartbeat_cost jsonb`
- `sessions.task_template_id`
- `users.last_seen_at`
- `sessions.status = pending | active | ended`
- `sessions.started_at` 与 `sessions.last_heartbeat_at` 改为可空

## 2. 建表 SQL

```sql
create extension if not exists pgcrypto;
create extension if not exists citext;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  username citext not null unique,
  auto_assign boolean not null default true,
  hunger_status text not null default 'healthy'
    check (hunger_status in ('healthy', 'hungry')),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.city_resources (
  id smallint primary key
    check (id = 1),
  coal integer not null check (coal >= 0),
  wood integer not null check (wood >= 0),
  steel integer not null check (steel >= 0),
  raw_food integer not null check (raw_food >= 0),
  food_supply integer not null check (food_supply >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null
    check (type in ('collect', 'build', 'convert', 'work')),
  district text not null
    check (district in ('resource', 'residential', 'medical', 'food', 'exploration')),
  output_resource text
    check (
      output_resource is null
      or output_resource in ('coal', 'wood', 'steel', 'raw_food', 'food_supply', 'progress')
    ),
  output_per_heartbeat integer not null default 0
    check (output_per_heartbeat >= 0),
  cost_resource text
    check (
      cost_resource is null
      or cost_resource in ('coal', 'wood', 'steel', 'raw_food', 'food_supply')
    ),
  cost_amount integer not null default 0
    check (cost_amount >= 0),
  build_cost jsonb not null default '{}'::jsonb,
  heartbeat_cost jsonb not null default '{}'::jsonb,
  duration_minutes integer
    check (duration_minutes is null or duration_minutes > 0),
  max_concurrent_instances integer not null default 0
    check (max_concurrent_instances >= 0),
  enabled boolean not null default true,
  sort_order integer not null
);

create table public.task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed')),
  progress_minutes integer not null default 0
    check (progress_minutes >= 0),
  remaining_minutes integer not null default 0
    check (remaining_minutes >= 0),
  slot_id text,
  locked_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table public.task_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  instance_id uuid not null references public.task_instances(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  unique (user_id, instance_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task_template_id uuid references public.task_templates(id) on delete restrict,
  task_instance_id uuid references public.task_instances(id) on delete set null,
  task_unbind_reason text
    check (
      task_unbind_reason is null
      or task_unbind_reason in (
        'task_completed',
        'resource_exhausted',
        'manual_unbind'
      )
    ),
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  ended_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'ended')),
  end_reason text
    check (
      end_reason is null
      or end_reason in (
        'timer_completed',
        'manual_stop',
        'resource_exhausted',
        'building_completed',
        'timeout'
      )
    ),
  total_heartbeats integer not null default 0
    check (total_heartbeats >= 0),
  total_minutes integer not null default 0
    check (total_minutes >= 0)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null unique references public.task_instances(id) on delete restrict,
  name text not null,
  participants_label text not null,
  completed_at timestamptz not null,
  slot_id text not null,
  district text not null
    check (district in ('resource', 'residential', 'medical', 'food', 'exploration'))
);

create table public.city_logs (
  id bigint generated always as identity primary key,
  user_label text not null,
  action_desc text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index task_instances_active_slot_key
  on public.task_instances (slot_id)
  where status = 'active' and slot_id is not null;

create unique index sessions_one_live_per_user_key
  on public.sessions (user_id)
  where status in ('pending', 'active');

create index task_instances_template_status_idx
  on public.task_instances (template_id, status);

create index task_participants_instance_idx
  on public.task_participants (instance_id);

create index sessions_status_heartbeat_idx
  on public.sessions (status, coalesce(last_heartbeat_at, started_at) desc);

create index users_last_seen_at_idx
  on public.users (last_seen_at desc);

create index buildings_district_completed_idx
  on public.buildings (district, completed_at desc);

create index city_logs_created_at_idx
  on public.city_logs (created_at desc);
```

## 3. 初始数据

```sql
insert into public.city_resources (
  id,
  coal,
  wood,
  steel,
  raw_food,
  food_supply
) values (
  1,
  5000,
  3000,
  500,
  0,
  50
);
```

## 4. `task_templates` 种子

| `code` | 名称 | `type` | `district` | `output_resource` | `output_per_heartbeat` | `duration_minutes` | `build_cost` | `heartbeat_cost` | `max_concurrent_instances` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `collect-coal` | 采集煤炭 | `collect` | `resource` | `coal` | `20` | `null` | `{}` | `{}` | `0` |
| `collect-wood` | 采集木材 | `collect` | `resource` | `wood` | `4` | `null` | `{}` | `{}` | `0` |
| `collect-steel` | 采集钢材 | `collect` | `resource` | `steel` | `2` | `null` | `{}` | `{}` | `0` |
| `build-collection-hut` | 建造收集小屋 | `build` | `resource` | `progress` | `10` | `180` | `{"wood":15,"steel":5}` | `{}` | `2` |
| `build-tent` | 建造帐篷 | `build` | `residential` | `progress` | `10` | `120` | `{"wood":10}` | `{}` | `2` |
| `build-medical-post` | 建造医疗室 | `build` | `medical` | `progress` | `10` | `120` | `{"wood":20}` | `{}` | `2` |
| `medical-shift` | 医疗室值班 | `work` | `medical` | `progress` | `10` | `600` | `{}` | `{}` | `1` |
| `build-hunters-hut` | 建造猎人小屋 | `build` | `food` | `progress` | `10` | `240` | `{"wood":15}` | `{}` | `2` |
| `hunt` | 狩猎 | `collect` | `food` | `raw_food` | `1` | `null` | `{}` | `{}` | `0` |
| `build-cookhouse` | 建造伙房 | `build` | `food` | `progress` | `10` | `180` | `{"wood":20}` | `{}` | `2` |
| `cookhouse-shift` | 食堂工作 | `convert` | `food` | `food_supply` | `2` | `null` | `{}` | `{"raw_food":1}` | `0` |
| `build-workshop` | 建造工作站 | `build` | `exploration` | `progress` | `10` | `180` | `{"wood":10,"steel":5}` | `{}` | `2` |
| `build-lighthouse` | 建造灯塔 | `build` | `exploration` | `progress` | `10` | `240` | `{"wood":30,"steel":20}` | `{}` | `2` |

说明：

- `medical-shift` 在 MVP 中可见，但默认 `canJoin = false`，`disabledReason = "no_patients"`。
- `hunt` 不绑定建筑解锁，MVP 直接可用。
- `collect-*` 与 `hunt` 不创建 `task_instances`，直接通过 `sessions.task_template_id` 建模。
- `cookhouse-shift` 与采集类一致，不创建 `task_instances`，直接通过 `sessions.task_template_id` 建模。
- `last_seen_at` 由登录接口与 `GET /api/city` 更新，用于每日在线用户消耗统计。
- 当前 MVP 中 `task_instances.locked_by_user_id` 没有启用场景，保留给未来独占任务扩展。
- 采集类与转化类 session 不做恢复；建造类与工作类 session 允许从 `pending` 或 `active` 恢复。

## 5. 事务与锁

- 所有城市库存修改必须在数据库事务内完成。
- `city_resources` 更新统一先执行 `select * from public.city_resources where id = 1 for update;`
- 建造类开始时一次性预扣 `build_cost`。
- 心跳只写入已经发生的 10 分钟贡献，不预写未来收益。
- `join` 只创建 `pending` session，不算正式开工。
- `start` 才会写入 `started_at` 与首个 `last_heartbeat_at`，并把 `status` 切到 `active`。
- `end` 把任意 `pending` 或 `active` session 置为 `ended`。

## 6. Supabase RPC 清单

- `rpc_join_task(p_user_id uuid, p_template_id uuid, p_instance_id uuid default null) returns uuid`
- `rpc_start_session(p_user_id uuid, p_session_id uuid) returns void`
- `rpc_session_heartbeat(p_user_id uuid, p_session_id uuid)`
- `rpc_end_session(p_user_id uuid, p_session_id uuid, p_end_reason text default null)`
- `rpc_assign_next_task(p_user_id uuid) returns jsonb`
- ~~`rpc_task_strategy_tick()`~~ — 已移除，建造补位改由 `POST /api/tasks/strategy` 在应用层执行
- ~~`rpc_daily_city_upkeep()`~~ — 已移除，城市消耗改由 `lib/cron.ts` 应用层 fallback 执行

`rpc_session_heartbeat` 固定返回：

```sql
(
  session_id uuid,
  task_type text,
  contribution jsonb,
  task_ended boolean,
  building_completed boolean,
  completed_building_name text,
  remaining_minutes integer,
  end_reason text
)
```

`rpc_assign_next_task` 固定返回：

```sql
(
  session_id uuid,
  template_id uuid,
  instance_id uuid,
  task_name text,
  task_type text,
  district text
)
```

`rpc_daily_city_upkeep` 固定返回：

```sql
(
  active_users integer,
  food_consumed integer,
  coal_consumed integer,
  newly_hungry_users integer,
  business_date date
)
```
