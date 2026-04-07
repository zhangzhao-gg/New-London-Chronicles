/**
 * [INPUT]: `POST /api/session/assign-next-task` 请求体（sessionId）、Supabase auth cookies
 * [OUTPUT]: 自动绑定下一个任务到当前 active session
 * [POS]: 位于 `app/api/session/assign-next-task/route.ts`，被专注页任务完成后自动分配消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  assignNextTaskToSession,
  ensureObjectBody,
  readRequestJson,
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

    const result = await assignNextTaskToSession(
      resolvedSession.user.id,
      requireUuid(body.sessionId, "sessionId"),
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
