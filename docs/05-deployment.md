# 05 - Deployment

## 1. pm2

`ecosystem.config.js`

```js
module.exports = {
  apps: [
    {
      name: "new-london-chronicles",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/srv/new-london-chronicles",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
};
```

## 2. Nginx

```nginx
server {
  listen 80;
  server_name nlc.example.com;

  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
  }
}
```

## 3. crontab

```cron
CRON_TZ=Asia/Shanghai
5 0 * * * curl -s -X POST http://127.0.0.1:3000/api/internal/city/upkeep -H "x-cron-secret: ${CRON_SHARED_SECRET}" >> /var/log/nlc-city-upkeep.log 2>&1
0 * * * * curl -s -X POST http://127.0.0.1:3000/api/internal/sessions/reap -H "x-cron-secret: ${CRON_SHARED_SECRET}" >> /var/log/nlc-sessions-reap.log 2>&1
```

> 建造补位已从 cron 脚本迁移至 `POST /api/tasks/strategy`，由外部 AI agent 按需调用，不再定时触发。

## 4. Supabase RLS

MVP 策略固定为“所有浏览器访问走 Next API，数据库只给 service role 写”。

```sql
alter table public.users enable row level security;
alter table public.city_resources enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;
alter table public.task_participants enable row level security;
alter table public.sessions enable row level security;
alter table public.buildings enable row level security;
alter table public.city_logs enable row level security;
```

不创建面向 `anon` 或 `authenticated` 的写策略。service role 绕过 RLS。

## 5. 上线前核对

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 已配置
- `CRON_SHARED_SECRET` 已配置
- 项目依赖已安装，且包含 `ts-node`
- 服务器 cron 明确按 `Asia/Shanghai` 执行
- Supabase 控制台已开启 Anonymous Sign-Ins
- 001/002/003 migration 执行成功
- `city_resources` 初始行存在且只有 `id = 1`
- cron 每分钟正常执行一次
- 每日 `00:05` 城市消耗 cron 正常执行一次
- `/api/auth/login` 能写 session cookie
- `/api/city` 返回 `temperatureC = -20`
- `/api/internal/city/upkeep` 仅接受正确的 `x-cron-secret`

## 6. 验收清单

- 每个 API 的入参与出参与文档完全一致，无“前端自定字段”
- 外键链路自洽：`task_templates -> task_instances -> task_participants/buildings`，`users -> sessions`
- 模块依赖无环：`M01` 与 `M06` 为根，`M09/M10` 位于末端
- 色彩与字体锁定为 `#221810 / #f4a462 / #ff9d00 / Newsreader`
- 认证方案统一为 Supabase anonymous auth session，不再出现自建 JWT 用户态
