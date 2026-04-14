/**
 * [INPUT]: 已登录业务用户、task_templates、task_instances、sessions、city_resources、buildings
 * [OUTPUT]: `GET /api/tasks`，返回区块任务列表与加入态，所有任务绑定建筑实例（含 location 风味文本）
 * [POS]: 位于 app/api/tasks，被区块详情弹窗消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import {
  handleRouteError,
  selectRows,
  toTaskJsonRecord,
  type BuildingRow,
  type CityResourcesRow,
  type SessionRow,
  type TaskInstanceRow,
  type TaskTemplateRow,
} from "@/lib/supabase-server";

/* ------------------------------------------------------------------ */
/*  类型                                                               */
/* ------------------------------------------------------------------ */

type DisabledReason = "insufficient_resource" | "no_patients" | null;

type TaskListItem = {
  template: ReturnType<typeof mapTemplateDto>;
  instance: {
    id: string;
    slotId: string | null;
    progressMinutes: number;
    remainingMinutes: number;
  } | null;
  building: { id: string; name: string; slotId: string; location: string | null } | null;
  participants: number;
  canJoin: boolean;
  disabledReason: DisabledReason;
  actionLabel: string;
};

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function hasEnoughResources(resources: CityResourcesRow, costs: Record<string, number>): boolean {
  return Object.entries(costs).every(([resourceKey, amount]) => {
    const normalizedKey = resourceKey as keyof CityResourcesRow;
    const currentAmount = typeof resources[normalizedKey] === "number" ? resources[normalizedKey] : 0;

    return currentAmount >= amount;
  });
}

function getActionLabel(type: TaskTemplateRow["type"]): string {
  return type === "collect" || type === "convert" ? "前往工作" : "加入建造";
}

function resolveJoinability(
  template: TaskTemplateRow,
  resources: CityResourcesRow,
): [boolean, DisabledReason] {
  if (template.code === "medical-shift") {
    return [false, "no_patients"];
  }

  if (template.type === "collect" || template.type === "convert") {
    const cost = toTaskJsonRecord(template.heartbeat_cost);
    const enough = hasEnoughResources(resources, cost);

    return [enough, enough ? null : "insufficient_resource"];
  }

  return [true, null];
}

function resolveBuildingDto(
  instance: TaskInstanceRow,
  buildingById: Map<string, BuildingRow>,
): { id: string; name: string; slotId: string; location: string | null } | null {
  if (!instance.building_id) return null;

  const building = buildingById.get(instance.building_id);
  if (!building) return null;

  return { id: building.id, name: building.name, slotId: building.slot_id, location: building.location };
}

function mapTemplateDto(template: TaskTemplateRow) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    type: template.type,
    district: template.district,
    outputResource: template.output_resource,
    outputPerHeartbeat: template.output_per_heartbeat,
    durationMinutes: template.duration_minutes,
    buildCost: toTaskJsonRecord(template.build_cost),
    heartbeatCost: toTaskJsonRecord(template.heartbeat_cost),
  };
}

/* ------------------------------------------------------------------ */
/*  GET /api/tasks                                                     */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const [resourcesRows, templates, activeInstances, liveSessions, buildings] = await Promise.all([
      selectRows<CityResourcesRow>(
        "city_resources",
        "id,coal,wood,steel,raw_food,food_supply,updated_at",
        { id: "eq.1", limit: "1" },
      ),
      selectRows<TaskTemplateRow>(
        "task_templates",
        "id,code,name,type,district,output_resource,output_per_heartbeat,build_cost,heartbeat_cost,duration_minutes,spawns_template_id,enabled,sort_order",
        {
          enabled: "eq.true",
          order: "sort_order.asc",
        },
      ),
      selectRows<TaskInstanceRow>(
        "task_instances",
        "id,template_id,status,progress_minutes,remaining_minutes,slot_id,building_id,created_at,completed_at",
        {
          status: "eq.active",
          order: "created_at.asc",
        },
      ),
      selectRows<SessionRow>(
        "sessions",
        "id,user_id,task_template_id,task_instance_id,created_at,started_at,last_heartbeat_at,ended_at,status,end_reason",
        {
          status: "in.(pending,active)",
        },
      ),
      selectRows<BuildingRow>(
        "buildings",
        "id,name,district,slot_id,location,completed_at",
      ),
    ]);

    const resources = resourcesRows[0];

    if (!resources) {
      throw new Error("City resources row is missing.");
    }

    const buildingById = new Map(buildings.map((b) => [b.id, b]));

    /* 只计入 active 且心跳新鲜（20 分钟内）的 session，排除僵尸 */
    const FRESHNESS_MS = 20 * 60 * 1000;
    const freshnessThreshold = Date.now() - FRESHNESS_MS;
    const freshSessions = liveSessions.filter((session) => {
      if (session.status !== "active") return false;
      const basis = session.last_heartbeat_at ?? session.started_at ?? session.created_at;
      return basis ? new Date(basis).getTime() >= freshnessThreshold : false;
    });

    const liveInstanceParticipants = freshSessions.reduce<Map<string, number>>((accumulator, session) => {
      if (session.task_instance_id) {
        accumulator.set(session.task_instance_id, (accumulator.get(session.task_instance_id) ?? 0) + 1);
      }

      return accumulator;
    }, new Map());

    const activeInstancesByTemplate = activeInstances.reduce<Map<string, TaskInstanceRow[]>>((accumulator, instance) => {
      const existing = accumulator.get(instance.template_id) ?? [];
      existing.push(instance);
      accumulator.set(instance.template_id, existing);
      return accumulator;
    }, new Map());

    /* ── 统一逻辑：所有任务类型都走 instance 卡片 ── */
    const tasks = templates.flatMap<TaskListItem>((template) => {
      const instances = activeInstancesByTemplate.get(template.id) ?? [];
      const [canJoin, disabledReason] = resolveJoinability(template, resources);

      return instances.map((instance) => ({
        template: mapTemplateDto(template),
        instance: {
          id: instance.id,
          slotId: instance.slot_id,
          progressMinutes: instance.progress_minutes,
          remainingMinutes: instance.remaining_minutes,
        },
        building: resolveBuildingDto(instance, buildingById),
        participants: liveInstanceParticipants.get(instance.id) ?? 0,
        canJoin,
        disabledReason,
        actionLabel: getActionLabel(template.type),
      }));
    });

    const response = NextResponse.json({ tasks });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
