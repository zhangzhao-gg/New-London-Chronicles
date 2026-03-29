/**
 * [INPUT]: `POST /api/tasks/join` 请求体、Supabase auth cookies、`public.rpc_join_task`
 * [OUTPUT]: 创建 pending session 并返回专注页跳转信息
 * [POS]: 位于 `app/api/tasks/join/route.ts`，被任务列表与区块弹窗消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  ensureObjectBody,
  joinTask,
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

    const result = await joinTask({
      userId: resolvedSession.user.id,
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
