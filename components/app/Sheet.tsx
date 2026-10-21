'use client';

import type { ReactNode } from 'react';
import { Drawer } from 'vaul';

/**
 * The phone sheet: drag down or tap the backdrop to close, focus trapped, aria-modal, the page
 * behind it doesn't scroll. At most 90% tall, with a 40×5 grabber and 20px top corners. Desktop
 * keeps its own modals and dropdowns; this is only ever rendered on phones.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  label,
  children,
  footer,
  testId = 'sheet',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible heading. When omitted, `label` names the sheet for assistive tech. */
  title?: ReactNode;
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-[rgba(17,17,17,0.35)]" />
        <Drawer.Content
          data-testid={testId}
          aria-modal="true"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[90dvh] flex-col rounded-t-[var(--r-sheet)] bg-ground outline-none"
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-pill bg-line-strong"
          />
          {title ? (
            <Drawer.Title className="px-5 pb-2 pt-3 font-display text-[26px] leading-none">
              {title}
            </Drawer.Title>
          ) : (
            <Drawer.Title className="sr-only">{label ?? 'Sheet'}</Drawer.Title>
          )}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
            data-scroll-area
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
