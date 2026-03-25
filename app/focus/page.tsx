/**
 * [INPUT]: 当前请求 cookie session、`@/lib/auth`、`@/components/focus/FocusExperience`
 * [OUTPUT]: `/focus` 页面服务端入口，为客户端 Focus 流程注入当前用户初始态
 * [POS]: 位于 `app/focus/page.tsx`，作为 M10 Focus 页面入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/focus/CLAUDE.md`、`app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import FocusExperience from "@/components/focus/FocusExperience";
import { getSession } from "@/lib/auth";

async function getCurrentUser() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const host = headerStore.get("host") ?? "localhost";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return getSession(
    new Request(`${protocol}://${host}/focus`, {
      headers: cookie ? { cookie } : undefined,
    }),
  );
}

export default async function FocusPage() {
  const session = await getCurrentUser();

  if (!session) {
    redirect("/");
  }

  return <FocusExperience initialUser={session.user} />;
}
