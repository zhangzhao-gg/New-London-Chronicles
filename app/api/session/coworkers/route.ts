/**
 * [INPUT]: 已登录业务用户、sessions/users 表、sessionId 查询参数
 * [OUTPUT]: `GET /api/session/coworkers`，返回同任务协作者（username + startedAt）
 * [POS]: 位于 app/api/session/coworkers，被 FocusExperience 轮询消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/api/session/CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import { handleRouteError, selectRows, type SessionRow } from "@/lib/supabase-server";

/* ================================================================
 *  心跳活跃阈值：与 city/tasks 保持一致，覆盖 2 个心跳周期容错
 * ================================================================ */

const FRESHNESS_MS = 20 * 60 * 1000;

/* ================================================================
 *  PostgREST 嵌套查询返回类型
 * ================================================================ */

type SessionWithUser = {
  user_id: string;
  started_at: string | null;
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

    /* ── 统一查 sessions：按心跳新鲜度过滤僵尸，与 city/tasks 阈值一致 ── */
    const aliveSince = new Date(Date.now() - FRESHNESS_MS).toISOString();
    const filter: Record<string, string> = {
      status: "in.(pending,active)",
      user_id: `neq.${userId}`,
      last_heartbeat_at: `gte.${aliveSince}`,
    };

    if (session.task_instance_id) {
      /* build/work: 同 instance 的活跃 session */
      filter.task_instance_id = `eq.${session.task_instance_id}`;
    } else {
      /* collect/convert: 同 template 的活跃 session */
      filter.task_template_id = `eq.${session.task_template_id}`;
    }

    const rows = await selectRows<SessionWithUser>("sessions", "user_id,started_at,users(username)", filter);

    /* 去重：唯一约束保证每用户最多一个 live session，但防御性处理 */
    const seen = new Set<string>();
    const coworkers: { username: string; startedAt: string | null }[] = [];
    for (const r of rows) {
      const username = r.users?.username;
      if (username && !seen.has(username)) {
        seen.add(username);
        coworkers.push({ username, startedAt: r.started_at ?? null });
      }
    }

    const response = NextResponse.json({ coworkers });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
