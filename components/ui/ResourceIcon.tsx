/**
 * [INPUT]: 资源类型、尺寸与标签展示参数
 * [OUTPUT]: 统一资源图标组件，可作为 HUD 与任务面板的资源语义入口
 * [POS]: 位于 `components/ui/ResourceIcon.tsx`，供顶部资源栏、任务收益说明等位置复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/ui/CLAUDE.md` 与上级 `CLAUDE.md`
 */

import type { HTMLAttributes, ReactNode } from "react";

import { joinClasses } from "@/lib/utils";

export type ResourceKind = "coal" | "wood" | "steel" | "rawFood" | "foodSupply" | "steamCore" | "temperature";
export type ResourceIconSize = "sm" | "md" | "lg";

export type ResourceIconProps = HTMLAttributes<HTMLSpanElement> & {
  resource: ResourceKind;
  size?: ResourceIconSize;
  showLabel?: boolean;
  label?: string;
  amount?: number | string;
};

const sizeClasses: Record<ResourceIconSize, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
};

const resourceLabels: Record<ResourceKind, string> = {
  coal: "煤炭",
  wood: "木材",
  steel: "钢材",
  rawFood: "生食材",
  foodSupply: "食物补给",
  steamCore: "蒸汽核心",
  temperature: "温度",
};

function renderIcon(resource: ResourceKind): ReactNode {
  const iconClassName = "size-[65%] text-current";

  switch (resource) {
    case "coal":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <path d="M6 14.5L11.5 5L18 9.5L16 18L7.5 19L4.5 16Z" fill="currentColor" opacity="0.86" />
          <path d="M10 8L14.5 10.25M8.5 15L14.5 10.25M14.5 10.25L15.5 16" stroke="#221810" strokeWidth="1.25" />
        </svg>
      );
    case "wood":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <rect x="6" y="5" width="5" height="14" rx="2.5" fill="currentColor" opacity="0.9" />
          <rect x="13" y="5" width="5" height="14" rx="2.5" fill="currentColor" opacity="0.62" />
          <path d="M8.5 8.5C9.7 9.5 9.7 11 8.5 12M15.5 8.5C16.7 9.5 16.7 11 15.5 12" stroke="#221810" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "steel":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <path d="M12 3L19 7V17L12 21L5 17V7L12 3Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.5L15.75 9.75V14.25L12 16.5L8.25 14.25V9.75L12 7.5Z" fill="currentColor" opacity="0.75" />
        </svg>
      );
    case "rawFood":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <path d="M8.5 12.5C8.5 8.4 11.1 5.2 15.5 4.5C17.3 8.9 16.9 13.4 13.75 17.25C10.8 16.85 8.5 15.1 8.5 12.5Z" fill="currentColor" opacity="0.85" />
          <path d="M10 18.5C11.5 16.25 13 14.1 16.5 10.5" stroke="#221810" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "foodSupply":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <path d="M7 11C7 8.4 9.2 6.25 12 6.25C14.8 6.25 17 8.4 17 11C17 14.4 14.85 18.25 12 18.25C9.15 18.25 7 14.4 7 11Z" fill="currentColor" opacity="0.86" />
          <path d="M10.25 7.5L12 5.25L13.75 7.5" stroke="#221810" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "steamCore":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" opacity="0.88" />
          <path d="M12 3.5V6M12 18V20.5M20.5 12H18M6 12H3.5M17.75 6.25L16 8M8 16L6.25 17.75M17.75 17.75L16 16M8 8L6.25 6.25" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        </svg>
      );
    case "temperature":
      return (
        <svg aria-hidden="true" className={iconClassName} viewBox="0 0 24 24" fill="none">
          <path d="M12 4.75C10.62 4.75 9.5 5.87 9.5 7.25V13.25C8.58 13.96 8 15.07 8 16.3C8 18.56 9.84 20.4 12.1 20.4C14.36 20.4 16.2 18.56 16.2 16.3C16.2 15.07 15.62 13.96 14.7 13.25V7.25C14.7 5.87 13.58 4.75 12 4.75Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.1 12V16.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12.1" cy="16.9" r="1.75" fill="currentColor" />
        </svg>
      );
  }
}

export function ResourceIcon({
  amount,
  className,
  label,
  resource,
  showLabel = false,
  size = "md",
  ...props
}: ResourceIconProps) {
  const resolvedLabel = label ?? resourceLabels[resource];
  const withText = showLabel || amount !== undefined;

  return (
    <span
      aria-label={!withText ? resolvedLabel : undefined}
      className={joinClasses("inline-flex items-center gap-2", className)}
      role={!withText ? "img" : undefined}
      {...props}
    >
      <span
        aria-hidden="true"
        className={joinClasses(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-[rgba(244,164,98,0.18)]",
          "bg-[rgba(255,255,255,0.04)] text-[var(--nlc-orange)]",
          sizeClasses[size],
        )}
      >
        {renderIcon(resource)}
      </span>
      {withText ? (
        <span className="inline-flex items-baseline gap-1 text-sm text-[var(--nlc-text)]">
          <span>{resolvedLabel}</span>
          {amount !== undefined ? <span className="text-[var(--nlc-orange)]">{amount}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export default ResourceIcon;
