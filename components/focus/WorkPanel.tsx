/**
 * [INPUT]: FocusSession 状态、用户名、区域/任务标签
 * [OUTPUT]: 右侧滑出工作信息面板 + 便签 tab 触发器 + 协作者列表
 * [POS]: 位于 `components/focus/WorkPanel.tsx`，被 `FocusExperience.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`
 */

"use client";

import { useEffect, useRef } from "react";

import type { FocusSession, FocusSessionStatus } from "@/hooks/use-heartbeat";

/* ================================================================
 *  Types
 * ================================================================ */

type CoworkerDto = { username: string };

type WorkPanelProps = {
  coworkers: CoworkerDto[];
  cycleHeartbeatCount: number;
  districtLabel: string;
  isOpen: boolean;
  objectiveSummary: string;
  onToggle: () => void;
  remoteStatus: FocusSessionStatus | "ended";
  session: FocusSession | null;
  username: string;
};

/* ================================================================
 *  Helpers
 * ================================================================ */

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "Awaiting Deployment", color: "text-amber-400" },
  active: { label: "In Operation", color: "text-emerald-400" },
  ended: { label: "Archived", color: "text-[var(--nlc-muted)]" },
};

function formatTime(iso: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ================================================================
 *  InfoRow — 单行键值
 * ================================================================ */

function InfoRow({ label, value, accent = false }: { accent?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[0.58rem] uppercase tracking-[0.2em] text-[rgba(244,164,98,0.46)]">{label}</span>
      <span
        className={
          accent
            ? "truncate text-right text-[0.78rem] font-semibold text-[var(--nlc-orange)]"
            : "truncate text-right text-[0.78rem] text-[rgba(247,221,197,0.82)]"
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ================================================================
 *  WorkPanel
 * ================================================================ */

const MAX_VISIBLE_CREW = 5;

export default function WorkPanel({
  coworkers,
  cycleHeartbeatCount,
  districtLabel,
  isOpen,
  objectiveSummary,
  onToggle,
  remoteStatus,
  session,
  username,
}: WorkPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* 点击面板外部关闭 */
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onToggle();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onToggle]);

  const status = statusMap[remoteStatus] ?? statusMap.pending;
  const taskType = session?.task?.type ?? "free";
  const taskTypeLabel = taskType === "free" ? "Free Focus" : taskType.charAt(0).toUpperCase() + taskType.slice(1);

  return (
    <div ref={panelRef} className="pointer-events-auto absolute right-0 top-1/2 z-20 -translate-y-1/2">
      {/* ── 便签 Tab ── */}
      <button
        aria-controls="work-panel-drawer"
        aria-expanded={isOpen}
        aria-label={isOpen ? "收起工作面板" : "展开工作面板"}
        className="absolute right-full top-1/2 z-10 -translate-y-1/2 cursor-pointer"
        onClick={onToggle}
        type="button"
      >
        <div
          className={[
            "flex items-center gap-1 rounded-l-sm border border-r-0 px-2 py-3 transition-all duration-300",
            "border-[rgba(244,164,98,0.28)] bg-[rgba(14,10,8,0.94)] shadow-[-4px_0_16px_rgba(0,0,0,0.3)]",
            isOpen
              ? "border-[rgba(244,164,98,0.42)] bg-[rgba(24,16,10,0.96)]"
              : "hover:border-[rgba(255,157,0,0.42)] hover:bg-[rgba(244,164,98,0.06)]",
          ].join(" ")}
        >
          {/* 竖排文字 */}
          <span
            className="text-[0.6rem] font-bold uppercase tracking-[0.32em] text-[var(--nlc-orange)]"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            WORK
          </span>
          {/* 小圆点指示器：有任务时亮 */}
          {session?.task ? (
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          ) : null}
        </div>
      </button>

      {/* ── 滑出面板 ── */}
      <div
        aria-hidden={!isOpen}
        id="work-panel-drawer"
        className={[
          "overflow-hidden transition-all duration-300 ease-out",
          isOpen ? "w-[17rem] opacity-100" : "w-0 opacity-0",
        ].join(" ")}
      >
        <div className="h-full w-[17rem] rounded-l-sm border border-r-0 border-[rgba(244,164,98,0.24)] bg-[rgba(10,7,5,0.96)] shadow-[-8px_0_32px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          {/* 面板头部 */}
          <div className="border-b border-[rgba(244,164,98,0.16)] px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.24em] text-[var(--nlc-orange)]">
                Work Intel
              </h3>
              <span className={`text-[0.56rem] font-semibold uppercase tracking-[0.16em] ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>

          {/* 面板内容 */}
          <div className="divide-y divide-[rgba(244,164,98,0.1)] px-4">
            <InfoRow label="Captain" value={username} />
            <InfoRow label="Region" value={districtLabel} accent />
            <InfoRow label="Objective" value={objectiveSummary} accent />
            <InfoRow label="Type" value={taskTypeLabel} />
            <InfoRow label="Shift" value={`${cycleHeartbeatCount + 1} / 4`} />
            <InfoRow label="Deployed" value={formatTime(session?.startedAt ?? null)} />
            <InfoRow label="Last Signal" value={formatTime(session?.lastHeartbeatAt ?? null)} />
          </div>

          {/* ── 协作者列表 ── */}
          {session?.task ? (
            <div className="border-t border-[rgba(244,164,98,0.1)] px-4 py-3">
              <h4 className="m-0 mb-2 text-[0.56rem] font-bold uppercase tracking-[0.24em] text-[rgba(244,164,98,0.46)]">
                Crew on Station
              </h4>
              {coworkers.length === 0 ? (
                <p className="m-0 text-[0.6rem] italic text-[rgba(247,221,197,0.3)]">No crew detected</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {coworkers.slice(0, MAX_VISIBLE_CREW).map((c) => (
                    <li key={c.username} className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                      <span className="truncate text-[0.68rem] text-[rgba(247,221,197,0.82)]">{c.username}</span>
                    </li>
                  ))}
                  {coworkers.length > MAX_VISIBLE_CREW ? (
                    <li className="text-[0.56rem] text-[rgba(247,221,197,0.36)]">
                      +{coworkers.length - MAX_VISIBLE_CREW} more
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          ) : null}

          {/* 面板底部装饰 */}
          <div className="mt-3 border-t border-[rgba(244,164,98,0.1)] px-4 py-3">
            <div className="flex items-center gap-2 text-[0.5rem] uppercase tracking-[0.2em] text-[rgba(247,221,197,0.24)]">
              <span className="h-px flex-1 bg-[rgba(244,164,98,0.12)]" />
              <span>Classified</span>
              <span className="h-px flex-1 bg-[rgba(244,164,98,0.12)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
