# hooks/
> L2 | 父级: /CLAUDE.md

成员清单

`use-city.tsx`: 城市页客户端数据拉取、30 秒轮询、自动任务开关与 FOCUS 交互状态。

法则

- `hooks/` 只封装客户端页面状态、轮询、副作用与轻量派生，不承载 API shape 的真相定义。
- `hooks/` 不直连 Supabase，只通过已有 Next Route Handlers 读写业务数据。
- hook 的输入输出变化时，先更新对应业务文件 L3，再检查本文件与 `/CLAUDE.md`。

[PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
