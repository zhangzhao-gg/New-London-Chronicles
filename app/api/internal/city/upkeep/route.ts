/**
 * [INPUT]: `x-cron-secret` 请求头、`lib/cron.ts` 暴露的城市 upkeep 逻辑
 * [OUTPUT]: 提供内部每日城市消耗接口，返回固定 contract 的 upkeep 摘要
 * [POS]: 位于 `app/api/internal/city/upkeep/route.ts`，被服务器每日 cron 调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md`、`CLAUDE.md` 与相关 docs
 */

import { NextResponse } from "next/server";

import { isValidCronSecret, runDailyCityUpkeep } from "@/lib/cron";

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get("x-cron-secret");

  if (!isValidCronSecret(secret)) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid cron secret.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const summary = await runDailyCityUpkeep();

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "City upkeep failed.";

    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message,
        },
      },
      { status: 500 },
    );
  }
}
