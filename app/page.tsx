/**
 * [INPUT]: next/navigation redirect
 * [OUTPUT]: 根路由入口，服务端 302 重定向到 /city
 * [POS]: 位于 `app/page.tsx`，纯粹的路由分发器，不承载业务
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/city");
}
