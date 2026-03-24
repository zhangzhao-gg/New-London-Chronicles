# 01 - Foundation

## 0. 文档目标

本文件定义项目骨架，不讨论实现风格。并行开发时，这里的栈、目录与部署口径不能被各模块自行修改。

## 1. 技术栈与精确版本

| 类别 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | `22.14.0` | 统一本地与服务器运行时 |
| TypeScript | `5.8.2` | 全仓 `strict: true` |
| Next.js | `15.2.4` | App Router + Route Handlers |
| React | `19.0.0` | 与 Next 15 配套 |
| Tailwind CSS | `4.1.1` | 设计 token 与页面样式 |
| `@supabase/supabase-js` | `2.49.4` | 数据访问与 Auth |
| `@supabase/ssr` | `0.5.2` | Next.js Cookie Session 读写 |
| `ts-node` | `10.9.2` | 运行定时任务脚本 |
| `jose` | `6.0.8` | 预留给未来内部签名场景，MVP 不参与用户鉴权 |

## 2. 鉴权模型

登录流程固定如下：

1. `POST /api/auth/login` 接收 `username`
2. Route Handler 通过 Supabase SSR Client 创建或恢复 anonymous session，并把 session 写入 httpOnly cookie
3. 服务端按 `username` 查找或创建业务表 `users`
4. 服务端把 `app_user_id` 与 `username` 写入 Supabase anonymous auth user 的 `user_metadata`
5. 受保护 API 通过 Supabase cookie session 读取 `authUserId + user_metadata`，再解析为业务用户

约束：

- Supabase anonymous auth 只负责浏览器会话，不是最终业务身份。
- 长期身份仍然以 `users.username` 为准。
- 允许相同用户名跨设备再次登录。
- `jose` 不参与当前 MVP 登录态。
- `JWT_SECRET` 不再是 MVP 必需环境变量。

## 3. 目录结构规范

```text
/
├─ app/
│  ├─ api/
│  │  ├─ auth/login/route.ts
│  │  ├─ users/me/settings/route.ts
│  │  ├─ city/route.ts
│  │  ├─ tasks/route.ts
│  │  ├─ tasks/join/route.ts
│  │  ├─ tasks/assign-next/route.ts
│  │  ├─ session/current/route.ts
│  │  ├─ session/start/route.ts
│  │  ├─ session/heartbeat/route.ts
│  │  ├─ session/end/route.ts
│  │  ├─ logs/route.ts
│  │  └─ internal/city/upkeep/route.ts
│  ├─ city/page.tsx
│  ├─ focus/page.tsx
│  ├─ complete/page.tsx
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ city/
│  ├─ focus/
│  ├─ hud/
│  └─ ui/
├─ hooks/
│  ├─ use-city.tsx
│  └─ use-heartbeat.ts
├─ lib/
│  ├─ auth.ts
│  ├─ audio.ts
│  ├─ constants.ts
│  ├─ cron.ts
│  ├─ resource-format.ts
│  ├─ supabase-browser.ts
│  ├─ supabase-server.ts
│  ├─ supabase-admin.ts
│  └─ task-rpc.ts
├─ public/
│  ├─ audio/
│  ├─ images/
│  └─ fonts/
├─ scripts/
│  └─ task-strategy.ts
├─ supabase/
│  ├─ migrations/
│  │  ├─ 001_create_tables.sql
│  │  ├─ 002_seed_task_templates.sql
│  │  └─ 003_task_rpc.sql
│  └─ seed.sql
├─ types/
│  ├─ api.ts
│  ├─ domain.ts
│  └─ supabase.ts
├─ docs/
│  ├─ README.md
│  ├─ 01-foundation.md
│  ├─ 02-database-schema.md
│  ├─ 03-api-contracts.md
│  ├─ 04-modules.md
│  ├─ 05-deployment.md
│  └─ CLAUDE.md
├─ CLAUDE.md
├─ PRD.md
├─ README.md
└─ TECH.md
```

目录职责：

- `app/`: 页面与 Route Handlers，只做请求编排、响应序列化、页面渲染。
- `components/`: 纯 UI 组件与页面块，不直接访问数据库。
- `hooks/`: 客户端轮询、倒计时、音频、心跳调度。
- `lib/`: 认证、Supabase client 工厂、领域工具、RPC 封装。
- `scripts/`: 脱离 Next runtime 的后台脚本。
- `supabase/migrations/`: 真正的数据结构与数据库函数定义。
- `types/`: 前后端共享 DTO 与领域类型。
- `docs/`: 拆分后的技术规范与实现基线。

硬约束：

- 单个文件不超过 800 行。
- 单目录直接子文件数超过 8 时，必须拆子目录。
- Route Handler 不直接内嵌 SQL。
- 原子业务逻辑统一下沉到 RPC 或 `lib/task-rpc.ts`。

## 4. 环境变量

| 变量名 | 必需 | 用途 |
| --- | --- | --- |
| `SUPABASE_URL` | 是 | 服务端与脚本访问数据库 |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | 服务端 Route Handlers 与 cron 写库 |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | 浏览器与 SSR Client 初始化 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase anonymous auth 会话 |
| `APP_BASE_URL` | 是 | 构造绝对地址 |
| `CRON_SHARED_SECRET` | 是 | 保护内部城市消耗接口 |

明确删除：

- `JWT_SECRET`

## 5. 部署架构

```text
git pull
-> npm ci
-> next build
-> next start -p 3000
-> pm2 守护
-> nginx 反代 80/443
-> crontab 触发策略脚本与城市消耗接口
```

角色：

- `next start -p 3000`: 页面与 API
- `pm2`: 维持 Web 进程
- `nginx`: TLS、gzip、静态资源缓存、反向代理
- `crontab`: 每分钟运行任务策略，每日调用城市消耗接口
- 业务日历固定使用 `Asia/Shanghai`，所有“每日”统计与 cron 触发时间都按该时区解释

## 6. 地图区块与槽位

| 区块 | `district` 值 | 原型定位 |
| --- | --- | --- |
| 核心能量塔 | `core` | 画面中心 |
| 资源区 | `resource` | `top: 20%, left: 30%, w: 56, h: 32` |
| 居住区 | `residential` | `bottom: 20%, right: 25%, w: 64, h: 40` |
| 医疗区 | `medical` | `top: 40%, right: 10%, w: 40, h: 40` |
| 食物区 | `food` | `top: 10%, right: 40%, w: 32, h: 20` |
| 探索区 | `exploration` | `bottom: 40%, left: 10%, w: 40, h: 24` |

`slot_id` 命名：

- `resource-01` 到 `resource-08`
- `residential-01` 到 `residential-12`
- `medical-01` 到 `medical-06`
- `food-01` 到 `food-06`
- `exploration-01` 到 `exploration-06`

最近空槽规则：

- 按区块预设顺序取第一个未被 `buildings.slot_id` 占用的槽位
- 同一时刻只允许一个进行中实例占用一个 `slot_id`
