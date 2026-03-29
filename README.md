# New-London-Chronicles

## Local Debug

当前本地调试若受 Node TLS 证书链影响，可使用：

```bash
npm run dev:insecure
```

它等价于：

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

说明：

- 仅用于本地调试 Supabase HTTPS 证书链问题
- 不用于生产环境
- 长期方案应改为修复本机代理证书或使用 `NODE_EXTRA_CA_CERTS`
- 兼容旧命令：`npm run dev:young` 仍可用，但建议迁移到更明确的 `dev:insecure`
- E2E 若也受同类证书链影响，可使用 `npm run test:e2e:insecure`
