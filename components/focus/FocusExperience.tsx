/**
 * [INPUT]: 当前登录用户、`/api/session/current`、`/api/session/create`、`use-heartbeat`、`MusicPlayer`、`lib/i18n`、`/api/session/assign-next-task`
 * [OUTPUT]: M10 Focus 主界面，无 session 时自动创建 free focus，支持有任务/Free Focus 两态，语言切换，任务完成通知与 auto-assign
 * [POS]: 位于 `components/focus/FocusExperience.tsx`，被 `app/focus/page.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import MusicPlayer from "@/components/focus/MusicPlayer";
import WorkPanel from "@/components/focus/WorkPanel";
import {
  AmbientGlyph,
  BackGlyph,
  DeleteGlyph,
  GlobeGlyph,
  HeaderGlyph,
  PlayGlyph,
  ResetGlyph,
} from "@/components/focus/FocusGlyphs";
import type { UserDto } from "@/lib/auth";
import { type AmbientSoundId, getAudioManager } from "@/lib/audio";
import { navigateTo } from "@/lib/client-navigation";
import { type Locale, LOCALES, LOCALE_LABELS, getSavedLocale, saveLocale, t } from "@/lib/i18n";
import {
  useHeartbeat,
  type FocusSession,
  type FocusSessionStatus,
  type FocusSummary,
  type FocusTask,
} from "@/hooks/use-heartbeat";

type SessionResponse = {
  session: FocusSession | null;
  error?: { message?: string };
};

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

type AmbientOption = {
  id: AmbientSoundId;
  label: string;
  hint: string;
};

const FOCUS_BACKGROUND_URL = "/images/focus-bg.jpg";
const ADMIN_AVATAR_URL = "/images/admin-avatar.jpg";

const districtLabels: Record<string, string> = {
  exploration: "Exploration Outpost",
  food: "Food District",
  medical: "Medical Ward",
  residential: "Residential Settlement",
  resource: "Industrial Resource Zone",
};

const slotDistrictNames: Record<string, string> = {
  resource: "资源区",
  food: "食物区",
  medical: "医疗区",
  residential: "居住区",
  exploration: "前哨区",
};

function formatSlotLabel(slotId: string): string {
  const dashIndex = slotId.lastIndexOf("-");
  if (dashIndex < 0) return slotId;

  const district = slotId.slice(0, dashIndex);
  const index = slotId.slice(dashIndex + 1);

  return `${slotDistrictNames[district] ?? district} ${index}号位`;
}

const ambientOptions: AmbientOption[] = [
  { id: "focus", label: "Focus", hint: "篝火" },
  { id: "chill", label: "Chill", hint: "大雪" },
  { id: "rest", label: "Rest", hint: "小雪" },
];

function todosKey(username: string) {
  return `nlc:focus-todos:${username}`;
}

function loadTodos(key: string): TodoItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(key: string, todos: TodoItem[]) {
  localStorage.setItem(key, JSON.stringify(todos));
}

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
  /* 无指定 sessionId 时传 any=1，确保 taskless free session 也能被恢复 */
  const url = sessionId
    ? `/api/session/current?sessionId=${encodeURIComponent(sessionId)}`
    : "/api/session/current?any=1";

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const payload = await readJson<SessionResponse>(response);

  if (response.status === 404) return null;

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to restore current session."));
  }

  return payload.session;
}

async function createFreeSession(): Promise<FocusSession | null> {
  const response = await fetch("/api/session/create", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });

  if (!response.ok) return null;

  const payload = await readJson<{ sessionId?: string }>(response);
  if (!payload?.sessionId) return null;

  /* 创建后立即获取完整 session DTO */
  return fetchCurrentSession(payload.sessionId);
}

function formatSeconds(value: number | null) {
  if (value == null) return "--:--";
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function resolvePrimaryActionLabel(status: FocusSessionStatus | "ended", isPaused: boolean) {
  if (status === "pending") return "开始";
  return isPaused ? "继续" : "暂停";
}

function resolveFocusStateLabel(status: FocusSessionStatus | "ended", isRunning: boolean) {
  if (status === "pending") return "Awaiting Deployment";
  if (status === "ended") return "Session Archived";
  return isRunning ? "Deep Focus Cycle" : "Focus Recovery";
}

function TodoItemRow({
  item,
  onDelete,
  onToggle,
}: {
  item: TodoItem;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 py-3 text-[0.94rem]">
      <button
        aria-label={item.done ? "标记未完成" : "标记完成"}
        className={joinClasses(
          "nlc-focus-ring flex size-5 shrink-0 items-center justify-center border text-[0.65rem] transition-colors",
          item.done
            ? "border-[rgba(244,164,98,0.34)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]"
            : "border-[rgba(244,164,98,0.48)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]",
        )}
        onClick={onToggle}
        type="button"
      >
        {item.done ? "✓" : ""}
      </button>
      <span
        className={joinClasses(
          "min-w-0 flex-1 font-semibold tracking-[0.04em] transition-all",
          item.done
            ? "text-[rgba(247,221,197,0.38)] line-through decoration-[rgba(244,164,98,0.5)]"
            : "text-[rgba(247,221,197,0.92)]",
        )}
      >
        {item.text}
      </span>
      <button
        aria-label="删除待办"
        className="nlc-focus-ring ml-auto shrink-0 text-[rgba(247,221,197,0.28)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
        type="button"
      >
        <DeleteGlyph />
      </button>
    </li>
  );
}

function SystemNotice({
  children,
  onDismiss,
  tone = "default",
}: {
  children: string;
  onDismiss?: () => void;
  tone?: "default" | "error" | "warn";
}) {
  const [exiting, setExiting] = useState(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!onDismissRef.current) return;
    const id = setTimeout(() => setExiting(true), 2800);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const id = setTimeout(() => onDismissRef.current?.(), 220);
    return () => clearTimeout(id);
  }, [exiting]);

  const toneClassName =
    tone === "error"
      ? "border-red-500/28 text-red-100 shadow-[0_18px_36px_rgba(127,29,29,0.28)]"
      : tone === "warn"
        ? "border-amber-500/30 text-amber-100 shadow-[0_18px_36px_rgba(120,53,15,0.24)]"
        : "border-[rgba(244,164,98,0.2)] text-[var(--nlc-muted)] shadow-[0_18px_36px_rgba(0,0,0,0.28)]";

  return (
    <div
      className={joinClasses(
        "rounded-sm border bg-[rgba(8,5,4,0.92)] px-4 py-3 text-[0.68rem] uppercase tracking-[0.18em] backdrop-blur-sm transition-opacity duration-200",
        toneClassName,
        exiting && "opacity-0",
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
        "nlc-focus-ring inline-flex size-11 items-center justify-center rounded-lg border transition-all",
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
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());
  const [locale, setLocaleState] = useState<Locale>("zh-CN");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showWorkPanel, setShowWorkPanel] = useState(false);
  const [coworkers, setCoworkers] = useState<{ username: string; startedAt: string | null }[]>([]);
  const newTodoInputRef = useRef<HTMLInputElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  /* ── mount 后同步 localStorage locale，避免 SSR hydration mismatch ── */
  useEffect(() => { setLocaleState(getSavedLocale()); }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        /* 尝试恢复已有 session（含 taskless free session） */
        let resolved = await fetchCurrentSession(initialSessionId);

        if (cancelled) return;

        /* 指定 sessionId 未命中 → fallback 到任意 live session */
        if (!resolved && initialSessionId) {
          resolved = await fetchCurrentSession(null);
        }

        if (cancelled) return;

        /* 仍无活跃 session → 自动创建 free focus session */
        if (!resolved) {
          resolved = await createFreeSession();
        }

        if (cancelled) return;

        if (!resolved) {
          setErrorMessage("Failed to create focus session.");
          return;
        }

        setSession(resolved);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to initialize focus session.");
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

  const storageKey = todosKey(initialUser.username);

  useEffect(() => {
    setTodos(loadTodos(storageKey));
  }, [storageKey]);

  const [taskCompletedNotice, setTaskCompletedNotice] = useState<string | null>(null);

  const handleTaskCompleted = useCallback(
    async (info: { buildingCompleted: boolean; buildingName: string | null; endReason: string | null }) => {
      /* 更新本地 session 状态：任务已解绑 */
      setSession((prev) => (prev ? { ...prev, task: null } : null));

      /* 显示通知 */
      const message = info.buildingCompleted
        ? `建造完成：${info.buildingName ?? "新建筑已落成"}`
        : info.endReason === "resource_exhausted"
          ? "资源不足，任务已中止"
          : "任务已完成";

      setTaskCompletedNotice(message);

      /* auto-assign：绑定下一个任务 */
      if (initialUser.autoAssign && session) {
        try {
          const response = await fetch("/api/session/assign-next-task", {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ sessionId: session.id }),
          });

          const payload = await readJson<{
            ok?: boolean;
            task?: FocusTask;
            error?: { message?: string };
          }>(response);

          const nextTask = response.ok ? payload?.task : null;

          if (nextTask) {
            setSession((prev) =>
              prev
                ? {
                    ...prev,
                    task: {
                      templateId: nextTask.templateId,
                      instanceId: nextTask.instanceId,
                      type: nextTask.type,
                      name: nextTask.name,
                      district: nextTask.district,
                      buildingName: nextTask.buildingName,
                      buildingSlotId: nextTask.buildingSlotId,
                      buildingLocation: nextTask.buildingLocation,
                    },
                  }
                : null,
            );
            setTaskCompletedNotice((prev) => `${prev} → 已自动绑定：${nextTask.name}`);
          }
        } catch {
          /* 无可分配任务，继续自由专注 */
        }
      }
    },
    [initialUser.autoAssign, session],
  );

  useEffect(() => {
    if (!showLangMenu) return;
    function handleClick(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLangMenu]);

  const {
    cycleHeartbeatCount,
    errorMessage: heartbeatErrorMessage,
    isEnding,
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
      window.sessionStorage.setItem("nlc:focus-ended-toast", JSON.stringify(summary));
      navigateTo("/city", { replace: true });
    },
    onTaskCompleted: handleTaskCompleted,
    session,
  });

  useEffect(() => {
    if (selectedMinutes == null) {
      return;
    }

    setSelectedMinutesInput(String(selectedMinutes));
  }, [selectedMinutes]);

  /* ── 协作者轮询（30s） ── */
  const taskTemplateId = session?.task?.templateId;
  useEffect(() => {
    const sid = session?.id;

    if (!sid || !taskTemplateId) {
      setCoworkers([]);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/session/coworkers?sessionId=${sid}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setCoworkers(data.coworkers ?? []);
      } catch { /* 静默 — 下次轮询重试 */ }
    }

    poll();
    const timer = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session?.id, taskTemplateId]);

  const updateTodos = useCallback((next: TodoItem[]) => {
    setTodos(next);
    saveTodos(storageKey, next);
  }, [storageKey]);

  const addTodo = useCallback(() => {
    const text = newTodoText.trim();
    if (!text) return;
    const item: TodoItem = { id: crypto.randomUUID(), text, done: false };
    updateTodos([...todos, item]);
    setNewTodoText("");
    setIsAddingTodo(false);
  }, [newTodoText, todos, updateTodos]);

  const toggleTodo = useCallback((id: string) => {
    updateTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, [todos, updateTodos]);

  const deleteTodo = useCallback((id: string) => {
    updateTodos(todos.filter((t) => t.id !== id));
  }, [todos, updateTodos]);

  const dismissNotice = useCallback((key: string) => {
    setDismissedNotices((prev) => new Set(prev).add(key));
  }, []);

  const currentErrorMessage = errorMessage ?? heartbeatErrorMessage;
  const isSessionReady = !isLoading && session != null;
  const canEditDuration = remoteStatus === "pending" || (remoteStatus === "active" && isPaused);
  const districtLabel = session?.task
    ? session.task.buildingLocation
      ?? (session.task.buildingSlotId ? formatSlotLabel(session.task.buildingSlotId) : null)
      ?? districtLabels[session.task.district]
      ?? session.task.district
    : "Free Focus";
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

  const objectiveSummary = session?.task
    ? session.task.buildingName
      ? `${session.task.buildingName} · ${session.task.name}`
      : session.task.name
    : "自由专注";
  const systemStatus = remoteStatus === "active" ? "System Active" : isLoading ? "System Restoring" : "System Idle";
  const notices = [
    isLoading ? { key: "loading", tone: "default" as const, message: "Restoring current session..." } : null,
    taskCompletedNotice ? { key: "task-completed", tone: "warn" as const, message: taskCompletedNotice } : null,
    statusMessage ? { key: "status", tone: "default" as const, message: statusMessage } : null,
    currentErrorMessage ? { key: "error", tone: "error" as const, message: currentErrorMessage } : null,
    restoredSessionNeedsDuration
      ? { key: "restored", tone: "warn" as const, message: "Current session restored. Re-enter duration to resume local countdown." }
      : null,
  ].filter((n): n is NonNullable<typeof n> => n != null && !dismissedNotices.has(n.key));

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
            <SystemNotice key={notice.key} onDismiss={() => dismissNotice(notice.key)} tone={notice.tone}>
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
                -20°C
              </span>
              <div className="relative" ref={langMenuRef}>
                <button
                  aria-label={t("focus.language", locale)}
                  className="relative rounded p-1.5 text-[var(--nlc-muted)] transition-colors hover:bg-[rgba(244,164,98,0.08)] hover:text-[var(--nlc-orange)]"
                  onClick={() => setShowLangMenu((v) => !v)}
                  type="button"
                >
                  <GlobeGlyph />
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--nlc-orange)]" />
                </button>
                {showLangMenu ? (
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[110px] rounded-sm border border-[rgba(244,164,98,0.2)] bg-[rgba(8,5,4,0.92)] py-1 shadow-xl backdrop-blur-md">
                    {LOCALES.map((loc) => (
                      <button
                        className={joinClasses(
                          "block w-full px-4 py-2 text-left text-[0.68rem] tracking-[0.08em] transition-colors",
                          loc === locale
                            ? "bg-[rgba(244,164,98,0.12)] font-bold text-[var(--nlc-orange)]"
                            : "text-[var(--nlc-muted)] hover:bg-[rgba(244,164,98,0.06)] hover:text-[var(--nlc-orange)]",
                        )}
                        key={loc}
                        onClick={() => { setLocaleState(loc); saveLocale(loc); setShowLangMenu(false); }}
                        type="button"
                      >
                        {LOCALE_LABELS[loc]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="h-8 w-8 overflow-hidden rounded border border-[rgba(244,164,98,0.4)] p-0.5">
                <img alt="Administrator portrait" className="h-full w-full rounded-sm object-cover" src={ADMIN_AVATAR_URL} />
              </div>
            </div>
          </div>

          <div className="grid border-t border-[rgba(244,164,98,0.12)] lg:grid-cols-[1fr_1.15fr_0.85fr]">
            <div className="flex items-center gap-2 border-b border-[rgba(244,164,98,0.08)] px-4 py-2.5 lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.12)]">
              <span className="text-[0.5rem] uppercase tracking-[0.2em] text-[rgba(244,164,98,0.46)]">Region</span>
              <span className="text-[0.82rem] font-semibold text-[var(--nlc-orange)]">{districtLabel}</span>
            </div>
            <div className="flex items-center gap-2 border-b border-[rgba(244,164,98,0.08)] px-4 py-2.5 lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.12)]">
              <span className="text-[0.5rem] uppercase tracking-[0.2em] text-[rgba(244,164,98,0.46)]">Current Objective</span>
              <span className="truncate text-[0.82rem] font-semibold text-[var(--nlc-orange)]">{objectiveSummary}</span>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-[0.5rem] uppercase tracking-[0.2em] text-[rgba(244,164,98,0.46)]">Captain</span>
              <span className="text-[0.82rem] font-semibold text-[rgba(247,221,197,0.88)]">{initialUser.username}</span>
              <span className="ml-auto text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]">{systemStatus}</span>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 overflow-hidden pb-[5.5rem] lg:grid-cols-[30%_70%]">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[rgba(244,164,98,0.12)] lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.18)]">
            <section
              className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-5"
              style={{
                backgroundImage: `linear-gradient(180deg,rgba(93,122,153,0.72),rgba(45,58,72,0.54)), linear-gradient(90deg,rgba(18,14,12,0.02),rgba(18,14,12,0.54)), url(${FOCUS_BACKGROUND_URL})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,10,0.08),rgba(6,8,10,0.4))]" />
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]" />
              <div className="relative flex min-h-full flex-col">
                {/* ── Shift Objectives ── */}
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="m-0 text-[1.2rem] font-semibold uppercase italic tracking-[0.04em] text-[#eef1f5]">
                      Shift Objectives
                    </h2>
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[var(--nlc-orange)]">
                      Priority Alpha
                    </span>
                  </div>

                  <ul className="mt-3 divide-y divide-[rgba(238,241,245,0.12)] border-t border-[rgba(238,241,245,0.16)]">
                    {todos.map((item) => (
                      <TodoItemRow
                        key={item.id}
                        item={item}
                        onDelete={() => deleteTodo(item.id)}
                        onToggle={() => toggleTodo(item.id)}
                      />
                    ))}
                  </ul>

                  {todos.length === 0 && !isAddingTodo ? (
                    <p className="mt-2 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]">
                      No objectives yet. Add one below.
                    </p>
                  ) : null}

                  {isAddingTodo ? (
                    <form
                      className="mt-3 flex items-center gap-2"
                      onSubmit={(e) => { e.preventDefault(); addTodo(); }}
                    >
                      <input
                        ref={newTodoInputRef}
                        autoFocus
                        className="h-8 flex-1 rounded-sm border border-[rgba(244,164,98,0.24)] bg-[rgba(5,4,3,0.62)] px-3 text-[0.88rem] text-[rgba(247,221,197,0.88)] outline-none transition placeholder:text-[rgba(247,221,197,0.3)] focus:border-[rgba(255,157,0,0.48)]"
                        onChange={(e) => setNewTodoText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setIsAddingTodo(false); }}
                        placeholder="Enter objective..."
                        value={newTodoText}
                      />
                      <button
                        className="nlc-focus-ring h-8 rounded-sm border border-[rgba(244,164,98,0.3)] bg-[rgba(244,164,98,0.08)] px-3 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--nlc-orange)] transition-colors hover:bg-[rgba(244,164,98,0.14)]"
                        type="submit"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      className="nlc-focus-ring mt-3 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[var(--nlc-orange)] transition-colors hover:text-[rgba(255,208,165,0.9)]"
                      onClick={() => setIsAddingTodo(true)}
                      type="button"
                    >
                      + New Objective
                    </button>
                  )}
                </div>

                {/* ── Expedition Notes ── */}
                <div className="mt-auto rounded-sm border border-[rgba(244,164,98,0.18)] bg-[rgba(10,7,5,0.6)] px-4 py-3.5">
                  <div className="flex items-center justify-between gap-4 border-b border-[rgba(244,164,98,0.14)] pb-2.5">
                    <h3 className="m-0 text-[0.92rem] font-semibold uppercase tracking-[0.08em] text-[var(--nlc-orange)]">
                      Expedition Notes
                    </h3>
                    <span className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]">Encrypted</span>
                  </div>
                  <textarea
                    className="mt-3 h-40 w-full resize-none rounded-sm border border-[rgba(244,164,98,0.14)] bg-[rgba(5,4,3,0.62)] px-3.5 py-2.5 text-[0.88rem] leading-5 text-[rgba(247,221,197,0.88)] outline-none transition focus:border-[rgba(255,157,0,0.48)]"
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Log observations of the frost creep..."
                    value={notes}
                  />
                  <div className="mt-3 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.18em] text-[rgba(247,221,197,0.42)]">
                    <span>Logged live</span>
                    <span>{notes.trim() ? `${notes.length} chars` : "Encrypted"}</span>
                  </div>
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

            {/* ── Work 便签面板 ── */}
            <WorkPanel
              coworkers={coworkers}
              cycleHeartbeatCount={cycleHeartbeatCount}
              districtLabel={districtLabel}
              isOpen={showWorkPanel}
              objectiveSummary={objectiveSummary}
              onToggle={() => setShowWorkPanel((v) => !v)}
              remoteStatus={remoteStatus}
              session={session}
              username={initialUser.username}
            />

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
                        <div className="mt-3 flex items-center gap-2">
                          <div className="font-mono text-[3.35rem] font-black tracking-[-0.08em] text-[var(--nlc-orange)] drop-shadow-[0_0_20px_rgba(244,164,98,0.22)] sm:text-[3.8rem]">
                            {formatSeconds(displaySeconds)}
                          </div>
                          {canEditDuration ? (
                            <div className="flex flex-col gap-1">
                              <button
                                aria-label="增加时长"
                                className="nlc-focus-ring flex size-6 items-center justify-center rounded border border-[rgba(244,164,98,0.3)] bg-[rgba(244,164,98,0.06)] text-[var(--nlc-orange)] transition-colors hover:bg-[rgba(244,164,98,0.14)]"
                                onClick={() => {
                                  const next = Math.min((Number(selectedMinutesInput) || 0) + 5, 180);
                                  setSelectedMinutesInput(String(next));
                                  setSelectedMinutes(next);
                                }}
                                type="button"
                              >
                                <svg aria-hidden="true" className="size-3" viewBox="0 0 12 12" fill="currentColor">
                                  <path d="M6 2.5 10 7.5H2Z" />
                                </svg>
                              </button>
                              <button
                                aria-label="减少时长"
                                className="nlc-focus-ring flex size-6 items-center justify-center rounded border border-[rgba(244,164,98,0.3)] bg-[rgba(244,164,98,0.06)] text-[var(--nlc-orange)] transition-colors hover:bg-[rgba(244,164,98,0.14)]"
                                onClick={() => {
                                  const next = Math.max((Number(selectedMinutesInput) || 0) - 5, 1);
                                  setSelectedMinutesInput(String(next));
                                  setSelectedMinutes(next);
                                }}
                                type="button"
                              >
                                <svg aria-hidden="true" className="size-3" viewBox="0 0 12 12" fill="currentColor">
                                  <path d="M6 9.5 2 4.5h8Z" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
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
