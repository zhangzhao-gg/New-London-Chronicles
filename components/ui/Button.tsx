/**
 * [INPUT]: M06 设计 token、按钮变体与纯表现 props
 * [OUTPUT]: 冰汽时代风格按钮组件
 * [POS]: 位于 `components/ui/Button.tsx`，被页面层、Modal 与其他共享组件消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/ui/CLAUDE.md` 与上级 `CLAUDE.md`
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "tab";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-2 text-[0.68rem]",
  md: "min-h-11 px-4 py-2.5 text-[0.74rem]",
  lg: "min-h-12 px-5 py-3 text-[0.82rem]",
  icon: "size-10 p-0",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "nlc-button-base nlc-button-primary",
  secondary: "nlc-button-base nlc-button-secondary",
  ghost: "nlc-button-base nlc-button-ghost",
  tab: "nlc-button-base nlc-button-tab",
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    fullWidth = false,
    leadingIcon,
    size = "md",
    trailingIcon,
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  const isActiveTab = variant === "tab" && (props["aria-pressed"] === true || props["aria-selected"] === true);

  return (
    <button
      ref={ref}
      className={joinClasses(
        "inline-flex items-center justify-center gap-2 rounded-md border font-semibold tracking-[0.22em]",
        "focus-visible:outline-none disabled:pointer-events-none",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
      data-active={isActiveTab ? "true" : "false"}
      type={type}
      {...props}
    >
      {leadingIcon ? <span className="shrink-0 text-current">{leadingIcon}</span> : null}
      {children ? <span className="leading-none">{children}</span> : null}
      {trailingIcon ? <span className="shrink-0 text-current">{trailingIcon}</span> : null}
    </button>
  );
});

Button.displayName = "Button";

export default Button;
