# Tech Docs - New London Chronicles

本目录是实现蓝图的唯一真相源。多个 Claude Code 实例并行开发时，直接按这里的拆分文档实现，不再依赖单一长文件。

## 文档地图

1. `01-foundation.md`
   - 技术栈
   - 鉴权模型
   - 目录结构
   - 环境变量
   - 地图区块与槽位
2. `02-database-schema.md`
   - 8 表 schema
   - 种子数据
   - 事务与锁
   - Supabase RPC 清单
3. `03-api-contracts.md`
   - 用户设置
   - 会话与任务 API
   - 城市 HUD API
   - 内部定时任务接口
4. `04-modules.md`
   - M01 到 M11 模块规格
   - 批次并行边界
5. `05-deployment.md`
   - pm2
   - nginx
   - crontab
   - RLS
   - 验收清单

## 已锁定决策

- 用户登录体验保持“仅输入用户名”，底层鉴权采用 Supabase anonymous auth 会话。
- MVP 固定温度为 `-20°C`。
- 视觉 token 锁定为 `#221810` / `#f4a462` / `#ff9d00` / `Newsreader`。
- 浏览器数据访问统一走 Next.js Route Handlers；前端不直连 Supabase 表。
- 自动任务开关真实生效：用户开启后，点击 `FOCUS` 直接领下一个任务；完成页自动跳下一个任务。
- 自动任务开关的 UI 落点固定在城市页右下用户信息卡。
- 城市每日消耗通过内部接口执行，并由定时任务触发。
- session 生命周期固定为 `pending -> active -> ended`，支持恢复建造类与工作类会话。
- 城市 HUD 补齐 `healthStatus`、`currentPolicyPlaceholder`、语言占位信息。
- 日志继续按 session 写入，不合并为全局唯一建筑完成事件。
- “用户只要上线就要消耗 1 份食物配给” 固定按方案 A 执行：登录或打开城市页即算上线，使用 `users.last_seen_at` 统计每日在线用户。
- 转化类任务按采集类处理：无需实例、可多人共享、用户可直接进入工作。
