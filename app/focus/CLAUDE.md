# app/focus/
> L2 | 父级: `/app/CLAUDE.md`

成员清单

`page.tsx`: `/focus` 服务端入口，向客户端 Focus 流程注入当前登录用户。  
`CLAUDE.md`: Focus 页面目录约束与职责说明。  

法则

- `app/focus/` 只承载页面入口，不直接实现倒计时副作用或音频逻辑。  
- Focus 页面业务交互放在 `components/focus/` 与 `hooks/use-heartbeat.ts`。  
- 页面级鉴权与跳转遵循 `/city` 相同模式，优先复用 `lib/auth.ts`。  

[PROTOCOL]: 变更时更新此头部，然后检查 `/app/CLAUDE.md` 与 `/CLAUDE.md`
