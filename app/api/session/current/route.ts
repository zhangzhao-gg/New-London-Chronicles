/**
 * [INPUT]: 已登录业务用户、sessions、task_templates、task_instances、buildings、可选 sessionId 查询参数
 * [OUTPUT]: `GET /api/session/current`，返回可恢复或显式指定的会话，含建筑名与地理位置
 * [POS]: 位于 app/api/session/current，被 `/focus` 页面恢复流程消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  handleRouteError,
  isSessionTimedOut,
  notFound,
  selectRows,
  timeoutSession,
  type BuildingRow,
  type SessionRow,
  type TaskInstanceRow,
  type TaskTemplateRow,
} from "@/lib/supabase-server";

type BuildingInfo = { name: string; slotId: string; location: string | null } | null;

function resolveBuildingInfo(
  session: SessionRow,
  instanceById: Map<string, TaskInstanceRow>,
  buildingById: Map<string, BuildingRow>,
): BuildingInfo {
  if (!session.task_instance_id) return null;

  const instance = instanceById.get(session.task_instance_id);
  if (!instance?.building_id) return null;

  const building = buildingById.get(instance.building_id);
  if (!building) return null;

  return { name: building.name, slotId: building.slot_id, location: building.location };
}

function mapSessionDto(
  session: SessionRow,
  template: TaskTemplateRow | null,
  building: BuildingInfo,
) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.started_at,
    lastHeartbeatAt: session.last_heartbeat_at,
    task: template
      ? {
          templateId: template.id,
          instanceId: session.task_instance_id,
          type: template.type,
          name: template.name,
          district: template.district,
          buildingName: building?.name ?? null,
          buildingSlotId: building?.slotId ?? null,
          buildingLocation: building?.location ?? null,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const requestedSessionId = request.nextUrl.searchParams.get("sessionId");
    const includeAnyLiveSession = request.nextUrl.searchParams.get("any") === "1";

    const [liveSessions, templates, activeInstances, buildings] = await Promise.all([
      selectRows<SessionRow>(
        "sessions",
        "id,user_id,task_template_id,task_instance_id,created_at,started_at,last_heartbeat_at,ended_at,status,end_reason",
        {
          user_id: `eq.${resolvedSession.user.id}`,
          status: "in.(pending,active)",
          order: "created_at.desc",
        },
      ),
      selectRows<TaskTemplateRow>(
        "task_templates",
        "id,code,name,type,district,output_resource,output_per_heartbeat,build_cost,heartbeat_cost,duration_minutes,spawns_template_id,enabled,sort_order",
        { order: "sort_order.asc" },
      ),
      selectRows<TaskInstanceRow>(
        "task_instances",
        "id,template_id,status,progress_minutes,remaining_minutes,slot_id,building_id,created_at,completed_at",
        { status: "eq.active" },
      ),
      selectRows<BuildingRow>(
        "buildings",
        "id,name,district,slot_id,location,completed_at",
      ),
    ]);

    const templateById = new Map(templates.map((t) => [t.id, t]));
    const instanceById = new Map(activeInstances.map((i) => [i.id, i]));
    const buildingById = new Map(buildings.map((b) => [b.id, b]));

    const matchedSession = requestedSessionId
      ? liveSessions.find((session) => session.id === requestedSessionId) ?? null
      : includeAnyLiveSession
        ? liveSessions[0] ?? null
      : liveSessions.find((session) => {
          if (!session.task_template_id) return false;
          const template = templateById.get(session.task_template_id);

          return template?.type === "build" || template?.type === "work";
        }) ?? null;

    if (!matchedSession) {
      if (requestedSessionId) {
        notFound("Session not found.");
      }

      const response = NextResponse.json({ session: null });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    if (isSessionTimedOut(matchedSession)) {
      await timeoutSession(matchedSession.id, resolvedSession.user.id);
      const response = NextResponse.json({ session: null });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    /* taskless session → task 为 null；有 template 但查不到 → 仅在显式请求时报 404 */
    const template = matchedSession.task_template_id
      ? templateById.get(matchedSession.task_template_id) ?? null
      : null;

    if (matchedSession.task_template_id && !template) {
      if (requestedSessionId) {
        notFound("Session not found.");
      }

      const response = NextResponse.json({ session: null });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    if (!requestedSessionId && !includeAnyLiveSession && (!template || (template.type !== "build" && template.type !== "work"))) {
      const response = NextResponse.json({ session: null });
      appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
      return response;
    }

    const building = resolveBuildingInfo(matchedSession, instanceById, buildingById);

    const response = NextResponse.json({
      session: mapSessionDto(matchedSession, template, building),
    });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
