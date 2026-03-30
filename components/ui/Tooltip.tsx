/**
 * [INPUT]: Tooltip 文案、触发节点、方向与开关控制 props
 * [OUTPUT]: Hover / focus 可见的提示气泡组件
 * [POS]: 位于 `components/ui/Tooltip.tsx`，供地图热区与 HUD 说明复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/ui/CLAUDE.md` 与上级 `CLAUDE.md`
 */

"use client";

import { useId, useState, type ReactNode } from "react";

export type TooltipSide = "top" | "right" | "bottom" | "left";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
};

const positionClasses: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+0.75rem)] left-1/2 -translate-x-1/2",
  right: "left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2",
  bottom: "left-1/2 top-[calc(100%+0.75rem)] -translate-x-1/2",
  left: "right-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2",
};

const arrowClasses: Record<TooltipSide, string> = {
  top: "left-1/2 top-full -translate-x-1/2 border-x-transparent border-b-transparent border-t-[rgba(32,22,15,0.96)]",
  right: "right-full top-1/2 -translate-y-1/2 border-y-transparent border-l-transparent border-r-[rgba(32,22,15,0.96)]",
  bottom:
    "bottom-full left-1/2 -translate-x-1/2 border-x-transparent border-t-transparent border-b-[rgba(32,22,15,0.96)]",
  left: "left-full top-1/2 -translate-y-1/2 border-y-transparent border-r-transparent border-l-[rgba(32,22,15,0.96)]",
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Tooltip({
  children,
  className,
  content,
  contentClassName,
  disabled = false,
  side = "top",
  style,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  if (disabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      className={joinClasses("relative inline-flex", className)}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={style}
    >
      <span aria-describedby={open ? tooltipId : undefined} className="inline-flex h-full w-full">
        {children}
      </span>
      <span
        aria-hidden={!open}
        className={joinClasses(
          "nlc-tooltip-surface pointer-events-none absolute z-40 max-w-64 rounded-md px-3 py-2 text-xs leading-5 text-[var(--nlc-text)]",
          "transition duration-150 ease-out",
          positionClasses[side],
          open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          contentClassName,
        )}
        id={tooltipId}
        role="tooltip"
      >
        {content}
        <span className={joinClasses("absolute size-0 border-[7px]", arrowClasses[side])} />
      </span>
    </span>
  );
}

export default Tooltip;
