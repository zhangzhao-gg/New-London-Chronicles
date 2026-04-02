# 2026-04-02 City 界面优化计划

## 优化清单

### 1. Citizen Hope & Discontent 填充虚拟值 — 已实施

- 现象：Hope / Discontent 面板显示空进度条 + "Telemetry unavailable"
- 方案：填入虚拟数值（Hope 65%、Discontent 28%，参考 city.html），进度条上色并显示百分比
- 实现：Hope 进度条 `w-[65%]` 橙色发光，Discontent `w-[28%]` 红色，右上角显示百分比数字
- 文件：`components/city/CityPageShell.tsx`

### 2. City Log 字号过小 — 已实施

- 现象：时间戳 `text-[9px]`，正文 `text-[10px]`，阅读困难
- 方案：时间戳提至 `text-[11px]`，正文提至 `text-xs`（12px），行高适配
- 文件：`components/city/CityPageShell.tsx`

### 3. 按钮左侧图标不见 — 已实施

- 现象：底部 Districts / Focus 和侧边栏导航按钮用 Unicode 字符，部分环境不渲染
- 方案：替换为内联 SVG 图标
- 实现：提取 `components/city/CityIcons.tsx`，包含 NavIconMap、NavIconBuild、NavIconPersonnel、NavIconAlerts、BottomIconDistricts、BottomIconFocus、SettingsGlyph、GlobeGlyph
- 文件：`components/city/CityIcons.tsx`（新）、`components/city/CityPageShell.tsx`

### 4. 区域悬浮框太窄 — 已实施

- 现象：鼠标 hover 六大区域弹出的 tooltip 非常窄，信息挤压
- 方案：给 Tooltip 设置 `min-w-[220px] max-w-80`，padding 从 `px-3 py-2` 扩大到 `px-4 py-3`
- 文件：`components/ui/Tooltip.tsx`

### 5. 【重点】默认路由改为 city — 已实施

- 现象：访问 `/` 显示登录页，需要手动导航到 `/city`
- 实现：
  1. `app/page.tsx` 重写为 server-side `redirect("/city")`
  2. 登录页迁移至 `app/login/page.tsx`
  3. `middleware.ts` 未登录重定向改为 `/login`
  4. 全局搜索 5 处 `redirect("/")` 改为 `redirect("/login")`
- 文件：`app/page.tsx`、`app/login/page.tsx`（新）、`middleware.ts`、`app/city/page.tsx`、`app/focus/page.tsx`、`app/complete/page.tsx`

### 6. 区域详情骨架屏 + 任务卡片重构 — 已实施

- 现象：点击区域后 DistrictModal 加载慢且任务卡片布局与设计图（`UI/city-任务.html`）不符
- 方案：骨架屏 + 任务卡片全面对齐设计图
- 实现：
  1. **Hero section**：纯 CSS 渐变替换为 city 背景图（`brightness-[0.4] contrast-125` + 底部渐变），标题浮在图片底部
  2. **Featured 首条任务**：大卡 `p-6 gap-6`、80×80 灰度缩略图、实心填充按钮（hover 反转为描边）
  3. **普通任务**：紧凑卡 `p-4 gap-4`、56×56 灰度缩略图、描边按钮（hover 加底色）
  4. **骨架屏**：2 条占位卡匹配新布局（缩略图 + 信息 + 按钮占位）
  5. `districtCopy` 移除废弃的 `hero` 渐变字段
- 文件：`components/city/DistrictModal.tsx`

### 7. 统一页面过渡加载动画 — 已实施

- 现象：页面切换期间无反馈，仅 city→focus 有过渡动画
- 方案：将过渡动画统一内置到 `navigateTo()` 导航函数中
- 实现：
  1. `lib/client-navigation.ts` 在 `window.location.assign/replace` 前注入 DOM 遮罩
  2. 动画内容：冰汽时代风格齿轮旋转 + 铲煤工人剪影 + 蒸汽粒子（复用 `globals.css` 动画类）
  3. 遮罩文案支持 i18n（读取 localStorage locale）
  4. 页面跳转后自然销毁，无需手动清理
- 覆盖范围：所有 `navigateTo()` 调用（login→city、city→focus、focus→complete、complete→city 等）
- 删除：`components/city/FocusTransitionOverlay.tsx`（React 组件已被 DOM 注入替代）
- 文件：`lib/client-navigation.ts`、`app/globals.css`（动画 keyframes）

### 8. 语言切换功能（i18n）— 已实施方案 A

- 现象：右上角地球按钮无功能，当前硬编码中英文混合
- 方案：轻量字典映射 `t(key, locale)` + localStorage 持久化
- 实现：
  1. `lib/i18n.ts`：导出 `t()` 函数、zh-CN/en-US 双语字典（~310 行）、locale 持久化工具
  2. 地球按钮点击弹出语言选择下拉菜单，支持切换 zh-CN / en-US
  3. 已接入 i18n 覆盖范围：
     - Header：标题、副标题、导航栏（Logistics / Council / Archives）
     - 侧边栏：导航按钮、Hope / Discontent 标签、City Log 标题与空状态
     - 资源条：煤炭 / 木材 / 钢材 / 生食材 / 食物配给 / 蒸汽核心 / 温度
     - 地图：左上角标签（Great Frost / 大霜冻）、区块战术视图
     - 六大区块地图：badge / label / tooltip / footer 全部 i18n
     - 核心能量枢纽：名称、标签、info 消息
     - District Overview 面板：标题 / ID / 选中区块 / 健康状态 / 法令
     - 区块状态 badge：可采集 / 建造进行中 / 资源不足 / 无进行中任务
     - 底部操作栏：Districts / Focus / Captain's Log / 管理者 / 在线人数
     - 状态通知：同步 / 轮询 / 遥测消息
     - 过渡动画：标题 / 副标题
  4. 语言偏好持久化到 localStorage，刷新后保持
- 文件：`lib/i18n.ts`（新）、`components/city/CityPageShell.tsx`、`lib/client-navigation.ts`
- 后续：DistrictModal / FocusExperience / CompleteExperience 可渐进接入

## 实施状态

全部 8 项优化已完成实施。tsc 编译零错误，文件均在 800 行限制内。
