# docs/
> L2 | 父级: /CLAUDE.md

成员清单

`README.md`: 技术文档总入口，说明拆分地图、锁定决策与已知缺口。  
`01-foundation.md`: 项目骨架，定义技术栈、鉴权、目录结构、环境变量、部署骨架、地图槽位。  
`02-database-schema.md`: 数据库设计，定义 8 表 SQL、种子数据、锁策略与 RPC 清单。  
`03-api-contracts.md`: API 契约，定义认证、城市、任务、会话、日志与内部 cron 接口的请求响应。  
`04-modules.md`: 模块规格，定义 M01-M11 的交付物、依赖与并行批次。  
`05-deployment.md`: 部署文档，定义 pm2、nginx、crontab、RLS 与验收清单。  
`CLAUDE.md`: docs 目录地图，约束拆分文档的职责边界与维护协议。  

法则

- `README.md` 负责导航，不承载长篇细节。
- `01` 到 `05` 分别承载单一主题，避免回退为单个超长规范。
- 修改某一技术主题时，只改对应分片文档，不复制到多个文件。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
