/**
 * [INPUT]: `POST /api/auth/login` 请求体、Supabase anonymous auth、`public.users`
 * [OUTPUT]: 创建或恢复匿名会话，绑定业务用户并返回 `{ user }`
 * [POS]: 位于 `app/api/auth/login/route.ts`，作为登录 Route Handler
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import {
  appendSupabaseSessionCookie,
  bindAuthUserToBusinessUser,
  ensureAnonymousSession,
  errorResponse,
  findOrCreateUserByUsername,
  successResponse,
  touchUserLastSeen,
  validateUsername,
} from "@/lib/auth";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid login payload.");
  }

  const username = validateUsername((payload as { username?: unknown })?.username);

  if (!username) {
    return errorResponse(400, "VALIDATION_ERROR", "Username must be 2-20 valid characters.");
  }

  try {
    const anonymousSession = await ensureAnonymousSession(request);

    if (!anonymousSession?.user?.id) {
      return errorResponse(500, "CONFLICT", "Failed to create anonymous session.");
    }

    const userRow = await findOrCreateUserByUsername(username);

    if (!userRow) {
      return errorResponse(500, "CONFLICT", "Failed to resolve business user.");
    }

    const metadataBound = await bindAuthUserToBusinessUser(anonymousSession, userRow);

    if (!metadataBound) {
      return errorResponse(500, "CONFLICT", "Failed to bind auth metadata.");
    }

    const touchedUser = await touchUserLastSeen(userRow.id);

    if (!touchedUser) {
      return errorResponse(500, "CONFLICT", "Failed to refresh user activity.");
    }

    const response = successResponse({
      user: {
        id: touchedUser.id,
        username: touchedUser.username,
        autoAssign: touchedUser.auto_assign,
        hungerStatus: touchedUser.hunger_status,
        createdAt: touchedUser.created_at,
      },
    });

    appendSupabaseSessionCookie(response, anonymousSession);

    return response;
  } catch {
    return errorResponse(500, "CONFLICT", "Login failed.");
  }
}

