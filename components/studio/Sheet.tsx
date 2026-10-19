'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '@/components/ui/icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea, select, [tabindex="0"]';

/**
 * A glass side panel on desktop (`side`, 460px) or a centred dialog (`center`), and a bottom
 * sheet on phones. Focus is trapped while open; Esc or the backdrop closes it and focus goes
 * back to whatever opened it. Body scroll is locked meanwhile.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  variant = 'side',
  width = 460,
  testId = 'sheet',
  labelledBy,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'side' | 'center';
  width?: number;
  testId?: string;
  /** Use an existing heading inside `children` as the label instead of `title`. */
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = `${testId}-title`;

  useEffect(() => {
    const el = panel.current;
    const opener = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (x) => x.offsetParent !== null,
      );
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const list = items();
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const position =
    variant === 'side'
      ? 'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[var(--sheet-w)]'
      : 'md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[86vh] md:w-[var(--sheet-w)] md:-translate-x-1/2 md:-translate-y-1/2';

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-testid={testId}>
      <div aria-hidden className="absolute inset-0 bg-[rgba(17,17,17,0.35)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        style={{ ['--sheet-w' as string]: `${width}px` }}
        className={`glass-light absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col bg-[rgb(var(--ground-rgb)/0.94)] ${position}`}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 bg-line-strong md:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-3 md:px-6 md:pt-5">
          <div id={labelledBy ? undefined : titleId} className="min-w-0">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A toast announced to screen readers. */
export function Toast({ message, onDone }: { message: string; onDone?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 4500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return createPortal(
    <div
      role="status"
      data-testid="toast"
      className="glass-dark fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-[90] -translate-x-1/2 px-5 py-3 text-[13px] md:bottom-8"
    >
      {message}
    </div>,
    document.body,
  );
}
