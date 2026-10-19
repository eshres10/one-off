'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useKickHeader } from '@/lib/hooks/useKickHeader';
import { useHideOnScroll } from '@/lib/hooks/useHideOnScroll';
import { useScrolled } from '@/lib/hooks/useScrolled';

export type HeaderVariant = 'auto' | 'overlay' | 'solid';

const MenuState = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

/** Lets the mega menu put the header into its glass state while a panel is open. */
export const useHeaderMenu = () => useContext(MenuState);

/**
 * The fixed site header. Transparent at the top of the page; picks up the frosted `glass-nav`
 * recipe once the page scrolls or a mega-menu panel opens. `overlay` keeps the logo and links
 * white while transparent (for full-bleed heroes); `auto` does the same only when the page
 * renders a `[data-hero]` section, so the server-rendered first paint is already right.
 * It slides away while scrolling down and comes back on the way up; sticky bars below it
 * follow `--header-offset`, which drops to 0 while it's hidden. Two pages differ: on the
 * homepage the content sheet pushes it up as it scrolls into it (useKickHeader), and on
 * Discover it isn't fixed at all (it scrolls off with the page, so the filter bar has the top
 * of the screen).
 */
function scrollModeFor(pathname: string): 'hide' | 'kick' | 'static' {
  if (pathname === '/') return 'kick';
  if (pathname === '/discover') return 'static';
  return 'hide';
}

export function HeaderFrame({
  variant = 'auto',
  children,
}: {
  variant?: HeaderVariant;
  children: ReactNode;
}) {
  const scrolled = useScrolled(8);
  const [open, setOpen] = useState(false);
  const glass = scrolled || open;
  const [focused, setFocused] = useState(false);
  const mode = scrollModeFor(usePathname() ?? '/');
  const ref = useRef<HTMLElement>(null);
  const hideOnScroll = useHideOnScroll({ disabled: open || focused || mode !== 'hide' });
  const kicked = useKickHeader(ref, { enabled: mode === 'kick' && !open && !focused });
  const hidden = hideOnScroll || kicked;
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.setAttribute('data-header-hidden', '');
    else root.removeAttribute('data-header-hidden');
    return () => root.removeAttribute('data-header-hidden');
  }, [hidden]);
  return (
    <MenuState.Provider value={{ open, setOpen }}>
      <header
        className={glass ? 'site-header glass-nav' : 'site-header'}
        data-variant={variant}
        data-scrolled={glass ? '' : undefined}
        data-menu-open={open ? '' : undefined}
        ref={ref}
        // The kicked header is moved by useKickHeader itself, not by [data-hidden].
        data-hidden={hideOnScroll ? '' : undefined}
        data-static={mode === 'static' ? '' : undefined}
        data-testid="site-header"
        // Keyboard users tabbing into the header always see it.
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {children}
      </header>
    </MenuState.Provider>
  );
}
