/**
 * [INPUT]: `POST /api/tasks/join` 请求体、Supabase auth cookies、`public.rpc_join_task`
 * [OUTPUT]: 创建 pending session 并返回专注页跳转信息
 * [POS]: 位于 `app/api/tasks/join/route.ts`，被任务列表与区块弹窗消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import {
  ensureObjectBody,
  joinTask,
  optionalUuid,
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

    const result = await joinTask({
      userId: user.userId,
      templateId: requireUuid(body.templateId, "templateId"),
      instanceId: optionalUuid(body.instanceId, "instanceId"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
