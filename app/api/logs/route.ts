/**
 * [INPUT]: 已登录业务用户、city_logs 表、分页 limit 查询参数
 * [OUTPUT]: `GET /api/logs`，返回城市日志滚动列表
 * [POS]: 位于 app/api/logs，被城市页滚动日志区域消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 app/CLAUDE.md 与 /CLAUDE.md
 */

import { NextRequest, NextResponse } from "next/server";

import { handleRouteError, mapLogDto, requireCurrentUser, selectRows, type CityLogRow } from "@/lib/supabase-server";

function parseLimit(request: NextRequest): number {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return 20;
  }

  return Math.min(parsedLimit, 100);
}

export async function GET(request: NextRequest) {
  try {
    await requireCurrentUser();

    const limit = parseLimit(request);
    const logs = await selectRows<CityLogRow>(
      "city_logs",
      "id,user_label,action_desc,created_at",
      {
        order: "created_at.desc",
        limit: String(limit),
      },
    );

    return NextResponse.json({
      logs: logs.map(mapLogDto),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

