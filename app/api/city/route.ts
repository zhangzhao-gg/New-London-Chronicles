/**
 * [INPUT]: 已登录业务用户、city_resources、task_templates、task_instances、sessions、buildings、city_logs
 * [OUTPUT]: `GET /api/city`，返回城市页 HUD 与 district hover 聚合数据
 * [POS]: 位于 app/api/city，被城市主页面轮询消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextResponse } from "next/server";

import {
  handleRouteError,
  mapLogDto,
  requireCurrentUser,
  selectRows,
  toTaskJsonRecord,
  touchLastSeen,
  type BuildingRow,
  type CityLogRow,
  type CityResourcesRow,
  type SessionRow,
  type TaskInstanceRow,
  type TaskTemplateRow,
} from "@/lib/supabase-server";

const DISTRICT_LABELS: Record<TaskTemplateRow["district"], string> = {
  resource: "资源区",
  residential: "居住区",
  medical: "医疗区",
  food: "食物区",
  exploration: "探索区",
};

const DISTRICT_ORDER: TaskTemplateRow["district"][] = [
  "resource",
  "residential",
  "medical",
  "food",
  "exploration",
];

function hasEnoughResources(resources: CityResourcesRow, costs: Record<string, number>): boolean {
  return Object.entries(costs).every(([resourceKey, amount]) => {
    const normalizedKey = resourceKey as keyof CityResourcesRow;
    const currentAmount = typeof resources[normalizedKey] === "number" ? resources[normalizedKey] : 0;

    return currentAmount >= amount;
  });
}

function getDistrictStatus(
  district: TaskTemplateRow["district"],
  resources: CityResourcesRow,
  templatesByDistrict: Map<TaskTemplateRow["district"], TaskTemplateRow[]>,
  activeBuildDistricts: Set<TaskTemplateRow["district"]>,
): "可采集" | "建造进行中" | "无进行中任务" | "资源不足" {
  if (activeBuildDistricts.has(district)) {
    return "建造进行中";
  }

  const templates = templatesByDistrict.get(district) ?? [];

  if (templates.some((template) => template.type === "collect")) {
    return "可采集";
  }

  if (
    templates.some((template) => {
      if (template.type === "convert") {
        return !hasEnoughResources(resources, toTaskJsonRecord(template.heartbeat_cost));
      }

      if (template.type === "build") {
        return !hasEnoughResources(resources, toTaskJsonRecord(template.build_cost));
      }

      return false;
    })
  ) {
    return "资源不足";
  }

  return "无进行中任务";
}

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    const [resourcesRows, templates, activeInstances, liveSessions, activeSessions, buildings, logs] = await Promise.all([
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
        },
      ),
      selectRows<SessionRow>(
        "sessions",
        "id,user_id,task_template_id,task_instance_id,created_at,started_at,last_heartbeat_at,ended_at,status,end_reason",
        {
          status: "in.(pending,active)",
        },
      ),
      selectRows<SessionRow>(
        "sessions",
        "id,user_id,task_template_id,task_instance_id,created_at,started_at,last_heartbeat_at,ended_at,status,end_reason",
        {
          status: "eq.active",
        },
      ),
      selectRows<BuildingRow>(
        "buildings",
        "id,name,district,slot_id,completed_at",
        {
          order: "completed_at.desc",
          limit: "30",
        },
      ),
      selectRows<CityLogRow>(
        "city_logs",
        "id,user_label,action_desc,created_at",
        {
          order: "created_at.desc",
          limit: "20",
        },
      ),
    ]);

    const resources = resourcesRows[0];

    if (!resources) {
      throw new Error("City resources row is missing.");
    }

    const templateById = new Map(templates.map((template) => [template.id, template]));
    const templatesByDistrict = templates.reduce<Map<TaskTemplateRow["district"], TaskTemplateRow[]>>((accumulator, template) => {
      const existing = accumulator.get(template.district) ?? [];
      existing.push(template);
      accumulator.set(template.district, existing);
      return accumulator;
    }, new Map());

    const activeBuildDistricts = new Set<TaskTemplateRow["district"]>(
      activeInstances
        .map((instance) => templateById.get(instance.template_id))
        .filter((template): template is TaskTemplateRow => Boolean(template && template.type === "build"))
        .map((template) => template.district),
    );

    const workingCountByDistrict = activeSessions.reduce<Map<TaskTemplateRow["district"], number>>((accumulator, session) => {
      const template = templateById.get(session.task_template_id);

      if (!template) {
        return accumulator;
      }

      accumulator.set(template.district, (accumulator.get(template.district) ?? 0) + 1);
      return accumulator;
    }, new Map());

    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const onlineUsers = new Set(
      liveSessions
        .filter((session) => {
          const basis = session.last_heartbeat_at ?? session.started_at ?? session.created_at;

          return new Date(basis).getTime() >= thirtyMinutesAgo;
        })
        .map((session) => session.user_id),
    );

    const districts = DISTRICT_ORDER.map((district) => ({
      district,
      label: DISTRICT_LABELS[district],
      status: getDistrictStatus(district, resources, templatesByDistrict, activeBuildDistricts),
      workingCount: workingCountByDistrict.get(district) ?? 0,
    }));

    await touchLastSeen(currentUser.appUserId);

    return NextResponse.json({
      resources: {
        coal: resources.coal,
        wood: resources.wood,
        steel: resources.steel,
        rawFood: resources.raw_food,
        foodSupply: resources.food_supply,
      },
      buildings: buildings.map((building) => ({
        id: building.id,
        name: building.name,
        district: building.district,
        slotId: building.slot_id,
        completedAt: building.completed_at,
      })),
      districts,
      onlineCount: onlineUsers.size,
      healthStatus: "健康",
      currentPolicyPlaceholder: "No active policy",
      currentLanguage: "zh-CN",
      languageOptions: ["zh-CN", "en-US"],
      logs: logs.map(mapLogDto),
      temperatureC: -20,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

