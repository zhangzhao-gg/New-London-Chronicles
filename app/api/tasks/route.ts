/**
 * [INPUT]: 已登录业务用户、task_templates、task_instances、sessions、city_resources
 * [OUTPUT]: `GET /api/tasks`，返回区块任务列表与加入态
 * [POS]: 位于 app/api/tasks，被区块详情弹窗消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCurrentUser,
  selectRows,
  toTaskJsonRecord,
  type CityResourcesRow,
  type SessionRow,
  type TaskInstanceRow,
  type TaskTemplateRow,
} from "@/lib/supabase-server";

type TaskListItem = {
  template: ReturnType<typeof mapTemplateDto>;
  instance: { id: string } | null;
  participants: number;
  canJoin: boolean;
  disabledReason: "insufficient_resource" | "no_patients" | null;
  actionLabel: string;
};

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

export async function GET() {
  try {
    await requireCurrentUser();

    const [resourcesRows, templates, activeInstances, liveSessions] = await Promise.all([
      selectRows<CityResourcesRow>(
        "city_resources",
        "id,coal,wood,steel,raw_food,food_supply,updated_at",
        { id: "eq.1", limit: "1" },
      ),
      selectRows<TaskTemplateRow>(
        "task_templates",
        "id,code,name,type,district,output_resource,output_per_heartbeat,build_cost,heartbeat_cost,duration_minutes,enabled,sort_order",
        {
          enabled: "eq.true",
          order: "sort_order.asc",
        },
      ),
      selectRows<TaskInstanceRow>(
        "task_instances",
        "id,template_id,status,progress_minutes,remaining_minutes,slot_id,created_at,completed_at",
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
    ]);

    const resources = resourcesRows[0];

    if (!resources) {
      throw new Error("City resources row is missing.");
    }

    const liveTemplateParticipants = liveSessions.reduce<Map<string, number>>((accumulator, session) => {
      if (!session.task_instance_id) {
        accumulator.set(session.task_template_id, (accumulator.get(session.task_template_id) ?? 0) + 1);
      }

      return accumulator;
    }, new Map());

    const liveInstanceParticipants = liveSessions.reduce<Map<string, number>>((accumulator, session) => {
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

    const tasks = templates.flatMap<TaskListItem>((template) => {
      const templateDto = mapTemplateDto(template);
      const actionLabel = getActionLabel(template.type);

      if (template.code === "medical-shift") {
        return [{
          template: templateDto,
          instance: null,
          participants: liveTemplateParticipants.get(template.id) ?? 0,
          canJoin: false,
          disabledReason: "no_patients",
          actionLabel,
        }];
      }

      if (template.type === "collect" || template.type === "convert") {
        const heartbeatCost = toTaskJsonRecord(template.heartbeat_cost);
        const hasEnoughHeartbeatResources = hasEnoughResources(resources, heartbeatCost);

        return [{
          template: templateDto,
          instance: null,
          participants: liveTemplateParticipants.get(template.id) ?? 0,
          canJoin: hasEnoughHeartbeatResources,
          disabledReason: hasEnoughHeartbeatResources ? null : "insufficient_resource",
          actionLabel,
        }];
      }

      const instances = activeInstancesByTemplate.get(template.id) ?? [];

      return instances.map((instance) => ({
        template: templateDto,
        instance: {
          id: instance.id,
        },
        participants: liveInstanceParticipants.get(instance.id) ?? 0,
        canJoin: true,
        disabledReason: null,
        actionLabel,
      }));
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}
