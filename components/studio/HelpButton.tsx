'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { replayTourAction } from '@/lib/actions/tour';

/** The floating ? on every Studio page: replay the tour, guides, or message Off One. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = 'flex min-h-[44px] w-full items-center px-4 text-left text-[13px] hover:bg-stone';
  return (
    <div
      ref={ref}
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-6 md:right-6"
    >
      {open && (
        <div
          id="studio-help-menu"
          role="menu"
          className="absolute bottom-[56px] right-0 w-[220px] border border-line bg-ground py-1 shadow-[0_12px_32px_rgba(17,17,17,0.18)]"
        >
          <form action={replayTourAction} className="hidden md:block">
            <input type="hidden" name="kind" value="studio" />
            <button role="menuitem" className={item} data-testid="help-replay">
              Replay tour
            </button>
          </form>
          <Link role="menuitem" href="/studio/help" className={item} onClick={() => setOpen(false)}>
            Guides
          </Link>
          <Link
            role="menuitem"
            href="/studio/support"
            className={item}
            onClick={() => setOpen(false)}
          >
            Message Off One
          </Link>
        </div>
      )}
      <button
        type="button"
        aria-label="Help"
        aria-expanded={open}
        aria-controls="studio-help-menu"
        onClick={() => setOpen((o) => !o)}
        className="glass-dark flex h-12 w-12 items-center justify-center rounded-circle font-display text-[22px] text-ground"
        data-testid="studio-help"
      >
        ?
      </button>
    </div>
  );
}
