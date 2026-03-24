/**
 * [INPUT]: 浏览器侧公开 Supabase 环境变量
 * [OUTPUT]: 供前端模块复用的最小 Supabase 浏览器配置读取
 * [POS]: 位于 `lib/supabase-browser.ts`，被后续浏览器模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `/CLAUDE.md`
 */

import { SUPABASE_SESSION_COOKIE_NAME } from "@/lib/auth";

export type SupabaseBrowserConfig = {
  url: string;
  anonKey: string;
  sessionCookieName: string;
};

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing public Supabase environment variables.");
  }

  return {
    url,
    anonKey,
    sessionCookieName: SUPABASE_SESSION_COOKIE_NAME,
  };
}

