/**
 * [INPUT]: 依赖 `lib/i18n` 的 t / Locale，消费 CitySnapshot.logs 数据，POST /api/logs 发送电报
 * [OUTPUT]: 对外提供 CommsPanel 电报通讯屏组件
 * [POS]: components/city 的日志展示器，被 CityPageShell 侧边栏消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/city/CLAUDE.md`
 */

"use client";

import { useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

/* ── 时间戳格式化 ── */

function formatLogTimestamp(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/* ── Types ── */

type LogEntry = {
  id: number | string;
  userLabel: string;
  actionDesc: string;
  createdAt: string;
};

type CommsPanelProps = {
  logs: LogEntry[];
  locale: Locale;
  language: string;
  onDispatchSent?: () => void;
};

/* ── Component ── */

export function CommsPanel({ logs, locale, language, onDispatchSent }: CommsPanelProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (res.ok) {
        setMessage("");
        onDispatchSent?.();
      }
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="comms-panel relative overflow-hidden rounded-sm">
      {/* 四角铆钉 */}
      <div className="comms-fastener left-1 top-1" />
      <div className="comms-fastener right-1 top-1" />
      <div className="comms-fastener bottom-1 left-1" />
      <div className="comms-fastener bottom-1 right-1" />

      {/* 状态栏 */}
      <div className="relative z-10 flex items-center justify-between bg-black/40 px-3 py-2">
        <span className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--nlc-orange)]/80">
          {t("sidebar.cityLog", locale)}
        </span>
        <div className="flex items-center gap-1">
          <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
          <span className="font-mono text-[7px] uppercase text-emerald-500/60">Live</span>
        </div>
      </div>

      {/* 打字机机构 */}
      <div className="comms-typewriter relative z-10 flex h-5 items-center justify-center px-3">
        <div className="h-px w-full bg-[rgba(244,164,98,0.15)]" />
        <div className="absolute flex items-center justify-center rounded-sm border border-[rgba(244,164,98,0.2)] bg-[#1a1410] px-2 py-0.5">
          <span className="font-mono text-[5px] uppercase text-[var(--nlc-orange)]/40">Transmitting</span>
        </div>
      </div>

      {/* 电子屏 */}
      <div className="comms-screen relative z-10 mx-1">
        <div className="comms-ticker-fade relative z-[2] max-h-48 overflow-y-auto scrollbar-none p-2.5 lg:max-h-[240px]">
          {logs.length ? (
            <div className="flex flex-col-reverse">
              <div className="space-y-3">
                {logs.slice(0, 8).map((entry, i) => (
                  <div
                    className="border-b border-black/10 pb-2"
                    key={entry.id}
                    style={{ opacity: Math.max(0.25, 1 - i * 0.12) }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-[8px] font-black uppercase tracking-tight opacity-50">
                        #{String(entry.id).slice(-3)}_DISPATCH
                      </span>
                      <span className="font-mono text-[8px] font-bold opacity-50">
                        {formatLogTimestamp(entry.createdAt, language)}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 font-mono text-[11px] font-bold uppercase leading-tight">
                      <span className="font-black opacity-80">{entry.userLabel}</span>
                      <span className="mx-1 opacity-30">—</span>
                      <span className="font-semibold">{entry.actionDesc}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="m-0 text-center font-mono text-[9px] uppercase opacity-40">
              {t("sidebar.telemetrySync", locale)}
            </p>
          )}
        </div>
      </div>

      {/* 底部发报区 */}
      <div className="relative z-10 space-y-1.5 border-t border-[rgba(244,164,98,0.2)] bg-[rgba(26,20,16,0.8)] px-2.5 py-2">
        <div className="flex items-center gap-2">
          {/* 旋钮装饰 */}
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="text-[5px] font-black uppercase text-[var(--nlc-orange)]/40">Freq</span>
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
            onSubmit={(e) => { e.preventDefault(); handleTransmit(); }}
          >
            <input
              ref={inputRef}
              className="w-full rounded-sm border border-[rgba(244,164,98,0.2)] bg-black/40 px-1.5 py-0.5 font-mono text-[8px] text-[var(--nlc-orange)] placeholder:text-[var(--nlc-orange)]/20 focus:outline-none focus:ring-1 focus:ring-[rgba(244,164,98,0.4)]"
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
    </div>
  );
}
