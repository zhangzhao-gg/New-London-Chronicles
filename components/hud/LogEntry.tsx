/**
 * [INPUT]: 城市日志 DTO（用户名、动作描述、时间）与可选 locale
 * [OUTPUT]: HUD 日志条目组件
 * [POS]: 位于 `components/hud/LogEntry.tsx`，被城市页右上日志列表消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/hud/CLAUDE.md` 与上级 `CLAUDE.md`
 */

export type HudLogEntry = {
  id: number | string;
  userLabel: string;
  actionDesc: string;
  createdAt: string;
};

export type LogEntryProps = {
  entry: HudLogEntry;
  locale?: string;
};

function formatTimestamp(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
    hour12: false,
  }).format(date);
}

export function LogEntry({ entry, locale = "zh-CN" }: LogEntryProps) {
  return (
    <article className="nlc-log-entry rounded-r-lg px-4 py-3">
      <div className="mb-1 text-[0.7rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]">
        {formatTimestamp(entry.createdAt, locale)}
      </div>
      <p className="m-0 text-sm leading-6 text-[var(--nlc-text)]">
        <span className="font-semibold text-[var(--nlc-orange)]">{entry.userLabel}</span>
        <span className="mx-1 text-[var(--nlc-muted)]">·</span>
        <span>{entry.actionDesc}</span>
      </p>
    </article>
  );
}

export default LogEntry;
