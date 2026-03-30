# 2026-03-26 Fix Summary

## 已修复（本轮 bugfix）

### 1. Focus 页 session 恢复失败时红色报错

- 修复：catch 分支改为静默重定向回 `/city`，不再展示错误框
- 文件：`components/focus/FocusExperience.tsx`

### 2. City 区块任务冲突时显示红色错误框

- 修复：CONFLICT 响应改为右上角 toast 提示 + 模态框抖动，不再用红色 error 框
- 文件：`components/city/DistrictModal.tsx`、`app/globals.css`（shake/toast 动画）、`components/ui/Modal.tsx`（panelClassName）

### 3. 多标签页重复结算 session

- 修复：`use-heartbeat` 新增 localStorage 跨标签通知，一个标签结束后其他标签自动检测并跳转
- 文件：`hooks/use-heartbeat.ts`

### 4. City 六大区块全部挤在中央

- 修复：区块定位从 Tailwind class 改为 inline style，并修复 Tooltip 的 `relative` wrapper 导致绝对定位失效的问题
- 文件：`components/city/CityPageShell.tsx`、`components/ui/Tooltip.tsx`

### 5. 医疗站与其他区块重叠

- 修复：调整医疗站定位至 `top: 28%, right: 22%`
- 文件：`components/city/CityPageShell.tsx`

### 6. 哨站和工业资源区颜色不明显

- 修复：工业资源区 slate → amber，哨站 slate → cyan
- 文件：`components/city/CityPageShell.tsx`

### 7. Focus Shift Objectives 改为交互式待办事项

- 修复：替换硬编码 objectives 为 localStorage 持久化的 todo list，支持添加/打勾（横杠效果）/删除
- 文件：`components/focus/FocusExperience.tsx`

### 8. Focus 布局重构：Expedition Notes 归入左侧面板底部

- 修复：Expedition Notes 从独立 section 移入 Shift Objectives 同一面板，用 `mt-auto` 推到底部
- 文件：`components/focus/FocusExperience.tsx`

### 9. 音乐播放器播放按钮缺圆角

- 修复：添加 `rounded-lg`
- 文件：`components/focus/MusicPlayer.tsx`

### 10. Focus 右上角 toast 不会自动消失

- 修复：SystemNotice 添加 2.8s 自动淡出消失逻辑
- 文件：`components/focus/FocusExperience.tsx`

### 11. Duration 输入框移入番茄钟内

- 修复：删除底部 Duration 区块和提示文案，改为番茄钟圆盘内时间右侧上下三角按钮（±5 分钟），运行中自动隐藏
- 文件：`components/focus/FocusExperience.tsx`

### 12. Focus 播放/重置按钮缺圆角

- 修复：TimerControl 添加 `rounded-lg`
- 文件：`components/focus/FocusExperience.tsx`

## 历史已修复（之前轮次）

- Focus 默认 25 分钟不可直接开始
- City 首屏在常见桌面视口下显示不全
- Focus 页面整体比例过大
- 完成页"选择下一个任务"不能真正打开任务选择
- Focus 深链恢复不稳定
- 计时结束与 heartbeat 提交竞态
- 按钮无障碍名不足导致测试和交互不稳
- City 底部 FOCUS 在已有 live session 时暴露冲突 JSON
- Focus 页面缺少返回 City 的入口
- 底部 FOCUS 在关闭 Auto assign 后仍错误打开任务列表
- next dev 与 next build/start 共用产物目录导致 /focus 500
- 登录态在 30 分钟到 1 小时左右失效
- heartbeat 已成功返回但 building_completed 仍卡在 Focus
- Playwright webServer 自动起服务误判 ready

## 还没修复的问题

### 1. 失效或已结束的 sessionId 深链回退

- 现象：访问 `/focus?sessionId=...` 时，如果 sessionId 已失效，页面仍可能停在错误态
- 状态：未修复

### 2. /complete 在 next dev 下偶发 chunk 404

- 现象：结算后浏览器偶发请求 chunk 返回 404
- 状态：未根治

## 已完成的验证

- `npx tsc --noEmit` 通过（排除预存 Playwright 类型错误）
- 8 个文件修改，387 行新增，158 行删除
