# app/api/tasks/
> L2 | 父级: /app/CLAUDE.md

成员清单

`route.ts`: `GET /api/tasks`，返回区块任务列表与加入态，被区块详情弹窗消费。  
`assign-next/route.ts`: `POST /api/tasks/assign-next`，为 autoAssign 用户创建下一个 pending session。  
`join/route.ts`: `POST /api/tasks/join`，用户加入指定任务。  
`strategy/route.ts`: `POST /api/tasks/strategy`，接受 `{ templateCode, slotId }`，执行外部 AI agent 指定的建造指令。  

法则

- 所有路由走用户 session 鉴权，不直连数据库。
- `strategy/` 由外部 AI agent 调用，建造决策由 agent 做出，接口只做校验和执行。

[PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md
