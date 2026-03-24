# M07 Follow-ups

## 当前结论

- `app/page.tsx` 已按 `docs/04-modules.md` 的 M07 契约实现登录页。
- 当前分支不建议为规避现状去改登录成功后的跳转目标；`/city` 仍应保持为既定下一站。
- 仍有若干明确的遗留问题与环境风险，建议在后续模块或独立 fix 分支处理。

## 已完成验证

- `npm install`：已完成
- `npm run typecheck`：通过
- `npm run build`：通过
- 本地运行 `PORT=3100 npm start`：通过
- `GET /`：返回 `200`，页面 HTML 中可见以下关键文案：
  - `Frostpunk Tales`
  - `The Great`
  - `Citizen Designation`
  - `Initialize Survival`
- `POST /api/auth/login` 传非法用户名（仅空格）：返回 `400 VALIDATION_ERROR`
- `GET /city` 未登录访问：返回 `307` 重定向到 `/`

## 待处理问题 / 风险

### 1. 登录成功后会落到 `/city`，但 M08 页面尚未落地

**现状**

- `app/page.tsx` 登录成功后执行 `router.push("/city")`
- `middleware.ts` 将 `/city` 视为受保护页面
- 当前仓库没有 `app/city/page.tsx`

**影响**

- 若登录成功且 session 正常建立，请求会进入 `/city`
- middleware 会放行已登录用户
- 但由于页面文件尚不存在，最终会看到 404，而不是城市主界面

**判断**

- 这不是 M07 页面实现错误
- 这是 M08 页面尚未接入导致的阶段性缺口
- 不建议在 M07 中改成跳去其他地址，也不建议移除 `/city` 的受保护配置，否则会偏离既定契约

**建议处理**

- 由 M08 按模块边界补齐：
  - `app/city/page.tsx`
- 在 M08 落地前，评审时需明确：当前登录成功后的下一屏仍不可用

---

### 2. `app/CLAUDE.md` 仍描述 `page.tsx` 为 M06 预览页

**现状**

- `app/page.tsx` 已变更为 M07 登录页
- `app/CLAUDE.md` 仍写着：`page.tsx: M06 设计系统预览页`

**影响**

- 与当前代码职责不一致
- 会误导后续接手 `app/` 目录的开发者
- 不符合仓库自己的更新协议

**本次为何未修**

- 本轮任务硬约束只允许修改 `app/page.tsx`
- 因此该问题已识别，但未在本分支越界修复

**建议处理**

- 在允许修改文档说明的后续小修中更新：
  - `app/CLAUDE.md`

---

### 3. 当前环境缺少 Supabase 配置，导致真实登录链路无法在本地完成

**现状**

- 根目录未发现 `.env` / `.env.local` 一类运行时配置文件
- 当前进程环境中以下变量均缺失：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 在本地运行服务后，请求：
  - `POST /api/auth/login` with `{ "username": "王五" }`
  - 返回 `500 CONFLICT`
  - 响应消息为：`Login failed.`

**影响**

- 当前可以验证：页面渲染、前端结构、无效输入的接口错误返回、未登录访问 `/city` 的保护行为
- 当前不能验证：
  - 真实登录成功
  - Supabase anonymous session 建立
  - 登录后成功跳转到受保护页面

**判断**

- 这更像是本地环境配置缺失，而不是 `app/page.tsx` 的前端逻辑问题
- 但在环境补齐前，不能声称真实登录链路已完成本地联调

**建议处理**

- 补齐 Supabase 相关环境变量
- 补齐后重测：
  - `POST /api/auth/login` 合法用户名成功返回 `200`
  - 浏览器中登录成功后跳转 `/city`

---

## 建议的后续修复顺序

1. 由 M08 补齐 `app/city/page.tsx`
2. 在允许越界的小修中更新 `app/CLAUDE.md`
3. 补齐 Supabase 环境变量后，完整联调登录成功链路
4. 再补一次浏览器层面的手工验收

## 当前是否可进入 PR

可以，但需要在 PR 描述中明确写出：

- M07 登录页已完成
- `/city` 下一屏尚待 M08 提供
- `app/CLAUDE.md` 描述滞后，未在本次范围内修复
- 本地自动化验证已通过 `typecheck` 与 `build`
- 真实登录联调受 Supabase 环境缺失限制，当前仅验证到失败分支与路由保护行为
