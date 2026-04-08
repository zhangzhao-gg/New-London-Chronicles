/**
 * [INPUT]: `POST /api/session/create` 请求体、Supabase auth cookies、`public.rpc_create_free_session`
 * [OUTPUT]: 创建无任务的 pending session 并返回跳转信息
 * [POS]: 位于 `app/api/session/create/route.ts`，被城市页"直接专注"按钮消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import { createFreeSession, toErrorResponse } from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const result = await createFreeSession(resolvedSession.user.id);

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
