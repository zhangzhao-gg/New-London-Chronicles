# app/api/session/
> L2 | 父级: /app/CLAUDE.md

成员清单

`create/route.ts`: `POST /api/session/create`，创建无任务 pending session（直接专注入口）。  
`current/route.ts`: `GET /api/session/current`，恢复当前 live session，支持有任务与 taskless 两态。  
`start/route.ts`: `POST /api/session/start`，激活 pending session 并启动心跳周期。  
`heartbeat/route.ts`: `POST /api/session/heartbeat`，10 分钟心跳，有任务时触发产出/进度推进。  
`end/route.ts`: `POST /api/session/end`，结束 session 并返回结算摘要。  
`bind-task/route.ts`: `POST /api/session/bind-task`，给已有 session 绑定任务。  
`unbind-task/route.ts`: `POST /api/session/unbind-task`，解绑当前 session 的任务。  
`assign-next-task/route.ts`: `POST /api/session/assign-next-task`，自动绑定下一个任务到 active session。  

法则

- session 是专注的原子单位，task 是可选绑定。一个 session 生命周期内可绑定/解绑多次任务。
- 所有路由走用户 session 鉴权，业务逻辑封装在 `lib/task-rpc.ts` 的 RPC wrapper 中。
- 唯一约束 `sessions_one_live_per_user_key` 保证每用户至多一个 live session。

[PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
