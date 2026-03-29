/**
 * [INPUT]: `POST /api/session/end` 请求体（`sessionId` + `endReason`）、Supabase auth cookies、`public.rpc_end_session`
 * [OUTPUT]: 结束 session、写入唯一日志，并返回结算摘要
 * [POS]: 位于 `app/api/session/end/route.ts`，被专注页与完成页消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  endSession,
  ensureObjectBody,
  readRequestJson,
  requireClientSessionEndReason,
  requireUuid,
  toErrorResponse,
} from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const body = await readRequestJson<unknown>(request);

    ensureObjectBody(body);

    const result = await endSession(
      resolvedSession.user.id,
      requireUuid(body.sessionId, "sessionId"),
      requireClientSessionEndReason(body.endReason),
    );

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
