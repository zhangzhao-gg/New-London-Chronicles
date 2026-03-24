# components/hud/
> L2 | 父级: /components/CLAUDE.md

成员清单

`LogEntry.tsx`: 城市日志单条展示组件。  
`CLAUDE.md`: hud 目录地图与 HUD 表现约束。  

法则

- HUD 组件只做展示，不直接拼装 API 请求。
- 文案优先消费 API DTO，不在组件内部推测业务状态。
- 时间、用户名、动作描述的层级要清晰，符合 `UI/city.html` 的信息密度。

[PROTOCOL]: 变更时更新此头部，然后检查 `components/CLAUDE.md`
