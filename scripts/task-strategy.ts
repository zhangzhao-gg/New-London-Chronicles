/**
 * [INPUT]: `process.env`、`lib/cron.ts` 暴露的建造补位逻辑、crontab 每分钟触发
 * [OUTPUT]: 执行一次建造实例补位，并向 stdout 输出本次摘要
 * [POS]: 位于 `scripts/task-strategy.ts`，由服务器 crontab 调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `CLAUDE.md` 与相关 docs
 */

import { runTaskStrategyTick } from "../lib/cron";

async function main(): Promise<void> {
  const result = await runTaskStrategyTick();
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
