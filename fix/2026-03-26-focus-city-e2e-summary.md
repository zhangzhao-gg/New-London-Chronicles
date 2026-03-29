# 2026-03-26 Fix Summary

## 已修复

### 1. Focus 默认 25 分钟不可直接开始

- 已修复：`pending` session 进入 `/focus` 后会初始化真实的 25 分钟本地状态
- 当前结果：默认 `duration=25`，开始按钮可直接点击

### 2. City 首屏在常见桌面视口下显示不全

- 已修复：压缩了城市页桌面布局，底部操作带和右下角个人卡重新回到首屏可视区
- 当前结果：`1440x900` 下首屏完整可见

### 3. Focus 页面整体比例过大

- 已修复：收紧了头部、左侧辅助区、主计时区、底部导航和播放器尺寸
- 当前结果：`1440x900` 下不再依赖浏览器缩放才能正常使用

### 4. 完成页“选择下一个任务”不能真正打开任务选择

- 已修复：完成页改为跳 `/city?openTasks=1`，城市页会自动打开任务 modal

### 5. Focus 深链恢复不稳定

- 已修复：`/focus` 服务端入口会读取 `searchParams.sessionId` 并下传给客户端恢复链

### 6. 计时结束与 heartbeat 提交竞态

- 已修复：结束判定已纳入待提交 heartbeat 状态，避免进度和完成态抢跑

### 7. 按钮无障碍名不足导致测试和交互不稳

- 已修复：Focus 主按钮、重来等关键操作已补上可稳定访问的名称

### 8. City 底部 `FOCUS` 在已有 live session 时暴露冲突 JSON

- 已修复：已有 live session 时会直接恢复到当前 `/focus?sessionId=...`

### 9. Focus 页面缺少返回 City 的入口

- 已修复：Focus 页左上已加入“返回城市”按钮

### 10. 区块弹窗 `前往工作` 在已有 live session 时跳错页面

- 已修复：区块任务冲突时不再自动跳转，而是在 modal 内提示“你已经有工作了，请先完成当前专注任务。”

### 11. 底部 `FOCUS` 在关闭 Auto assign 后仍错误打开任务列表

- 已修复：点击 `FOCUS` 现在会先检查 live session；若存在，优先恢复；若不存在，再按 Auto assign 分支处理

### 12. `next dev` 与 `next build/start` 共用产物目录导致 `/focus` 500

- 已修复：开发态使用 `.next-dev`，构建/生产态继续使用 `.next`
- 当前结果：`/focus` 的 `.next/server/app/focus/page.js` 丢失问题已收敛

### 13. 登录态在 30 分钟到 1 小时左右失效

- 已修复：自定义 cookie `nlc-sb-anon-session` 不再把浏览器过期时间绑定到 Supabase access token 的 `expires_at`
- 根因：浏览器之前会在 access token 到期时把整个 cookie 一起删掉，连 refresh token 也一并丢失
- 当前结果：access token 失效后，后端仍可借助 refresh token 自动续期

### 14. heartbeat 已成功返回但 `building_completed` 仍卡在 Focus

- 已修复：heartbeat sender effect 不再因为 `isHeartbeatInFlight` 的状态切换立刻 cleanup 自己，成功返回后会继续写 `/api/session/end` 并跳转 `/complete`
- 补充修复：本地持久化现在会记录已确认 heartbeat 数，恢复 session 时会补回未同步队列；build/work 轮询也加了并发保护
- 当前结果：`build session completion enters complete with building_completed` E2E 已通过，`timer_completed` 与 `building_completed` 结算链都能稳定落到 `/complete`

### 15. Playwright `webServer` 自动起服务误判 ready

- 已修复：Playwright 配置从 `url` readiness probe 改成 `port`，并通过 `PLAYWRIGHT_REUSE_EXISTING_SERVER` 显式控制是否复用现有 server
- 当前结果：不手动起 server 时，E2E 也能自动拉起 `next start` 并稳定执行

## 还没修复的问题

### 1. 失效或已结束的 `sessionId` 深链回退

- 现象：访问 `/focus?sessionId=...` 时，如果 `sessionId` 已失效、已结束或不属于当前可恢复会话，页面仍可能停在错误态
- 正确预期：应稳定回退到 `/city`
- 状态：未修复

### 2. `/complete` 在 `next dev` 下偶发 chunk 404

- 现象：结算后浏览器偶发请求 `/_next/static/chunks/app/complete/page.js` 返回 `404`
- 当前判断：这是 Next dev / HMR / manifest 运行态异常，不是 `POST /api/session/end` 业务错误
- 当前临时处理：停掉 dev、隔离 `.next-dev`、重新启动 `npm run dev:insecure`
- 状态：未根治

### 3. `Duration` 的可编辑规则还没完全确认

- 现状：只能确认 `active + running` 时不可编辑是设计行为
- 未确认部分：`pending` 或 `paused` 态下是否仍存在偶发不可编辑
- 状态：待确认

### 4. 双窗口下另一窗口仍可再次点击结算

- 现象：同一个 focus session 同时开两个窗口时，一个窗口完成结算后，另一个窗口仍可能继续点一次“结算”
- 初步判断：当前 `endingRef` 只是单窗口内存态，没有做跨窗口的 `ending/ended` 同步
- 风险判断：按 [`docs/03-api-contracts.md`](../docs/03-api-contracts.md) 约定，`POST /api/session/end` 应为幂等，且 `city_logs` 每个 session 只写一条；理论上不应重复计算或重复写日志
- 仍未确认：虽然文档契约如此，但当前还没有针对“双窗口重复点击结算”做专项数据库或 E2E 验证，所以是否绝对不会重复计账，暂时不能下最终结论
- 状态：未修复，是否重复计账待验证

## 仍有风险或覆盖不足的场景

### 1. 未补足的专项链路

- `resource_exhausted`
- `timeout` 12 小时链路
- `medical-shift/no_patients`

### 2. 并发与运行态风险

- 多人并发 heartbeat / 建造完成竞态还没有高压力验证
- 当前鉴权链是手写 Supabase Auth REST + 自定义 cookie，不是官方 Next.js SSR 最佳实践，后续仍有维护风险

## 已完成的验证

- `npx tsc --noEmit` 通过
- `NODE_TLS_REJECT_UNAUTHORIZED=0 npm run --silent build` 通过（仅限本地临时调试，禁止用于 CI/生产）
- `PLAYWRIGHT_START_COMMAND='npm run start:insecure' NODE_TLS_REJECT_UNAUTHORIZED=0 npx playwright test tests/e2e/app.spec.ts --reporter=line` 通过（仅限本地临时调试，禁止用于 CI/生产）
- 全量 `tests/e2e/app.spec.ts` 结果：`10 passed`

## 说明

- 语言切换当前按 `docs/README.md` 与 `docs/04-modules.md` 只要求“占位”，不列为未修 bug
- `Newsreader` 远端字体请求问题已处理，不再列为遗留项
- 环境音按钮暂停行为已处理，不再列为遗留项
- `Focus` 顶部提示改成右上角 toast 目前属于体验优化，不计入未修 bug
