/**
 * [INPUT]: Supabase auth cookies、请求体 `{ templateCode, slotId }`、`lib/cron.ts` 的 `executeBuildOrder`
 * [OUTPUT]: `POST /api/tasks/strategy`，执行外部 agent 指定的建造指令，返回建造结果
 * [POS]: 位于 `app/api/tasks/strategy/route.ts`，被外部 AI agent 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveAuthSessionFromRequest } from "@/lib/auth";
import { executeBuildOrder } from "@/lib/cron";

export async function POST(request: NextRequest) {
  let resolvedAuthSession: Awaited<ReturnType<typeof resolveAuthSessionFromRequest>> | null = null;

  try {
    resolvedAuthSession = await resolveAuthSessionFromRequest(request);

    if (!resolvedAuthSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const body = await request.json();
    const { templateCode, slotId } = body;

    if (typeof templateCode !== "string" || typeof slotId !== "string") {
      const response = errorResponse(400, "VALIDATION_ERROR", "templateCode and slotId are required.");
      appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
      return response;
    }

    const result = await executeBuildOrder({ templateCode, slotId });

    const status = result.ok ? 200 : 409;
    const response = NextResponse.json(result, { status });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Build order failed.";

    const response = NextResponse.json(
      { ok: false, reason: "internal_error", message },
      { status: 500 },
    );
    appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
    return response;
  }
}
