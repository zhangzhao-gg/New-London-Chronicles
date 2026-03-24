/**
 * [INPUT]: `app/globals.css`、`docs/04-modules.md` 的 M06 设计 token、`PRD.md` 的字体要求
 * [OUTPUT]: 根布局，向全部页面注入全局样式
 * [POS]: 位于 `app/layout.tsx`，作为 App Router 根布局
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "New London Chronicles",
  description: "Steam-punk inspired shared focus city.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body className="font-serif antialiased">
        <div className="nlc-shell">{children}</div>
      </body>
    </html>
  );
}
