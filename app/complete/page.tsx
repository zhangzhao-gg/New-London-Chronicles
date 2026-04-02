/**
 * [INPUT]: 当前请求 cookie session、`@/lib/auth`、`@/components/focus/CompleteExperience`
 * [OUTPUT]: `/complete` 页面服务端入口，为客户端完成页流程注入当前用户初始态
 * [POS]: 位于 `app/complete/page.tsx`，作为 M10 完成页入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/complete/CLAUDE.md`、`app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import CompleteExperience from "@/components/focus/CompleteExperience";
import { getSession } from "@/lib/auth";

async function getCurrentUser() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const host = headerStore.get("host") ?? "localhost";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return getSession(
    new Request(`${protocol}://${host}/complete`, {
      headers: cookie ? { cookie } : undefined,
    }),
  );
}

export default async function CompletePage() {
  const session = await getCurrentUser();

  if (!session) {
    redirect("/login");
  }

  return <CompleteExperience initialUser={session.user} />;
}
