'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { lastOpener, openerFor, readList } from '@/lib/quickview/state';
import { ChevronIcon, CloseIcon } from '@/components/ui/icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]), textarea, select, [tabindex="0"]';

/**
 * The quick view frame. It lives in the intercepting route's layout, so it stays mounted while
 * ←/→ swap the product inside it. Close (×, Esc, backdrop) goes back in history, which restores
 * the page underneath; focus returns to the card that opened it.
 */
export function QuickViewShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const slug = decodeURIComponent(pathname.split('/')[2] ?? '');
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<string[]>([]);

  useEffect(() => setList(readList()), []);
  const at = list.indexOf(slug);
  const prev = at > 0 ? list[at - 1] : undefined;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : undefined;

  const close = useCallback(() => router.back(), [router]);
  const go = useCallback(
    (s: string | undefined) => s && router.replace(`/products/${s}`, { scroll: false }),
    [router],
  );

  // Scroll lock, first focus, and focus back to the opener when the modal goes away. Arriving
  // any other way than a card click on desktop (a redirect after signing in, a phone) shows
  // the full product page instead.
  useEffect(() => {
    if (!openerFor(slug) || !window.matchMedia('(min-width: 1024px)').matches) {
      window.location.replace(window.location.href);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      const opener = lastOpener();
      requestAnimationFrame(() => opener?.isConnected && opener.focus({ preventScroll: true }));
    };
    // Mount only: the shell outlives prev/next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New product: start at the top of the details column.
  useEffect(() => {
    root.current?.querySelector('[data-qv-scroll]')?.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        const first = items[0];
        const last = items[items.length - 1];
        const inside = root.current?.contains(document.activeElement);
        if (!inside || (e.shiftKey && document.activeElement === first)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el?.closest('[data-qv-gallery]') ||
        el?.matches('input, textarea, select, [contenteditable]')
      )
        return;
      e.preventDefault();
      go(e.key === 'ArrowRight' ? next : prev);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, go, next, prev]);

  return (
    <div ref={root} className="fixed inset-0 z-[80] hidden lg:block" data-quickview-dialog>
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(17,17,17,0.6)] backdrop-blur-[3px]"
        onClick={close}
        data-testid="qv-backdrop"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qv-title"
          tabIndex={-1}
          data-testid="quick-view"
          className="qv-panel pointer-events-auto relative h-[min(800px,90vh)] w-[min(1096px,92vw)] overflow-hidden bg-ground outline-none"
        >
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close quick view"
        data-testid="qv-close"
        className="glass-chip absolute right-5 top-5 flex h-11 w-11 items-center justify-center"
      >
        <CloseIcon width={16} height={16} />
      </button>
      {prev && (
        <button
          type="button"
          onClick={() => go(prev)}
          aria-label="Previous piece"
          data-testid="qv-prev"
          className="glass-chip absolute left-5 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center"
        >
          <ChevronIcon dir="left" width={22} height={22} />
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={() => go(next)}
          aria-label="Next piece"
          data-testid="qv-next"
          className="glass-chip absolute right-5 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center"
        >
          <ChevronIcon width={22} height={22} />
        </button>
      )}
    </div>
  );
}
