/**
 * [INPUT]: `process.env`、`city_resources`、`task_templates`、`task_instances`、`buildings`、`users`、`sessions` 的 Supabase REST 数据
 * [OUTPUT]: 提供 cron 鉴权、Asia/Shanghai 日历、建造指令执行、每日 upkeep 与僵尸 session 清扫能力
 * [POS]: 位于 `lib/cron.ts`，被 `app/api/tasks/strategy/route.ts`、`app/api/internal/city/upkeep/route.ts`、`app/api/internal/sessions/reap/route.ts` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `CLAUDE.md` 与相关 docs
 */

import { timingSafeEqual } from "node:crypto";

type DbResourceKey = "coal" | "wood" | "steel" | "raw_food" | "food_supply";
type District = "resource" | "residential" | "medical" | "food" | "exploration";

type JsonRecord = Record<string, unknown>;

type CityResourcesRow = {
  id: number;
  coal: number;
  wood: number;
  steel: number;
  raw_food: number;
  food_supply: number;
  updated_at: string;
};

type TaskTemplateRow = {
  id: string;
  code: string;
  type: "build";
  district: District;
  build_cost: JsonRecord;
  duration_minutes: number | null;
  max_concurrent_instances: number;
  enabled: boolean;
};

type TaskInstanceRow = {
  id: string;
  template_id: string;
  slot_id: string | null;
};

type BuildingRow = {
  slot_id: string;
};

type UserRow = {
  id: string;
  hunger_status: "healthy" | "hungry";
  last_seen_at: string;
  created_at: string;
};

export type ReapZombieSessionsSummary = {
  reaped: number;
};

export type DailyCityUpkeepSummary = {
  businessDate: string;
  activeUsers: number;
  foodConsumed: number;
  coalConsumed: number;
  newlyHungryUsers: number;
};

export type BuildOrderInput = {
  templateCode: string;
  slotId: string;
};

export type BuildOrderResult =
  | { ok: true; instanceId: string; templateCode: string; slotId: string }
  | { ok: false; reason: "template_not_found" | "invalid_slot" | "slot_occupied" | "max_active_reached" | "insufficient_resource" };

type CreateInstanceResult =
  | {
      created: true;
      instanceId: string;
      slotId: string;
      resourceState: CityResourcesRow;
    }
  | {
      created: false;
      reason: "insufficient_resource" | "slot_occupied";
      resourceState: CityResourcesRow;
    };

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const CITY_RESOURCE_ROW_ID = 1;
const CAS_RETRY_LIMIT = 3;
const ZOMBIE_SESSION_THRESHOLD_HOURS = 12;

const DISTRICT_SLOT_COUNTS: Record<District, number> = {
  resource: 8,
  residential: 12,
  medical: 6,
  food: 6,
  exploration: 6,
};

const RESOURCE_KEY_ALIASES: Record<string, DbResourceKey | undefined> = {
  coal: "coal",
  wood: "wood",
  steel: "steel",
  rawFood: "raw_food",
  raw_food: "raw_food",
  foodSupply: "food_supply",
  food_supply: "food_supply",
};

class CronError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "CronError";
    this.status = options?.status ?? 500;
    this.code = options?.code ?? "CRON_ERROR";
  }
}

class SupabaseAdminApi {
  private readonly restBaseUrl: string;
  private readonly headers: HeadersInit;

  constructor() {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    this.restBaseUrl = `${supabaseUrl}/rest/v1`;
    this.headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };
  }

  async get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const response = await fetch(this.buildUrl(path, params), {
      method: "GET",
      headers: this.headers,
      cache: "no-store",
    });

    return this.parseResponse<T>(response);
  }

  async post<T>(path: string, body: unknown, extraHeaders?: HeadersInit): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: "POST",
      headers: { ...this.headers, ...extraHeaders },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    return this.parseResponse<T>(response);
  }

  async patch<T>(
    path: string,
    body: unknown,
    params?: URLSearchParams,
    extraHeaders?: HeadersInit,
  ): Promise<T> {
    const response = await fetch(this.buildUrl(path, params), {
      method: "PATCH",
      headers: { ...this.headers, ...extraHeaders },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    return this.parseResponse<T>(response);
  }

  async delete(path: string, params?: URLSearchParams): Promise<void> {
    const response = await fetch(this.buildUrl(path, params), {
      method: "DELETE",
      headers: this.headers,
      cache: "no-store",
    });

    if (!response.ok) {
      await this.parseResponse(response);
    }
  }


  private buildUrl(path: string, params?: URLSearchParams): string {
    const url = new URL(`${this.restBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);

    if (params) {
      url.search = params.toString();
    }

    return url.toString();
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const payload = await safeReadJson(response);

    if (!response.ok) {
      throw toCronError(payload, response.status);
    }

    return payload as T;
  }

}

export function getBusinessDateInShanghai(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new CronError("Failed to resolve Asia/Shanghai business date.");
  }

  return `${year}-${month}-${day}`;
}

export function getShanghaiBusinessDayRange(now: Date = new Date()): {
  businessDate: string;
  startIso: string;
  endIso: string;
} {
  const businessDate = getBusinessDateInShanghai(now);
  const startAt = new Date(`${businessDate}T00:00:00+08:00`);
  const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

  return {
    businessDate,
    startIso: startAt.toISOString(),
    endIso: endAt.toISOString(),
  };
}

export function isValidCronSecret(candidate: string | null | undefined): boolean {
  const expected = process.env.CRON_SHARED_SECRET;

  if (!expected || !candidate) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

export async function runDailyCityUpkeep(): Promise<DailyCityUpkeepSummary> {
  const api = new SupabaseAdminApi();
  return runDailyCityUpkeepFallback(api);
}

export async function executeBuildOrder(input: BuildOrderInput): Promise<BuildOrderResult> {
  const api = new SupabaseAdminApi();

  /* ── 1. 模板校验 ── */
  const template = await findBuildTemplate(api, input.templateCode);

  if (!template) {
    return { ok: false, reason: "template_not_found" };
  }

  /* ── 2. 地块格式校验 ── */
  if (!isValidSlotForDistrict(input.slotId, template.district)) {
    return { ok: false, reason: "invalid_slot" };
  }

  /* ── 3. 并发上限 + 占位校验 ── */
  const [activeInstances, buildings] = await Promise.all([
    getActiveTaskInstances(api),
    getCompletedBuildingSlots(api),
  ]);

  const occupiedSlots = new Set<string>();
  let activeCount = 0;

  for (const instance of activeInstances) {
    if (instance.slot_id) {
      occupiedSlots.add(instance.slot_id);
    }

    if (instance.template_id === template.id) {
      activeCount += 1;
    }
  }

  for (const building of buildings) {
    occupiedSlots.add(building.slot_id);
  }

  if (occupiedSlots.has(input.slotId)) {
    return { ok: false, reason: "slot_occupied" };
  }

  if (activeCount >= template.max_concurrent_instances) {
    return { ok: false, reason: "max_active_reached" };
  }

  /* ── 4. CAS 扣资源 + 创建实例 ── */
  const resourceState = await getCityResources(api);
  const result = await createTaskInstanceWithReservedCost(api, template, input.slotId, resourceState);

  if (!result.created) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    instanceId: result.instanceId,
    templateCode: input.templateCode,
    slotId: result.slotId,
  };
}

/* ================================================================
 *  僵尸 session 清扫
 *  超过 ZOMBIE_SESSION_THRESHOLD_HOURS 未心跳的 pending/active session
 *  强制转为 ended + end_reason='timeout'
 * ================================================================ */

export async function reapZombieSessions(): Promise<ReapZombieSessionsSummary> {
  const api = new SupabaseAdminApi();
  const cutoff = new Date(Date.now() - ZOMBIE_SESSION_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  /* 条件 PATCH 一步到位：匹配即更新，无需先查后改 */
  const orFilter = [
    `last_heartbeat_at.lt.${cutoff}`,
    `and(last_heartbeat_at.is.null,started_at.lt.${cutoff})`,
    `and(last_heartbeat_at.is.null,started_at.is.null,created_at.lt.${cutoff})`,
  ].join(",");

  const params = new URLSearchParams();
  params.set("status", "in.(pending,active)");
  params.set("or", `(${orFilter})`);

  const rows = await api.patch<Array<{ id: string }>>(
    "/sessions",
    { status: "ended", end_reason: "timeout", ended_at: now },
    params,
    { Prefer: "return=representation" },
  );

  return { reaped: rows.length };
}

async function runDailyCityUpkeepFallback(api: SupabaseAdminApi): Promise<DailyCityUpkeepSummary> {
  const { businessDate, startIso, endIso } = getShanghaiBusinessDayRange();
  const activeUsers = await getTodayActiveUsers(api, startIso, endIso);

  let resources = await getCityResources(api);
  const activeUserCount = activeUsers.length;
  const foodConsumed = Math.min(resources.food_supply, activeUserCount);
  const coalConsumed = Math.min(resources.coal, 1000);
  const hungryCandidates = activeUsers.slice(foodConsumed);

  resources = await compareAndSwapResources(api, resources, {
    food_supply: resources.food_supply - foodConsumed,
    coal: resources.coal - coalConsumed,
  });

  const newlyHungryUsers = await markUsersHungry(api, hungryCandidates.map((user) => user.id));

  return {
    businessDate,
    activeUsers: activeUserCount,
    foodConsumed,
    coalConsumed,
    newlyHungryUsers,
  };
}


async function createTaskInstanceWithReservedCost(
  api: SupabaseAdminApi,
  template: TaskTemplateRow,
  slotId: string,
  initialResourceState: CityResourcesRow,
): Promise<CreateInstanceResult> {
  const buildCost = normalizeResourceCost(template.build_cost);
  let resourceState = initialResourceState;

  for (let attempt = 0; attempt < CAS_RETRY_LIMIT; attempt += 1) {
    if (!canAffordCost(resourceState, buildCost)) {
      return {
        created: false,
        reason: "insufficient_resource",
        resourceState,
      };
    }

    const insertPayload = {
      template_id: template.id,
      status: "active",
      progress_minutes: 0,
      remaining_minutes: template.duration_minutes ?? 0,
      slot_id: slotId,
    };

    let insertedInstance: { id: string } | undefined;

    try {
      const insertedRows = await api.post<Array<{ id: string }>>(
        "/task_instances",
        insertPayload,
        { Prefer: "return=representation" },
      );

      insertedInstance = insertedRows[0];
    } catch (error) {
      if (error instanceof CronError && error.code === "23505") {
        resourceState = await getCityResources(api);

        return {
          created: false,
          reason: "slot_occupied",
          resourceState,
        };
      }

      throw error;
    }

    if (!insertedInstance) {
      throw new CronError(`Failed to create task instance for template ${template.code}.`);
    }

    try {
      resourceState = await compareAndSwapResources(api, resourceState, subtractCost(resourceState, buildCost));

      return {
        created: true,
        instanceId: insertedInstance.id,
        slotId,
        resourceState,
      };
    } catch (error) {
      await api.delete("/task_instances", buildSingleRowParams({ id: `eq.${insertedInstance.id}` }));

      if (!(error instanceof CronError)) {
        throw error;
      }

      if (error.code !== "RESOURCE_CONFLICT") {
        throw error;
      }

      resourceState = await getCityResources(api);
    }
  }

  throw new CronError("Failed to reserve city resources after retrying cron mutations.", {
    status: 409,
    code: "RESOURCE_CONFLICT",
  });
}

async function compareAndSwapResources(
  api: SupabaseAdminApi,
  current: CityResourcesRow,
  partialNext: Partial<Pick<CityResourcesRow, DbResourceKey>>,
): Promise<CityResourcesRow> {
  const patchParams = buildSingleRowParams({
    id: `eq.${CITY_RESOURCE_ROW_ID}`,
    updated_at: `eq.${current.updated_at}`,
    select: "id,coal,wood,steel,raw_food,food_supply,updated_at",
  });

  const patchBody: Partial<Record<DbResourceKey | "updated_at", number | string>> = {
    updated_at: new Date().toISOString(),
  };

  for (const key of Object.keys(partialNext) as DbResourceKey[]) {
    const value = partialNext[key];

    if (typeof value === "number") {
      patchBody[key] = value;
    }
  }

  const rows = await api.patch<CityResourcesRow[]>("/city_resources", patchBody, patchParams, {
    Prefer: "return=representation",
  });

  if (rows.length === 0) {
    throw new CronError("City resources changed during cron mutation; retry required.", {
      status: 409,
      code: "RESOURCE_CONFLICT",
    });
  }

  return rows[0];
}

async function markUsersHungry(api: SupabaseAdminApi, userIds: string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const params = buildSingleRowParams({
    id: `in.(${userIds.join(",")})`,
    hunger_status: "neq.hungry",
    select: "id",
  });
  const rows = await api.patch<Array<{ id: string }>>(
    "/users",
    { hunger_status: "hungry" },
    params,
    { Prefer: "return=representation" },
  );

  return rows.length;
}

async function getCityResources(api: SupabaseAdminApi): Promise<CityResourcesRow> {
  const rows = await api.get<CityResourcesRow[]>(
    "/city_resources",
    buildSingleRowParams({
      id: `eq.${CITY_RESOURCE_ROW_ID}`,
      select: "id,coal,wood,steel,raw_food,food_supply,updated_at",
      limit: "1",
    }),
  );

  const row = rows[0];

  if (!row) {
    throw new CronError("Missing city_resources row with id = 1.", {
      status: 500,
      code: "RESOURCE_ROW_MISSING",
    });
  }

  return row;
}

async function findBuildTemplate(api: SupabaseAdminApi, code: string): Promise<TaskTemplateRow | null> {
  const rows = await api.get<TaskTemplateRow[]>(
    "/task_templates",
    buildSingleRowParams({
      select: "id,code,type,district,build_cost,duration_minutes,max_concurrent_instances,enabled",
      code: `eq.${code}`,
      type: "eq.build",
      enabled: "eq.true",
      limit: "1",
    }),
  );

  return rows[0] ?? null;
}

function isValidSlotForDistrict(slotId: string, district: District): boolean {
  const match = slotId.match(/^([a-z]+)-(\d{2})$/);

  if (!match) {
    return false;
  }

  const [, slotDistrict, indexStr] = match;

  if (slotDistrict !== district) {
    return false;
  }

  const index = parseInt(indexStr, 10);
  return index >= 1 && index <= DISTRICT_SLOT_COUNTS[district];
}

async function getActiveTaskInstances(api: SupabaseAdminApi): Promise<TaskInstanceRow[]> {
  return api.get<TaskInstanceRow[]>(
    "/task_instances",
    buildSingleRowParams({
      select: "id,template_id,slot_id",
      status: "eq.active",
    }),
  );
}

async function getCompletedBuildingSlots(api: SupabaseAdminApi): Promise<BuildingRow[]> {
  return api.get<BuildingRow[]>(
    "/buildings",
    buildSingleRowParams({
      select: "slot_id",
    }),
  );
}

async function getTodayActiveUsers(
  api: SupabaseAdminApi,
  startIso: string,
  endIso: string,
): Promise<UserRow[]> {
  const params = new URLSearchParams();
  params.set("select", "id,hunger_status,last_seen_at,created_at");
  params.append("last_seen_at", `gte.${startIso}`);
  params.append("last_seen_at", `lt.${endIso}`);
  params.set("order", "last_seen_at.desc,created_at.asc");

  return api.get<UserRow[]>(
    "/users",
    params,
  );
}


function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new CronError(`Missing required environment variable: ${name}.`, {
      status: 500,
      code: "MISSING_ENV",
    });
  }

  return value;
}

function normalizeResourceCost(input: JsonRecord): Partial<Record<DbResourceKey, number>> {
  const normalized: Partial<Record<DbResourceKey, number>> = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = RESOURCE_KEY_ALIASES[rawKey];
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);

    if (!key || Number.isNaN(value) || value <= 0) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function canAffordCost(
  resources: CityResourcesRow,
  cost: Partial<Record<DbResourceKey, number>>,
): boolean {
  return (Object.keys(cost) as DbResourceKey[]).every((key) => resources[key] >= (cost[key] ?? 0));
}

function subtractCost(
  resources: CityResourcesRow,
  cost: Partial<Record<DbResourceKey, number>>,
): Partial<Record<DbResourceKey, number>> {
  const next: Partial<Record<DbResourceKey, number>> = {};

  for (const key of Object.keys(cost) as DbResourceKey[]) {
    next[key] = resources[key] - (cost[key] ?? 0);
  }

  return next;
}

function buildSingleRowParams(values: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value.length > 0) {
      params.set(key, value);
    }
  }

  return params;
}

async function safeReadJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}


function toCronError(payload: unknown, status: number): CronError {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    const code = (payload as { code?: unknown }).code;

    return new CronError(typeof message === "string" ? message : "Cron request failed.", {
      status,
      code: typeof code === "string" ? code : "CRON_ERROR",
    });
  }

  return new CronError("Cron request failed.", { status });
}
