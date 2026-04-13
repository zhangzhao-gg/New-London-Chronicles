# app/api/internal/
> L2 | 父级: /app/CLAUDE.md

成员清单

`city/upkeep/route.ts`: `POST /api/internal/city/upkeep`，每日城市消耗（食物、煤炭），由 cron 每日 00:05 触发。  
`sessions/reap/route.ts`: `POST /api/internal/sessions/reap`，僵尸 session 清扫（超 12h 未心跳的 pending/active session 强制 timeout），由 cron 每小时触发。  

法则

- 所有内部路由必须验证 `x-cron-secret` 请求头，拒绝匿名访问。
- 业务逻辑封装在 `lib/cron.ts`，路由只做鉴权 + 调用 + 错误包装。

[PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
