/**
 * [INPUT]: `POST /api/session/bind-task` 请求体（sessionId + templateId + instanceId?）、Supabase auth cookies
 * [OUTPUT]: 给已有 session 绑定任务并返回 task 信息
 * [POS]: 位于 `app/api/session/bind-task/route.ts`，被专注页任务选择器消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  bindTask,
  ensureObjectBody,
  optionalUuid,
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

    const result = await bindTask({
      userId: resolvedSession.user.id,
      sessionId: requireUuid(body.sessionId, "sessionId"),
      templateId: requireUuid(body.templateId, "templateId"),
      instanceId: optionalUuid(body.instanceId, "instanceId"),
    });

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
