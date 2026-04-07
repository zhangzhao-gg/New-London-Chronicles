/**
 * [INPUT]: `POST /api/session/unbind-task` 请求体（sessionId + reason?）、Supabase auth cookies
 * [OUTPUT]: 解绑当前 session 的任务
 * [POS]: 位于 `app/api/session/unbind-task/route.ts`，被专注页手动解绑消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  ensureObjectBody,
  readRequestJson,
  requireUuid,
  toErrorResponse,
  unbindTask,
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

    const reason = typeof body.reason === "string" ? body.reason : "manual_unbind";

    const result = await unbindTask(
      resolvedSession.user.id,
      requireUuid(body.sessionId, "sessionId"),
      reason,
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
