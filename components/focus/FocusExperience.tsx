/**
 * [INPUT]: 当前登录用户、`/api/session/current` 的恢复结果、`use-heartbeat`、`MusicPlayer`
 * [OUTPUT]: M10 Focus 主界面，负责恢复 session、驱动倒计时、结算后跳转 `/complete`
 * [POS]: 位于 `components/focus/FocusExperience.tsx`，被 `app/focus/page.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import MusicPlayer from "@/components/focus/MusicPlayer";
import type { UserDto } from "@/lib/auth";
import { type AmbientSoundId, getAudioManager } from "@/lib/audio";
import { navigateTo } from "@/lib/client-navigation";
import {
  useHeartbeat,
  type FocusSession,
  type FocusSessionStatus,
  type FocusSummary,
} from "@/hooks/use-heartbeat";

type SessionResponse = {
  session: FocusSession | null;
  error?: { message?: string };
};

type ObjectiveRow = {
  id: string;
  title: string;
  detail: string;
  tone: "active" | "complete" | "idle";
};

type AmbientOption = {
  id: AmbientSoundId;
  label: string;
  hint: string;
};

const FOCUS_BACKGROUND_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCp_o98ut-RPMAIQXKRSfdH7l98-uHemKQHFyZI8BRqWMN196ZvPYC4JxscN7ESJO19-cC6i0sIMHPFBikoMQQvbcaL9VNIj5Zc3Z-ncYcXgBUhnYyJP1zXOL60nuMd8qC2HFpm7vhTvYKV19YIbbY_58QCHGK0c49raa7RobBlMhN-A2tRCCx-TN6DaYhtNYk_Xu0G9OewQfYsFbSVzyL_lu8-Cc0XAalcofXioRE2iNbf3zvFucA01x8RUD0tZ_IgUj7V0L1LfIM";

const districtLabels: Record<string, string> = {
  exploration: "Exploration Outpost",
  food: "Food District",
  medical: "Medical Ward",
  residential: "Residential Settlement",
  resource: "Industrial Resource Zone",
};

const ambientOptions: AmbientOption[] = [
  { id: "focus", label: "Focus", hint: "篝火" },
  { id: "chill", label: "Chill", hint: "大雪" },
  { id: "rest", label: "Rest", hint: "小雪" },
];

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getApiErrorMessage(payload: { error?: { message?: string } } | null, fallback: string) {
  const message = payload?.error?.message?.trim();
  return message && message.length > 0 ? message : fallback;
}

async function fetchCurrentSession(sessionId: string | null) {
  const url = sessionId ? `/api/session/current?sessionId=${encodeURIComponent(sessionId)}` : "/api/session/current";
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<SessionResponse>(response);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to restore current session."));
  }

  return payload.session;
}

function formatSeconds(value: number | null) {
  if (value == null) {
    return "--:--";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function resolvePrimaryActionLabel(status: FocusSessionStatus | "ended", isPaused: boolean) {
  if (status === "pending") {
    return "开始";
  }

  return isPaused ? "继续" : "暂停";
}

function resolveFocusStateLabel(status: FocusSessionStatus | "ended", isRunning: boolean) {
  if (status === "pending") {
    return "Awaiting Deployment";
  }

  if (status === "ended") {
    return "Session Archived";
  }

  return isRunning ? "Deep Focus Cycle" : "Focus Recovery";
}

function HeaderGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.8 13.2 7l4.1-2.1-2.1 4.1 4.2 1.2-4.2 1.2 2.1 4.1-4.1-2.1L12 21.2l-1.2-4.2-4.1 2.1 2.1-4.1-4.2-1.2 4.2-1.2-2.1-4.1L10.8 7 12 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
      <path d="M8.5 12H20" />
    </svg>
  );
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

function GearGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3h4l.7 2.3 2.2.9 2.1-1.1 2 3.5-1.8 1.5.2 2.4 1.8 1.5-2 3.5-2.1-1.1-2.2.9L14 21h-4l-.7-2.3-2.2-.9-2.1 1.1-2-3.5 1.8-1.5-.2-2.4L2.8 9.1l2-3.5 2.1 1.1 2.2-.9L10 3Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function HistoryGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 11a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v4h4" />
      <path d="M12 7.5V12l3.2 1.9" />
    </svg>
  );
}

function PlayGlyph({ paused }: { paused: boolean }) {
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

function ResetGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 5v5h-5" />
    </svg>
  );
}

function ObjectiveMarker({ tone }: { tone: ObjectiveRow["tone"] }) {
  if (tone === "complete") {
    return (
      <span className="flex size-5 items-center justify-center border border-[rgba(244,164,98,0.34)] bg-[rgba(244,164,98,0.08)] text-[0.65rem] text-[var(--nlc-orange)]">
        ✓
      </span>
    );
  }

  return (
    <span
      className={joinClasses(
        "flex size-5 items-center justify-center border text-[0.65rem]",
        tone === "active"
          ? "border-[rgba(244,164,98,0.48)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]"
          : "border-[rgba(244,164,98,0.18)] bg-transparent text-[rgba(247,221,197,0.46)]",
      )}
    >
      {tone === "active" ? "◻" : ""}
    </span>
  );
}

function ObjectiveItem({ row }: { row: ObjectiveRow }) {
  return (
    <li className="flex items-start gap-3 py-3 text-[0.94rem] text-[rgba(247,221,197,0.78)]">
      <ObjectiveMarker tone={row.tone} />
      <div className="min-w-0">
        <div className="font-semibold tracking-[0.04em] text-[rgba(247,221,197,0.92)]">{row.title}</div>
        <div className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]">{row.detail}</div>
      </div>
    </li>
  );
}

function SystemNotice({ children, tone = "default" }: { children: string; tone?: "default" | "error" | "warn" }) {
  const toneClassName =
    tone === "error"
      ? "border-red-500/28 text-red-100 shadow-[0_18px_36px_rgba(127,29,29,0.28)]"
      : tone === "warn"
        ? "border-amber-500/30 text-amber-100 shadow-[0_18px_36px_rgba(120,53,15,0.24)]"
        : "border-[rgba(244,164,98,0.2)] text-[var(--nlc-muted)] shadow-[0_18px_36px_rgba(0,0,0,0.28)]";

  return (
    <div
      className={joinClasses(
        "rounded-sm border bg-[rgba(8,5,4,0.92)] px-4 py-3 text-[0.68rem] uppercase tracking-[0.18em] backdrop-blur-sm",
        toneClassName,
      )}
    >
      {children}
    </div>
  );
}

function TimerControl({
  ariaLabel,
  children,
  disabled = false,
  onClick,
  primary = false,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={joinClasses(
        "nlc-focus-ring inline-flex size-11 items-center justify-center border transition-all",
        primary
          ? "border-[rgba(255,208,165,0.34)] bg-[linear-gradient(180deg,#f6b16f_0%,var(--nlc-orange)_100%)] text-[var(--nlc-dark)] shadow-[0_0_24px_rgba(244,164,98,0.22)]"
          : "border-[rgba(244,164,98,0.24)] bg-[rgba(20,13,9,0.84)] text-[var(--nlc-orange)] hover:bg-[rgba(244,164,98,0.08)]",
        disabled && "cursor-not-allowed opacity-40 shadow-none",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function FocusExperience({
  initialSessionId,
  initialUser,
}: {
  initialSessionId: string | null;
  initialUser: UserDto;
}) {
  const audioManager = useMemo(() => getAudioManager(), []);
  const audioSnapshot = useSyncExternalStore(
    audioManager.subscribe,
    audioManager.getSnapshot,
    audioManager.getSnapshot,
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [session, setSession] = useState<FocusSession | null>(null);
  const [selectedMinutesInput, setSelectedMinutesInput] = useState("25");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const restoredSession = await fetchCurrentSession(initialSessionId);

        if (cancelled) {
          return;
        }

        if (!restoredSession) {
          navigateTo("/city", { replace: true });
          return;
        }

        setSession(restoredSession);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to restore current session.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [initialSessionId]);

  const {
    cycleHeartbeatCount,
    errorMessage: heartbeatErrorMessage,
    isEnding,
    isHeartbeatInFlight,
    isPaused,
    isReady,
    isRunning,
    isStarting,
    remainingSeconds,
    remoteStatus,
    selectedMinutes,
    setSelectedMinutes,
    statusMessage,
    stopSession,
    toggleStartPause,
    resetTimer,
  } = useHeartbeat({
    onEnded(summary: FocusSummary) {
      window.sessionStorage.setItem("nlc:last-summary", JSON.stringify(summary));
      navigateTo("/complete", { replace: true });
    },
    session,
  });

  useEffect(() => {
    if (selectedMinutes == null) {
      return;
    }

    setSelectedMinutesInput(String(selectedMinutes));
  }, [selectedMinutes]);

  const currentErrorMessage = errorMessage ?? heartbeatErrorMessage;
  const isSessionReady = !isLoading && session != null;
  const canEditDuration = remoteStatus === "pending" || (remoteStatus === "active" && isPaused);
  const districtLabel = session ? districtLabels[session.task.district] ?? session.task.district : "Unknown district";
  const previewMinutes = Number(selectedMinutesInput);
  const displaySeconds =
    remainingSeconds ??
    (Number.isFinite(previewMinutes) && previewMinutes > 0 ? Math.max(0, Math.round(previewMinutes) * 60) : null);
  const restoredSessionNeedsDuration = !currentErrorMessage && remoteStatus === "active" && remainingSeconds == null;

  const focusStateLabel = useMemo(
    () => resolveFocusStateLabel(remoteStatus, isRunning),
    [isRunning, remoteStatus],
  );
  const primaryActionLabel = useMemo(
    () => resolvePrimaryActionLabel(remoteStatus, isPaused),
    [isPaused, remoteStatus],
  );

  const objectiveSummary = session ? session.task.name : "Awaiting current objective";
  const systemStatus = remoteStatus === "active" ? "System Active" : isLoading ? "System Restoring" : "System Idle";
  const notices = [
    isLoading ? { key: "loading", tone: "default" as const, message: "Restoring current session..." } : null,
    statusMessage ? { key: "status", tone: "default" as const, message: statusMessage } : null,
    currentErrorMessage ? { key: "error", tone: "error" as const, message: currentErrorMessage } : null,
    restoredSessionNeedsDuration
      ? { key: "restored", tone: "warn" as const, message: "Current session restored. Re-enter duration to resume local countdown." }
      : null,
  ].filter(Boolean) as Array<{ key: string; tone: "default" | "error" | "warn"; message: string }>;

  const objectives = useMemo<ObjectiveRow[]>(
    () => [
      {
        detail: districtLabel,
        id: "01",
        title: session ? `Audit ${session.task.name}` : "Await deployment order",
        tone: "active",
      },
      {
        detail: isHeartbeatInFlight ? "Telemetry sync in progress" : "10 minute heartbeat protocol",
        id: "02",
        title: remoteStatus === "active" ? "Maintain field cadence" : "Prepare shift ignition",
        tone: remoteStatus === "active" ? "complete" : "idle",
      },
      {
        detail: notes.trim() ? `${notes.length} chars encrypted` : "Encrypted after settlement",
        id: "03",
        title: notes.trim() ? "Field notes recorded" : "Log observations before shutdown",
        tone: notes.trim() ? "complete" : "idle",
      },
    ],
    [districtLabel, isHeartbeatInFlight, notes, remoteStatus, session],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070504] text-[var(--nlc-text)] lg:h-screen">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-100"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(244,164,98,0.08), transparent 24%), linear-gradient(rgba(244,164,98,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(244,164,98,0.035) 1px, transparent 1px)",
          backgroundPosition: "center, center, center",
          backgroundSize: "auto, 18px 18px, 18px 18px",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,5,4,0.62),rgba(7,5,4,0.92))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,164,98,0.06),transparent_36%)]" />

      <div className="relative z-10 flex min-h-screen flex-col lg:h-screen">
        <div className="pointer-events-none absolute right-4 top-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-5">
          {notices.map((notice) => (
            <SystemNotice key={notice.key} tone={notice.tone}>
              {notice.message}
            </SystemNotice>
          ))}
        </div>

        <header className="border-b border-[rgba(244,164,98,0.18)] bg-[rgba(13,9,7,0.96)]">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                aria-label="返回城市"
                className="nlc-focus-ring inline-flex h-8 items-center gap-2 rounded-sm border border-[rgba(244,164,98,0.2)] bg-[rgba(20,13,9,0.72)] px-3 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)] transition-colors hover:border-[rgba(255,157,0,0.42)] hover:text-[var(--nlc-orange)]"
                onClick={() => navigateTo("/city")}
                type="button"
              >
                <BackGlyph />
                <span className="hidden sm:inline">City</span>
              </button>
              <div className="flex size-7 items-center justify-center text-[var(--nlc-orange)]">
                <HeaderGlyph />
              </div>
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.3em] text-[var(--nlc-orange)]">
                  Expedition Focus
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]">
              <span className="hidden items-center gap-2 sm:inline-flex">
                <HeaderGlyph />
                -20 C
              </span>
              <span className="hidden items-center gap-2 sm:inline-flex">
                <GearGlyph />
              </span>
              <span className="hidden items-center gap-2 sm:inline-flex">
                <HistoryGlyph />
              </span>
              <span className="flex h-7 w-7 items-center justify-center border border-[rgba(244,164,98,0.2)] bg-[rgba(247,237,226,0.96)] text-[#1f1610]">
                I
              </span>
            </div>
          </div>

          <div className="grid border-t border-[rgba(244,164,98,0.12)] text-[0.6rem] uppercase tracking-[0.16em] text-[var(--nlc-muted)] lg:grid-cols-[1fr_1.15fr_0.85fr]">
            <div className="flex items-center gap-2 border-b border-[rgba(244,164,98,0.08)] px-4 py-2 lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.12)]">
              <span className="text-[rgba(244,164,98,0.46)]">Region</span>
              <span className="text-[var(--nlc-orange)]">{districtLabel}</span>
            </div>
            <div className="flex items-center gap-2 border-b border-[rgba(244,164,98,0.08)] px-4 py-2 lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.12)]">
              <span className="text-[rgba(244,164,98,0.46)]">Current Objective</span>
              <span className="truncate text-[var(--nlc-orange)]">{objectiveSummary}</span>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="text-[rgba(244,164,98,0.46)]">Captain {initialUser.username}</span>
              <span className="text-[var(--nlc-orange)]">{systemStatus}</span>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 overflow-hidden pb-[5.5rem] lg:grid-cols-[30%_70%]">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[rgba(244,164,98,0.12)] lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.18)]">
            <section
              className="relative min-h-[9rem] flex-[0.68] overflow-hidden border-b border-[rgba(244,164,98,0.16)] px-4 py-4 sm:px-5"
              style={{
                backgroundImage: `linear-gradient(180deg,rgba(93,122,153,0.72),rgba(45,58,72,0.54)), linear-gradient(90deg,rgba(18,14,12,0.02),rgba(18,14,12,0.54)), url(${FOCUS_BACKGROUND_URL})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,10,0.08),rgba(6,8,10,0.4))]" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="m-0 text-[1.2rem] font-semibold uppercase italic tracking-[0.04em] text-[#eef1f5]">
                    Shift Objectives
                  </h2>
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[var(--nlc-orange)]">
                    Priority Alpha
                  </span>
                </div>

                <ul className="mt-3 divide-y divide-[rgba(238,241,245,0.12)] border-t border-[rgba(238,241,245,0.16)]">
                  {objectives.map((row) => (
                    <ObjectiveItem key={row.id} row={row} />
                  ))}
                </ul>

                <div className="mt-3 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--nlc-orange)]">
                  + New Objective
                </div>
              </div>
            </section>

            <section className="flex-[0.32] px-4 py-3 sm:px-5">
              <div className="rounded-sm border border-[rgba(244,164,98,0.18)] bg-[rgba(10,7,5,0.6)] px-4 py-3.5">
                <div className="flex items-center justify-between gap-4 border-b border-[rgba(244,164,98,0.14)] pb-2.5">
                  <h3 className="m-0 text-[0.92rem] font-semibold uppercase tracking-[0.08em] text-[var(--nlc-orange)]">
                    Expedition Notes
                  </h3>
                  <span className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]">Encrypted</span>
                </div>
                <textarea
                  className="mt-3 h-20 w-full resize-none rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(5,4,3,0.62)] px-3.5 py-2.5 text-[0.88rem] leading-5 text-[rgba(247,221,197,0.88)] outline-none transition focus:border-[rgba(255,157,0,0.48)]"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Log observations of the frost creep..."
                  value={notes}
                />
                <div className="mt-3 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-[rgba(247,221,197,0.42)]">
                  <span>Logged live</span>
                  <span>{notes.trim() ? `${notes.length} chars` : "Encrypted"}</span>
                </div>
              </div>
            </section>
          </aside>

          <section className="relative flex min-h-0 flex-col justify-between overflow-hidden px-5 py-4 sm:px-6">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-3 top-3 h-1.5 w-1.5 bg-[rgba(244,164,98,0.4)]" />
              <div className="absolute right-3 top-3 h-1.5 w-1.5 bg-[rgba(244,164,98,0.4)]" />
              <div className="absolute bottom-3 left-3 h-1.5 w-1.5 bg-[rgba(244,164,98,0.4)]" />
              <div className="absolute bottom-3 right-3 h-1.5 w-1.5 bg-[rgba(244,164,98,0.4)]" />
            </div>

            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[25.5rem]">
                <div className="rounded-sm border border-[rgba(244,164,98,0.3)] bg-[rgba(14,10,8,0.88)] px-5 py-5 shadow-[0_0_28px_rgba(244,164,98,0.08)]">
                  <div className="mx-auto flex max-w-[14.5rem] flex-col items-center text-center">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--nlc-orange)]">
                      {focusStateLabel}
                    </div>

                    <div className="mt-4 flex aspect-square w-full max-w-[14.75rem] items-center justify-center rounded-full border-[9px] border-[#0d0907] bg-[#0d0907] shadow-[0_0_30px_rgba(0,0,0,0.42)]">
                      <div className="flex aspect-square w-full max-w-[12.2rem] flex-col items-center justify-center rounded-full border border-[rgba(244,164,98,0.18)] bg-[radial-gradient(circle_at_top,rgba(244,164,98,0.06),rgba(8,6,4,0.98)_68%)] px-4 shadow-[inset_0_0_64px_rgba(244,164,98,0.03)]">
                        <div className="text-[0.62rem] uppercase tracking-[0.28em] text-[var(--nlc-muted)]">Deep Focus Cycle</div>
                        <div className="mt-3 font-mono text-[3.35rem] font-black tracking-[-0.08em] text-[var(--nlc-orange)] drop-shadow-[0_0_20px_rgba(244,164,98,0.22)] sm:text-[3.8rem]">
                          {formatSeconds(displaySeconds)}
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-4">
                          <TimerControl
                            ariaLabel={primaryActionLabel}
                            disabled={!isSessionReady || !isReady || isStarting || isEnding}
                            onClick={() => void toggleStartPause()}
                            primary
                          >
                            <PlayGlyph paused={!isSessionReady || isStarting ? true : isPaused} />
                          </TimerControl>
                          <TimerControl ariaLabel="重来" disabled={!isSessionReady || !isReady || isEnding} onClick={resetTimer}>
                            <ResetGlyph />
                          </TimerControl>
                        </div>
                      </div>
                    </div>

                    <div className="mt-[-0.55rem] flex items-center justify-center gap-2">
                      <div className="rounded-sm border border-[rgba(244,164,98,0.24)] bg-[rgba(8,6,4,0.96)] px-2.5 py-1 text-[0.54rem] font-semibold uppercase tracking-[0.2em] text-[var(--nlc-orange)]">
                        Shift {cycleHeartbeatCount + 1}/4
                      </div>
                      <div className="rounded-sm border border-[rgba(244,164,98,0.24)] bg-[rgba(8,6,4,0.96)] px-2.5 py-1 text-[0.54rem] font-semibold uppercase tracking-[0.2em] text-[var(--nlc-orange)]">
                        Core {remoteStatus === "active" ? "Nominal" : "Standby"}
                      </div>
                    </div>

                    <div className="mt-4 grid w-full grid-cols-3 gap-2">
                      {ambientOptions.map((option) => {
                        const isActive = audioSnapshot.ambientSoundId === option.id && audioSnapshot.isAmbientPlaying;

                        return (
                          <button
                            aria-label={isActive ? `暂停${option.label}环境音` : `播放${option.label}环境音`}
                            key={option.id}
                            aria-pressed={isActive}
                            className={joinClasses(
                              "nlc-focus-ring flex flex-col items-center gap-1 rounded-sm border px-2 py-2 transition-all",
                              isActive
                                ? "border-[rgba(255,157,0,0.42)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]"
                                : "border-[rgba(244,164,98,0.18)] bg-[rgba(8,6,4,0.72)] text-[var(--nlc-muted)] opacity-55 hover:opacity-100 hover:text-[var(--nlc-orange)]",
                            )}
                            onClick={() => {
                              void audioManager.setAmbientSound(option.id);
                            }}
                            type="button"
                          >
                            <AmbientGlyph soundId={option.id} />
                            <span className="text-[0.54rem] font-semibold uppercase tracking-[0.18em]">{option.label}</span>
                            <span className="text-[0.48rem] uppercase tracking-[0.12em]">{option.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center gap-3 text-[0.5rem] uppercase tracking-[0.2em] text-[rgba(247,221,197,0.28)]">
                      <span className="h-px w-10 bg-[rgba(244,164,98,0.16)]" />
                      <span>{audioSnapshot.lastError ? "Audio standby" : "Unit 0924 monitoring"}</span>
                      <span className="h-px w-10 bg-[rgba(244,164,98,0.16)]" />
                    </div>

                    <button
                      className="nlc-focus-ring mt-4 inline-flex h-8.5 items-center justify-center rounded-sm border border-[rgba(244,164,98,0.22)] bg-[rgba(10,7,5,0.76)] px-4 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)] transition-colors hover:border-[rgba(255,157,0,0.42)] hover:text-[var(--nlc-orange)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!isSessionReady || isEnding}
                      onClick={() => void stopSession()}
                      type="button"
                    >
                      {isEnding ? "结算中" : "手动停止"}
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1fr_0.92fr]">
                  <label className="block" htmlFor="focus-duration-input">
                    <span className="block text-[0.68rem] uppercase tracking-[0.26em] text-[var(--nlc-muted)]">
                      Duration
                    </span>
                    <input
                      className="mt-2 h-10 w-full rounded-sm border border-[rgba(244,164,98,0.2)] bg-[rgba(10,7,5,0.76)] px-4 text-base text-[var(--nlc-text)] outline-none transition focus:border-[rgba(255,157,0,0.5)] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!isSessionReady || !canEditDuration}
                      id="focus-duration-input"
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setSelectedMinutesInput(nextValue);

                        if (!nextValue.trim()) {
                          setSelectedMinutes(null);
                          return;
                        }

                        const parsed = Number(nextValue);
                        setSelectedMinutes(Number.isFinite(parsed) ? parsed : null);
                      }}
                      placeholder="25"
                      type="number"
                      value={selectedMinutesInput}
                    />
                  </label>

                  <div className="rounded-sm border border-[rgba(244,164,98,0.16)] bg-[rgba(10,7,5,0.52)] px-4 py-3 text-[0.64rem] leading-5 text-[var(--nlc-muted)]">
                    {!isSessionReady
                      ? "正在恢复 session 数据，恢复完成后才能启动本轮计时。"
                      : remoteStatus === "pending"
                        ? "输入分钟数后，第一次点击开始会调用 /api/session/start。"
                        : remainingSeconds == null
                          ? "这是一个已恢复的 session。先输入本轮时长，再点击继续。"
                          : "暂停只影响本地倒计时；服务端 session 仍保持 active。"}
                  </div>
                </div>

              </div>
            </div>
          </section>
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30">
          <nav className="flex items-center justify-center border-y border-[rgba(244,164,98,0.18)] bg-[rgba(12,9,7,0.96)] px-5 py-0.5 text-[0.58rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]">
            <div className="inline-flex items-center">
              {["Chrono", "Grid", "Cargo", "Signal"].map((tab, index) => (
                <div
                  className={joinClasses(
                    "flex items-center justify-center border-r border-[rgba(244,164,98,0.14)] px-6 py-2",
                    index === 0 && "rounded-sm border border-[rgba(244,164,98,0.22)] bg-[rgba(244,164,98,0.06)] text-[var(--nlc-orange)]",
                    index !== 0 && "text-[var(--nlc-muted)]",
                    index === 0 && "mr-0",
                    index === 3 && "border-r-0",
                  )}
                  key={tab}
                >
                  {tab}
                </div>
              ))}
            </div>
          </nav>

          <MusicPlayer />
        </div>
      </div>
    </div>
  );
}

export default FocusExperience;
