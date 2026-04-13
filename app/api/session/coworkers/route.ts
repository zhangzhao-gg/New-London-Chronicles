/**
 * [INPUT]: 已登录业务用户、sessions/task_participants/users 表、sessionId 查询参数
 * [OUTPUT]: `GET /api/session/coworkers`，返回同任务协作者用户名列表
 * [POS]: 位于 app/api/session/coworkers，被 FocusExperience 轮询消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/api/session/CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import { handleRouteError, selectRows, type SessionRow } from "@/lib/supabase-server";

/* ================================================================
 *  PostgREST 嵌套查询返回类型
 * ================================================================ */

type ParticipantWithUser = {
  user_id: string;
  users: { username: string };
};

type SessionWithUser = {
  user_id: string;
  users: { username: string };
};

/* ================================================================
 *  GET /api/session/coworkers?sessionId=xxx
 * ================================================================ */

export async function GET(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return errorResponse(400, "VALIDATION_ERROR", "sessionId is required.");
    }

    const userId = resolvedSession.user.id;

    /* ── 查当前 session 确认归属与任务绑定 ── */
    const [session] = await selectRows<SessionRow>(
      "sessions",
      "id,user_id,task_template_id,task_instance_id,status",
      { id: `eq.${sessionId}`, user_id: `eq.${userId}`, limit: "1" },
    );

    if (!session) {
      const response = NextResponse.json({ coworkers: [] });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    /* ── 无任务 → 空列表 ── */
    if (!session.task_template_id) {
      const response = NextResponse.json({ coworkers: [] });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    let usernames: string[];

    if (session.task_instance_id) {
      /* ── build/work: 查 task_participants ── */
      const rows = await selectRows<ParticipantWithUser>(
        "task_participants",
        "user_id,users(username)",
        { instance_id: `eq.${session.task_instance_id}`, user_id: `neq.${userId}` },
      );
      usernames = rows.map((r) => r.users.username);
    } else {
      /* ── collect/convert: 查同 template 的 active sessions ── */
      const rows = await selectRows<SessionWithUser>(
        "sessions",
        "user_id,users(username)",
        {
          task_template_id: `eq.${session.task_template_id}`,
          status: "in.(pending,active)",
          user_id: `neq.${userId}`,
        },
      );

      /* 去重：同一用户可能有多个 session（理论上不会，但防御性处理） */
      const seen = new Set<string>();
      usernames = [];
      for (const r of rows) {
        if (!seen.has(r.users.username)) {
          seen.add(r.users.username);
          usernames.push(r.users.username);
        }
      }
    }

    const coworkers = usernames.map((username) => ({ username }));

    const response = NextResponse.json({ coworkers });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
