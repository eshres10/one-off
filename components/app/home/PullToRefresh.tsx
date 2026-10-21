'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Pull down from the top of the screen to refresh (touch only). */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      setPull(dy > 0 ? Math.min(90, dy * 0.5) : 0);
    };
    const onEnd = () => {
      if (startY.current !== null && pull >= 60) {
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 900);
      }
      startY.current = null;
      setPull(0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [pull, router]);
  return (
    <div data-testid="pull-to-refresh">
      <div
        aria-hidden={!busy}
        role="status"
        className="flex items-center justify-center overflow-hidden text-[11px] uppercase tracking-label text-muted-2 transition-[height]"
        style={{ height: busy ? 32 : pull > 10 ? pull / 2 : 0 }}
      >
        {busy ? 'Refreshing…' : pull >= 60 ? 'Release to refresh' : ''}
      </div>
      {children}
    </div>
  );
}
