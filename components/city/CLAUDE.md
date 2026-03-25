# components/city/
> L2 | 父级: /components/CLAUDE.md

成员清单

`CityPageShell.tsx`: 城市页 HUD 壳层、地图区块与状态面板展示。  
`CLAUDE.md`: city 目录地图与页面展示约束。  

法则

- `components/city/` 只承载城市页展示层，不发起业务写请求。
- 区块布局、HUD 层级与视觉氛围优先对照 `UI/city.html`。
- 轮询、任务分配与 session 相关控制留在 `hooks/` 或 Route Handlers。

[PROTOCOL]: 变更时更新此头部，然后检查 `components/CLAUDE.md`
