/**
 * [INPUT]: Next Route Handler 请求、Supabase auth cookies、public.rpc_* 数据库函数
 * [OUTPUT]: M04 写接口所需的鉴权解析、RPC 调用、错误映射与响应 DTO 组装
 * [POS]: 位于 `lib/task-rpc.ts`，被 `app/api/tasks/*` 与 `app/api/session/*` 路由消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type AppErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_RESOURCE"
  | "NO_PATIENTS"
  | "FORBIDDEN";

type TaskType = "collect" | "build" | "convert" | "work";
type SessionEndReason = "timer_completed" | "manual_stop" | "resource_exhausted" | "building_completed" | "timeout";

type CookieLike = {
  name: string;
  value: string;
};

type AuthenticatedUser = {
  userId: string;
  username: string;
};

type TaskTemplateRecord = {
  id: string;
  name: string;
  type: TaskType;
  district: string;
};

type SessionRow = {
  id: string;
  started_at: string | null;
};

type AssignNextRpcResult = {
  sessionId: string;
  templateId: string;
  instanceId: string | null;
  taskName: string;
  taskType: TaskType;
  district: string;
};

type HeartbeatResources = {
  coal: number;
  wood: number;
  steel: number;
  rawFood: number;
  foodSupply: number;
};

type HeartbeatContribution = {
  minutes: number;
  resources: HeartbeatResources;
};

type HeartbeatRpcResult = {
  session_id: string;
  task_type: TaskType;
  contribution: HeartbeatContribution;
  task_ended: boolean;
  building_completed: boolean;
  completed_building_name: string | null;
  remaining_minutes: number;
  end_reason: SessionEndReason | null;
};

type EndSummary = {
  sessionId: string;
  endReason: SessionEndReason;
  resource: string;
  amount: number;
  narrative: string;
  buildingCompleted: boolean;
  buildingName: string | null;
  participantsLabel: string | null;
};

type SupabaseAuthPayload = {
  user_metadata?: Record<string, unknown>;
};

type SupabaseErrorPayload = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWN_ERROR_CODES = new Set<AppErrorCode>([
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INSUFFICIENT_RESOURCE",
  "NO_PATIENTS",
  "FORBIDDEN",
]);

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status = statusForErrorCode(code)) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function statusForErrorCode(code: AppErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "VALIDATION_ERROR":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
    case "INSUFFICIENT_RESOURCE":
    case "NO_PATIENTS":
      return 409;
  }
}

function getRequiredEnv(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getSupabaseRestBaseUrl() {
  return `${(process.env.SUPABASE_URL ?? getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/$/, "")}/rest/v1`;
}

function getSupabaseAuthBaseUrl() {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? getRequiredEnv("SUPABASE_URL")).replace(/\/$/, "")}/auth/v1`;
}

function getServiceRoleKey() {
  return getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function getAnonKey() {
  return getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function readRequestJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

export function ensureObjectBody(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }
}

export function requireUuid(value: unknown, fieldName: string) {
  if (!isUuid(value)) {
    throw new AppError("VALIDATION_ERROR", `${fieldName} must be a valid UUID.`);
  }

  return value;
}

export function optionalUuid(value: unknown, fieldName: string) {
  if (value == null) {
    return null;
  }

  if (!isUuid(value)) {
    throw new AppError("VALIDATION_ERROR", `${fieldName} must be a valid UUID or null.`);
  }

  return value;
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractAccessTokenFromParsedCookie(parsed: unknown): string | null {
  if (typeof parsed === "string") {
    return parsed.split(".").length === 3 ? parsed : null;
  }

  if (Array.isArray(parsed)) {
    const [candidate] = parsed;
    return typeof candidate === "string" ? candidate : null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const payload = parsed as Record<string, unknown>;

  if (typeof payload.access_token === "string") {
    return payload.access_token;
  }

  if (payload.currentSession && typeof payload.currentSession === "object") {
    const currentSession = payload.currentSession as Record<string, unknown>;

    if (typeof currentSession.access_token === "string") {
      return currentSession.access_token;
    }
  }

  return null;
}

function parseSupabaseAccessToken(cookies: ReadonlyArray<CookieLike>) {
  const authCookies = cookies.filter(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name));

  if (authCookies.length === 0) {
    return null;
  }

  const rawValue = authCookies.some(({ name }) => /\.\d+$/.test(name))
    ? authCookies
        .slice()
        .sort((left, right) => {
          const leftIndex = Number(left.name.split(".").pop() ?? 0);
          const rightIndex = Number(right.name.split(".").pop() ?? 0);
          return leftIndex - rightIndex;
        })
        .map(({ value }) => value)
        .join("")
    : authCookies[0].value;

  const candidates = new Set<string>();
  candidates.add(rawValue);

  try {
    candidates.add(decodeURIComponent(rawValue));
  } catch {}

  for (const candidate of candidates) {
    const parsedDirect = tryParseJson(candidate);
    const directToken = extractAccessTokenFromParsedCookie(parsedDirect ?? candidate);

    if (directToken) {
      return directToken;
    }

    if (candidate.startsWith("base64-")) {
      const decoded = decodeBase64Url(candidate.slice("base64-".length));
      const parsedDecoded = tryParseJson(decoded);
      const decodedToken = extractAccessTokenFromParsedCookie(parsedDecoded ?? decoded);

      if (decodedToken) {
        return decodedToken;
      }
    }
  }

  return null;
}

async function resolveAuthUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetch(`${getSupabaseAuthBaseUrl()}/user`, {
    cache: "no-store",
    headers: {
      apikey: getAnonKey(),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AppError("UNAUTHORIZED", "Login required.");
  }

  const payload = (await response.json()) as SupabaseAuthPayload;
  const userMetadata = payload.user_metadata ?? {};
  const userId = userMetadata.app_user_id;
  const username = userMetadata.username;

  if (!isUuid(userId) || typeof username !== "string" || username.length === 0) {
    throw new AppError("UNAUTHORIZED", "Login required.");
  }

  return {
    userId,
    username,
  };
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const accessToken = parseSupabaseAccessToken(request.cookies.getAll());

  if (!accessToken) {
    throw new AppError("UNAUTHORIZED", "Login required.");
  }

  return resolveAuthUser(accessToken);
}

async function parseSupabaseError(response: Response) {
  let payload: SupabaseErrorPayload | null = null;

  try {
    payload = (await response.json()) as SupabaseErrorPayload;
  } catch {}

  const candidateCode = payload?.message?.trim();
  if (candidateCode && KNOWN_ERROR_CODES.has(candidateCode as AppErrorCode)) {
    throw new AppError(candidateCode as AppErrorCode, payload?.details?.trim() || candidateCode);
  }

  if (response.status === 401) {
    throw new AppError("UNAUTHORIZED", "Login required.");
  }

  throw new Error(payload?.details?.trim() || payload?.message?.trim() || `Supabase request failed with ${response.status}.`);
}

async function callRpc<T>(functionName: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getSupabaseRestBaseUrl()}/rpc/${functionName}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      apikey: getServiceRoleKey(),
      Authorization: `Bearer ${getServiceRoleKey()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseSupabaseError(response);
  }

  const text = await response.text();
  return (text ? (JSON.parse(text) as T) : (null as T));
}

async function fetchSingleRow<T>(table: string, query: URLSearchParams, missingMessage: string): Promise<T> {
  const response = await fetch(`${getSupabaseRestBaseUrl()}/${table}?${query.toString()}`, {
    cache: "no-store",
    headers: {
      apikey: getServiceRoleKey(),
      Authorization: `Bearer ${getServiceRoleKey()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    await parseSupabaseError(response);
  }

  const rows = (await response.json()) as T[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("NOT_FOUND", missingMessage);
  }

  return rows[0];
}

async function getTaskTemplate(templateId: string): Promise<TaskTemplateRecord> {
  const query = new URLSearchParams({
    select: "id,name,type,district",
    id: `eq.${templateId}`,
    limit: "1",
  });

  return fetchSingleRow<TaskTemplateRecord>("task_templates", query, "Task template not found.");
}

async function getSessionRow(sessionId: string): Promise<SessionRow> {
  const query = new URLSearchParams({
    select: "id,started_at",
    id: `eq.${sessionId}`,
    limit: "1",
  });

  return fetchSingleRow<SessionRow>("sessions", query, "Session not found.");
}

function normalizeResources(resources: Partial<HeartbeatResources> | null | undefined): HeartbeatResources {
  return {
    coal: Number(resources?.coal ?? 0),
    wood: Number(resources?.wood ?? 0),
    steel: Number(resources?.steel ?? 0),
    rawFood: Number(resources?.rawFood ?? 0),
    foodSupply: Number(resources?.foodSupply ?? 0),
  };
}

function normalizeContribution(value: Partial<HeartbeatContribution> | null | undefined): HeartbeatContribution {
  return {
    minutes: Number(value?.minutes ?? 0),
    resources: normalizeResources(value?.resources),
  };
}

export async function joinTask(input: { userId: string; templateId: string; instanceId: string | null }) {
  const sessionId = await callRpc<string>("rpc_join_task", {
    p_user_id: input.userId,
    p_template_id: input.templateId,
    p_instance_id: input.instanceId,
  });
  const task = await getTaskTemplate(input.templateId);

  return {
    sessionId,
    status: "pending" as const,
    task: {
      templateId: task.id,
      instanceId: input.instanceId,
      type: task.type,
      name: task.name,
    },
    requiresStart: true,
    redirectTo: `/focus?sessionId=${sessionId}`,
  };
}

export async function assignNextTask(userId: string) {
  const payload = await callRpc<AssignNextRpcResult | null>("rpc_assign_next_task", {
    p_user_id: userId,
  });

  if (!payload) {
    throw new AppError("NOT_FOUND", "No assignable task found.");
  }

  return {
    sessionId: payload.sessionId,
    status: "pending" as const,
    task: {
      templateId: payload.templateId,
      instanceId: payload.instanceId,
      type: payload.taskType,
      name: payload.taskName,
      district: payload.district,
    },
    redirectTo: `/focus?sessionId=${payload.sessionId}`,
  };
}

export async function startSession(userId: string, sessionId: string) {
  await callRpc<null>("rpc_start_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  const session = await getSessionRow(sessionId);

  if (!session.started_at) {
    throw new Error("Session started_at was not persisted.");
  }

  return {
    ok: true as const,
    startedAt: session.started_at,
  };
}

export async function heartbeatSession(userId: string, sessionId: string) {
  const response = await callRpc<HeartbeatRpcResult[] | HeartbeatRpcResult>("rpc_session_heartbeat", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  const row = Array.isArray(response) ? response[0] : response;

  if (!row) {
    throw new Error("Heartbeat RPC returned no rows.");
  }

  return {
    contribution: normalizeContribution(row.contribution),
    taskEnded: Boolean(row.task_ended),
    buildingCompleted: Boolean(row.building_completed),
    remainingMinutes: Number(row.remaining_minutes ?? 0),
    endReason: row.end_reason,
  };
}

export async function endSession(userId: string, sessionId: string) {
  const summary = await callRpc<EndSummary | null>("rpc_end_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });

  if (!summary) {
    throw new Error("End session RPC returned no summary.");
  }

  return {
    summary,
  };
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      {
        status: error.status,
      },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "CONFLICT",
        message: "Internal server error.",
      },
    },
    {
      status: 500,
    },
  );
}
