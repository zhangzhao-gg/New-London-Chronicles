/**
 * [INPUT]: `POST /api/session/heartbeat` 请求体、Supabase auth cookies、`public.rpc_session_heartbeat`
 * [OUTPUT]: 写入唯一一次 10 分钟贡献并返回任务是否应结束
 * [POS]: 位于 `app/api/session/heartbeat/route.ts`，被专注页定时器消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import {
  ensureObjectBody,
  heartbeatSession,
  readRequestJson,
  requireAuthenticatedUser,
  requireUuid,
  toErrorResponse,
} from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readRequestJson<unknown>(request);

    ensureObjectBody(body);

    const result = await heartbeatSession(user.userId, requireUuid(body.sessionId, "sessionId"));

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
