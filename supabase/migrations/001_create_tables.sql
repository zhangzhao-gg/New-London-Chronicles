/*
 [INPUT]: docs/02-database-schema.md 定义的 8 表、扩展、约束与索引
 [OUTPUT]: 创建 public.users / city_resources / task_templates / task_instances / task_participants / sessions / buildings / city_logs
 [POS]: 位于 supabase/migrations，供 Supabase migration runner 执行
 [PROTOCOL]: 变更时更新此头部，然后检查 supabase/migrations/CLAUDE.md 与 /CLAUDE.md
*/

begin;

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
  task_template_id uuid not null references public.task_templates(id) on delete restrict,
  task_instance_id uuid references public.task_instances(id) on delete set null,
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
  on public.sessions (status, (coalesce(last_heartbeat_at, started_at)) desc);

create index users_last_seen_at_idx
  on public.users (last_seen_at desc);

create index buildings_district_completed_idx
  on public.buildings (district, completed_at desc);

create index city_logs_created_at_idx
  on public.city_logs (created_at desc);

commit;
