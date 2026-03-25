/**
 * [INPUT]: `lib/audio.ts` 的客户端音频状态、M06 设计 token、`UI/focus.html` 底部播放器原型
 * [OUTPUT]: Focus 模块专属的环境音 + lo-fi 播放器组件
 * [POS]: 位于 `components/focus/MusicPlayer.tsx`，供后续 `app/focus/page.tsx` 挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md` 与上级 `CLAUDE.md`
 */

"use client";

import { useMemo, useSyncExternalStore } from "react";

import { getAudioManager } from "@/lib/audio";

type MusicPlayerProps = {
  className?: string;
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

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

export default function MusicPlayer({ className }: MusicPlayerProps) {
  const audioManager = useMemo(() => getAudioManager(), []);
  const snapshot = useSyncExternalStore(
    audioManager.subscribe,
    audioManager.getSnapshot,
    audioManager.getSnapshot,
  );

  const helperMessage = snapshot.lastError
    ? snapshot.lastError
    : !snapshot.isAmbientReady || !snapshot.isMusicReady
      ? "Local audio assets unavailable"
      : "Unit 0924 monitoring";

  return (
    <section
      className={joinClasses(
        "border-t border-[rgba(244,164,98,0.18)] bg-[rgba(12,9,7,0.97)]",
        className,
      )}
    >
      <div className="grid gap-3 px-5 py-3 sm:px-7 lg:grid-cols-[1.2fr_auto_1fr] lg:items-center">
        <div className="flex min-w-0 items-center gap-3 rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(7,5,4,0.52)] px-4 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center border border-[rgba(244,164,98,0.18)] text-[var(--nlc-orange)]">
            <EqualizerIcon />
          </div>
          <div className="min-w-0">
            <div className="text-[0.58rem] uppercase tracking-[0.28em] text-[rgba(247,221,197,0.44)]">Soundscape Link 04</div>
            <div className="mt-1 truncate text-[0.9rem] font-semibold uppercase tracking-[0.14em] text-[var(--nlc-orange)]">
              {snapshot.activeTrack?.title ?? "No Local Track"}
            </div>
            <div className="mt-1 truncate font-mono text-[0.7rem] uppercase tracking-[0.16em] text-[var(--nlc-muted)]">
              {snapshot.activeTrack?.fileLabel ?? "audio_missing.wav"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-[rgba(244,164,98,0.2)] bg-[rgba(7,5,4,0.72)] px-3 py-2">
            <button
              aria-label="上一首"
              className="nlc-focus-ring inline-flex size-8 items-center justify-center text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!snapshot.activeTrack}
              onClick={() => {
                void audioManager.previousTrack();
              }}
              type="button"
            >
              <PreviousIcon />
            </button>

            <button
              aria-label={snapshot.isMusicPlaying ? "暂停播放" : "开始播放"}
              className="nlc-focus-ring inline-flex size-10 items-center justify-center border border-[rgba(255,208,165,0.34)] bg-[linear-gradient(180deg,#f6b16f_0%,var(--nlc-orange)_100%)] text-[var(--nlc-dark)] shadow-[0_0_18px_rgba(244,164,98,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!snapshot.activeTrack}
              onClick={() => {
                void audioManager.toggleMusic();
              }}
              type="button"
            >
              {snapshot.isMusicPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <button
              aria-label="下一首"
              className="nlc-focus-ring inline-flex size-8 items-center justify-center text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-35"
              disabled={!snapshot.activeTrack}
              onClick={() => {
                void audioManager.nextTrack();
              }}
              type="button"
            >
              <NextIcon />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(7,5,4,0.52)] px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-[0.58rem] uppercase tracking-[0.28em] text-[rgba(247,221,197,0.44)]">
              <span>Volume</span>
              <span className="font-mono text-[var(--nlc-orange)]">{Math.round(snapshot.musicVolume * 100)}%</span>
            </div>
            <input
              aria-label="播放器音量"
              className="nlc-focus-ring mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-none border border-[rgba(244,164,98,0.16)] bg-[rgba(255,255,255,0.05)] accent-[var(--nlc-orange)]"
              max="100"
              min="0"
              onChange={(event) => {
                audioManager.setMusicVolume(Number(event.target.value) / 100);
              }}
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
      </div>
    </section>
  );
}
