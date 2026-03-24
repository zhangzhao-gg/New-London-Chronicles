/**
 * [INPUT]: 当前请求 cookie session、`@/lib/auth`、`@/components/city/CityPageShell`
 * [OUTPUT]: 城市地图页服务端入口，为客户端 HUD 注入当前用户初始态
 * [POS]: 位于 `app/city/page.tsx`，作为 M08 城市地图页入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CityPageShell } from "@/components/city/CityPageShell";
import { getSession } from "@/lib/auth";

async function getCurrentUser() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const host = headerStore.get("host") ?? "localhost";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return getSession(
    new Request(`${protocol}://${host}/city`, {
      headers: cookie ? { cookie } : undefined,
    }),
  );
}

export default async function CityPage() {
  const session = await getCurrentUser();

  if (!session) {
    redirect("/");
  }

  return <CityPageShell initialUser={session.user} />;
}
