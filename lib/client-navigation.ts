/**
 * [INPUT]: 依赖 `lib/i18n.ts` 的 `t()` + `getSavedLocale()`
 * [OUTPUT]: 对外提供 `navigateTo()` 客户端页面跳转函数（附统一过渡动画）
 * [POS]: 位于 `lib/client-navigation.ts`，全局唯一客户端导航入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 `lib/CLAUDE.md`
 */

import { getSavedLocale, t } from "@/lib/i18n";

/* ─── 齿轮 SVG 路径常量 ─── */

const GEAR_D =
  "M32 8l3 6.5a16 16 0 0 1 4.8 2l6.7-2.4 3.4 3.4-2.4 6.7a16 16 0 0 1 2 4.8L56 32l-6.5 3a16 16 0 0 1-2 4.8l2.4 6.7-3.4 3.4-6.7-2.4a16 16 0 0 1-4.8 2L32 56l-3-6.5a16 16 0 0 1-4.8-2l-6.7 2.4-3.4-3.4 2.4-6.7a16 16 0 0 1-2-4.8L8 32l6.5-3a16 16 0 0 1 2-4.8l-2.4-6.7 3.4-3.4 6.7 2.4a16 16 0 0 1 4.8-2L32 8z";

const OVERLAY_ID = "nlc-page-transition";

/* ─── 过渡遮罩 DOM 注入（纯 DOM，不依赖 React） ─── */

function injectTransitionOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;

  const locale = getSavedLocale();
  const title = t("transition.title", locale);
  const subtitle = t("transition.subtitle", locale);

  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.className = "nlc-focus-overlay";
  el.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,5,3,0.96)";

  el.innerHTML = [
    '<div style="position:relative;margin-bottom:2rem;height:8rem;width:8rem">',
    /* 主齿轮 */
    `<svg class="nlc-gear-main" style="position:absolute;inset:0;color:var(--nlc-orange)" viewBox="0 0 64 64" fill="currentColor" opacity="0.7">`,
    `<path d="${GEAR_D}"/><circle cx="32" cy="32" r="8" fill="rgba(8,5,3,0.96)"/></svg>`,
    /* 副齿轮 */
    `<svg class="nlc-gear-secondary" style="position:absolute;right:-1rem;top:-0.5rem;height:3rem;width:3rem;color:var(--nlc-orange)" viewBox="0 0 64 64" fill="currentColor" opacity="0.4">`,
    `<path d="${GEAR_D}"/><circle cx="32" cy="32" r="8" fill="rgba(8,5,3,0.96)"/></svg>`,
    /* 工人剪影 */
    '<svg style="position:absolute;bottom:-1.5rem;left:50%;height:4rem;width:4rem;transform:translateX(-50%);color:var(--nlc-orange)" viewBox="0 0 64 64" fill="currentColor" opacity="0.6">',
    '<ellipse cx="32" cy="52" rx="6" ry="2" opacity="0.3"/>',
    '<rect x="28" y="28" width="8" height="18" rx="2"/><circle cx="32" cy="24" r="5"/>',
    '<rect x="28" y="44" width="3.5" height="10" rx="1" transform="rotate(-6 29.75 44)"/>',
    '<rect x="32.5" y="44" width="3.5" height="10" rx="1" transform="rotate(6 34.25 44)"/>',
    '<g class="nlc-worker-arm"><rect x="35" y="30" width="14" height="2.5" rx="1" transform="rotate(-30 35 31)"/>',
    '<rect x="46" y="22" width="3" height="6" rx="0.5" transform="rotate(-30 47.5 25)"/></g></svg>',
    /* 蒸汽粒子 */
    '<div class="nlc-steam-particle" style="position:absolute;top:-1rem;left:1.5rem;height:0.75rem;width:0.75rem;border-radius:50%;background:rgba(148,163,184,0.3)"></div>',
    '<div class="nlc-steam-particle-delayed" style="position:absolute;top:-0.5rem;left:3.5rem;height:0.5rem;width:0.5rem;border-radius:50%;background:rgba(148,163,184,0.2)"></div>',
    '<div class="nlc-steam-particle-slow" style="position:absolute;top:-1.5rem;left:2.5rem;height:0.625rem;width:0.625rem;border-radius:50%;background:rgba(100,116,139,0.25)"></div>',
    "</div>",
    /* 文案 */
    `<p style="font-size:0.875rem;font-weight:700;text-transform:uppercase;letter-spacing:0.3em;color:var(--nlc-orange)">${title}</p>`,
    `<p class="nlc-loading-dots" style="margin-top:0.5rem;font-size:0.75rem;letter-spacing:0.2em;color:var(--nlc-muted)">${subtitle}</p>`,
  ].join("");

  document.body.appendChild(el);
}

/* ─── 导航入口 ─── */

export function navigateTo(url: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;

  injectTransitionOverlay();

  if (options?.replace) {
    window.location.replace(url);
    return;
  }

  window.location.assign(url);
}
