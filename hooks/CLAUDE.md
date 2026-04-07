# hooks/
> L2 | 父级: /CLAUDE.md

成员清单

`use-city.tsx`: 城市页客户端数据拉取、30 秒轮询、自动任务开关、FOCUS 交互与 `freeFocus` 直接专注入口。
`use-heartbeat.ts`: Focus 倒计时、条件性 heartbeat（有任务调 API / 无任务纯本地 tick）、`onTaskCompleted` 回调与 session 结算。

法则

- `hooks/` 只封装客户端页面状态、轮询、副作用与轻量派生，不承载 API shape 的真相定义。
- `hooks/` 不直连 Supabase，只通过已有 Next Route Handlers 读写业务数据。
- hook 的输入输出变化时，先更新对应业务文件 L3，再检查本文件与 `/CLAUDE.md`。

[PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
