# M02 Auth Follow-ups

## 背景

当前 M02 已完成功能交付，并已通过真实 Supabase 联调：

- `POST /api/auth/login`
- `PATCH /api/users/me/settings`
- `middleware` 对受保护页面与 API 的拦截
- `getSession(req)` 会话解析

但为了遵守本次工作范围与仓库现状，仍保留一些明确的技术债、环境风险与后续补强点，建议后续统一处理。

## 待处理问题 / 风险

### 1. 鉴权基础设施偏离文档基线

**现状**

当前实现使用的是手写 Supabase Auth REST + PostgREST 调用，未使用文档基线里的：

- `@supabase/supabase-js`
- `@supabase/ssr`

**影响**

- 与 `docs/01-foundation.md` / `docs/04-modules.md` 的技术基线不完全一致
- 后续模块如果默认按官方 SSR client 读取/写入 session，可能与当前自定义 cookie 机制不兼容
- token refresh、cookie 生命周期、用户信息读取逻辑都由本地维护，后续演进成本更高

**建议**

后续统一切回官方 Supabase SSR 方案：

- 引入 `@supabase/supabase-js`
- 引入 `@supabase/ssr`
- 将 `lib/auth.ts` 中手写 REST 鉴权逻辑迁移到官方 client
- 统一浏览器 / Route Handler / middleware 的 session 读写方式

---

### 2. 当前 session cookie 是自定义格式

**现状**

当前使用自定义 cookie：

- `nlc-sb-anon-session`

cookie 内保存：

- `accessToken`
- `refreshToken`
- `expiresAt`

**影响**

- 不是 Supabase SSR 默认 cookie 结构
- 后续如果接入官方 helper，可能需要迁移 cookie 格式
- 需要持续维护编解码兼容逻辑

**建议**

后续若迁回官方 SSR client，应一并淘汰当前自定义 cookie 结构。

---

### 3. middleware 与 API handler 的鉴权层级仍是折中方案

**现状**

当前已避免 middleware 对 API 做完整 Supabase session 解析，改成：

- middleware 仅对受保护 API 检查“是否存在 session cookie”
- 真实用户解析仍在 Route Handler 中完成

这样是为了避免：

- middleware 做一次 Supabase lookup
- handler 再做一次 Supabase lookup

**影响**

- 目前行为正确，但属于折中方案，不是完整的“单层鉴权架构”
- stale cookie 会先通过 middleware，再由 handler 返回 `401`
- 如果未来受保护 API 变多，可能需要统一抽象更清晰的 auth guard

**建议**

后续二选一统一：

1. middleware 只做页面保护，API 全部在 handler 内鉴权
2. middleware 完成 API 会话解析并透传给 handler，避免重复读取 cookie / token

---

### 4. 本机 Node HTTPS 证书链存在环境问题

**现状**

真实联调时，这台机器的 Node HTTPS 请求报过：

- `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`

为完成联调，临时使用过：

- `NODE_TLS_REJECT_UNAUTHORIZED=0`

**影响**

- 这不是业务代码问题，但会影响本地直接联调 Supabase
- 以后本机继续跑 server-side fetch 访问 Supabase 时可能再次出现

**建议**

后续单独处理本机环境：

- 修复系统 / Node 证书链
- 避免继续使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`

---

### 5. 缺少自动化测试

**现状**

当前做过：

- `npm run typecheck`
- `npm run build`
- 手动 / 真实 Supabase 接口联调

但还没有新增自动化测试。

**影响**

- 后续调整 `lib/auth.ts` 时容易引入回归
- cookie 编解码、Supabase 返回体解析、middleware 分支逻辑都缺少回归保护

**建议**

后续补测试时优先覆盖：

- `parseJsonResponse()` 的非 JSON / 空响应场景
- cookie 读写与 session 解析
- login route 的“已绑定 session 不允许换绑”
- `PATCH /api/users/me/settings` 的 401 / 400 / 200
- middleware 对页面和 API 的不同分支行为

---

### 6. 直接依赖 Service Role Key 写 `public.users`

**现状**

当前服务端通过 `SUPABASE_SERVICE_ROLE_KEY` 直接访问 PostgREST，执行：

- 查询用户
- 创建用户
- 更新 `last_seen_at`
- 更新 `auto_assign`

**影响**

- 当前可用，但权限很高
- 如果未来服务端访问层继续扩展，容易把过多数据写入逻辑堆进 `lib/auth.ts`

**建议**

后续可以考虑：

- 引入更明确的 server data access 层
- 用官方 Supabase server client 替代手写 REST
- 将 auth 会话逻辑和 `users` 表读写逻辑进一步拆开

---

### 7. 匿名登录依赖 Supabase 项目配置

**现状**

当前功能依赖 Supabase 后台已开启：

- Anonymous sign-ins

此前联调实际遇到过配置缺失导致登录失败。

**影响**

- 新环境初始化时，如果忘记打开该开关，`POST /api/auth/login` 会直接失败

**建议**

后续在部署/初始化文档中显式加入检查项：

- Supabase Auth > Providers > Anonymous 已开启

---

## 建议后续修复顺序

1. 先处理本机 / 环境证书问题
2. 再补自动化测试，保护当前行为
3. 最后迁回 `@supabase/supabase-js` + `@supabase/ssr` 官方方案

## 备注

当前这些项多数属于：

- 技术债
- 基础设施一致性问题
- 环境问题
- 可维护性补强

不影响本次 M02 已验证通过的功能链路。
