/**
 * [INPUT]: 页面与 API 请求路径、Supabase cookie session
 * [OUTPUT]: 保护受限页面与受保护 API，缺失登录时重定向或返回 401
 * [POS]: 位于 `middleware.ts`，作为全局请求入口守卫
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import {
  appendSupabaseSessionCookie,
  clearSupabaseSessionCookie,
  errorResponse,
  hasStoredSession,
  resolveAuthSessionFromRequest,
} from "@/lib/auth";

const PROTECTED_PAGES = new Set(["/city", "/focus", "/complete"]);
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/internal/"];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.has(pathname);
}

function isProtectedApi(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  return !PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPage(pathname) && !isProtectedApi(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedApi(pathname)) {
    if (!hasStoredSession(request)) {
      const response = errorResponse(401, "UNAUTHORIZED", "Login required.");

      clearSupabaseSessionCookie(response);

      return response;
    }

    return NextResponse.next();
  }

  try {
    const authSession = await resolveAuthSessionFromRequest(request);

    if (!authSession) {
      const response = NextResponse.redirect(new URL("/", request.url));

      clearSupabaseSessionCookie(response);

      return response;
    }

    const response = NextResponse.next();

    if (authSession.refreshed) {
      appendSupabaseSessionCookie(response, authSession.supabaseSession);
    }

    return response;
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
