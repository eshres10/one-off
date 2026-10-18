'use client';

import type { ReactNode } from 'react';
import { useScrolled } from '@/lib/hooks/useScrolled';

export type HeaderVariant = 'auto' | 'overlay' | 'solid';

/**
 * The fixed site header. Transparent at the top of the page; picks up the frosted `glass-nav`
 * recipe once the page scrolls. `overlay` keeps the logo and links white while transparent (for
 * full-bleed heroes); `auto` does the same only when the page renders a `[data-hero]` section,
 * so the server-rendered first paint is already right.
 */
export function HeaderFrame({
  variant = 'auto',
  children,
}: {
  variant?: HeaderVariant;
  children: ReactNode;
}) {
  const scrolled = useScrolled(8);
  return (
    <header
      className={`site-header${scrolled ? 'glass-nav' : ''}`}
      data-variant={variant}
      data-scrolled={scrolled ? '' : undefined}
      data-testid="site-header"
    >
      {children}
    </header>
  );
}
