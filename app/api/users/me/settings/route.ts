/**
 * [INPUT]: `PATCH /api/users/me/settings` 请求体、Supabase cookie session
 * [OUTPUT]: 更新当前用户 `autoAssign` 并返回最新 `{ user }`
 * [POS]: 位于 `app/api/users/me/settings/route.ts`，作为当前用户设置 Route Handler
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import {
  appendSupabaseSessionCookieIfRefreshed,
  errorResponse,
  resolveSessionFromRequest,
  successResponse,
  updateUserAutoAssign,
} from "@/lib/auth";

export async function PATCH(request: Request) {
  const resolvedSession = await resolveSessionFromRequest(request);

  if (!resolvedSession) {
    return errorResponse(401, "UNAUTHORIZED", "Login required.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid settings payload.");
  }

  const autoAssign = (payload as { autoAssign?: unknown })?.autoAssign;

  if (typeof autoAssign !== "boolean") {
    return errorResponse(400, "VALIDATION_ERROR", "autoAssign must be boolean.");
  }

  const updatedUser = await updateUserAutoAssign(resolvedSession.user.id, autoAssign);

  if (!updatedUser) {
    return errorResponse(500, "CONFLICT", "Failed to update settings.");
  }

  const response = successResponse({
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      autoAssign: updatedUser.auto_assign,
      hungerStatus: updatedUser.hunger_status,
      createdAt: updatedUser.created_at,
    },
  });

  appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);

  return response;
}
