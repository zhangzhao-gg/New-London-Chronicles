/**
 * [INPUT]: 已登录业务用户、sessions、task_templates、可选 sessionId 查询参数
 * [OUTPUT]: `GET /api/session/current`，返回可恢复或显式指定的会话
 * [POS]: 位于 app/api/session/current，被 `/focus` 页面恢复流程消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import {
  handleRouteError,
  isSessionTimedOut,
  notFound,
  requireCurrentUser,
  selectRows,
  timeoutSession,
  type SessionRow,
  type TaskTemplateRow,
} from "@/lib/supabase-server";

function mapSessionDto(session: SessionRow, template: TaskTemplateRow) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.started_at,
    lastHeartbeatAt: session.last_heartbeat_at,
    task: {
      templateId: template.id,
      instanceId: session.task_instance_id,
      type: template.type,
      name: template.name,
      district: template.district,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await requireCurrentUser();
    const requestedSessionId = request.nextUrl.searchParams.get("sessionId");
    const includeAnyLiveSession = request.nextUrl.searchParams.get("any") === "1";

    const [liveSessions, templates] = await Promise.all([
      selectRows<SessionRow>(
        "sessions",
        "id,user_id,task_template_id,task_instance_id,created_at,started_at,last_heartbeat_at,ended_at,status,end_reason",
        {
          user_id: `eq.${currentUser.appUserId}`,
          status: "in.(pending,active)",
          order: "created_at.desc",
        },
      ),
      selectRows<TaskTemplateRow>(
        "task_templates",
        "id,code,name,type,district,output_resource,output_per_heartbeat,build_cost,heartbeat_cost,duration_minutes,enabled,sort_order",
        { order: "sort_order.asc" },
      ),
    ]);

    const templateById = new Map(templates.map((template) => [template.id, template]));
    const matchedSession = requestedSessionId
      ? liveSessions.find((session) => session.id === requestedSessionId) ?? null
      : includeAnyLiveSession
        ? liveSessions[0] ?? null
      : liveSessions.find((session) => {
          const template = templateById.get(session.task_template_id);

          return template?.type === "build" || template?.type === "work";
        }) ?? null;

    if (!matchedSession) {
      if (requestedSessionId) {
        notFound("Session not found.");
      }

      return NextResponse.json({ session: null });
    }

    if (isSessionTimedOut(matchedSession)) {
      await timeoutSession(matchedSession.id, currentUser.appUserId);
      return NextResponse.json({ session: null });
    }

    const template = templateById.get(matchedSession.task_template_id);

    if (!template) {
      if (requestedSessionId) {
        notFound("Session not found.");
      }

      return NextResponse.json({ session: null });
    }

    if (!requestedSessionId && !includeAnyLiveSession && template.type !== "build" && template.type !== "work") {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({
      session: mapSessionDto(matchedSession, template),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
