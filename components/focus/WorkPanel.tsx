/**
 * [INPUT]: FocusSession 状态、用户名、区域/任务标签、CoworkerDto（username + startedAt）
 * [OUTPUT]: 右侧滑出电报风格工作面板 + 便签 tab 触发器 + 协作者信号条
 * [POS]: 位于 `components/focus/WorkPanel.tsx`，被 `FocusExperience.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`
 */

"use client";

import { useEffect, useRef } from "react";

import type { FocusSession, FocusSessionStatus } from "@/hooks/use-heartbeat";

/* ================================================================
 *  Types
 * ================================================================ */

type CoworkerDto = { username: string; startedAt: string | null };

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
  pending: { label: "STANDBY", color: "text-amber-400" },
  active: { label: "IN OPERATION", color: "text-emerald-400" },
  ended: { label: "ARCHIVED", color: "text-[var(--nlc-muted)]" },
};

function formatTime(iso: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ── 协作者头像 ── */
function CrewAvatar() {
  return (
    <img
      alt=""
      className="size-5 shrink-0 rounded-sm border border-[rgba(244,164,98,0.3)] object-cover"
      src="/images/admin-avatar.jpg"
    />
  );
}

/* ── 脉冲状态指示器：三点交替闪烁 ── */
function PulseDots() {
  return (
    <span className="inline-flex gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-[3px] rounded-full bg-emerald-400"
          style={{
            animation: "nlc-dot-blink 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

/* ── 信号强度：startedAt → 5 档 ── */
const SIGNAL_THRESHOLDS = [10, 30, 60, 120] as const;
const SIGNAL_TOTAL = 5;

const SIGNAL_LABELS = ["warming up", "focusing", "in the zone", "deep work", "iron will"] as const;

function signalLevel(startedAt: string | null): number {
  if (!startedAt) return 1;
  const minutes = (Date.now() - new Date(startedAt).getTime()) / 60_000;
  let level = 1;
  for (const threshold of SIGNAL_THRESHOLDS) {
    if (minutes >= threshold) level++;
  }
  return level;
}

function signalLabel(level: number): string {
  return SIGNAL_LABELS[level - 1] ?? SIGNAL_LABELS[0];
}

/* ── 方块条渲染器：通用于信号 & shift 进度 ── */
function BlockBar({ total, filled }: { filled: number; total: number }) {
  return (
    <span className="font-mono text-[0.72rem] tracking-[0.06em]">
      <span className="text-[var(--nlc-orange)]">{"█".repeat(filled)}</span>
      <span className="text-[rgba(244,164,98,0.50)]">{"░".repeat(total - filled)}</span>
    </span>
  );
}

/* ── 电报分隔线 ── */
const muted = "text-[rgba(244,164,98,0.22)]";

function TelegramDivider({ label }: { label: string }) {
  return (
    <div className={`flex items-center gap-2.5 py-2.5 font-mono text-[0.64rem] uppercase tracking-[0.18em] ${muted}`}>
      <span className="h-px flex-1 bg-[rgba(244,164,98,0.12)]" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-[rgba(244,164,98,0.12)]" />
    </div>
  );
}

/* ── 电报字段行 ── */
function Field({ tag, children }: { children: React.ReactNode; tag: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-13 shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[rgba(244,164,98,0.42)]">
        {tag}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[rgba(247,221,197,0.86)]">
        {children}
      </span>
    </div>
  );
}

/* ================================================================
 *  WorkPanel
 * ================================================================ */

const SHIFT_TOTAL = 4;

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
  const shiftNum = Math.min(cycleHeartbeatCount + 1, SHIFT_TOTAL);

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
            "flex items-center gap-1.5 rounded-l-sm border border-r-0 px-2.5 py-4 transition-all duration-300",
            "border-[rgba(244,164,98,0.28)] bg-[rgba(14,10,8,0.94)] shadow-[-4px_0_16px_rgba(0,0,0,0.3)]",
            isOpen
              ? "border-[rgba(244,164,98,0.42)] bg-[rgba(24,16,10,0.96)]"
              : "hover:border-[rgba(255,157,0,0.42)] hover:bg-[rgba(244,164,98,0.06)]",
          ].join(" ")}
        >
          <span
            className="text-[0.72rem] font-bold uppercase tracking-[0.32em] text-[var(--nlc-orange)]"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            WORK
          </span>
          {session?.task ? (
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          ) : null}
        </div>
      </button>

      {/* ── 滑出面板 ── */}
      <div
        aria-hidden={!isOpen}
        id="work-panel-drawer"
        className={[
          "overflow-hidden transition-all duration-300 ease-out",
          isOpen ? "w-[20rem] opacity-100" : "w-0 opacity-0",
        ].join(" ")}
      >
        <div className="h-full w-[20rem] rounded-l-sm border border-r-0 border-[rgba(244,164,98,0.24)] bg-[rgba(10,7,5,0.96)] shadow-[-8px_0_32px_rgba(0,0,0,0.4)] backdrop-blur-sm">

          {/* ── 电报头 ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <h3 className="m-0 font-mono text-[0.78rem] font-bold uppercase tracking-[0.28em] text-[var(--nlc-orange)]">
                Work Intel
              </h3>
              <span className={`font-mono text-[0.64rem] font-semibold uppercase tracking-[0.14em] ${status.color}`}>
                ◈ {status.label}
              </span>
            </div>
            <div className="mt-1.5 h-px bg-[rgba(244,164,98,0.24)]" />
            <div className="mt-px h-px bg-[rgba(244,164,98,0.12)]" />
          </div>

          {/* ── 区1：Dispatch 摘要（紧凑低调） ── */}
          <div className="px-5 pb-3">
            <div className={`mb-2 font-mono text-[0.58rem] uppercase tracking-[0.16em] ${muted}`}>
              Dispatch — Unit 0924
            </div>
            <Field tag="FROM">CPT {username}</Field>
            <Field tag="RE">
              <span className="font-semibold text-[var(--nlc-orange)]">{objectiveSummary}</span>
            </Field>
            {session?.task ? <Field tag="ZONE">{districtLabel}</Field> : null}
          </div>

          {/* ── 区2：Crew Signals（视觉主角，底色升格） ── */}
          {session?.task && coworkers.length > 0 ? (
            <div className="mx-3 rounded-sm bg-[rgba(244,164,98,0.03)] px-3 py-3 border border-[rgba(244,164,98,0.08)]">
              <div className={`mb-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--nlc-orange)]`}>
                Crew Signals
              </div>
              <ul className="m-0 flex max-h-44 list-none flex-col gap-2.5 overflow-y-auto p-0 scrollbar-none">
                {coworkers.map((c) => {
                  const level = signalLevel(c.startedAt);
                  return (
                    <li key={c.username} className="flex items-start gap-2.5">
                      <CrewAvatar />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-[0.74rem] text-[rgba(247,221,197,0.82)]">
                            {c.username}
                          </span>
                          <BlockBar total={SIGNAL_TOTAL} filled={level} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <PulseDots />
                          <span className="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-emerald-400/60">
                            {signalLabel(level)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : session?.task ? (
            <div className="mx-3 rounded-sm bg-[rgba(244,164,98,0.03)] px-3 py-3 border border-[rgba(244,164,98,0.08)]">
              <div className={`mb-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--nlc-orange)]`}>
                Crew Signals
              </div>
              <p className={`m-0 font-mono text-[0.62rem] italic ${muted}`}>No crew detected</p>
            </div>
          ) : null}

          {/* ── 区3：元数据脚注（最低调） ── */}
          <div className="flex items-center gap-4 px-5 py-3 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[rgba(247,221,197,0.32)]">
            <span>
              <BlockBar total={SHIFT_TOTAL} filled={shiftNum} />
              <span className="ml-1.5">{shiftNum}/{SHIFT_TOTAL}</span>
            </span>
            <span className="h-2.5 w-px bg-[rgba(244,164,98,0.12)]" />
            <span>{formatTime(session?.startedAt ?? null)} dep</span>
            <span className="h-2.5 w-px bg-[rgba(244,164,98,0.12)]" />
            <span>{formatTime(session?.lastHeartbeatAt ?? null)} sig</span>
          </div>

          {/* ── 电报尾 ── */}
          <div className="px-5 pb-4">
            <div className="h-px bg-[rgba(244,164,98,0.12)]" />
            <div className="mt-px h-px bg-[rgba(244,164,98,0.24)]" />
            <div className={`mt-2 text-center font-mono text-[0.5rem] uppercase tracking-[0.24em] ${muted}`}>
              End Dispatch
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
