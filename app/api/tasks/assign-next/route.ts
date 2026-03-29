/**
 * [INPUT]: `POST /api/tasks/assign-next` 请求、Supabase auth cookies、`public.rpc_assign_next_task`
 * [OUTPUT]: 为开启 autoAssign 的用户创建下一个 pending session，或在 live session 冲突时返回 `{ redirectTo }`
 * [POS]: 位于 `app/api/tasks/assign-next/route.ts`，被城市页与完成页消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveAuthSessionFromRequest } from "@/lib/auth";
import { AppError, assignNextTask, getLiveSessionRedirect, toErrorResponse } from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  let resolvedAuthSession: Awaited<ReturnType<typeof resolveAuthSessionFromRequest>> | null = null;
  let userId: string | null = null;

  try {
    resolvedAuthSession = await resolveAuthSessionFromRequest(request);

    if (!resolvedAuthSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const appUserId = resolvedAuthSession.authUser.user_metadata?.app_user_id;

    if (typeof appUserId !== "string" || !appUserId) {
      const response = errorResponse(401, "UNAUTHORIZED", "Login required.");
      appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
      return response;
    }

    userId = appUserId;

    const result = await assignNextTask(userId);

    const response = NextResponse.json(result);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
    return response;
  } catch (error) {
    if (resolvedAuthSession && userId && error instanceof AppError && error.code === "CONFLICT") {
      try {
        const redirectTo = await getLiveSessionRedirect(userId);
        const response = NextResponse.json({ redirectTo });
        appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
        return response;
      } catch (redirectError) {
        console.error("[assign-next] Failed to resolve live session redirect after conflict.", redirectError);
      }
    }

    const response = toErrorResponse(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedAuthSession);
    return response;
  }
}
