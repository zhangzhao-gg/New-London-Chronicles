# app/complete/
> L2 | 父级: `/app/CLAUDE.md`

成员清单

`page.tsx`: `/complete` 服务端入口，向客户端结算页注入当前登录用户。  
`CLAUDE.md`: Complete 页面目录约束与职责说明。  

法则

- `app/complete/` 只承载页面入口与鉴权注入，不直接读写 sessionStorage。  
- 完成页客户端交互放在 `components/focus/CompleteExperience.tsx`。  
- 任何自动任务跳转必须继续复用 `POST /api/tasks/assign-next` 既有契约。  

[PROTOCOL]: 变更时更新此头部，然后检查 `/app/CLAUDE.md` 与 `/CLAUDE.md`
