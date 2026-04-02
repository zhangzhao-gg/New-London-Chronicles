/**
 * [INPUT]: 当前请求 cookie session、`@/lib/auth`、`@/components/city/CityPageShell`
 * [OUTPUT]: 城市地图页服务端入口，为客户端 HUD 注入当前用户初始态
 * [POS]: 位于 `app/city/page.tsx`，作为 M08 城市地图页入口，未登录时重定向到 /login
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CityPageShell } from "@/components/city/CityPageShell";
import type { CitySnapshot } from "@/hooks/use-city";
import { getSession } from "@/lib/auth";

async function getRequestContext() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const host = headerStore.get("host") ?? "localhost";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  return { cookie, host, protocol };
}

async function getCurrentUser() {
  const { cookie, host, protocol } = await getRequestContext();

  return getSession(
    new Request(`${protocol}://${host}/city`, {
      headers: cookie ? { cookie } : undefined,
    }),
  );
}

async function getInitialCitySnapshot(): Promise<CitySnapshot | null> {
  const { cookie, host, protocol } = await getRequestContext();
  const response = await fetch(`${protocol}://${host}/api/city`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Partial<CitySnapshot> | null;

  if (!payload || !Array.isArray(payload.districts) || !Array.isArray(payload.languageOptions)) {
    return null;
  }

  return payload as CitySnapshot;
}

export default async function CityPage() {
  const session = await getCurrentUser();

  if (!session) {
    redirect("/login");
  }

  const initialCity = await getInitialCitySnapshot();

  return <CityPageShell initialCity={initialCity} initialUser={session.user} />;
}
