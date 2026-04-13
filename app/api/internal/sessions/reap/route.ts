/**
 * [INPUT]: `x-cron-secret` 请求头、`lib/cron.ts` 暴露的僵尸 session 清扫逻辑
 * [OUTPUT]: 提供内部僵尸 session 清扫接口，返回清扫数量
 * [POS]: 位于 `app/api/internal/sessions/reap/route.ts`，被服务器每小时 cron 调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md`、`CLAUDE.md` 与相关 docs
 */

import { NextResponse } from "next/server";

import { isValidCronSecret, reapZombieSessions } from "@/lib/cron";

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get("x-cron-secret");

  if (!isValidCronSecret(secret)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid cron secret." } },
      { status: 401 },
    );
  }

  try {
    const summary = await reapZombieSessions();

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zombie session reap failed.";

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
  }
}
