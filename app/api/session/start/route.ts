/**
 * [INPUT]: `POST /api/session/start` 请求体、Supabase auth cookies、`public.rpc_start_session`
 * [OUTPUT]: 将 pending session 幂等切换到 active 并返回 startedAt
 * [POS]: 位于 `app/api/session/start/route.ts`，被专注页开始按钮消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  ensureObjectBody,
  readRequestJson,
  requireUuid,
  startSession,
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

    const result = await startSession(resolvedSession.user.id, requireUuid(body.sessionId, "sessionId"));

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
