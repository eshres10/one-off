'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
 * follow `--header-offset`, which drops to 0 while it's hidden.
 */
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
  const hidden = useHideOnScroll({ disabled: open || focused });
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
        data-hidden={hidden ? '' : undefined}
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
