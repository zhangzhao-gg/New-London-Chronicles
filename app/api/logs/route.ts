/**
 * [INPUT]: 已登录业务用户、city_logs 表、分页 limit 查询参数
 * [OUTPUT]: `GET /api/logs` 返回城市日志；`POST /api/logs` 写入用户电报消息
 * [POS]: 位于 app/api/logs，被城市页滚动日志区域与 CommsPanel 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import { appendSupabaseSessionCookieIfRefreshed, errorResponse, resolveSessionFromRequest } from "@/lib/auth";
import { handleRouteError, insertRow, mapLogDto, selectRows, type CityLogRow } from "@/lib/supabase-server";

function parseLimit(request: NextRequest): number {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return 20;
  }

  return Math.min(parsedLimit, 100);
}

export async function GET(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const limit = parseLimit(request);
    const logs = await selectRows<CityLogRow>(
      "city_logs",
      "id,user_label,action_desc,created_at",
      {
        order: "created_at.desc",
        limit: String(limit),
      },
    );

    const response = NextResponse.json({
      logs: logs.map(mapLogDto),
    });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}

const MAX_MESSAGE_LENGTH = 200;

export async function POST(request: NextRequest) {
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionFromRequest>> | null = null;

  try {
    resolvedSession = await resolveSessionFromRequest(request);

    if (!resolvedSession) {
      return errorResponse(401, "UNAUTHORIZED", "Login required.");
    }

    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return errorResponse(400, "BAD_REQUEST", "Message is required.");
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return errorResponse(400, "BAD_REQUEST", `Message must be under ${MAX_MESSAGE_LENGTH} characters.`);
    }

    await insertRow("city_logs", {
      user_label: resolvedSession.user.username,
      action_desc: message,
    });

    const response = NextResponse.json({ ok: true }, { status: 201 });
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  } catch (error) {
    const response = handleRouteError(error);
    appendSupabaseSessionCookieIfRefreshed(response, resolvedSession);
    return response;
  }
}
