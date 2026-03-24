# components/
> L2 | 父级: /CLAUDE.md

成员清单

`ui/`: M06 设计系统共享组件，提供按钮、弹窗、Tooltip、资源图标等纯 UI 能力。  
`hud/`: 城市 HUD 展示块，当前承载日志条目组件。  
`CLAUDE.md`: components 目录地图与纯组件约束。  

法则

- `components/` 只接受干净 props，不直接访问数据库、cookie 或路由请求对象。
- 共享视觉 token 统一从 `app/globals.css` 获取，不在组件内部硬编码第二套色板。
- 模块级组件优先复用 `ui/`，避免在页面层复制交互壳子。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
