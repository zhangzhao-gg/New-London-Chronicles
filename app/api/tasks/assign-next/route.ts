/**
 * [INPUT]: `POST /api/tasks/assign-next` 请求、Supabase auth cookies、`public.rpc_assign_next_task`
 * [OUTPUT]: 为开启 autoAssign 的用户创建下一个 pending session
 * [POS]: 位于 `app/api/tasks/assign-next/route.ts`，被城市页与完成页消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import { AppError, assignNextTask, getLiveSessionRedirect, toErrorResponse } from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const result = await assignNextTask(resolvedSession.user.id);

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    if (resolvedSession && error instanceof AppError && error.code === "CONFLICT") {
      try {
        const redirectTo = await getLiveSessionRedirect(resolvedSession.user.id);
        const response = NextResponse.json({ redirectTo });
        appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
        return response;
      } catch {}
    }

    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
