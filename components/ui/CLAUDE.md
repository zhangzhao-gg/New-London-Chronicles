# components/ui/
> L2 | 父级: /components/CLAUDE.md

成员清单

`Button.tsx`: 冰汽时代风格按钮，支持主按钮、次按钮、幽灵按钮与页签态。  
`Modal.tsx`: 通用弹窗壳，处理遮罩、Esc 关闭与结构化头尾区。  
`Tooltip.tsx`: Hover / focus 提示气泡，供地图热区与 HUD 信息提示复用。  
`ResourceIcon.tsx`: 城市资源图标组件，统一资源视觉语义。  
`CLAUDE.md`: ui 目录地图与约束。  

法则

- 所有组件保持表现层职责，不携带业务请求、副作用写入或数据库字段耦合。
- 可访问性是默认要求：按钮有语义、Tooltip 可 focus、Modal 可 Esc 关闭。
- 样式优先贴近 `UI/*.html` 的深色工业面板与橙色高亮氛围。

[PROTOCOL]: 变更时更新此头部，然后检查 `components/CLAUDE.md`
