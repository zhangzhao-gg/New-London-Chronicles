/**
 * [INPUT]: `Request` cookie、Supabase Auth REST、`public.users` 表
 * [OUTPUT]: 会话解析、用户 DTO 映射、匿名登录辅助与统一错误响应
 * [POS]: 位于 `lib/auth.ts`，被 `app/api/auth/login/route.ts`、`app/api/users/me/settings/route.ts`、`middleware.ts` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

import { NextResponse } from "next/server";

export type HungerStatus = "healthy" | "hungry";

export type UserDto = {
  id: string;
  username: string;
  autoAssign: boolean;
  hungerStatus: HungerStatus;
  createdAt: string;
};

type SessionResult = {
  authUserId: string;
  user: UserDto;
};

type SupabaseAuthUser = {
  id: string;
  user_metadata?: Record<string, unknown> | null;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in?: number;
  token_type?: string;
  user?: SupabaseAuthUser;
};

type SupabaseSessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type UserRow = {
  id: string;
  username: string;
  auto_assign: boolean;
  hunger_status: HungerStatus;
  created_at: string;
};

type ResolvedAuthSession = {
  authUser: SupabaseAuthUser;
  supabaseSession: SupabaseSession;
  refreshed: boolean;
};

type ResolvedRequestSession = {
  authUser: SupabaseAuthUser;
  supabaseSession: SupabaseSession;
  user: UserDto;
  refreshed: boolean;
};

type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_RESOURCE"
  | "NO_PATIENTS"
  | "FORBIDDEN";

const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9 _-]+$/u;

export const SUPABASE_SESSION_COOKIE_NAME = "nlc-sb-anon-session";
const SUPABASE_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function formatFetchFailure(error: unknown, context: "auth" | "rest"): Error {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string" && error.cause.trim()
          ? error.cause
          : "";

    const detail = [error.message, cause].filter(Boolean).join(" | ");
    return new Error(`Supabase ${context} fetch failed: ${detail || "Unknown fetch error."}`);
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(`Supabase ${context} fetch failed: ${error}`);
  }

  return new Error(`Supabase ${context} fetch failed: Unknown fetch error.`);
}

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function getSupabaseAnonKey(): string {
  return requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

function getSupabaseServiceRoleKey(): string {
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function mapUserRowToDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    autoAssign: row.auto_assign,
    hungerStatus: row.hunger_status,
    createdAt: row.created_at,
  };
}

function parseCookieHeader(headerValue: string | null): Record<string, string> {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf("=");

    if (index <= 0) {
      return cookies;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[name] = value;

    return cookies;
  }, {});
}

function parseStoredSessionValue(cookieValue: string): SupabaseSessionPayload | null {
  const candidates = [cookieValue];

  try {
    candidates.push(decodeURIComponent(cookieValue));
  } catch {}

  try {
    candidates.push(decodeURIComponent(candidates[candidates.length - 1]));
  } catch {}

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<SupabaseSessionPayload>;

      if (
        typeof parsed.accessToken === "string" &&
        typeof parsed.refreshToken === "string" &&
        typeof parsed.expiresAt === "number"
      ) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
        };
      }
    } catch {}
  }

  return null;
}

function readStoredSession(request: Request): SupabaseSessionPayload | null {
  const cookieValue = parseCookieHeader(request.headers.get("cookie"))[SUPABASE_SESSION_COOKIE_NAME];

  if (!cookieValue) {
    return null;
  }

  return parseStoredSessionValue(cookieValue);
}

function toStoredSession(session: SupabaseSession): SupabaseSessionPayload {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
  };
}

function isSupabaseAuthUser(value: unknown): value is SupabaseAuthUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeUser = value as Partial<SupabaseAuthUser>;

  return typeof maybeUser.id === "string";
}

function isSupabaseSession(value: unknown): value is SupabaseSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeSession = value as Partial<SupabaseSession>;

  return (
    typeof maybeSession.access_token === "string" &&
    typeof maybeSession.refresh_token === "string" &&
    typeof maybeSession.expires_at === "number"
  );
}

function extractSession(value: unknown): SupabaseSession | null {
  if (isSupabaseSession(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeWrapped = value as { session?: unknown };

  return isSupabaseSession(maybeWrapped.session) ? maybeWrapped.session : null;
}

function extractUser(value: unknown): SupabaseAuthUser | null {
  if (isSupabaseAuthUser(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeWrapped = value as { user?: unknown };

  return isSupabaseAuthUser(maybeWrapped.user) ? maybeWrapped.user : null;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function authRequest<T>(
  path: string,
  init: RequestInit,
  options?: { accessToken?: string },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers = new Headers(init.headers);

  headers.set("apikey", getSupabaseAnonKey());

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  if (options?.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${getSupabaseUrl()}/auth/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    throw formatFetchFailure(error, "auth");
  }

  return {
    ok: response.ok,
    status: response.status,
    data: await parseJsonResponse<T>(response),
  };
}

async function restRequest<T>(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers = new Headers(init.headers);
  const serviceRoleKey = getSupabaseServiceRoleKey();

  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    throw formatFetchFailure(error, "rest");
  }

  return {
    ok: response.ok,
    status: response.status,
    data: await parseJsonResponse<T>(response),
  };
}

async function getAuthUser(accessToken: string): Promise<SupabaseAuthUser | null> {
  const response = await authRequest<unknown>("/user", { method: "GET" }, { accessToken });

  if (!response.ok) {
    return null;
  }

  return extractUser(response.data);
}

async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession | null> {
  const response = await authRequest<unknown>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  return extractSession(response.data);
}

async function createAnonymousSupabaseSession(): Promise<SupabaseSession | null> {
  const response = await authRequest<unknown>("/signup", {
    method: "POST",
    body: JSON.stringify({ data: {} }),
  });

  if (!response.ok) {
    return null;
  }

  return extractSession(response.data);
}

async function upsertAuthUserMetadata(accessToken: string, metadata: Record<string, unknown>): Promise<boolean> {
  const response = await authRequest<unknown>(
    "/user",
    {
      method: "PUT",
      body: JSON.stringify({ data: metadata }),
    },
    { accessToken },
  );

  return response.ok && !!extractUser(response.data);
}

async function findUserByUsername(username: string): Promise<UserRow | null> {
  const response = await restRequest<UserRow[]>(
    `/users?select=id,username,auto_assign,hunger_status,created_at&username=eq.${encodeURIComponent(username)}&limit=1`,
    {
      method: "GET",
    },
  );

  if (!response.ok || !response.data?.length) {
    return null;
  }

  return response.data[0] ?? null;
}

async function findUserById(userId: string): Promise<UserRow | null> {
  const response = await restRequest<UserRow[]>(
    `/users?select=id,username,auto_assign,hunger_status,created_at&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      method: "GET",
    },
  );

  if (!response.ok || !response.data?.length) {
    return null;
  }

  return response.data[0] ?? null;
}

async function createUser(username: string): Promise<UserRow | null> {
  const response = await restRequest<UserRow[]>("/users?select=id,username,auto_assign,hunger_status,created_at", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok || !response.data?.length) {
    return null;
  }

  return response.data[0] ?? null;
}

export async function touchUserLastSeen(userId: string): Promise<UserRow | null> {
  const response = await restRequest<UserRow[]>(
    `/users?select=id,username,auto_assign,hunger_status,created_at&id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    },
  );

  if (!response.ok || !response.data?.length) {
    return null;
  }

  return response.data[0] ?? null;
}

export async function updateUserAutoAssign(userId: string, autoAssign: boolean): Promise<UserRow | null> {
  const response = await restRequest<UserRow[]>(
    `/users?select=id,username,auto_assign,hunger_status,created_at&id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({ auto_assign: autoAssign }),
    },
  );

  if (!response.ok || !response.data?.length) {
    return null;
  }

  return response.data[0] ?? null;
}

export async function findOrCreateUserByUsername(username: string): Promise<UserRow | null> {
  const existingUser = await findUserByUsername(username);

  if (existingUser) {
    return existingUser;
  }

  const createdUser = await createUser(username);

  if (createdUser) {
    return createdUser;
  }

  return findUserByUsername(username);
}

export function hasStoredSession(request: Request): boolean {
  return readStoredSession(request) !== null;
}

export function validateUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const username = value.trim();

  if (username.length < 2 || username.length > 20) {
    return null;
  }

  if (!USERNAME_PATTERN.test(username)) {
    return null;
  }

  return username;
}

export function appendSupabaseSessionCookie(response: NextResponse, session: SupabaseSession): void {
  response.cookies.set({
    name: SUPABASE_SESSION_COOKIE_NAME,
    value: JSON.stringify(toStoredSession(session)),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPABASE_SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function appendSupabaseSessionCookieIfRefreshed(
  response: NextResponse,
  session: { refreshed: boolean; supabaseSession: SupabaseSession } | null | undefined,
): void {
  if (!session?.refreshed) {
    return;
  }

  appendSupabaseSessionCookie(response, session.supabaseSession);
}

export function clearSupabaseSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SUPABASE_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function ensureAnonymousSession(request: Request): Promise<SupabaseSession | null> {
  const storedSession = readStoredSession(request);

  if (storedSession) {
    const authUser = await getAuthUser(storedSession.accessToken);

    if (authUser) {
      return {
        access_token: storedSession.accessToken,
        refresh_token: storedSession.refreshToken,
        expires_at: storedSession.expiresAt,
        user: authUser,
      };
    }

    const refreshedSession = await refreshSupabaseSession(storedSession.refreshToken);

    if (refreshedSession) {
      return refreshedSession;
    }
  }

  return createAnonymousSupabaseSession();
}

export async function resolveAuthSessionFromRequest(request: Request): Promise<ResolvedAuthSession | null> {
  const storedSession = readStoredSession(request);

  if (!storedSession) {
    return null;
  }

  let supabaseSession: SupabaseSession = {
    access_token: storedSession.accessToken,
    refresh_token: storedSession.refreshToken,
    expires_at: storedSession.expiresAt,
  };
  let refreshed = false;
  let authUser = await getAuthUser(supabaseSession.access_token);

  if (!authUser) {
    const refreshedSession = await refreshSupabaseSession(supabaseSession.refresh_token);

    if (!refreshedSession) {
      return null;
    }

    supabaseSession = refreshedSession;
    refreshed = true;
    authUser = refreshedSession.user ?? (await getAuthUser(refreshedSession.access_token));
  }

  if (!authUser) {
    return null;
  }

  const appUserId = authUser.user_metadata?.app_user_id;

  if (typeof appUserId !== "string" || !appUserId) {
    return null;
  }

  return {
    authUser,
    supabaseSession,
    refreshed,
  };
}

export async function resolveSessionFromRequest(request: Request): Promise<ResolvedRequestSession | null> {
  const authSession = await resolveAuthSessionFromRequest(request);

  if (!authSession) {
    return null;
  }

  const appUserId = authSession.authUser.user_metadata?.app_user_id;

  if (typeof appUserId !== "string" || !appUserId) {
    return null;
  }

  const userRow = await findUserById(appUserId);

  if (!userRow) {
    return null;
  }

  return {
    authUser: authSession.authUser,
    supabaseSession: authSession.supabaseSession,
    user: mapUserRowToDto(userRow),
    refreshed: authSession.refreshed,
  };
}

export async function getSession(request: Request): Promise<SessionResult | null> {
  const resolvedSession = await resolveSessionFromRequest(request);

  if (!resolvedSession) {
    return null;
  }

  return {
    authUserId: resolvedSession.authUser.id,
    user: resolvedSession.user,
  };
}

export async function bindAuthUserToBusinessUser(session: SupabaseSession, user: UserRow): Promise<boolean> {
  return upsertAuthUserMetadata(session.access_token, {
    app_user_id: user.id,
    username: user.username,
  });
}

export function successResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function errorResponse(status: number, code: ErrorCode, message: string): NextResponse {
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
