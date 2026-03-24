/*
 [INPUT]: docs/02-database-schema.md 中 city_resources 初始库存定义
 [OUTPUT]: 写入唯一一条 id = 1 的城市库存基础数据
 [POS]: 位于 supabase 根目录，供本地或预发环境初始化执行
 [PROTOCOL]: 变更时更新此头部，然后检查 supabase/CLAUDE.md 与 /CLAUDE.md
*/

begin;

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
) on conflict (id) do update
set
  coal = excluded.coal,
  wood = excluded.wood,
  steel = excluded.steel,
  raw_food = excluded.raw_food,
  food_supply = excluded.food_supply,
  updated_at = now();

commit;
