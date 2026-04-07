/**
 * [INPUT]: 当前登录用户、`sessionStorage["nlc:last-summary"]`、`POST /api/tasks/assign-next`
 * [OUTPUT]: M10 完成页，支持任务结算与自由专注两种摘要展示，autoAssign 仅对任务 session 生效
 * [POS]: 位于 `components/focus/CompleteExperience.tsx`，被 `app/complete/page.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useEffect, useState } from "react";

import Button from "@/components/ui/Button";
import type { UserDto } from "@/lib/auth";
import { navigateTo } from "@/lib/client-navigation";
import type { FocusSummary } from "@/hooks/use-heartbeat";

type AssignNextResponse = {
  redirectTo?: string;
  sessionId?: string;
  error?: { message?: string };
};

const LAST_SUMMARY_STORAGE_KEY = "nlc:last-summary";
let summaryCache: FocusSummary | null = null;
let clearSummaryCacheTimer: number | null = null;

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function cancelPendingSummaryCacheClear() {
  if (clearSummaryCacheTimer == null) {
    return;
  }

  window.clearTimeout(clearSummaryCacheTimer);
  clearSummaryCacheTimer = null;
}

function scheduleSummaryCacheClear() {
  cancelPendingSummaryCacheClear();
  clearSummaryCacheTimer = window.setTimeout(() => {
    summaryCache = null;
    clearSummaryCacheTimer = null;
  }, 0);
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

async function assignNextTask() {
  const response = await fetch("/api/tasks/assign-next", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({}),
  });

  const payload = await readJson<AssignNextResponse>(response);

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to assign next task."));
  }

  return payload;
}

function consumeLastSummary(): FocusSummary | null {
  cancelPendingSummaryCacheClear();

  try {
    const rawSummary = window.sessionStorage.getItem(LAST_SUMMARY_STORAGE_KEY);

    if (!rawSummary) {
      return summaryCache;
    }

    const parsedSummary = JSON.parse(rawSummary) as FocusSummary;
    window.sessionStorage.removeItem(LAST_SUMMARY_STORAGE_KEY);
    summaryCache = parsedSummary;
    return parsedSummary;
  } catch {
    window.sessionStorage.removeItem(LAST_SUMMARY_STORAGE_KEY);
    summaryCache = null;
    return null;
  }
}

function SummaryNotice({ children, tone = "default" }: { children: string; tone?: "default" | "error" | "warn" }) {
  const toneClassName =
    tone === "error"
      ? "border-red-500/22 bg-red-950/24 text-red-100"
      : tone === "warn"
        ? "border-amber-500/22 bg-amber-950/24 text-amber-100"
        : "border-[rgba(244,164,98,0.14)] bg-[rgba(0,0,0,0.24)] text-[var(--nlc-muted)]";

  return <div className={joinClasses("rounded-2xl border px-4 py-3 text-sm leading-6", toneClassName)}>{children}</div>;
}

export function CompleteExperience({ initialUser }: { initialUser: UserDto }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [summary, setSummary] = useState<FocusSummary | null>(null);

  useEffect(() => {
    const parsedSummary = consumeLastSummary();

    if (!parsedSummary) {
      navigateTo("/city", { replace: true });
      return;
    }

    setSummary(parsedSummary);
  }, []);

  useEffect(() => {
    return () => {
      scheduleSummaryCacheClear();
    };
  }, []);

  useEffect(() => {
    /* 自由专注结束不触发 auto-assign */
    if (!summary || !initialUser.autoAssign || summary.resource === "focus") {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsAssigning(true);
      setErrorMessage(null);

      try {
        const payload = await assignNextTask();

        if (!cancelled) {
          navigateTo(payload.redirectTo ?? `/focus?sessionId=${payload.sessionId}`, { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to assign next task.");
        }
      } finally {
        if (!cancelled) {
          setIsAssigning(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [initialUser.autoAssign, summary]);

  if (!summary) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 text-center text-sm text-[var(--nlc-muted)]">
        正在读取结算摘要...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="nlc-panel nlc-inset nlc-etched w-full max-w-3xl rounded-[2rem] px-6 py-8 sm:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,164,98,0.12),transparent_42%)] opacity-80" />
        <div className="relative z-10 space-y-6">
          <div className="text-center">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.32em] text-[var(--nlc-muted)]">Session Complete</p>
            <h1 className="m-0 mt-3 text-3xl uppercase tracking-[0.12em] text-[var(--nlc-orange)]">
              {summary.resource === "focus" ? "自由专注回执" : "城市结算回执"}
            </h1>
            <p className="m-0 mt-3 text-sm leading-7 text-[var(--nlc-muted)]">{summary.narrative}</p>
          </div>

          <div className={joinClasses("grid gap-4", summary.resource === "focus" ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/18 px-4 py-4 text-center">
              <p className="m-0 text-[0.68rem] uppercase tracking-[0.24em] text-[var(--nlc-muted)]">结束原因</p>
              <p className="m-0 mt-3 text-sm uppercase tracking-[0.18em] text-white">{summary.endReason}</p>
            </div>
            {summary.resource !== "focus" ? (
              <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/18 px-4 py-4 text-center">
                <p className="m-0 text-[0.68rem] uppercase tracking-[0.24em] text-[var(--nlc-muted)]">资源/进度</p>
                <p className="m-0 mt-3 text-sm uppercase tracking-[0.18em] text-white">
                  {summary.resource} · {summary.amount}
                </p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/18 px-4 py-4 text-center">
              <p className="m-0 text-[0.68rem] uppercase tracking-[0.24em] text-[var(--nlc-muted)]">执行者</p>
              <p className="m-0 mt-3 text-sm uppercase tracking-[0.18em] text-white">{initialUser.username}</p>
            </div>
          </div>

          {summary.buildingCompleted || summary.buildingName ? (
            <div className="rounded-2xl border border-[rgba(255,157,0,0.22)] bg-[rgba(244,164,98,0.06)] px-5 py-4 text-sm leading-7 text-[var(--nlc-muted)]">
              建筑完成：{summary.buildingName ?? "新建筑已投入城市"}。
              {summary.participantsLabel ? ` 参与者：${summary.participantsLabel}。` : ""}
            </div>
          ) : null}

          {summary.resource === "focus" ? (
            <SummaryNotice>自由专注已结束。你可以返回城市，或选择一项任务继续。</SummaryNotice>
          ) : initialUser.autoAssign ? (
            <SummaryNotice tone={errorMessage ? "error" : "default"}>
              {errorMessage
                ? errorMessage
                : isAssigning
                  ? "自动任务已开启，正在调用 `/api/tasks/assign-next` 并跳转下一轮 Focus。"
                  : "自动任务已开启，正在准备下一轮。"}
            </SummaryNotice>
          ) : (
            <SummaryNotice>自动任务已关闭。你可以返回城市，或者回去选择下一项任务。</SummaryNotice>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => navigateTo("/city")} size="lg" variant="secondary">
              返回城市
            </Button>
            <Button
              disabled={isAssigning}
              onClick={() => navigateTo("/city?openTasks=1")}
              size="lg"
              variant={initialUser.autoAssign ? "ghost" : "primary"}
            >
              选择下一个任务
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CompleteExperience;
