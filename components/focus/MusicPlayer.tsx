/**
 * [INPUT]: `lib/audio.ts` 的 AudioManager / PLAYLISTS / AudioSnapshot，`UI/focus.html` 底部播放器原型
 * [OUTPUT]: Focus 模块底部播放器 + 播放列表选择面板
 * [POS]: 位于 `components/focus/MusicPlayer.tsx`，被 `FocusExperience` 挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md` 与上级 `CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getAudioManager, PLAYLISTS, type PlaylistIcon as PlaylistIconType } from "@/lib/audio";

/* ─── 工具 ─── */

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* ─── SVG 图标 ─── */

function PreviousIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="5" width="2.5" height="14" rx="1" />
      <path d="M18.5 6.5a1 1 0 0 1 1.5.85v9.3a1 1 0 0 1-1.5.85L10 12l8.5-5.5Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="17.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M5.5 6.5A1 1 0 0 0 4 7.35v9.3a1 1 0 0 0 1.5.85L14 12 5.5 6.5Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="size-5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5a1 1 0 0 1 1.53-.85l8.8 6a1 1 0 0 1 0 1.7l-8.8 6A1 1 0 0 1 8 17.5v-12Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

function EqualizerIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 5v14" />
      <path d="M12 5v14" />
      <path d="M18 5v14" />
      <circle cx="6" cy="10" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="8" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlaylistIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h12" />
      <path d="M4 10h12" />
      <path d="M4 14h8" />
      <path d="M16 13v6l5-3-5-3Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ─── 播放列表氛围图标 ─── */

const THEME_ICON_SVG: Record<PlaylistIconType, React.ReactNode> = {
  flame: (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 3C9 6.5 7.5 9 7.5 12.1A4.5 4.5 0 0 0 12 16.5a4.5 4.5 0 0 0 4.5-4.4C16.5 9 15 6.5 12 3Z" fill="currentColor" opacity="0.9" />
      <path d="M12 10.5c-1.2 1.2-1.8 2.1-1.8 3.1a1.8 1.8 0 1 0 3.6 0c0-1-.6-1.9-1.8-3.1Z" fill="#221810" />
    </svg>
  ),
  snowflake: (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.75 13.35 7.2l3.7-1.2-2 3.35 3.45 1.25-3.45 1.25 2 3.35-3.7-1.2L12 17.75l-1.35-3.4-3.7 1.2 2-3.35-3.45-1.25 3.45-1.25-2-3.35 3.7 1.2L12 3.75Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  ),
  globe: (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
      <path d="M12 3c-1.8 2-3 5-3 9s1.2 7 3 9" />
      <path d="M12 3c1.8 2 3 5 3 9s-1.2 7-3 9" />
      <path d="M3.5 9h17M3.5 15h17" />
    </svg>
  ),
};

/* ─── 播放列表面板（纯渲染，click-outside 由父级处理） ─── */

function PlaylistPanel({
  activePlaylistId,
  onSelect,
}: {
  activePlaylistId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-sm border border-[rgba(244,164,98,0.22)] bg-[rgba(8,5,4,0.96)] shadow-[0_-8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
      {/* ── 面板标题 ── */}
      <div className="flex items-center justify-between border-b border-[rgba(244,164,98,0.14)] px-4 py-2.5">
        <span className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-[var(--nlc-orange)]">
          Sound Archives
        </span>
        <span className="text-[0.5rem] uppercase tracking-[0.16em] text-[rgba(247,221,197,0.3)]">
          {PLAYLISTS.length} series
        </span>
      </div>

      {/* ── 系列卡片 ── */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {PLAYLISTS.map((playlist) => {
          const isActive = playlist.id === activePlaylistId;

          return (
            <button
              key={playlist.id}
              className={joinClasses(
                "group flex flex-col items-center gap-2 rounded-sm border px-2 py-3 transition-all",
                isActive
                  ? "border-[rgba(255,157,0,0.42)] bg-[rgba(244,164,98,0.1)] text-[var(--nlc-orange)]"
                  : "border-[rgba(244,164,98,0.14)] bg-[rgba(14,10,8,0.72)] text-[var(--nlc-muted)] hover:border-[rgba(244,164,98,0.28)] hover:text-[var(--nlc-orange)]",
              )}
              onClick={() => onSelect(playlist.id)}
              type="button"
            >
              {THEME_ICON_SVG[playlist.icon]}
              <span className="text-[0.58rem] font-semibold uppercase tracking-[0.14em]">
                {playlist.name}
              </span>
              <span className="text-[0.46rem] uppercase tracking-[0.1em] opacity-60">
                {playlist.description}
              </span>
              <span className="text-[0.44rem] uppercase tracking-[0.1em] opacity-40">
                {playlist.tracks.length} track{playlist.tracks.length !== 1 ? "s" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 主组件 ─── */

type MusicPlayerProps = {
  className?: string;
};

export default function MusicPlayer({ className }: MusicPlayerProps) {
  const audioManager = useMemo(() => getAudioManager(), []);
  const snapshot = useSyncExternalStore(
    audioManager.subscribe,
    audioManager.getSnapshot,
    audioManager.getSnapshot,
  );

  const [showPlaylist, setShowPlaylist] = useState(false);
  const playlistZoneRef = useRef<HTMLDivElement>(null);

  const closePlaylist = useCallback(() => setShowPlaylist(false), []);

  /* ── click-outside：包裹触发按钮 + 面板，避免 close→reopen 闪烁 ── */
  useEffect(() => {
    if (!showPlaylist) return;
    function handleClick(e: MouseEvent) {
      if (playlistZoneRef.current && !playlistZoneRef.current.contains(e.target as Node)) {
        closePlaylist();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPlaylist, closePlaylist]);

  return (
    <section
      className={joinClasses(
        "border-t border-[rgba(244,164,98,0.18)] bg-[rgba(12,9,7,0.97)]",
        className,
      )}
    >
      <div className="grid gap-2.5 px-4 py-2.5 sm:px-6 lg:grid-cols-[1.15fr_auto_1fr] lg:items-center">
        {/* ── 曲目信息 ── */}
        <div className="flex min-w-0 items-center gap-2.5 rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(7,5,4,0.52)] px-3.5 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center border border-[rgba(244,164,98,0.18)] text-[var(--nlc-orange)]">
            <EqualizerIcon />
          </div>
          <div className="min-w-0">
            <div className="text-[0.52rem] uppercase tracking-[0.24em] text-[rgba(247,221,197,0.44)]">Soundscape Link 04</div>
            <div className="mt-1 truncate text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-[var(--nlc-orange)]">
              {snapshot.activeTrack?.title ?? "No Local Track"}
            </div>
            <div className="mt-0.5 truncate font-mono text-[0.64rem] uppercase tracking-[0.14em] text-[var(--nlc-muted)]">
              {snapshot.activeTrack?.fileLabel ?? "audio_missing.wav"}
            </div>
          </div>
        </div>

        {/* ── 播放控制 ── */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-[rgba(244,164,98,0.2)] bg-[rgba(7,5,4,0.72)] px-3 py-1.5">
            <button
              aria-label="上一首"
              className="nlc-focus-ring inline-flex size-7 items-center justify-center text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!snapshot.activeTrack}
              onClick={() => { void audioManager.previousTrack(); }}
              type="button"
            >
              <PreviousIcon />
            </button>
            <button
              aria-label={snapshot.isMusicPlaying ? "暂停播放" : "开始播放"}
              className="nlc-focus-ring inline-flex size-9 items-center justify-center rounded-lg border border-[rgba(255,208,165,0.34)] bg-[linear-gradient(180deg,#f6b16f_0%,var(--nlc-orange)_100%)] text-[var(--nlc-dark)] shadow-[0_0_18px_rgba(244,164,98,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!snapshot.activeTrack}
              onClick={() => { void audioManager.toggleMusic(); }}
              type="button"
            >
              {snapshot.isMusicPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              aria-label="下一首"
              className="nlc-focus-ring inline-flex size-7 items-center justify-center text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!snapshot.activeTrack}
              onClick={() => { void audioManager.nextTrack(); }}
              type="button"
            >
              <NextIcon />
            </button>
          </div>
        </div>

        {/* ── 音量 + 播放列表 ── */}
        <div className="relative flex items-center gap-3">
          <div className="flex flex-1 items-center justify-between gap-4 rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(7,5,4,0.52)] px-3.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-[0.52rem] uppercase tracking-[0.24em] text-[rgba(247,221,197,0.44)]">
                <span>Volume</span>
                <span className="font-mono text-[var(--nlc-orange)]">{Math.round(snapshot.musicVolume * 100)}%</span>
              </div>
              <input
                aria-label="播放器音量"
                className="nlc-focus-ring mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-none border border-[rgba(244,164,98,0.16)] bg-[rgba(255,255,255,0.05)] accent-[var(--nlc-orange)]"
                max="100"
                min="0"
                onChange={(event) => { audioManager.setMusicVolume(Number(event.target.value) / 100); }}
                type="range"
                value={Math.round(snapshot.musicVolume * 100)}
              />
            </div>
            <div className="flex items-end gap-1 text-[var(--nlc-orange)]" aria-hidden="true">
              {[0.35, 0.72, 0.48, 0.88, 0.62].map((height, index) => (
                <span
                  key={index}
                  className={joinClasses(
                    "block w-1 bg-current transition-all duration-200",
                    snapshot.isMusicPlaying ? "opacity-90" : "opacity-30",
                  )}
                  style={{ height: `${Math.round(height * (snapshot.isMusicPlaying ? 22 : 14))}px` }}
                />
              ))}
            </div>
          </div>

          {/* ── 播放列表区域（按钮 + 面板共享 ref，click-outside 统一处理） ── */}
          <div ref={playlistZoneRef} className="relative shrink-0">
            <button
              aria-label="播放列表"
              className={joinClasses(
                "nlc-focus-ring flex size-9 items-center justify-center rounded-sm border transition-all",
                showPlaylist
                  ? "border-[rgba(255,157,0,0.42)] bg-[rgba(244,164,98,0.1)] text-[var(--nlc-orange)]"
                  : "border-[rgba(244,164,98,0.18)] bg-[rgba(7,5,4,0.52)] text-[var(--nlc-muted)] hover:border-[rgba(244,164,98,0.3)] hover:text-[var(--nlc-orange)]",
              )}
              onClick={() => setShowPlaylist((v) => !v)}
              type="button"
            >
              <PlaylistIcon />
            </button>
            {showPlaylist ? (
              <PlaylistPanel
                activePlaylistId={snapshot.activePlaylistId}
                onSelect={(id) => {
                  void audioManager.setPlaylist(id);
                  setShowPlaylist(false);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
