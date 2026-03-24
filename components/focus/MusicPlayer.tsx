/**
 * [INPUT]: `lib/audio.ts` 的客户端音频状态、M06 设计 token、`UI/focus.html` 底部播放器原型
 * [OUTPUT]: Focus 模块专属的环境音 + lo-fi 播放器组件
 * [POS]: 位于 `components/focus/MusicPlayer.tsx`，供后续 `app/focus/page.tsx` 挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md` 与上级 `CLAUDE.md`
 */

"use client";

import { useMemo, useSyncExternalStore } from "react";

import { type AmbientSoundId, getAudioManager } from "@/lib/audio";

type MusicPlayerProps = {
  className?: string;
};

type AmbientOption = {
  id: AmbientSoundId;
  label: string;
  hint: string;
};

const ambientOptions: AmbientOption[] = [
  { id: "focus", label: "Focus", hint: "篝火" },
  { id: "chill", label: "Chill", hint: "大雪" },
  { id: "rest", label: "Rest", hint: "小雪" },
];

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function AmbientGlyph({ soundId }: { soundId: AmbientSoundId }) {
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

function PreviousIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="5" width="2.5" height="14" rx="1" />
      <path d="M18.5 6.5a1 1 0 0 1 1.5.85v9.3a1 1 0 0 1-1.5.85L10 12l8.5-5.5Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="17.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M5.5 6.5A1 1 0 0 0 4 7.35v9.3a1 1 0 0 0 1.5.85L14 12 5.5 6.5Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="size-7 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5a1 1 0 0 1 1.53-.85l8.8 6a1 1 0 0 1 0 1.7l-8.8 6A1 1 0 0 1 8 17.5v-12Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="size-7" viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

function EqualizerIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
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
      ? "本地静态音频暂未就绪，补齐 /public/audio 资源后即可生效。"
      : "客户端本地音频接口已待命，不依赖服务器状态。";

  return (
    <section className={joinClasses("nlc-panel nlc-inset nlc-etched rounded-[1.75rem] px-5 py-5 sm:px-6", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,164,98,0.12),transparent_40%)] opacity-80" />

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col gap-3 border-b border-[color:var(--nlc-border)] pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[0.66rem] uppercase tracking-[0.3em] text-[var(--nlc-muted)]">Atmosphere Control</p>
              <h2 className="m-0 mt-1 text-lg uppercase tracking-[0.18em] text-[var(--nlc-orange)]">Focus Soundscape</h2>
            </div>
            <div className="rounded-full border border-[color:var(--nlc-border)] bg-black/25 px-3 py-1 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--nlc-muted)]">
              300ms Fade
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {ambientOptions.map((option) => {
              const isActive = snapshot.ambientSoundId === option.id;

              return (
                <button
                  key={option.id}
                  aria-pressed={isActive}
                  className={joinClasses(
                    "nlc-focus-ring flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-center transition-all",
                    isActive
                      ? "border-[color:var(--nlc-border-strong)] bg-[linear-gradient(180deg,rgba(244,164,98,0.16),rgba(34,24,16,0.94))] text-[var(--nlc-orange)] shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
                      : "border-[color:var(--nlc-border)] bg-[rgba(17,12,9,0.72)] text-[var(--nlc-muted)] hover:border-[color:rgba(255,157,0,0.42)] hover:text-[var(--nlc-text)]",
                  )}
                  onClick={() => {
                    void audioManager.setAmbientSound(option.id);
                  }}
                  type="button"
                >
                  <span className="flex size-10 items-center justify-center rounded-full border border-current/20 bg-black/20">
                    <AmbientGlyph soundId={option.id} />
                  </span>
                  <span className="text-[0.7rem] uppercase tracking-[0.28em]">{option.label}</span>
                  <span className="text-[0.68rem] tracking-[0.12em] opacity-70">{option.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[color:var(--nlc-border)] bg-[rgba(8,5,4,0.42)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[color:var(--nlc-border)] bg-black/35 text-[var(--nlc-orange)] shadow-[0_0_18px_rgba(244,164,98,0.14)]">
                <EqualizerIcon />
              </div>
              <div className="min-w-0">
                <p className="m-0 text-[0.6rem] uppercase tracking-[0.28em] text-[var(--nlc-muted)]">Soundscape Link</p>
                <p className="m-0 mt-1 truncate text-sm uppercase tracking-[0.18em] text-[var(--nlc-orange)]">
                  {snapshot.activeTrack?.title ?? "No Local Track"}
                </p>
                <p className="m-0 mt-1 truncate font-mono text-[0.75rem] uppercase tracking-[0.16em] text-[var(--nlc-muted)]">
                  {snapshot.activeTrack?.fileLabel ?? "audio_missing.mp3"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 rounded-full border border-[color:var(--nlc-border)] bg-black/30 px-4 py-2">
              <button
                aria-label="上一首"
                className="nlc-focus-ring flex size-11 items-center justify-center rounded-full text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-40"
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
                className="nlc-focus-ring flex size-14 items-center justify-center rounded-full border border-[color:rgba(255,208,165,0.44)] bg-[linear-gradient(180deg,#f6b16f_0%,var(--nlc-orange)_100%)] text-[var(--nlc-dark)] shadow-[0_0_18px_rgba(244,164,98,0.32)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
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
                className="nlc-focus-ring flex size-11 items-center justify-center rounded-full text-[var(--nlc-muted)] transition-colors hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!snapshot.activeTrack}
                onClick={() => {
                  void audioManager.nextTrack();
                }}
                type="button"
              >
                <NextIcon />
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-5">
              <div className="min-w-[12rem] max-w-[14rem] flex-1 text-right">
                <label className="mb-2 flex items-center justify-end gap-3 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--nlc-muted)]" htmlFor="music-player-volume">
                  <span>Volume</span>
                  <span className="font-mono text-[var(--nlc-orange)]">{Math.round(snapshot.musicVolume * 100)}%</span>
                </label>
                <input
                  aria-label="播放器音量"
                  className="nlc-focus-ring h-2 w-full cursor-pointer appearance-none rounded-full border border-[color:var(--nlc-border)] bg-[rgba(255,255,255,0.08)] accent-[var(--nlc-orange)]"
                  id="music-player-volume"
                  max="100"
                  min="0"
                  onChange={(event) => {
                    audioManager.setMusicVolume(Number(event.target.value) / 100);
                  }}
                  type="range"
                  value={Math.round(snapshot.musicVolume * 100)}
                />
              </div>

              <div className="flex flex-col items-center gap-2 rounded-2xl border border-[color:var(--nlc-border)] bg-black/20 px-3 py-3 text-[var(--nlc-muted)]">
                <EqualizerIcon />
                <div className="flex items-end gap-1" aria-hidden="true">
                  {[0.85, 0.65, 0.9, 0.5, 0.3].map((height, index) => (
                    <span
                      key={index}
                      className={joinClasses(
                        "block w-1 rounded-full bg-[var(--nlc-orange)] transition-all duration-200",
                        snapshot.isMusicPlaying ? "opacity-90" : "opacity-35",
                      )}
                      style={{ height: `${Math.round(height * (snapshot.isMusicPlaying ? 18 : 12))}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-[color:var(--nlc-border)] pt-3 text-[0.68rem] tracking-[0.08em] text-[var(--nlc-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span className="uppercase tracking-[0.24em] text-[var(--nlc-muted)]">
              {snapshot.isMusicPlaying ? "Transmission Active" : "Transmission Standby"}
            </span>
            <span>{helperMessage}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
