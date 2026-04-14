/**
 * [INPUT]: FocusSession 状态、用户名、区域/任务标签、CoworkerDto（username + startedAt）
 * [OUTPUT]: 右侧滑出电报风格工作面板 + 便签 tab 触发器 + 协作者信号条
 * [POS]: 位于 `components/focus/WorkPanel.tsx`，被 `FocusExperience.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`
 */

"use client";

import { useEffect, useRef, useState } from "react";

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
  pending: { label: "STANDBY", color: "text-[#8a6a20]" },
  active: { label: "IN OPERATION", color: "text-[#1a5a3a]" },
  ended: { label: "ARCHIVED", color: "text-[rgba(26,42,56,0.45)]" },
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
      className="size-5 shrink-0 rounded-sm border border-[rgba(26,42,56,0.25)] object-cover"
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
          className="inline-block size-[3px] rounded-full bg-[#1a5a3a]"
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
      <span className="text-[#1a2a38]">{"█".repeat(filled)}</span>
      <span className="text-[rgba(26,42,56,0.45)]">{"░".repeat(total - filled)}</span>
    </span>
  );
}

/* ── 电报分隔线 ── */
const muted = "text-[rgba(26,42,56,0.55)]";

function TelegramDivider({ label }: { label: string }) {
  return (
    <div className={`flex items-center gap-2.5 py-2.5 font-mono text-[0.64rem] uppercase tracking-[0.18em] ${muted}`}>
      <span className="h-px flex-1 bg-black/10" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

/* ── 电报字段行 ── */
function Field({ tag, children }: { children: React.ReactNode; tag: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-13 shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[rgba(26,42,56,0.45)]">
        {tag}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[#1a2a38]">
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  async function handleTransmit() {
    const text = message.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) setMessage("");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

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
          isOpen ? "w-[17rem] opacity-100" : "w-0 opacity-0",
        ].join(" ")}
      >
        <div className="flex w-[17rem]">
          {/* ── 3D 厚度边栏 ── */}
          <div className="w-2 shrink-0 rounded-l-sm bg-gradient-to-b from-[#1a1410] via-[#3d2b1d] to-[#1a1410] shadow-[-2px_0_5px_rgba(0,0,0,0.5)]" />

        <div className="comms-panel relative min-w-0 flex-1 overflow-hidden">
          {/* 四角铆钉 */}
          <div className="comms-fastener left-1 top-1" />
          <div className="comms-fastener right-1 top-1" />
          <div className="comms-fastener bottom-1 left-1" />
          <div className="comms-fastener bottom-1 right-1" />

          <div className="relative z-10 flex flex-col">

            {/* ── 状态栏头 ── */}
            <div className="flex items-center justify-between border-b border-[rgba(244,164,98,0.2)] bg-black/40 px-3 py-3.5">
              <span className="text-[8px] font-black uppercase tracking-[0.22em] text-[rgba(244,164,98,0.8)]">
                Automated Dispatch Log
              </span>
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
                <span className="font-mono text-[7px] uppercase text-emerald-500/60">Recording...</span>
              </div>
            </div>

            {/* ── 打字机机构 ── */}
            <div className="comms-typewriter relative flex h-7 items-center justify-center px-3">
              <div className="h-px w-full bg-[rgba(244,164,98,0.15)]" />
              <div className="absolute flex items-center justify-center rounded-sm border border-[rgba(244,164,98,0.2)] bg-[#1a1410] px-2 py-0.5">
                <span className="font-mono text-[5px] uppercase text-[rgba(244,164,98,0.4)]">Calibrating</span>
              </div>
            </div>

            {/* ── 电子屏主体 ── */}
            <div className="comms-screen relative mx-1">

              {/* ── 电报头 ── */}
              <div className="relative z-[2] px-4 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="m-0 font-mono text-[0.72rem] font-bold uppercase tracking-[0.24em] text-[#1a2a38]">
                    Work Intel
                  </h3>
                  <span className={`font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] ${status.color}`}>
                    ◈ {status.label}
                  </span>
                </div>
                <div className="mt-1.5 h-px bg-black/15" />
              </div>

              {/* ── Dispatch 摘要 ── */}
              <div className="relative z-[2] px-4 pb-3">
                <div className={`mb-1.5 font-mono text-[0.54rem] uppercase tracking-[0.14em] ${muted}`}>
                  Dispatch — Unit 0924
                </div>
                <Field tag="FROM">CPT {username}</Field>
                <Field tag="RE">
                  <span className="font-semibold text-[#1a2a38]">{objectiveSummary}</span>
                </Field>
                {session?.task ? <Field tag="ZONE">{districtLabel}</Field> : null}
              </div>

              {/* ── Crew Signals ── */}
              {coworkers.length > 0 ? (
                <div className="relative z-[2] mx-2 rounded-sm bg-[rgba(26,42,56,0.06)] px-2.5 py-2.5 border border-[rgba(26,42,56,0.10)]">
                  <div className="mb-1.5 font-mono text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-[#1a2a38]">
                    Crew Signals
                  </div>
                  <ul className="m-0 flex max-h-36 list-none flex-col gap-2 overflow-y-auto p-0 scrollbar-none">
                    {coworkers.map((c) => {
                      const level = signalLevel(c.startedAt);
                      return (
                        <li key={c.username} className="flex items-start gap-2">
                          <CrewAvatar />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-[#1a2a38]">
                                {c.username}
                              </span>
                              <BlockBar total={SIGNAL_TOTAL} filled={level} />
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <PulseDots />
                              <span className="font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[rgba(26,90,58,0.65)]">
                                {signalLabel(level)}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="relative z-[2] mx-2 rounded-sm bg-[rgba(26,42,56,0.06)] px-2.5 py-2.5 border border-[rgba(26,42,56,0.10)]">
                  <div className="mb-1 font-mono text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-[#1a2a38]">
                    Crew Signals
                  </div>
                  <p className={`m-0 font-mono text-[0.58rem] italic ${muted}`}>No crew detected</p>
                </div>
              )}

              {/* ── 元数据脚注 ── */}
              <div className="relative z-[2] flex items-center gap-3 px-4 py-3.5 font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[rgba(26,42,56,0.58)]">
                <span>
                  <BlockBar total={SHIFT_TOTAL} filled={shiftNum} />
                  <span className="ml-1">{shiftNum}/{SHIFT_TOTAL}</span>
                </span>
                <span className="h-2.5 w-px bg-black/10" />
                <span>{formatTime(session?.startedAt ?? null)} dep</span>
                <span className="h-2.5 w-px bg-black/10" />
                <span>{formatTime(session?.lastHeartbeatAt ?? null)} sig</span>
              </div>

            </div>{/* /comms-screen */}

            {/* ── 底部发报区 ── */}
            <div className="space-y-1.5 border-t border-[rgba(244,164,98,0.2)] bg-[rgba(26,20,16,0.8)] px-2.5 py-3">
              <div className="flex items-center gap-2">
                {/* 旋钮装饰 */}
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <span className="text-[5px] font-black uppercase text-[rgba(244,164,98,0.4)]">Freq</span>
                  <div
                    className="relative h-6 w-6 cursor-default rounded-full border border-[#2a1f18]"
                    style={{ background: "conic-gradient(from 0deg, #1a1410, #3d2b1d, #1a1410, #3d2b1d, #1a1410)" }}
                  >
                    <div className="absolute left-1/2 top-0.5 h-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--nlc-orange)] shadow-[0_0_4px_rgba(244,164,98,0.8)]" />
                  </div>
                </div>

                {/* 输入 + 发送 */}
                <form
                  className="flex flex-1 flex-col gap-1"
                  onSubmit={(e) => { e.preventDefault(); void handleTransmit(); }}
                >
                  <input
                    ref={inputRef}
                    className="w-full rounded-sm border border-[rgba(244,164,98,0.2)] bg-black/40 px-1.5 py-0.5 font-mono text-[8px] text-[var(--nlc-orange)] placeholder:text-[rgba(244,164,98,0.2)] focus:outline-none focus:ring-1 focus:ring-[rgba(244,164,98,0.4)]"
                    maxLength={200}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="type telegram..."
                    value={message}
                  />
                  <button
                    className="flex w-full items-center justify-center gap-1 rounded-sm border border-[rgba(244,164,98,0.3)] bg-[rgba(244,164,98,0.1)] py-0.5 font-mono text-[7px] font-bold uppercase tracking-[0.08em] text-[var(--nlc-orange)] transition-all hover:bg-[rgba(244,164,98,0.2)] disabled:opacity-40"
                    disabled={!message.trim() || isSending}
                    type="submit"
                  >
                    <svg aria-hidden="true" className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M22 2 11 13" />
                      <path d="M22 2 15 22 11 13 2 9 22 2Z" />
                    </svg>
                    {isSending ? "Sending..." : "Transmit"}
                  </button>
                </form>
              </div>
            </div>

          </div>{/* /z-10 flex col */}
        </div>{/* /comms-panel */}
        </div>{/* /flex 3d wrapper */}
      </div>
    </div>
  );
}
