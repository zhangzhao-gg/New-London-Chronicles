# components/city/
> L2 | 父级: /components/CLAUDE.md

成员清单

`CityPageShell.tsx`: 城市页 HUD 壳层、地图区块与状态面板展示。  
`CityIcons.tsx`: 侧边栏导航、底部操作栏与 Header 按钮的 SVG 图标集合。  
`CommsPanel.tsx`: 电报通讯屏组件，CRT 电子屏 + 打字机机构 + 碳纤维面板，展示城市日志与发报输入。  
`DistrictModal.tsx`: M09 区块任务弹窗，消费 `/api/tasks`，支持 join 新建 session 与 bind 绑定已有 session 双路径，含"直接专注"入口。  
`CLAUDE.md`: city 目录地图与页面展示约束。  

法则

- `components/city/` 只承载城市页展示层，不发起业务写请求。
- 区块布局、HUD 层级与视觉氛围优先对照 `UI/city.html`。
- 轮询、任务分配与 session 相关控制留在 `hooks/` 或 Route Handlers。

[PROTOCOL]: 变更时更新此头部，然后检查 `components/CLAUDE.md`
