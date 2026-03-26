# E2E Tests

运行：

```bash
npm run test:e2e
```

说明：

- 默认使用 Playwright + Chromium headless。
- 测试会启动本地 `next dev`，并通过真实页面流转执行。
- 少量测试准备直接使用 Supabase service role 操作测试环境数据，用于缩短 10 分钟 heartbeat / 建造实例准备时间。
