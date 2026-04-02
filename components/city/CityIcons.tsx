/**
 * [INPUT]: 无外部依赖，纯 SVG 组件
 * [OUTPUT]: 城市页导航与底部操作栏图标集合
 * [POS]: 位于 `components/city/CityIcons.tsx`，被 `CityPageShell.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/city/CLAUDE.md`
 */

/* ─── 侧边栏导航 SVG 图标（对齐 city.html Material Symbols 语义） ─── */

export function NavIconMap() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

export function NavIconBuild() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="1" />
      <path d="M12 6V2" />
      <path d="M6 6V4" />
      <path d="M18 6V4" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function NavIconPersonnel() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function NavIconAlerts() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/* ─── 底部导航 SVG 图标（对齐 city.html precision_manufacturing / center_focus_strong） ─── */

export function BottomIconDistricts() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4" />
      <path d="M12 19v4" />
      <path d="M1 12h4" />
      <path d="M19 12h4" />
      <path d="M4.22 4.22l2.83 2.83" />
      <path d="M16.95 16.95l2.83 2.83" />
      <path d="M4.22 19.78l2.83-2.83" />
      <path d="M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

export function BottomIconFocus() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h2" />
      <path d="M19 12h2" />
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  );
}

/* ─── Header 按钮图标 ─── */

export function SettingsGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3h4l.7 2.3 2.2.9 2.1-1.1 2 3.5-1.8 1.5.2 2.4 1.8 1.5-2 3.5-2.1-1.1-2.2.9L14 21h-4l-.7-2.3-2.2-.9-2.1 1.1-2-3.5 1.8-1.5-.2-2.4L2.8 9.1l2-3.5 2.1 1.1 2.2-.9L10 3Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function GlobeGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.5c2.4 2.2 3.8 5.2 3.8 8.5S14.4 18.3 12 20.5" />
      <path d="M12 3.5C9.6 5.7 8.2 8.7 8.2 12s1.4 6.3 3.8 8.5" />
    </svg>
  );
}
