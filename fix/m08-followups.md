# M08 Follow-ups

## 当前状态

- `app/city/page.tsx` 已落地城市地图页入口
- `hooks/use-city.ts` 已落地 HUD、30 秒轮询、district tooltip、auto-assign / modal 分支
- 2026-03-24 本地已验证 `npm run typecheck`
- 2026-03-24 本地已验证 `npm run build`

## 建议后续单独修复的事项

### P1 - 联调阻塞，建议单独 fix 分支处理

1. `FOCUS` 主 CTA 依赖 `/focus` 路由，但当前仓库不存在该页面
   - 现状：M08 按 `docs/04-modules.md` 契约，在 `autoAssign = true` 时跳转 `/focus?sessionId=...`
   - 代码落点：`hooks/use-city.ts` 的 `focus()` 流程、`lib/task-rpc.ts` 的 assign-next 返回结果消费
   - 仓库现状：当前 workspace 不包含 `app/focus/page.tsx`，`npm run build` 也不会生成 `/focus` 路由
   - 影响：单独验收城市页时，点击 `FOCUS` 会直接进入 404
   - 判断：这是 M08 与 M10 之间的集成缺口，不应在当前分支擅自改跳转契约或私自加非约定 fallback
   - 建议：由 M10 落地 `/focus` 路由后联调；如需临时占位页，必须由模块负责人明确批准跨模块处理范围

### P2 - 可在后续收敛批次处理

2. `app/city/page.tsx` 存在重复鉴权读取
   - 现状：页面服务端入口会调用 `getSession()` 解析当前用户；同时 `middleware.ts` 已对 `/city` 做受保护校验，并会在 refresh 成功时回写 cookie
   - 当前判断：现有实现没有确认复现“进入 `/city` 后马上被 `/api/city` 401”这一 correctness bug
   - 影响：当前更像重复 session 解析与额外 auth 开销，存在后续维护成本
   - 建议：如果后续统一页面级用户注水方案，可收敛这段逻辑，减少重复 auth lookup；但不建议在本分支顺手改动认证链路

3. `hooks/use-city.ts` 当前使用 `// @ts-nocheck`
   - 原因：当前任务强约束文件名为 `hooks/use-city.ts`，但该文件同时承载 hook 与客户端视图导出
   - 影响：本地可构建、可运行，但失去该文件内部的完整 TypeScript 保护
   - 建议：若后续允许拆出 `.tsx` 视图壳层，建议恢复强类型检查并去掉 `ts-nocheck`

### P3 - 当前按契约执行，不建议在 fix 中直接改实现

4. 温度显示固定 `-20°C`
   - 现状：`GET /api/city` 已返回 `temperatureC`
   - 当前实现：按 `docs/04-modules.md` 与 PRD 的锁定规则，资源栏固定展示 `-20°C`
   - 判断：这不是当前 M08 的实现偏差；如果后续温度要改为动态值，应先更新真相源文档，再调整前端渲染

## 建议的 fix 分支范围

- 验证并明确 `/focus` 路由的归属与联调时间点
- 如负责人确认需要，再补临时 `/focus` 占位方案或联调说明
- 在不改认证契约的前提下，评估是否收敛页面级重复 session 读取
- 若文件命名约束解除，拆分 `hooks/use-city.ts` 的视图导出并恢复类型检查

## 本次不建议在当前分支顺手处理的事

- 不要为了绕开 404 擅自修改 `FOCUS -> /focus?sessionId=...` 的既定契约
- 不要在 M08 中补 M09 的任务列表逻辑
- 不要把温度从固定值切到动态值，除非文档先改
- 不要跨模块改 API route、数据库结构或未分配页面
