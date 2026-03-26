/**
 * [INPUT]: `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、可选 `.env.local`、各测试场景传入的用户/任务/session 标识
 * [OUTPUT]: 为 E2E 提供 Supabase 管理操作，包括测试数据准备、状态读取、资源调整、session 轮询与清理
 * [POS]: 位于 `tests/e2e/helpers/`，仅供浏览器端 E2E 辅助代码调用，不参与生产运行时
 * [PROTOCOL]: 直接调用 Supabase REST API，使用 service role 凭证执行测试前置与清理写操作
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DISTRICT_SLOT_COUNTS = {
  exploration: 6,
  food: 6,
  medical: 6,
  residential: 12,
  resource: 8,
} as const;

type DistrictKey = keyof typeof DISTRICT_SLOT_COUNTS;

type UserRow = {
  id: string;
  username: string;
  auto_assign: boolean;
};

type TaskTemplateRow = {
  id: string;
  code: string;
  district: DistrictKey;
  duration_minutes: number | null;
};

type TaskInstanceRow = {
  id: string;
  slot_id: string | null;
};

type SessionRow = {
  id: string;
  status: "pending" | "active" | "ended";
  end_reason: string | null;
  total_heartbeats: number;
  total_minutes: number;
};

type CityResourcesRow = {
  id: number;
  coal: number;
  wood: number;
  steel: number;
  raw_food: number;
  food_supply: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name] ?? readDotEnvLocal()[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

let dotenvCache: Record<string, string> | null = null;

function readDotEnvLocal() {
  if (dotenvCache) {
    return dotenvCache;
  }

  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    dotenvCache = content.split(/\r?\n/).reduce<Record<string, string>>((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
  } catch {
    dotenvCache = {};
  }

  return dotenvCache;
}

function buildUrl(path: string, params?: URLSearchParams): string {
  const url = new URL(path, `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/`);
  if (params) {
    url.search = params.toString();
  }
  return url.toString();
}

async function readJson(response: Response) {
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

async function request<T>(path: string, init: RequestInit = {}, params?: URLSearchParams): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      apikey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${JSON.stringify(await readJson(response))}`);
  }

  return (await readJson(response)) as T;
}

async function selectRows<T>(table: string, select: string, filters: Record<string, string>) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  return request<T[]>(table, { method: "GET" }, params);
}

async function insertRows<T>(table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>) {
  return request<T[]>(table, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
}

async function patchRows<T>(table: string, filters: Record<string, string>, payload: Record<string, unknown>) {
  const params = new URLSearchParams(filters);
  return request<T[]>(table, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  }, params);
}

async function deleteRows(table: string, filters: Record<string, string>) {
  const params = new URLSearchParams(filters);
  await request<void>(table, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  }, params);
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await selectRows<UserRow>("users", "id,username,auto_assign", {
    username: `eq.${username}`,
    limit: "1",
  });
  return rows[0] ?? null;
}

export async function cleanupUser(username: string) {
  const user = await getUserByUsername(username);
  if (!user) {
    return;
  }

  await deleteRows("sessions", { user_id: `eq.${user.id}` });
  await deleteRows("task_participants", { user_id: `eq.${user.id}` });
}

export async function setAutoAssignForUser(username: string, autoAssign: boolean) {
  const user = await getUserByUsername(username);
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }

  await patchRows<UserRow>("users", { id: `eq.${user.id}` }, { auto_assign: autoAssign });
}

export async function getCityResources(): Promise<CityResourcesRow> {
  const rows = await selectRows<CityResourcesRow>("city_resources", "id,coal,wood,steel,raw_food,food_supply", {
    id: "eq.1",
    limit: "1",
  });
  const row = rows[0];
  if (!row) {
    throw new Error("city_resources row missing");
  }
  return row;
}

export async function updateCityResources(patch: Partial<CityResourcesRow>) {
  await patchRows<CityResourcesRow>("city_resources", { id: "eq.1" }, patch);
}

export async function getTaskTemplateByCode(code: string): Promise<TaskTemplateRow> {
  const rows = await selectRows<TaskTemplateRow>("task_templates", "id,code,district,duration_minutes", {
    code: `eq.${code}`,
    limit: "1",
  });
  const row = rows[0];
  if (!row) {
    throw new Error(`Task template not found: ${code}`);
  }
  return row;
}

async function getOccupiedSlots(district: DistrictKey): Promise<Set<string>> {
  const [buildings, activeInstances] = await Promise.all([
    selectRows<{ slot_id: string }>("buildings", "slot_id", {
      district: `eq.${district}`,
    }),
    selectRows<{ slot_id: string }>("task_instances", "slot_id", {
      status: "eq.active",
      slot_id: "not.is.null",
    }),
  ]);

  return new Set(
    [...buildings, ...activeInstances]
      .map((row) => row.slot_id)
      .filter((slotId): slotId is string => typeof slotId === "string" && slotId.length > 0),
  );
}

function nextFreeSlot(district: DistrictKey, occupiedSlots: Set<string>): string | null {
  const limit = DISTRICT_SLOT_COUNTS[district];
  for (let index = 1; index <= limit; index += 1) {
    const slotId = `${district}-${String(index).padStart(2, "0")}`;
    if (!occupiedSlots.has(slotId)) {
      return slotId;
    }
  }
  return null;
}

export async function ensureActiveBuildInstance(code: string): Promise<{ instanceId: string; created: boolean }> {
  const template = await getTaskTemplateByCode(code);

  const activeInstances = await selectRows<TaskInstanceRow>("task_instances", "id,slot_id", {
    template_id: `eq.${template.id}`,
    status: "eq.active",
    order: "created_at.asc",
    limit: "1",
  });

  if (activeInstances[0]) {
    return { instanceId: activeInstances[0].id, created: false };
  }

  const occupiedSlots = await getOccupiedSlots(template.district);
  const slotId = nextFreeSlot(template.district, occupiedSlots);

  if (!slotId) {
    throw new Error(`No free slot available for district ${template.district}`);
  }

  const inserted = await insertRows<TaskInstanceRow>("task_instances", {
    template_id: template.id,
    status: "active",
    progress_minutes: 0,
    remaining_minutes: template.duration_minutes ?? 10,
    slot_id: slotId,
  });

  if (!inserted[0]?.id) {
    throw new Error(`Failed to create task instance for ${code}`);
  }

  return { instanceId: inserted[0].id, created: true };
}

export async function updateBuildInstance(instanceId: string, patch: {
  progress_minutes?: number;
  remaining_minutes?: number;
  status?: "active" | "completed";
}) {
  await patchRows<TaskInstanceRow>("task_instances", { id: `eq.${instanceId}` }, patch);
}

export async function deleteTaskInstance(instanceId: string) {
  await deleteRows("buildings", { instance_id: `eq.${instanceId}` });
  await deleteRows("task_participants", { instance_id: `eq.${instanceId}` });
  await deleteRows("sessions", { task_instance_id: `eq.${instanceId}` });
  await deleteRows("task_instances", { id: `eq.${instanceId}` });
}

export async function getSession(sessionId: string): Promise<SessionRow> {
  const rows = await selectRows<SessionRow>("sessions", "id,status,end_reason,total_heartbeats,total_minutes", {
    id: `eq.${sessionId}`,
    limit: "1",
  });
  const row = rows[0];
  if (!row) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return row;
}

export async function pollSession(sessionId: string, predicate: (session: SessionRow) => boolean, timeoutMs = 10_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const session = await getSession(sessionId);
    if (predicate(session)) {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for session ${sessionId}`);
}
