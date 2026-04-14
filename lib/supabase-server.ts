/**
 * [INPUT]: Next.js Route Handlers、Supabase Auth cookies、public 表与环境变量
 * [OUTPUT]: M03 只读查询、当前业务用户解析、统一 JSON 错误响应
 * [POS]: 位于 lib，被 City State API Route Handlers 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 /CLAUDE.md
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_RESOURCE"
  | "NO_PATIENTS"
  | "FORBIDDEN";

type AuthUserResponse = {
  id: string;
  user_metadata?: Record<string, unknown>;
};

type CurrentUser = {
  authUserId: string;
  appUserId: string;
  username: string;
};

type JsonRecord = Record<string, number>;

type UserRow = {
  id: string;
  username: string;
};

const CUSTOM_AUTH_COOKIE_NAME = "nlc-sb-anon-session";
const AUTH_COOKIE_NAME_PATTERN = /(auth-token|^sb-)/;
const CHUNK_SUFFIX_PATTERN = /\.\d+$/;
const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;

export type CityResourcesRow = {
  id: number;
  coal: number;
  wood: number;
  steel: number;
  raw_food: number;
  food_supply: number;
  updated_at: string;
};

export type BuildingRow = {
  id: string;
  name: string;
  district: string;
  slot_id: string;
  location: string | null;
  completed_at: string;
};

export type CityLogRow = {
  id: number;
  user_label: string;
  action_desc: string;
  created_at: string;
};

export type TaskTemplateRow = {
  id: string;
  code: string;
  name: string;
  type: "collect" | "build" | "convert" | "work";
  district: "resource" | "residential" | "medical" | "food" | "exploration";
  output_resource: "coal" | "wood" | "steel" | "raw_food" | "food_supply" | "progress" | null;
  output_per_heartbeat: number;
  build_cost: JsonRecord | null;
  heartbeat_cost: JsonRecord | null;
  duration_minutes: number | null;
  spawns_template_id: string | null;
  enabled: boolean;
  sort_order: number;
};

export type TaskInstanceRow = {
  id: string;
  template_id: string;
  status: "active" | "completed";
  progress_minutes: number;
  remaining_minutes: number;
  slot_id: string | null;
  building_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SessionRow = {
  id: string;
  user_id: string;
  task_template_id: string | null;
  task_instance_id: string | null;
  created_at: string;
  started_at: string | null;
  last_heartbeat_at: string | null;
  ended_at: string | null;
  status: "pending" | "active" | "ended";
  end_reason: string | null;
  task_unbind_reason: string | null;
};

class RouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("Missing SUPABASE_URL.");
  }

  return url.replace(/\/$/, "");
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return key;
}

function buildRestUrl(table: string, params?: URLSearchParams): string {
  const baseUrl = `${getSupabaseUrl()}/rest/v1/${table}`;
  const query = params?.toString();

  return query ? `${baseUrl}?${query}` : baseUrl;
}

function buildAuthUrl(pathname: string): string {
  return `${getSupabaseUrl()}/auth/v1/${pathname.replace(/^\//, "")}`;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized.padEnd(normalized.length + paddingLength, "=");

  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeSupabaseCookieValue(rawValue: string): string {
  if (!rawValue.startsWith("base64-")) {
    return rawValue;
  }

  return decodeBase64Url(rawValue.slice("base64-".length));
}

function extractAccessToken(sessionValue: string): string | null {
  const decodedValue = decodeSupabaseCookieValue(sessionValue);

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(decodedValue)) {
    return decodedValue;
  }

  try {
    const parsed: unknown = JSON.parse(decodedValue);

    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "access_token" in parsed &&
      typeof parsed.access_token === "string"
    ) {
      return parsed.access_token;
    }

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "accessToken" in parsed &&
      typeof parsed.accessToken === "string"
    ) {
      return parsed.accessToken;
    }

    return null;
  } catch {
    return null;
  }
}

async function getAccessTokenCandidates(): Promise<string[]> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const candidateBaseNames = [...new Set(
    allCookies
      .map(({ name }) => name.replace(CHUNK_SUFFIX_PATTERN, ""))
      .filter((baseName) => baseName === CUSTOM_AUTH_COOKIE_NAME || AUTH_COOKIE_NAME_PATTERN.test(baseName)),
  )];

  const accessTokens: string[] = [];

  for (const baseName of candidateBaseNames) {
    const exactMatch = allCookies.find(({ name }) => name === baseName)?.value;
    const chunkValue = exactMatch ?? allCookies
      .filter(({ name }) => name.startsWith(`${baseName}.`))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
      .map(({ value }) => value)
      .join("");

    if (!chunkValue) {
      continue;
    }

    const accessToken = extractAccessToken(chunkValue);

    if (accessToken) {
      accessTokens.push(accessToken);
    }
  }

  return [...new Set(accessTokens)];
}

async function fetchAuthUser(accessToken: string): Promise<AuthUserResponse | null> {
  const response = await fetch(buildAuthUrl("user"), {
    headers: {
      apikey: getServiceRoleKey(),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase auth request failed: ${message}`);
  }

  return (await response.json()) as AuthUserResponse;
}

type TableRequestOptions = {
  method?: "GET" | "PATCH";
  params?: URLSearchParams;
  body?: Record<string, unknown>;
  prefer?: string;
};

async function tableRequest<T>(table: string, options: TableRequestOptions = {}): Promise<T> {
  const headers = new Headers({
    apikey: getServiceRoleKey(),
    Authorization: `Bearer ${getServiceRoleKey()}`,
  });

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (options.prefer) {
    headers.set("Prefer", options.prefer);
  }

  const response = await fetch(buildRestUrl(table, options.params), {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase table request failed: ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildSelectParams(selectClause: string, extraParams: Record<string, string> = {}): URLSearchParams {
  const params = new URLSearchParams({ select: selectClause });

  Object.entries(extraParams).forEach(([key, value]) => {
    params.set(key, value);
  });

  return params;
}

export async function selectRows<T>(table: string, selectClause: string, extraParams: Record<string, string> = {}): Promise<T[]> {
  return tableRequest<T[]>(table, {
    params: buildSelectParams(selectClause, extraParams),
  });
}

export async function insertRow(table: string, body: Record<string, unknown>): Promise<void> {
  await tableRequest<void>(table, {
    method: "POST",
    body,
    prefer: "return=minimal",
  });
}

export async function patchRows(table: string, filters: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  await tableRequest<void>(table, {
    method: "PATCH",
    params: new URLSearchParams(filters),
    body,
    prefer: "return=minimal",
  });
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const accessTokens = await getAccessTokenCandidates();

  for (const accessToken of accessTokens) {
    const authUser = await fetchAuthUser(accessToken);

    if (!authUser) {
      continue;
    }

    const appUserId = authUser.user_metadata?.app_user_id;

    if (typeof appUserId !== "string" || appUserId.length === 0) {
      continue;
    }

    const userRows = await selectRows<UserRow>(
      "users",
      "id,username",
      { id: `eq.${appUserId}`, limit: "1" },
    );

    const userRow = userRows[0];

    if (!userRow) {
      continue;
    }

    return {
      authUserId: authUser.id,
      appUserId: userRow.id,
      username: userRow.username,
    };
  }

  throw new RouteError(401, "UNAUTHORIZED", "Login required.");
}

export function jsonError(status: number, code: ErrorCode, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof RouteError) {
    return jsonError(error.status, error.code, error.message);
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";
  return jsonError(500, "FORBIDDEN", message);
}

export function notFound(message = "Not found."): never {
  throw new RouteError(404, "NOT_FOUND", message);
}

export function toTaskJsonRecord(value: JsonRecord | null | undefined): JsonRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<JsonRecord>((accumulator, [key, amount]) => {
    if (typeof amount === "number") {
      accumulator[key] = amount;
    }

    return accumulator;
  }, {});
}

export function touchLastSeen(userId: string): Promise<void> {
  return patchRows("users", { id: `eq.${userId}` }, { last_seen_at: new Date().toISOString() });
}

export function isSessionTimedOut(session: Pick<SessionRow, "started_at" | "last_heartbeat_at">): boolean {
  const basis = session.last_heartbeat_at ?? session.started_at;

  if (!basis) {
    return false;
  }

  return Date.now() - new Date(basis).getTime() > TWELVE_HOURS_IN_MS;
}

export async function timeoutSession(sessionId: string, userId: string): Promise<void> {
  await patchRows(
    "sessions",
    {
      id: `eq.${sessionId}`,
      user_id: `eq.${userId}`,
      status: "in.(pending,active)",
    },
    {
      status: "ended",
      end_reason: "timeout",
      ended_at: new Date().toISOString(),
    },
  );
}

export function mapLogDto(log: CityLogRow) {
  return {
    id: log.id,
    userLabel: log.user_label,
    actionDesc: log.action_desc,
    createdAt: log.created_at,
  };
}
