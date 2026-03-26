/**
 * [INPUT]: `PLAYWRIGHT_BASE_URL`、`PORT`、Playwright CLI 参数、项目 `npm run start`
 * [OUTPUT]: Chromium headless E2E 运行配置，控制测试超时、截图、trace 与本地 webServer 启动
 * [POS]: 位于仓库根目录，作为 `tests/e2e/` 的统一 Playwright 配置入口
 * [PROTOCOL]: 依赖 Next.js 生产服务、Playwright 浏览器运行时与 CI/本地命令行环境
 */

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? "3001");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
