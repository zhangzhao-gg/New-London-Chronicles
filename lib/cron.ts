/**
 * [INPUT]: `process.env`、`city_resources`、`task_templates`、`task_instances`、`buildings`、`users` 的 Supabase REST/RPC 数据
 * [OUTPUT]: 提供 cron 鉴权、Asia/Shanghai 日历、建造补位与每日 upkeep 执行能力
 * [POS]: 位于 `lib/cron.ts`，被 `scripts/task-strategy.ts` 与 `app/api/internal/city/upkeep/route.ts` 消费
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

type DailyCityUpkeepRpcRow = {
  active_users: number;
  food_consumed: number;
  coal_consumed: number;
  newly_hungry_users: number;
  business_date: string;
};

export type DailyCityUpkeepSummary = {
  businessDate: string;
  activeUsers: number;
  foodConsumed: number;
  coalConsumed: number;
  newlyHungryUsers: number;
};

export type TaskStrategyTickSummary = {
  ok: true;
  mode: "rpc" | "fallback";
  businessDate: string;
  createdInstances: Array<{
    instanceId: string;
    templateCode: string;
    slotId: string;
  }>;
  skippedTemplates: Array<{
    templateCode: string;
    reason: "max_active_reached" | "insufficient_resource" | "no_slot";
  }>;
};

type CreateInstanceResult =
  | {
      created: true;
      instanceId: string;
      slotId: string;
      resourceState: CityResourcesRow;
    }
  | {
      created: false;
      reason: "insufficient_resource" | "no_slot";
      resourceState: CityResourcesRow;
    };

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const CITY_RESOURCE_ROW_ID = 1;
const MAX_ACTIVE_BUILD_INSTANCES = 2;
const CAS_RETRY_LIMIT = 3;

const BUILD_PRIORITY = [
  "build-tent",
  "build-collection-hut",
  "build-medical-post",
  "build-hunters-hut",
  "build-cookhouse",
  "build-workshop",
  "build-lighthouse",
] as const;

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

  async callRpc<T>(name: string, body: unknown): Promise<T | null> {
    const response = await fetch(this.buildUrl(`/rpc/${name}`), {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const payload = await safeReadJson(response);
      const code = readErrorCode(payload);

      if (code === "PGRST202" || code === "42883") {
        return null;
      }

      throw toCronError(payload, response.status);
    }

    return this.parseRpcPayload<T>(await safeReadJson(response));
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

  private parseRpcPayload<T>(payload: unknown): T {
    if (Array.isArray(payload)) {
      return (payload[0] ?? null) as T;
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
  const rpcResult = await api.callRpc<DailyCityUpkeepRpcRow>("rpc_daily_city_upkeep", {});

  if (rpcResult) {
    return normalizeDailyCityUpkeepSummary(rpcResult);
  }

  return runDailyCityUpkeepFallback(api);
}

export async function runTaskStrategyTick(): Promise<TaskStrategyTickSummary> {
  const api = new SupabaseAdminApi();
  const businessDate = getBusinessDateInShanghai();
  const rpcResult = await api.callRpc<JsonRecord>("rpc_task_strategy_tick", {});

  if (rpcResult) {
    return {
      ok: true,
      mode: "rpc",
      businessDate,
      createdInstances: [],
      skippedTemplates: [],
    };
  }

  return runTaskStrategyTickFallback(api, businessDate);
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

async function runTaskStrategyTickFallback(
  api: SupabaseAdminApi,
  businessDate: string,
): Promise<TaskStrategyTickSummary> {
  const [templates, activeInstances, buildings] = await Promise.all([
    getBuildTemplates(api),
    getActiveTaskInstances(api),
    getCompletedBuildingSlots(api),
  ]);

  let resourceState = await getCityResources(api);

  const templatesByCode = new Map(templates.map((template) => [template.code, template]));
  const activeCountByTemplateId = new Map<string, number>();
  const occupiedSlots = new Set<string>();

  for (const instance of activeInstances) {
    activeCountByTemplateId.set(
      instance.template_id,
      (activeCountByTemplateId.get(instance.template_id) ?? 0) + 1,
    );

    if (instance.slot_id) {
      occupiedSlots.add(instance.slot_id);
    }
  }

  for (const building of buildings) {
    occupiedSlots.add(building.slot_id);
  }

  const createdInstances: TaskStrategyTickSummary["createdInstances"] = [];
  const skippedTemplates: TaskStrategyTickSummary["skippedTemplates"] = [];

  for (const code of BUILD_PRIORITY) {
    const template = templatesByCode.get(code);

    if (!template) {
      continue;
    }

    const maxAllowed = Math.min(template.max_concurrent_instances, MAX_ACTIVE_BUILD_INSTANCES);

    if (maxAllowed <= 0) {
      skippedTemplates.push({ templateCode: code, reason: "max_active_reached" });
      continue;
    }

    let activeCount = activeCountByTemplateId.get(template.id) ?? 0;

    if (activeCount >= maxAllowed) {
      skippedTemplates.push({ templateCode: code, reason: "max_active_reached" });
      continue;
    }

    while (activeCount < maxAllowed) {
      const nextSlotId = getFirstAvailableSlotId(template.district, occupiedSlots);

      if (!nextSlotId) {
        skippedTemplates.push({ templateCode: code, reason: "no_slot" });
        break;
      }

      const result = await createTaskInstanceWithReservedCost(
        api,
        template,
        nextSlotId,
        resourceState,
      );

      resourceState = result.resourceState;

      if (!result.created) {
        skippedTemplates.push({ templateCode: code, reason: result.reason });
        break;
      }

      activeCount += 1;
      activeCountByTemplateId.set(template.id, activeCount);
      occupiedSlots.add(result.slotId);
      createdInstances.push({
        instanceId: result.instanceId,
        templateCode: code,
        slotId: result.slotId,
      });
    }
  }

  return {
    ok: true,
    mode: "fallback",
    businessDate,
    createdInstances,
    skippedTemplates,
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
          reason: "no_slot",
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

async function getBuildTemplates(api: SupabaseAdminApi): Promise<TaskTemplateRow[]> {
  const rows = await api.get<TaskTemplateRow[]>(
    "/task_templates",
    buildSingleRowParams({
      select:
        "id,code,type,district,build_cost,duration_minutes,max_concurrent_instances,enabled",
      type: "eq.build",
      enabled: "eq.true",
    }),
  );

  return rows.sort((left, right) => {
    const leftIndex = BUILD_PRIORITY.indexOf(left.code as (typeof BUILD_PRIORITY)[number]);
    const rightIndex = BUILD_PRIORITY.indexOf(right.code as (typeof BUILD_PRIORITY)[number]);

    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
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

function normalizeDailyCityUpkeepSummary(row: DailyCityUpkeepRpcRow): DailyCityUpkeepSummary {
  return {
    businessDate: row.business_date,
    activeUsers: row.active_users,
    foodConsumed: row.food_consumed,
    coalConsumed: row.coal_consumed,
    newlyHungryUsers: row.newly_hungry_users,
  };
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

function getFirstAvailableSlotId(district: District, occupiedSlots: Set<string>): string | null {
  const total = DISTRICT_SLOT_COUNTS[district];

  for (let index = 1; index <= total; index += 1) {
    const slotId = `${district}-${String(index).padStart(2, "0")}`;

    if (!occupiedSlots.has(slotId)) {
      return slotId;
    }
  }

  return null;
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

function readErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeCode = (payload as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : null;
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
