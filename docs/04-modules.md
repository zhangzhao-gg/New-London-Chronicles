# 04 - Modules

## M01 — Schema & 种子数据

- 交付物：`supabase/migrations/001_create_tables.sql`、`supabase/migrations/002_seed_task_templates.sql`、`supabase/seed.sql`
- 输入：`02-database-schema.md`
- 输出：8 表、13 条模板种子、1 条 `city_resources`
- 规则：所有列名、检查约束、索引与文档完全一致
- 依赖：无

## M02 — Auth + 中间件

- 交付物：`app/api/auth/login/route.ts`、`app/api/users/me/settings/route.ts`、`lib/auth.ts`、`middleware.ts`、`lib/supabase-browser.ts`
- 输入：Supabase SSR、`users` 表
- 输出：
  - `POST /api/auth/login`
  - `PATCH /api/users/me/settings`
  - `getSession(req): Promise<{ authUserId: string; user: UserDto } | null>`
- 规则：
  - 登录后写 anonymous session cookie
  - 登录成功时刷新 `users.last_seen_at`
  - `middleware.ts` 保护 `/city`、`/focus`、`/complete` 与全部受保护 API
  - `getSession` 必须从 Supabase cookie session + `user_metadata.app_user_id` 解析业务用户
- 依赖：M01

## M03 — City State API

- 交付物：
  - `app/api/city/route.ts`
  - `app/api/tasks/route.ts`
  - `app/api/logs/route.ts`
  - `app/api/session/current/route.ts`
  - `lib/supabase-server.ts`
- 输入：`getSession`、城市资源、实例、日志
- 输出：
  - `GET /api/city`
  - `GET /api/tasks`
  - `GET /api/logs`
  - `GET /api/session/current`
- 规则：
  - `GET /api/city` 允许附带刷新 `users.last_seen_at`
  - `GET /api/tasks` 必须计算 `canJoin`、`disabledReason`、`actionLabel`
  - `GET /api/tasks` 对 `build/work` 的非空 `instance` 必须返回 `id`、`slotId`、`progressMinutes`、`remainingMinutes`
  - `GET /api/city` 必须返回 `healthStatus`、`currentPolicyPlaceholder`、语言占位字段
  - `GET /api/city` 必须返回按 district 聚合的 `status + workingCount`，供地图 hover tooltip 使用
  - `GET /api/session/current` 未传 `sessionId` 时负责恢复 `build/work` 类型的 `pending/active` session
  - `GET /api/session/current?sessionId=...` 必须支持 `/focus` 直接加载指定 `pending/active` session
- 依赖：M01、M02

## M04 — 任务参与 + 心跳 API

- 交付物：
  - `app/api/tasks/join/route.ts`
  - `app/api/tasks/assign-next/route.ts`
  - `app/api/session/start/route.ts`
  - `app/api/session/heartbeat/route.ts`
  - `app/api/session/end/route.ts`
  - `lib/task-rpc.ts`
  - `supabase/migrations/003_task_rpc.sql`
- 输入：`sessions`、`task_instances`、`task_participants`、`city_resources`
- 输出：5 个写操作接口与 7 个 RPC
- 规则：
  - `join` 只做参数验证与 RPC 调用
  - `join` 创建 `pending` session
  - `assign-next` 只对 `autoAssign = true` 的用户开放
  - `start` 只做幂等开始
  - `heartbeat` 是唯一贡献写入入口
  - `end` 是唯一日志写入入口，且请求体必须显式传 `endReason = 'manual_stop' | 'timer_completed'`
- 三类心跳处理：
  - 采集类：增加库存，更新 `total_minutes`、`total_heartbeats`
  - 建造/工作类：推进 `progress_minutes`，完成时落 `buildings`
  - 转化类：像采集类一样允许多人直接加入，同步锁库存并转化产物，原材料不足则结束
- 超时规则：
  - 若 `coalesce(last_heartbeat_at, started_at) < now() - interval '12 hours'`，下一次读到 session 时强制 `timeout`
- 依赖：M01、M02

## M05 — 城市运维与建造指令

- 交付物：`app/api/internal/city/upkeep/route.ts`、`app/api/tasks/strategy/route.ts`、`lib/cron.ts`
- 输入：`city_resources`、`task_templates`、`task_instances`、`users`
- 输出：
  - `POST /api/internal/city/upkeep`：每日执行一次的城市日常消耗（cron 触发）
  - `POST /api/tasks/strategy`：建造指令接口，接受 `{ templateCode, slotId }`，由外部 AI agent 按需调用
- 规则：
  - 采集类不创建实例
  - 转化类不创建实例
  - 每个建造模板并发上限由 `task_templates.max_concurrent_instances` 控制
  - 资源不足时不创建建造实例，不做负库存
  - `food_supply` 不足固定按 `food_supply = 0` 判定
- 决策顺序固定：
  1. 按优先级扫描建造模板：`build-tent` -> `build-collection-hut` -> `build-medical-post` -> `build-hunters-hut` -> `build-cookhouse` -> `build-workshop` -> `build-lighthouse`
  2. 仅当 `city_resources` 足够覆盖 `build_cost` 才创建
  3. 所有模板达到上限则 no-op
  4. 每日城市消耗通过内部接口执行：`food_supply -= active_users`，`coal -= 1000`
  5. 食物不足时不写负库存，把缺口对应用户置为 `hungry`
  6. 业务日历固定按 `Asia/Shanghai`
- 依赖：M01

## M06 — 设计系统 + 共享组件

- 交付物：
  - `app/globals.css`
  - `components/ui/Button.tsx`
  - `components/ui/Modal.tsx`
  - `components/ui/Tooltip.tsx`
  - `components/ui/ResourceIcon.tsx`
  - `components/hud/LogEntry.tsx`
- 设计 token 固定：
  - `--nlc-dark: #221810`
  - `--nlc-orange: #f4a462`
  - `--nlc-amber: #ff9d00`
  - `font-family: "Newsreader", serif`
- 规则：
  - 页面背景统一使用深棕黑基底，不回退到蓝灰色原型
  - 组件不接数据库参数，只接干净 props
- 依赖：无

## M07 — 登录页

- 交付物：`app/page.tsx`
- 输入：`POST /api/auth/login`
- 输出：登录页与用户名表单
- 规则：
  - 实现前必须对照 `UI/start.html`
  - 全屏暗色背景、居中输入框、主按钮使用 `#f4a462`
  - 登录成功后 `router.push("/city")`
  - 用户名为空、过长或包含非法字符时前端即时提示
- 依赖：M02、M06

## M08 — 城市地图页 + HUD

- 交付物：`app/city/page.tsx`、`hooks/use-city.tsx`、`components/city/CityPageShell.tsx`
- 输入：`GET /api/city`、`POST /api/tasks/assign-next`
- 输出：地图页、HUD、区块 hover tooltip
- 规则：
  - 实现前必须对照 `UI/city.html`
  - 30 秒轮询 `/api/city`
  - 顶部导航固定展示 `LOGISTICS` 选中，`COUNCIL` 与 `ARCHIVES` 作为未来占位
  - 顶部资源栏必须显示 `coal / wood / steel / rawFood / foodSupply / temperature`
  - 温度固定渲染 `-20°C`
  - 地图 hover tooltip 必须显示 `区块名称 / 当前状态 / 正在此处工作的人数`
  - 右上区域展示在线人数、`healthStatus`、`currentPolicyPlaceholder` 与城市日志
  - 右上保留语言切换占位，先支持 `zh-CN` / `en-US`
  - 右下展示当前用户，并放置自动任务开关 toggle
  - 底栏只有 `DISTRICTS` 与 `FOCUS`
  - 点击 `FOCUS` 时先调用 `GET /api/session/current?any=1` 检查当前是否已有 live session
  - 若已有 live session，直接跳转 `/focus?sessionId=...`
  - 若没有 live session 且 `autoAssign = true`，再调用 `POST /api/tasks/assign-next` 并跳转 `/focus?sessionId=...`
  - 若没有 live session 且 `autoAssign = false`，打开任务选择 modal
- 依赖：M03、M04、M06

## M09 — 区块 Modal

- 交付物：`components/city/DistrictModal.tsx`
- 输入：`GET /api/tasks`
- 输出：区块任务列表
- 规则：
  - 实现前必须对照 `UI/city-任务.html`
  - 每行显示任务名、产出或效果、当前参与人数、操作按钮
  - `build/work` 行在 `instance != null` 时消费 `slotId`、`progressMinutes`、`remainingMinutes`
  - `disabledReason` 为 `insufficient_resource` 时显示缺少资源说明
  - 点击按钮后调用 `POST /api/tasks/join`
  - 成功后跳转 `/focus?sessionId=...`
- 依赖：M03、M04、M06

## M10 — 专注页

- 交付物：`app/focus/page.tsx`、`hooks/use-heartbeat.ts`
- 输入：`sessionId`、`GET /api/session/current`、`POST /api/session/start`、`POST /api/session/heartbeat`、`POST /api/session/end`、`POST /api/session/bind-task`、`POST /api/session/assign-next-task`
- 输出：倒计时、结束后导航回 city 并展示 toast 摘要
- 规则：
  - `app/focus/page.tsx` 实现前必须对照 `UI/focus.html`
  - 进入 `/focus?sessionId=...` 时先查 `GET /api/session/current?sessionId=...`，加载本次待进行或进行中的 session
  - 未带 `sessionId` 进入 `/focus` 时，再查 `GET /api/session/current`，恢复可继续的 `build/work` session
  - 支持 Free Focus（无任务）与有任务两种模式，task 为可选绑定
  - 用户输入自选时长后才调用 `/api/session/start`
  - `开始/暂停` 共用一个主按钮：开始前触发 `start`，开始后只切本地 pause/resume
  - `重来` 只重置当前本地倒计时，不回滚已写入 heartbeat 贡献
  - 本地倒计时状态持久化到 `localStorage[“nlc:focus-state:<sessionId>”]`
  - 有任务时每 10 分钟发一次 heartbeat；无任务时纯本地计时
  - 建造类 session 每 30 秒轮询一次 `/api/tasks`，若实例已完成则触发 unbind + auto-assign
  - 手动停止调用 `POST /api/session/end` 时必须传 `endReason = 'manual_stop'`
  - 倒计时自然结束调用 `POST /api/session/end` 时必须传 `endReason = 'timer_completed'`
  - 结束后写摘要到 `sessionStorage[“nlc:focus-ended-toast”]` 并导航回 `/city`
  - 城市页消费 toast 摘要后展示右上角通知；若 `autoAssign = true` 且为任务 session，3 秒后自动触发下一轮 focus
- 依赖：M04、M06

## M11 — 音频系统

- 交付物：`lib/audio.ts`、`components/focus/MusicPlayer.tsx`
- 输入：本地音频文件与 Focus 页状态
- 输出：环境音与底部播放器
- 规则：
  - 播放器布局与氛围需对照 `UI/focus.html` 底部播放器区域
  - 三路环境音固定命名：`focus` / `chill` / `rest`
  - 切换时 `300ms` 淡入淡出
  - 音频状态仅存在客户端，不写服务器
- 依赖：M06

## 并行批次

| Batch | 可并行模块 | 说明 |
| --- | --- | --- |
| 1 | `M01 + M06` | 数据层与设计系统先完成 |
| 2 | `M02 + M03 + M04 + M05` | 后端能力面 |
| 3 | `M07 + M08 + M11` | 页面基础面 |
| 4 | `M09 + M10` | 交互收尾 |

禁止跨批次破坏共享契约：

- Batch 3/4 不得改表结构
- Batch 4 不得修改 API shape，只能消费 M03/M04 的既定输出
- Batch 2 不得改设计 token
