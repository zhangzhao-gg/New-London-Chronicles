# lib/
> L2 | 父级: /CLAUDE.md

成员清单

`auth.ts`: 认证与会话管理，cookie 读写、anonymous auth、用户 CRUD。  
`i18n.ts`: 轻量 i18n 工具，`t(key, locale)` 函数 + zh-CN/en-US 双语字典 + locale 持久化。  
`client-navigation.ts`: 客户端导航唯一入口，内置冰汽时代风格过渡动画（DOM 注入齿轮 + 工人 + 蒸汽遮罩）。  
`supabase-browser.ts`: 浏览器端 Supabase client 工厂。  
`supabase-server.ts`: 服务端 Supabase client 工厂（service role）。  
`task-rpc.ts`: 任务系统 RPC 封装（join、assign、start、heartbeat、end）。  
`audio.ts`: 音频播放工具。  
`cron.ts`: 定时任务调度工具。  
`CLAUDE.md`: lib 目录地图与职责边界。  

法则

- `lib/` 只承载纯工具函数与 client 工厂，不包含 React 组件或 hooks。
- Supabase 直连只允许通过 `supabase-server.ts`（service role），浏览器端走 Route Handler。
- i18n 字典新增 key 时 zh-CN / en-US 必须同步添加。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
