/**
 * [INPUT]: 依赖 `lib/audio.ts` 的 AmbientSoundId 类型
 * [OUTPUT]: Focus 模块共享 SVG 图标集合（Header / Timer / Todo / 语言切换）
 * [POS]: 位于 `components/focus/FocusGlyphs.tsx`，被 FocusExperience 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`
 */

import type { AmbientSoundId } from "@/lib/audio";

/* ── Header ── */

export function HeaderGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.8 13.2 7l4.1-2.1-2.1 4.1 4.2 1.2-4.2 1.2 2.1 4.1-4.1-2.1L12 21.2l-1.2-4.2-4.1 2.1 2.1-4.1-4.2-1.2 4.2-1.2-2.1-4.1L10.8 7 12 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BackGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
      <path d="M8.5 12H20" />
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

/* ── 环境音 ── */

export function AmbientGlyph({ soundId }: { soundId: AmbientSoundId }) {
  if (soundId === "focus") {
    return (
      <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C9 6.5 7.5 9 7.5 12.1A4.5 4.5 0 0 0 12 16.5a4.5 4.5 0 0 0 4.5-4.4C16.5 9 15 6.5 12 3Z" fill="currentColor" opacity="0.9" />
        <path d="M12 10.5c-1.2 1.2-1.8 2.1-1.8 3.1a1.8 1.8 0 1 0 3.6 0c0-1-.6-1.9-1.8-3.1Z" fill="#221810" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.75 13.35 7.2l3.7-1.2-2 3.35 3.45 1.25-3.45 1.25 2 3.35-3.7-1.2L12 17.75l-1.35-3.4-3.7 1.2 2-3.35-3.45-1.25 3.45-1.25-2-3.35 3.7 1.2L12 3.75Z"
        fill="currentColor"
        opacity={soundId === "chill" ? "0.9" : "0.7"}
      />
      {soundId === "rest" ? <circle cx="12" cy="12" r="2.1" fill="#221810" /> : null}
    </svg>
  );
}

/* ── 计时器控制 ── */

export function PlayGlyph({ paused }: { paused: boolean }) {
  if (!paused) {
    return (
      <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6.5" y="5" width="4" height="14" rx="1" />
        <rect x="13.5" y="5" width="4" height="14" rx="1" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="size-4 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5a1 1 0 0 1 1.53-.85l8.8 6a1 1 0 0 1 0 1.7l-8.8 6A1 1 0 0 1 8 17.5v-12Z" />
    </svg>
  );
}

export function ResetGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 5v5h-5" />
    </svg>
  );
}

/* ── 待办事项 ── */

export function DeleteGlyph() {
  return (
    <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
