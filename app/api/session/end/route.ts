/**
 * [INPUT]: `POST /api/session/end` 请求体、Supabase auth cookies、`public.rpc_end_session`
 * [OUTPUT]: 结束 session、写入唯一日志，并返回结算摘要
 * [POS]: 位于 `app/api/session/end/route.ts`，被专注页与完成页消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import {
  endSession,
  ensureObjectBody,
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

    const result = await endSession(user.userId, requireUuid(body.sessionId, "sessionId"));

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
