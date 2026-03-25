/**
 * [INPUT]: `/focus` 页面加载到的 session、`/api/session/*` 写接口、`/api/tasks` 轮询结果
 * [OUTPUT]: Focus 倒计时、localStorage 持久化、10 分钟 heartbeat 调度与 session 结算控制
 * [POS]: 位于 `hooks/use-heartbeat.ts`，被 `components/focus/FocusExperience.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `hooks/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useEffect, useRef, useState } from "react";

export type FocusTaskType = "collect" | "build" | "convert" | "work";
export type FocusSessionStatus = "pending" | "active";
export type FocusClientEndReason = "manual_stop" | "timer_completed";
export type FocusServerEndReason =
  | "manual_stop"
  | "timer_completed"
  | "resource_exhausted"
  | "building_completed"
  | "timeout";

export type FocusSession = {
  id: string;
  status: FocusSessionStatus;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  task: {
    templateId: string;
    instanceId: string | null;
    type: FocusTaskType;
    name: string;
    district: string;
  };
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
};

type HeartbeatPayload = {
  taskEnded: boolean;
  buildingCompleted: boolean;
  remainingMinutes: number;
  endReason: FocusServerEndReason | null;
};

type UseHeartbeatOptions = {
  session: FocusSession | null;
  onEnded: (summary: FocusSummary) => void;
};

type UseHeartbeatResult = {
  cycleHeartbeatCount: number;
  errorMessage: string | null;
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

function getStorageKey(sessionId: string) {
  return `nlc:focus-state:${sessionId}`;
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

    return {
      selectedMinutes: Math.max(1, Math.round(parsed.selectedMinutes)),
      remainingSeconds: Math.max(0, Math.round(parsed.remainingSeconds)),
      isPaused: parsed.isPaused,
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

  return payload.tasks.some(
    (task) =>
      task.template.id === session.task.templateId &&
      task.instance?.id === session.task.instanceId &&
      task.instance.remainingMinutes > 0,
  );
}

function deriveCycleHeartbeatCount(selectedMinutes: number, remainingSeconds: number) {
  const elapsedSeconds = Math.max(0, selectedMinutes * 60 - remainingSeconds);
  return Math.floor(elapsedSeconds / HEARTBEAT_SECONDS);
}

export function useHeartbeat({ session, onEnded }: UseHeartbeatOptions): UseHeartbeatResult {
  const [cycleHeartbeatCount, setCycleHeartbeatCount] = useState(0);
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
    queuedHeartbeatCountRef.current = 0;

    if (persistedState) {
      const nextCycleHeartbeatCount = deriveCycleHeartbeatCount(
        persistedState.selectedMinutes,
        persistedState.remainingSeconds,
      );

      cycleHeartbeatCountRef.current = nextCycleHeartbeatCount;
      setCycleHeartbeatCount(nextCycleHeartbeatCount);
      setSelectedMinutesState(persistedState.selectedMinutes);
      setRemainingSeconds(persistedState.remainingSeconds);
      setIsPaused(persistedState.isPaused);
      setStatusMessage(persistedState.isPaused ? "已恢复暂停中的本地倒计时。" : "已恢复进行中的本地倒计时。");
      return;
    }

    cycleHeartbeatCountRef.current = 0;
    setCycleHeartbeatCount(0);
    setSelectedMinutesState(null);
    setRemainingSeconds(null);
    setIsPaused(true);
    setStatusMessage(
      nextRemoteStatus === "active" ? "检测到可恢复 session，请重新输入本轮时长后继续。" : "输入本轮时长后即可开始。",
    );
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
    });
  }, [isPaused, remainingSeconds, selectedMinutes, session]);

  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      isPaused ||
      remainingSeconds == null ||
      selectedMinutes == null ||
      endingRef.current
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((currentValue) => {
        if (currentValue == null || currentValue <= 0) {
          return 0;
        }

        const nextValue = Math.max(0, currentValue - 1);
        const completedHeartbeatCount = deriveCycleHeartbeatCount(selectedMinutes, nextValue);
        const acknowledgedHeartbeatCount = cycleHeartbeatCountRef.current + queuedHeartbeatCountRef.current;

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

        return nextValue;
      });
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPaused, remainingSeconds, remoteStatus, selectedMinutes, session]);

  async function finishSession(endReason: FocusClientEndReason) {
    if (!session || endingRef.current) {
      return;
    }

    endingRef.current = true;
    setIsEnding(true);
    setIsPaused(true);
    setStatusMessage("正在写入结算摘要...");
    clearPersistedState(session.id);

    try {
      const summary = await endSession(session.id, endReason);

      if (!mountedRef.current) {
        return;
      }

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
      queuedHeartbeatCount <= 0 ||
      isHeartbeatInFlight ||
      endingRef.current
    ) {
      return;
    }

    let cancelled = false;

    const runHeartbeat = async () => {
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

        if (payload.taskEnded || payload.buildingCompleted || payload.endReason) {
          await finishSession("timer_completed");
        }
      } catch (error) {
        if (cancelled || !mountedRef.current) {
          return;
        }

        setIsPaused(true);
        setErrorMessage(error instanceof Error ? error.message : "Failed to sync heartbeat.");
        setStatusMessage("heartbeat 同步失败，已暂停本地倒计时。");
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
  }, [isHeartbeatInFlight, queuedHeartbeatCount, remoteStatus, session]);

  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      isPaused ||
      remainingSeconds !== 0 ||
      queuedHeartbeatCount > 0 ||
      isHeartbeatInFlight ||
      endingRef.current
    ) {
      return;
    }

    void finishSession("timer_completed");
  }, [isHeartbeatInFlight, isPaused, queuedHeartbeatCount, remainingSeconds, remoteStatus, session]);

  useEffect(() => {
    if (
      !session ||
      remoteStatus !== "active" ||
      endingRef.current ||
      (session.task.type !== "build" && session.task.type !== "work") ||
      !session.task.instanceId
    ) {
      return;
    }

    let cancelled = false;

    const runPoll = async () => {
      try {
        const isInstanceStillActive = await pollTaskInstance(session);

        if (cancelled || !mountedRef.current || endingRef.current) {
          return;
        }

        if (!isInstanceStillActive) {
          setStatusMessage("检测到建造实例已完成，正在结算。");
          await finishSession("timer_completed");
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setStatusMessage("建造实例轮询暂时失败，稍后重试。");
        }
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

    if (remainingSeconds == null) {
      setRemainingSeconds(selectedMinutes * 60);
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

    setIsPaused((currentValue) => {
      const nextValue = !currentValue;
      setStatusMessage(nextValue ? "已暂停本地倒计时。" : "本地倒计时继续。");
      return nextValue;
    });
  }

  async function stopSession() {
    await finishSession("manual_stop");
  }

  function resetTimer() {
    if (selectedMinutes == null || !session) {
      setErrorMessage("请先输入本轮专注分钟数。");
      return;
    }

    setErrorMessage(null);
    setIsPaused(true);
    setRemainingSeconds(selectedMinutes * 60);
    setQueuedHeartbeatCount(0);
    setCycleHeartbeatCount(0);
    setStatusMessage("已重置当前本地倒计时，本轮零散秒数不会计入 heartbeat。");
    queuedHeartbeatCountRef.current = 0;
    cycleHeartbeatCountRef.current = 0;
    persistState(session.id, {
      selectedMinutes,
      remainingSeconds: selectedMinutes * 60,
      isPaused: true,
    });
  }

  function setSelectedMinutes(value: number | null) {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      setSelectedMinutesState(null);
      setRemainingSeconds(null);
      return;
    }

    const normalizedValue = Math.max(1, Math.round(value));
    setErrorMessage(null);
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
