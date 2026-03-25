# M10 Live Session Follow-ups

## 当前结论

- 结合 2026-03-25 的用户实测反馈与当前代码检查，`/city` 进入后仍存在一类高概率的 live session 续接问题。
- 现象是：用户已经登录并进入 `/city`，但点击 `FOCUS` 或区块任务时，可能收到 `User already has a live session.`。
- 这说明服务端仍认定该用户存在 `pending/active` session，而城市页首屏没有把它当作“应立即恢复的进行中工作”来处理。
- 当前仓库里虽然已经有“冲突后尝试恢复”的兜底逻辑，但从用户反馈看，这条路径的体验仍不稳定，至少没有把问题彻底吃掉。

## 建议后续单独修复的事项

### P1 - 高优先级：城市页未主动续接已有 live session

**现状**

- `hooks/use-city.tsx` 的 `focus()` 在 `autoAssign = true` 时，会先调用 `POST /api/tasks/assign-next`。
- `components/city/DistrictModal.tsx` 的 `handleJoin()` 会先调用 `POST /api/tasks/join`。
- 数据库函数 `rpc_assign_next_task` / `rpc_join_task` 在用户已存在 `pending/active` session 时，会返回 `CONFLICT`，错误文案即 `User already has a live session.`。
- 当前前端确实加了冲突后的恢复分支：
  - `hooks/use-city.tsx`
  - `components/city/DistrictModal.tsx`
  - 二者都会在冲突后尝试请求 `GET /api/session/current?any=1`，再跳回 `/focus?sessionId=...`

**为什么仍值得记为问题**

- 从交互设计上说，用户“已经有 live session”本质上不是异常，而是一个应被直接恢复的正常状态。
- 当前实现是“先尝试新建，再用数据库冲突回退到恢复”，这会把正常续接路径建立在错误分支上。
- 用户已经反馈在真实点击 `FOCUS` / 任务时看到了这条错误提示，说明目前的兜底体验不够稳，至少会暴露底层冲突语义。

**影响**

- 用户会误以为系统出错，而不是“你有一轮未完成工作，正在为你恢复”。
- 若恢复链路因时序、请求失败或 cookie 状态未对齐而没走通，用户会被卡在城市页，且无法继续开始任何任务。

**建议处理**

- 不要把“恢复 live session”建立在 `assign-next/join` 失败之后。
- 优先评估改成以下任一方案：
  - 进入 `/city` 时先探测 `GET /api/session/current?any=1`，若存在 live session，则直接提示恢复或自动跳转 `/focus?sessionId=...`
  - 点击 `FOCUS` / 任务前先检查 live session，只有在不存在 live session 时才调用 `assign-next` 或 `join`
- 若仍保留当前兜底，也应把前端提示改成产品语言，例如“检测到未完成工作，正在恢复”，而不是把数据库冲突原文抛给用户。

### P2 - 中优先级：`/city` 首屏缺少“进行中会话”状态注水

**现状**

- `app/city/page.tsx` 现在会服务端拉取一次 `/api/city`，解决了资源/区块信息首屏不同步的问题。
- 但这份首屏注水只覆盖城市快照，不覆盖用户当前是否持有 live session。
- 也就是说：用户即便有一轮未完成的 `pending/active` session，首屏仍会先进入标准城市页，而不是进入“恢复工作”的明确状态。

**影响**

- 页面视觉上看起来像“可自由开始新任务”，但服务端真实状态却可能是“已有未完成任务”。
- 这会放大 P1 中的冲突体验。

**建议处理**

- 评估在城市页服务端入口一并拉取当前 live session 摘要，至少把 `hasLiveSession` 注入客户端。
- 若不想在 `/city` 首屏直接跳转，也应把底栏主按钮文案切为“RESUME FOCUS”或类似语义，避免误导。

### P3 - 待复现确认：刷新后出现“需要登录”的主观感知

**现状**

- 用户此前反馈过：刷新后信息同步了，但界面提示需要登录。
- 仅从本轮代码检查，尚不足以直接证明该问题稳定存在；更像是登录态刷新、页面 SSR 注水与客户端 API 请求三者之间可能有短暂不同步。

**当前判断**

- 这条问题目前证据不足，不能直接定性为已确认 bug。
- 但它与 P1/P2 同属“首屏状态与服务端真实 session 状态不同步”的大类风险，值得在后续联调里一起验证。

**建议处理**

- 在正式回归里加入一条浏览器用例：`登录 -> 进入 /city -> 刷新 -> 点击 FOCUS -> 能恢复或继续`。
- 若复现，再单独判断是 cookie 刷新问题、middleware 问题，还是客户端首屏状态问题。

## 推荐验证清单

- `baby` 登录后直接进入 `/city`，若数据库中已有 `pending/active` session，页面应明确进入恢复路径。
- 点击 `FOCUS` 时，不应再先向用户暴露 `User already has a live session.`。
- 打开区块任务弹窗并点击任一可加入任务时，若已有 live session，应恢复原 session，而不是报错。
- 浏览器刷新 `/city` 后，登录态、城市快照与 live session 状态应保持一致。

## 当前是否建议直接在本分支顺手改实现

- 如果目标只是把风险记录清楚：可以先进入 PR。
- 如果目标是让用户实测不再撞到该问题：建议下一步单独做一轮 live session 恢复链路修复，并补浏览器回归。
