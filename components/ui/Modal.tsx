/**
 * [INPUT]: 受控开关、标题文案、描述文案、内容节点与关闭回调
 * [OUTPUT]: 通用弹窗容器，提供遮罩、Esc 关闭、焦点约束与结构化布局
 * [POS]: 位于 `components/ui/Modal.tsx`，供区块详情、设置面板等浮层复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/ui/CLAUDE.md` 与上级 `CLAUDE.md`
 */

"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";
import { joinClasses } from "@/lib/utils";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export type ModalProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  size?: ModalSize;
  dismissOnBackdrop?: boolean;
  panelClassName?: string;
};

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"),
  );
}

export function Modal({
  children,
  closeLabel = "关闭弹窗",
  description,
  dismissOnBackdrop = true,
  footer,
  onClose,
  open,
  panelClassName,
  size = "md",
  title,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = getFocusableElements(dialog);
      (focusableElements[0] ?? dialog).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden={!open}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="presentation"
    >
      {dismissOnBackdrop ? (
        <button aria-label={closeLabel} className="nlc-modal-backdrop absolute inset-0" onClick={onClose} type="button" />
      ) : (
        <div aria-hidden="true" className="nlc-modal-backdrop absolute inset-0" />
      )}
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={joinClasses(
          "nlc-panel nlc-inset nlc-etched relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border text-left",
          "max-h-[calc(100vh-3rem)]",
          sizeClasses[size],
          panelClassName,
        )}
        onKeyDown={handleKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[rgba(244,164,98,0.14)] px-6 py-5">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-[var(--nlc-muted)]" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <Button aria-label={closeLabel} size="icon" variant="ghost" onClick={onClose}>
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none px-6 py-5">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-[rgba(244,164,98,0.14)] px-6 py-4">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export default Modal;
