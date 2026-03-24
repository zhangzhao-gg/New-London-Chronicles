/**
 * [INPUT]: `POST /api/tasks/assign-next` 请求、Supabase auth cookies、`public.rpc_assign_next_task`
 * [OUTPUT]: 为开启 autoAssign 的用户创建下一个 pending session
 * [POS]: 位于 `app/api/tasks/assign-next/route.ts`，被城市页与完成页消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { NextRequest, NextResponse } from "next/server";

import { assignNextTask, requireAuthenticatedUser, toErrorResponse } from "@/lib/task-rpc";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const result = await assignNextTask(user.userId);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
