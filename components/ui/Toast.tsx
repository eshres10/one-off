'use client';

import type { ReactNode } from 'react';

/** Bottom toast that clears the phone tab bar. Render it only while it should be visible. */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-dark fixed inset-x-3 bottom-[calc(var(--tabbar-h)+12px)] z-50 flex min-h-[52px] items-center justify-between gap-4 px-4 text-[13px] md:inset-x-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2"
    >
      {children}
    </div>
  );
}
