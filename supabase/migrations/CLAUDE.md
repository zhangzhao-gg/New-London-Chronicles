# supabase/migrations/
> L2 | 父级: /supabase/CLAUDE.md

成员清单

`001_create_tables.sql`: 创建扩展、8 张业务表与全部索引。  
`002_seed_task_templates.sql`: 写入 13 条 `task_templates` 模板种子。  
`003_task_rpc.sql`: 5 个核心 RPC（join_task、assign_next_task、start/heartbeat/end_session）与辅助函数。  
`004_decouple_session_task.sql`: 解耦专注与任务 — schema 变更 + 4 个新 RPC + 3 个 RPC 重写。  
`005_heartbeat_city_logs.sql`: 重写 rpc_session_heartbeat（心跳写日志）+ rpc_end_session（手动停止去日志、移除 timer_completed 验证）。  
`CLAUDE.md`: migrations 目录地图，维护迁移编号与职责说明。  

法则

- migration 编号按递增顺序创建，已发布文件只追加不重写。
- schema migration 负责结构与结构性种子；运行态基础库存放在 `supabase/seed.sql`。
- SQL 变更必须先对照 `docs/02-database-schema.md`，保持字段、约束、索引一致。

[PROTOCOL]: 变更时更新此头部，然后检查父级 `/supabase/CLAUDE.md`
