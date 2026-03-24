# supabase/
> L2 | 父级: /CLAUDE.md

成员清单

`migrations/`: Supabase migration SQL，承载 schema、索引、函数与结构性数据迁移。  
`seed.sql`: 本地/预发初始化数据，当前仅写入 `city_resources` 初始行。  
`CLAUDE.md`: supabase 目录地图，约束迁移与 seed 的职责边界。  

法则

- 结构变更优先写入 `migrations/`，不要把 schema 定义散落到其他目录。
- `seed.sql` 只放可重复初始化的基础数据，不混入业务逻辑。
- 表结构、索引与种子必须对齐 `docs/02-database-schema.md`。

[PROTOCOL]: 变更时更新此头部，然后检查父级 `/CLAUDE.md`
