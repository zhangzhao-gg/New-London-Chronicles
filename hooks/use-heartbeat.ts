/**
 * [INPUT]: `FocusSession`（task 可空）、`/api/session/*` 写接口、`/api/tasks` 轮询结果
 * [OUTPUT]: Focus 倒计时（归零自动重置，不终止 session）、条件性 heartbeat（有任务调 API / 无任务纯本地 tick）、`onTaskCompleted` 回调、任务轮询感知建造完成、`hasTask` 状态
 * [POS]: 位于 `hooks/use-heartbeat.ts`，被 `components/focus/FocusExperience.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `hooks/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { navigateTo } from "@/lib/client-navigation";

export type FocusTaskType = "collect" | "build" | "convert" | "work";
export type FocusSessionStatus = "pending" | "active";
export type FocusClientEndReason = "manual_stop";
export type FocusServerEndReason =
  | "manual_stop"
  | "resource_exhausted"
  | "building_completed"
  | "timeout";

export type FocusTask = {
  templateId: string;
  instanceId: string | null;
  type: FocusTaskType;
  name: string;
  district: string;
};

export type FocusSession = {
  id: string;
  status: FocusSessionStatus;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  task: FocusTask | null;
};

export type FocusSummary = {
  sessionId: string;
  endReason: FocusServerEndReason;
  resource: string;
  amount: number;
  narrative: string;
  buildingCompleted: boolean;
  buildingName: string | null;
  participantsLabel: string | null;
};

type PersistedFocusState = {
  selectedMinutes: number;
  remainingSeconds: number;
  isPaused: boolean;
  countdownEndsAtMs: number | null;
  acknowledgedHeartbeatCount?: number;
};

type HeartbeatPayload = {
  taskEnded: boolean;
  buildingCompleted: boolean;
  completedBuildingName?: string | null;
  remainingMinutes: number;
  endReason: FocusServerEndReason | null;
};

type TaskCompletedInfo = {
  buildingCompleted: boolean;
  buildingName: string | null;
  endReason: string | null;
};

type UseHeartbeatOptions = {
  session: FocusSession | null;
  onEnded: (summary: FocusSummary) => void;
  onTaskCompleted?: (info: TaskCompletedInfo) => void;
};

type UseHeartbeatResult = {
  cycleHeartbeatCount: number;
  errorMessage: string | null;
  hasTask: boolean;
  isEnding: boolean;
  isHeartbeatInFlight: boolean;
  isPaused: boolean;
  isReady: boolean;
  isRunning: boolean;
  isStarting: boolean;
  remainingSeconds: number | null;
  remoteStatus: FocusSessionStatus | "ended";
  selectedMinutes: number | null;
  setSelectedMinutes: (value: number | null) => void;
  statusMessage: string | null;
  stopSession: () => Promise<void>;
  toggleStartPause: () => Promise<void>;
  resetTimer: () => void;
};

const HEARTBEAT_SECONDS = 10 * 60;
const TASK_POLL_INTERVAL_MS = 30_000;
const LOCAL_TICK_INTERVAL_MS = 250;
const DEFAULT_PENDING_FOCUS_MINUTES = 45;
const SESSION_ENDED_KEY_PREFIX = "nlc:session-ended:";

function getStorageKey(sessionId: string) {
  return `nlc:focus-state:${sessionId}`;
}

function normalizePositiveWholeNumber(value: number) {
  return Math.max(1, Math.round(value));
}

function normalizeRemainingSeconds(value: number) {
  return Math.max(0, Math.round(value));
}

function normalizeHeartbeatCount(value: number) {
  return Math.max(0, Math.floor(value));
}

function deriveCountdownEndsAtMs(remainingSeconds: number) {
  return Date.now() + normalizeRemainingSeconds(remainingSeconds) * 1_000;
}

function getRemainingMs(countdownEndsAtMs: number) {
  return Math.max(0, countdownEndsAtMs - Date.now());
}

function getRemainingSecondsFromMs(remainingMs: number) {
  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / 1_000);
}

function readPersistedState(sessionId: string): PersistedFocusState | null {
  try {
    const rawValue = window.localStorage.getItem(getStorageKey(sessionId));

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedFocusState>;

    if (
      typeof parsed.selectedMinutes !== "number" ||
      typeof parsed.remainingSeconds !== "number" ||
      typeof parsed.isPaused !== "boolean"
    ) {
      return null;
    }

    if (parsed.selectedMinutes <= 0) {
      return null;
    }

    if (
      parsed.countdownEndsAtMs != null &&
      (typeof parsed.countdownEndsAtMs !== "number" || !Number.isFinite(parsed.countdownEndsAtMs))
    ) {
      return null;
    }

    return {
      selectedMinutes: normalizePositiveWholeNumber(parsed.selectedMinutes),
      remainingSeconds: normalizeRemainingSeconds(parsed.remainingSeconds),
      isPaused: parsed.isPaused,
      countdownEndsAtMs:
        parsed.isPaused
          ? null
          : typeof parsed.countdownEndsAtMs === "number"
            ? Math.round(parsed.countdownEndsAtMs)
            : deriveCountdownEndsAtMs(parsed.remainingSeconds),
      acknowledgedHeartbeatCount:
        typeof parsed.acknowledgedHeartbeatCount === "number" && Number.isFinite(parsed.acknowledgedHeartbeatCount)
          ? normalizeHeartbeatCount(parsed.acknowledgedHeartbeatCount)
          : undefined,
    };
  } catch {
    return null;
  }
}

function clearPersistedState(sessionId: string) {
  try {
    window.localStorage.removeItem(getStorageKey(sessionId));
  } catch {}
}

function persistState(sessionId: string, state: PersistedFocusState) {
  try {
    window.localStorage.setItem(getStorageKey(sessionId), JSON.stringify(state));
  } catch {}
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

async function startSession(sessionId: string) {
  const response = await fetch("/api/session/start", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });

  const payload = await readJson<{ ok?: boolean; error?: { message?: string } }>(response);

  if (!response.ok || !payload?.ok) {
    throw new Error(getApiErrorMessage(payload, "Failed to start session."));
  }
}

async function sendHeartbeat(sessionId: string): Promise<HeartbeatPayload> {
  const response = await fetch("/api/session/heartbeat", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });

  const payload = await readJson<
    HeartbeatPayload & {
      error?: { message?: string };
    }
  >(response);

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to sync heartbeat."));
  }

  return payload;
}

async function endSession(sessionId: string, endReason: FocusClientEndReason): Promise<FocusSummary> {
  const response = await fetch("/api/session/end", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sessionId, endReason }),
  });

  const payload = await readJson<{ summary?: FocusSummary; error?: { message?: string } }>(response);

  if (!response.ok || !payload?.summary) {
    throw new Error(getApiErrorMessage(payload, "Failed to end session."));
  }

  return payload.summary;
}

async function pollTaskInstance(session: FocusSession) {
  const response = await fetch("/api/tasks", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<{
    tasks?: Array<{
      template: { id: string };
      instance: { id: string; remainingMinutes: number } | null;
    }>;
    error?: { message?: string };
  }>(response);

  if (!response.ok || !payload?.tasks) {
    throw new Error(getApiErrorMessage(payload, "Failed to poll task state."));
  }

  if (!session.task) return false;

  return payload.tasks.some(
    (task) =>
      task.template.id === session.task!.templateId &&
      task.instance?.id === session.task!.instanceId &&
      task.instance.remainingMinutes > 0,
  );
}

function deriveCycleHeartbeatCount(selectedMinutes: number, remainingSeconds: number) {
  const elapsedSeconds = Math.max(0, selectedMinutes * 60 - remainingSeconds);
  return Math.floor(elapsedSeconds / HEARTBEAT_SECONDS);
}

function deriveCycleHeartbeatCountFromRemainingMs(selectedMinutes: number, remainingMs: number) {
  const totalMs = Math.max(0, selectedMinutes * 60 * 1_000);
  const elapsedSeconds = Math.max(0, (totalMs - remainingMs) / 1_000);
  return Math.floor(elapsedSeconds / HEARTBEAT_SECONDS);
}

export function useHeartbeat({ session, onEnded, onTaskCompleted }: UseHeartbeatOptions): UseHeartbeatResult {
  const [cycleHeartbeatCount, setCycleHeartbeatCount] = useState(0);
  const [countdownEndsAtMs, setCountdownEndsAtMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [isHeartbeatInFlight, setIsHeartbeatInFlight] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<FocusSessionStatus | "ended">(session?.status ?? "pending");
  const [selectedMinutes, setSelectedMinutesState] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [queuedHeartbeatCount, setQueuedHeartbeatCount] = useState(0);

  const mountedRef = useRef(true);
  const endingRef = useRef(false);
  const cycleHeartbeatCountRef = useRef(0);
  const isTaskPollInFlightRef = useRef(false);
  const queuedHeartbeatCountRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    cycleHeartbeatCountRef.current = cycleHeartbeatCount;
  }, [cycleHeartbeatCount]);

  useEffect(() => {
    queuedHeartbeatCountRef.current = queuedHeartbeatCount;
  }, [queuedHeartbeatCount]);

  useEffect(() => {
    if (!session) {
      setCountdownEndsAtMs(null);
      setCycleHeartbeatCount(0);
      setErrorMessage(null);
      setIsEnding(false);
      setIsHeartbeatInFlight(false);
      setIsPaused(true);
      setIsStarting(false);
      setQueuedHeartbeatCount(0);
      setRemainingSeconds(null);
      setRemoteStatus("pending");
      setSelectedMinutesState(null);
      setStatusMessage(null);
      endingRef.current = false;
      isTaskPollInFlightRef.current = false;
      cycleHeartbeatCountRef.current = 0;
      queuedHeartbeatCountRef.current = 0;
      return;
    }

    const persistedState = readPersistedState(session.id);
    const nextRemoteStatus = session.status;

    setErrorMessage(null);
    setIsEnding(false);
    setIsHeartbeatInFlight(false);
    setIsStarting(false);
    setQueuedHeartbeatCount(0);
    setRemoteStatus(nextRemoteStatus);
    endingRef.current = false;
    isTaskPollInFlightRef.current = false;
    queuedHeartbeatCountRef.current = 0;

    if (persistedState) {
      const isRunningFromStorage = !persistedState.isPaused && persistedState.countdownEndsAtMs != null;
      const restoredCountdownEndsAtMs = isRunningFromStorage ? persistedState.countdownEndsAtMs : null;
      const remainingMs = restoredCountdownEndsAtMs == null ? null : getRemainingMs(restoredCountdownEndsAtMs);
      const nextRemainingSeconds =
        remainingMs == null
          ? persistedState.remainingSeconds
          : getRemainingSecondsFromMs(remainingMs);

      const completedHeartbeatCount =
        remainingMs == null
          ? deriveCycleHeartbeatCount(persistedState.selectedMinutes, nextRemainingSeconds)
          : deriveCycleHeartbeatCountFromRemainingMs(persistedState.selectedMinutes, remainingMs);
      const savedHeartbeatCount = deriveCycleHeartbeatCount(persistedState.selectedMinutes, persistedState.remainingSeconds);
      const acknowledgedHeartbeatCount = Math.min(
        completedHeartbeatCount,
        normalizeHeartbeatCount(persistedState.acknowledgedHeartbeatCount ?? savedHeartbeatCount),
      );
      const nextQueuedHeartbeatCount = Math.max(0, completedHeartbeatCount - acknowledgedHeartbeatCount);

      cycleHeartbeatCountRef.current = acknowledgedHeartbeatCount;
      queuedHeartbeatCountRef.current = nextQueuedHeartbeatCount;
      setCountdownEndsAtMs(restoredCountdownEndsAtMs);
      setCycleHeartbeatCount(acknowledgedHeartbeatCount);
      setQueuedHeartbeatCount(nextQueuedHeartbeatCount);
      setSelectedMinutesState(persistedState.selectedMinutes);
      setRemainingSeconds(nextRemainingSeconds);
      setIsPaused(persistedState.isPaused);
      setStatusMessage(
        persistedState.isPaused
          ? nextQueuedHeartbeatCount > 0
            ? "已恢复暂停中的本地倒计时，待同步 heartbeat 已保留。"
            : "已恢复暂停中的本地倒计时。"
          : nextQueuedHeartbeatCount > 0
            ? "已恢复进行中的本地倒计时，并补回待同步 heartbeat。"
            : "已恢复进行中的本地倒计时。",
      );
      return;
    }

    cycleHeartbeatCountRef.current = 0;
    setCountdownEndsAtMs(null);
    setCycleHeartbeatCount(0);
    setIsPaused(true);

    if (nextRemoteStatus === "pending") {
      setSelectedMinutesState(DEFAULT_PENDING_FOCUS_MINUTES);
      setRemainingSeconds(DEFAULT_PENDING_FOCUS_MINUTES * 60);
      setStatusMessage("已载入默认 45 分钟时长，可直接开始。");
      return;
    }

    setSelectedMinutesState(null);
    setRemainingSeconds(null);
    setStatusMessage("检测到可恢复 session，请重新输入本轮时长后继续。");
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (selectedMinutes == null || remainingSeconds == null || endingRef.current) {
      clearPersistedState(session.id);
      return;
    }

    persistState(session.id, {
      selectedMinutes,
      remainingSeconds,
      isPaused,
      countdownEndsAtMs: isPaused ? null : countdownEndsAtMs,
      acknowledgedHeartbeatCount: cycleHeartbeatCount,
    });
  }, [countdownEndsAtMs, cycleHeartbeatCount, isPaused, remainingSeconds, selectedMinutes, session]);

  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      isPaused ||
      countdownEndsAtMs == null ||
      selectedMinutes == null ||
      endingRef.current
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      const remainingMs = getRemainingMs(countdownEndsAtMs);
      const nextRemainingSeconds = getRemainingSecondsFromMs(remainingMs);
      const completedHeartbeatCount = deriveCycleHeartbeatCountFromRemainingMs(selectedMinutes, remainingMs);
      const acknowledgedHeartbeatCount = cycleHeartbeatCountRef.current + queuedHeartbeatCountRef.current;

      setRemainingSeconds((currentValue) => (currentValue === nextRemainingSeconds ? currentValue : nextRemainingSeconds));

      if (completedHeartbeatCount > acknowledgedHeartbeatCount) {
        const diff = completedHeartbeatCount - acknowledgedHeartbeatCount;
        queuedHeartbeatCountRef.current += diff;
        window.queueMicrotask(() => {
          if (!mountedRef.current) {
            return;
          }

          setQueuedHeartbeatCount((currentCount) => currentCount + diff);
        });
      }
    }, LOCAL_TICK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [countdownEndsAtMs, isPaused, remoteStatus, selectedMinutes, session]);

  /* ─── 跨 tab 结算通知：另一个窗口结束同一 session 时，当前 tab 感知并跳转 ─── */

  useEffect(() => {
    if (!session) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== `${SESSION_ENDED_KEY_PREFIX}${session.id}`) return;
      if (endingRef.current) return;

      endingRef.current = true;
      setCountdownEndsAtMs(null);
      setIsPaused(true);
      setIsEnding(true);
      clearPersistedState(session.id);
      navigateTo("/city", { replace: true });
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [session]);

  async function finishSession(endReason: FocusClientEndReason) {
    if (!session || endingRef.current) {
      return;
    }

    /* 跨 tab 防重：如果另一个 tab 已经结算过，直接跳走 */
    try {
      if (window.localStorage.getItem(`${SESSION_ENDED_KEY_PREFIX}${session.id}`)) {
        endingRef.current = true;
        navigateTo("/city", { replace: true });
        return;
      }
    } catch {}

    endingRef.current = true;
    setCountdownEndsAtMs(null);
    setIsEnding(true);
    setIsPaused(true);
    setStatusMessage("正在写入结算摘要...");
    clearPersistedState(session.id);

    try {
      const summary = await endSession(session.id, endReason);

      if (!mountedRef.current) {
        return;
      }

      /* 广播结算信号给其他 tab */
      try {
        window.localStorage.setItem(`${SESSION_ENDED_KEY_PREFIX}${session.id}`, String(Date.now()));
      } catch {}

      setRemoteStatus("ended");
      setErrorMessage(null);
      onEnded(summary);
    } catch (error) {
      endingRef.current = false;

      if (!mountedRef.current) {
        return;
      }

      setIsEnding(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to end session.");
      setStatusMessage("结算失败，请重试。");
    }
  }

  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      isPaused ||
      queuedHeartbeatCount <= 0 ||
      isHeartbeatInFlight ||
      endingRef.current
    ) {
      return;
    }

    let cancelled = false;

    const runHeartbeat = async () => {
      /* ── 无任务 → 纯本地 tick，不调 API ── */
      if (!session.task) {
        queuedHeartbeatCountRef.current = Math.max(0, queuedHeartbeatCountRef.current - 1);
        cycleHeartbeatCountRef.current += 1;

        setQueuedHeartbeatCount((currentCount) => Math.max(0, currentCount - 1));
        setCycleHeartbeatCount(cycleHeartbeatCountRef.current);
        return;
      }

      setIsHeartbeatInFlight(true);
      setStatusMessage("正在同步 10 分钟 heartbeat...");

      try {
        const payload = await sendHeartbeat(session.id);

        if (cancelled || !mountedRef.current) {
          return;
        }

        queuedHeartbeatCountRef.current = Math.max(0, queuedHeartbeatCountRef.current - 1);
        cycleHeartbeatCountRef.current += 1;

        setQueuedHeartbeatCount((currentCount) => Math.max(0, currentCount - 1));
        setCycleHeartbeatCount(cycleHeartbeatCountRef.current);
        setErrorMessage(null);
        setStatusMessage("当前轮次 heartbeat 已同步。");

        /* ── 任务完成 → 通知上层，session 继续 ── */
        if (payload.taskEnded || payload.buildingCompleted) {
          onTaskCompleted?.({
            buildingCompleted: payload.buildingCompleted,
            buildingName: payload.completedBuildingName ?? null,
            endReason: payload.endReason,
          });
        }
      } catch (error) {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setCountdownEndsAtMs(null);
        setIsPaused(true);
        setErrorMessage(error instanceof Error ? error.message : "Failed to sync heartbeat.");
        setStatusMessage("heartbeat 同步失败，已暂停本地倒计时；恢复后会继续补发。");
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsHeartbeatInFlight(false);
        }
      }
    };

    void runHeartbeat();

    return () => {
      cancelled = true;
    };
  }, [isPaused, queuedHeartbeatCount, remoteStatus, session]);

  /* ── 计时器归零 → 重置下一轮，session 不终止 ── */
  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      isPaused ||
      remainingSeconds !== 0 ||
      selectedMinutes == null ||
      queuedHeartbeatCount > 0 ||
      queuedHeartbeatCountRef.current > 0 ||
      isHeartbeatInFlight ||
      endingRef.current
    ) {
      return;
    }

    const nextSeconds = selectedMinutes * 60;

    cycleHeartbeatCountRef.current = 0;
    queuedHeartbeatCountRef.current = 0;
    setCycleHeartbeatCount(0);
    setQueuedHeartbeatCount(0);
    setRemainingSeconds(nextSeconds);
    setCountdownEndsAtMs(deriveCountdownEndsAtMs(nextSeconds));
    setStatusMessage("本轮专注完成，已自动开始下一轮。");
  }, [isHeartbeatInFlight, isPaused, queuedHeartbeatCount, remainingSeconds, remoteStatus, selectedMinutes, session]);

  useEffect(() => {
    if (
      !session ||
      !session.task ||
      remoteStatus !== "active" ||
      endingRef.current ||
      (session.task.type !== "build" && session.task.type !== "work") ||
      !session.task.instanceId
    ) {
      return;
    }

    let cancelled = false;

    const runPoll = async () => {
      if (isTaskPollInFlightRef.current) {
        return;
      }

      isTaskPollInFlightRef.current = true;

      try {
        const isInstanceStillActive = await pollTaskInstance(session);

        if (cancelled || !mountedRef.current || endingRef.current) {
          return;
        }

        if (!isInstanceStillActive) {
          const isBuild = session.task?.type === "build";
          setStatusMessage(isBuild ? "检测到建造已完成。" : "检测到任务已完成。");
          onTaskCompleted?.({
            buildingCompleted: isBuild,
            buildingName: isBuild ? (session.task?.name ?? null) : null,
            endReason: isBuild ? "building_completed" : "resource_exhausted",
          });
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setStatusMessage("建造实例轮询暂时失败，稍后重试。");
        }
      } finally {
        isTaskPollInFlightRef.current = false;
      }
    };

    void runPoll();

    const pollTimer = window.setInterval(() => {
      void runPoll();
    }, TASK_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [remoteStatus, session]);

  async function toggleStartPause() {
    if (!session) {
      return;
    }

    if (selectedMinutes == null || selectedMinutes <= 0) {
      setErrorMessage("请先输入本轮专注分钟数。");
      return;
    }

    const nextRemainingSeconds = remainingSeconds ?? selectedMinutes * 60;

    if (remainingSeconds == null) {
      setRemainingSeconds(nextRemainingSeconds);
    }

    setErrorMessage(null);

    if (remoteStatus === "pending") {
      setIsStarting(true);
      setStatusMessage("正在启动 session...");

      try {
        await startSession(session.id);

        if (!mountedRef.current) {
          return;
        }

        setCountdownEndsAtMs(deriveCountdownEndsAtMs(nextRemainingSeconds));
        setRemoteStatus("active");
        setIsPaused(false);
        setStatusMessage("session 已启动，倒计时进行中。");
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to start session.");
        setStatusMessage("启动失败，请重试。");
      } finally {
        if (mountedRef.current) {
          setIsStarting(false);
        }
      }

      return;
    }

    if (isPaused) {
      setCountdownEndsAtMs(deriveCountdownEndsAtMs(nextRemainingSeconds));
      setIsPaused(false);
      setStatusMessage("本地倒计时继续。");
      return;
    }

    const pausedRemainingSeconds =
      countdownEndsAtMs == null ? nextRemainingSeconds : getRemainingSecondsFromMs(getRemainingMs(countdownEndsAtMs));

    setCountdownEndsAtMs(null);
    setRemainingSeconds(pausedRemainingSeconds);
    setIsPaused(true);
    setStatusMessage("已暂停本地倒计时。");
  }

  async function stopSession() {
    await finishSession("manual_stop");
  }

  function resetTimer() {
    if (selectedMinutes == null || !session) {
      setErrorMessage("请先输入本轮专注分钟数。");
      return;
    }

    const nextRemainingSeconds = selectedMinutes * 60;

    setCountdownEndsAtMs(null);
    setErrorMessage(null);
    setIsPaused(true);
    setRemainingSeconds(nextRemainingSeconds);
    setQueuedHeartbeatCount(0);
    setCycleHeartbeatCount(0);
    setStatusMessage("已重置当前本地倒计时，本轮零散秒数不会计入 heartbeat。");
    queuedHeartbeatCountRef.current = 0;
    cycleHeartbeatCountRef.current = 0;
    persistState(session.id, {
      selectedMinutes,
      remainingSeconds: nextRemainingSeconds,
      isPaused: true,
      countdownEndsAtMs: null,
    });
  }

  function setSelectedMinutes(value: number | null) {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      setCountdownEndsAtMs(null);
      setSelectedMinutesState(null);
      setRemainingSeconds(null);
      return;
    }

    const normalizedValue = normalizePositiveWholeNumber(value);
    setCountdownEndsAtMs(null);
    setErrorMessage(null);
    setIsPaused(true);
    setSelectedMinutesState(normalizedValue);
    setRemainingSeconds(normalizedValue * 60);
    setQueuedHeartbeatCount(0);
    setCycleHeartbeatCount(0);
    queuedHeartbeatCountRef.current = 0;
    cycleHeartbeatCountRef.current = 0;
  }

  return {
    cycleHeartbeatCount,
    errorMessage,
    hasTask: session?.task != null,
    isEnding,
    isHeartbeatInFlight,
    isPaused,
    isReady: selectedMinutes != null && remainingSeconds != null,
    isRunning: remoteStatus === "active" && !isPaused && (remainingSeconds ?? 0) > 0,
    isStarting,
    remainingSeconds,
    remoteStatus,
    selectedMinutes,
    setSelectedMinutes,
    statusMessage,
    stopSession,
    toggleStartPause,
    resetTimer,
  };
}

export default useHeartbeat;
