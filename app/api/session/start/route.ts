/**
 * [INPUT]: `POST /api/session/start` 请求体、Supabase auth cookies、`public.rpc_start_session`
 * [OUTPUT]: 将 pending session 幂等切换到 active 并返回 startedAt
 * [POS]: 位于 `app/api/session/start/route.ts`，被专注页开始按钮消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import {
  ensureObjectBody,
  readRequestJson,
  requireAuthenticatedUser,
  requireUuid,
  startSession,
  toErrorResponse,
} from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readRequestJson<unknown>(request);

    ensureObjectBody(body);

    const result = await startSession(user.userId, requireUuid(body.sessionId, "sessionId"));

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
