# 2026-03-26 Focus / City Review, Fixes, and E2E Summary

## 本次完成了什么

- 先按 `PRD.md`、`docs/README.md`、`docs/01-foundation.md`、`docs/03-api-contracts.md`、`docs/04-modules.md`、`README.md` 作为业务真相源，审查了 `/city`、`/focus`、`/complete`、相关 API 与状态恢复链路。
- 补齐了最小可用的 Playwright + Chromium headless E2E 基建。
- 针对真实用户流补了浏览器端端到端测试，不只停留在单元测试。
- 修了多处影响真实流程的 bug，包括 session 恢复、完成页回跳、默认 25 分钟不可开始、City 首屏溢出、Focus 过大等问题。
- 在真实接口和真实页面上复跑构建、类型检查和 E2E。

## 新增或修改的测试基建

- 新增 `playwright.config.ts`
- 新增 `tests/e2e/app.spec.ts`
- 新增 `tests/e2e/helpers/supabase-admin.ts`
- 新增 `tests/e2e/README.md`
- 更新 `package.json`
  - 增加 `typecheck`
  - 增加 `test:e2e`

## 这次修了什么

### 1. Focus 默认 25 分钟显示了，但开始按钮不可点击

- 现象：进入 `/focus` 后看到默认 `25` 分钟，但“开始”按钮是灰的；只有手动改一下输入框才可点击。
- 影响：直接阻断最核心的工作开始流程。
- 修复：
  - `hooks/use-heartbeat.ts`
  - 对 `pending` session 在无本地持久态时直接初始化真实的 `25` 分钟状态，而不是只显示一个占位值。
- 结果：
  - 进入 `/focus` 时默认 `duration=25`
  - “开始”按钮立即可点击

### 2. City 首屏在常见桌面视口下显示不全

- 现象：`1440x900` 下，底部 `Districts / Focus` 与右下角个人名牌曾被挤出视口。
- 影响：City 首屏可读性差，关键操作入口与状态信息丢失。
- 修复：
  - `components/city/CityPageShell.tsx`
  - 收紧桌面布局高度，控制主区域溢出方式，压缩操作带和边栏节奏。
- 结果：
  - 无头截图验证 `scrollHeight=900`、`clientHeight=900`
  - 关键底部按钮与名牌重新回到可视区

### 3. Focus 页面整体比例过大，必须浏览器缩到 80% 才能看着舒服

- 现象：Focus 主卡、左侧目标区、底部导航与播放器叠加后，整体显得过大、过重。
- 影响：桌面端视觉密度失衡，主焦点不明确。
- 修复：
  - `components/focus/FocusExperience.tsx`
  - `components/focus/MusicPlayer.tsx`
  - 同步压缩头部、左侧辅助区、主计时卡、底部 tab、音频播放器。
- 结果：
  - `1440x900` 下首屏完整可见
  - 主计时区更集中，页面不再依赖浏览器缩放才能正常使用

### 4. 完成页“选择下一个任务”不能真正打开任务选择

- 现象：按钮只回 `/city`，没有打开任务选择 modal。
- 修复：
  - `components/focus/CompleteExperience.tsx`
  - `components/city/CityPageShell.tsx`
  - 通过 `/city?openTasks=1` 回城，并在城市页自动打开任务 modal。

### 5. Focus 深链恢复不稳定

- 现象：直接打开 `/focus?sessionId=...` 时，客户端恢复链不稳定。
- 修复：
  - `app/focus/page.tsx`
  - `components/focus/FocusExperience.tsx`
  - 改为服务端读取 `searchParams` 并下传 `initialSessionId`，减少刷新/深链场景的不稳定性。

### 6. 计时结束与 heartbeat 提交之间存在竞态

- 现象：在倒计时归零同时又应提交 heartbeat 的边缘时刻，可能先进入 `timer_completed`，导致 build/work 进度丢失或完成态判断错误。
- 修复：
  - `hooks/use-heartbeat.ts`
  - 在结束判定中纳入待提交 heartbeat 的引用状态，避免抢跑。

### 7. 自动化测试定位依赖文案或无障碍名不足

- 修复：
  - `components/focus/FocusExperience.tsx`
  - 补充开始/暂停、重来等按钮的可访问名称。
  - `tests/e2e/app.spec.ts`
  - 将部分脆弱的文案断言收敛为更稳定的行为断言。

## 实际跑了什么

### 构建与静态检查

- `npm run build`
- `npm run typecheck`

结果：

- 均通过

### 浏览器端 E2E

命令：

- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test tests/e2e/app.spec.ts --reporter=line`

最终结果：

- `7 passed (1.9m)`

覆盖到的真实流程包括：

- 新用户登录并进入 `/city`
- 未登录访问受保护页被拦截
- 城市页 hover tooltip
- 打开区块 modal 并查看任务列表
- `autoAssign=false` 下从任务进入 `/focus`
- `/focus` 开始、暂停、继续、重来、手动停止
- 自然结束进入 `/complete`
- `building_completed` 进入完成页
- `autoAssign=true` 下完成页自动续到下一任务
- 资源不足导致按钮禁用
- build/work session 带 `sessionId` 与不带 `sessionId` 的恢复
- 缺失 summary 时从 `/complete` 回退 `/city`

### 无头截图验证

额外做了两类截图验证：

- `city` 首屏在 `1440x900` 下是否完整显示
- `focus` 首屏在 `1440x900` 下是否完整显示，且默认 `25` 分钟可直接开始

当前结果：

- `city`: `scrollHeight=900`, `clientHeight=900`
- `focus`: `scrollHeight=900`, `clientHeight=900`, `durationValue="25"`, `startDisabled=false`

## 还存在的问题

### 1. 失效 `sessionId` 深链回退仍未修

- 当前如果 `sessionId` 已失效或已结束，`/focus` 仍可能停在错误态，而不是按文档回退 `/city`。
- 这是现存最明确的已知功能缺口。
### 2. 登陆信息很快就失效

- 登陆大概30-1小时左右，登陆信息会失效，不确定是什么原因导致的

### 3. foucs界面的三个按钮focus，chill,rest点击之后无法暂停音乐

- 点击之后会播放，再点击就暂停。且按钮恢复未点击状态。

### 4. city界面待优化

- 顶部栏特别胖，左侧栏特别瘦，导致整体比例怪怪的。
- 左侧栏City Temperature 与Active Builders 的部分代码删掉，暂时不展示
- 中间6大区块部分重叠在一起，需要别让区块积压在一起，建议使用无头浏览器截图然后与city.html进行对比

### 5. city界面顶部的语言功能并未实装
- 顶部语言理论上可以切换中文和英文，但是并没有实装，且目前展示的是两个大按钮，EN US和ZH CN 。建议当前版本先不做语言，但是可以把图标换成citu.html里面的地球图标

### 6. 字体请求有问题
- https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;500;600;700&display=swap 很多界面用到了这个字体库，但是url 是错误的。所以一直请求失败，建议废弃该库，当前字体已经足够美观

### 7. focus界面Duration按钮
- 该界面Duration按钮似乎大部分情况下都无法进行修改，这是不合理的，应该可以编辑才行。需要具体调查一下什么时候可编辑，什么时候不可编辑。

### 8. focus界面显示优化

- 本地倒计时继续。已暂停本地倒计时。  这个展示的部分建议可以做成右上角小弹窗，这样视觉效果好看。

### 9. focus界面疑似时间倒计时有点问题
- 倒计时似乎没有按照真实时间长度走，目前不清楚怎么回事，我明明似乎现实生活中已经过了好一会了，但是系统里时间明显要慢一些。

## 还没完全覆盖或仍有风险的场景

### 未完全覆盖

- `resource_exhausted` 的被动结束链路
- `timeout` 的 12 小时超时链路
- `medical-shift/no_patients` 的独立完成页链路
- 心跳/轮询在多人并发下的更深层竞态验证

### 已覆盖但仍应保持警惕

- `autoAssign=true` 的自动续任务
  - 这条链路之前出现过一次不稳定，本次全量回归已通过，但仍建议后续继续观察
- `building_completed`
  - 本次已跑通，但它天然依赖 heartbeat 与建造进度收口，后续仍值得保留回归

## 这次删除了什么

删除原因：

- `fix/` 里原有几份 follow-up 文档是分模块、分阶段记录，部分内容已经过时，且会和本次完整总结冲突。
- 这些文件已经被这份汇总文档覆盖，不再单独保留。

删除对象：

- `fix/m07-followups.md`
- `fix/m08-followups.md`
- `fix/m10-live-session-followups.md`
- `fix/m11-audio-risks.md`

