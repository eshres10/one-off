/** Class strings shared by server and client components (no 'use client' here on purpose). */
export const appButtonLinkClass = (variant: 'ink' | 'outline' = 'ink', extra = '') =>
  `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-app px-5 text-[12px] uppercase tracking-[0.16em] ${variant === 'ink' ? 'bg-ink text-ground' : 'border border-ink text-ink'} ${extra}`;
