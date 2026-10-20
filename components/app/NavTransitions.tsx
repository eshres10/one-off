'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isPhone, navDepth, popScreen, pushScreen, routeSettled, setNavDepth } from '@/lib/app/nav';
import { isPushedScreen } from './tabs';
import { isStandalone } from '@/lib/app/standalone';

/**
 * Three things that make phone navigation feel native, none of which touch the links:
 * 1. in-app links are pushed through a slide transition (and the transition is released as
 *    soon as the new path renders);
 * 2. a depth counter so "back" knows whether there is anything to go back to;
 * 3. in standalone (home screen) mode, a swipe from the left edge of a pushed screen goes back.
 */
export function NavTransitions() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const first = useRef(true);
  const last = useRef(pathname + search);

  useEffect(() => {
    routeSettled();
    const key = pathname + (search ? `?${search}` : '');
    if (first.current) {
      first.current = false;
      setNavDepth(0);
    } else if (key !== last.current && document.documentElement.dataset.navDir !== 'back') {
      setNavDepth(navDepth() + 1);
    } else if (document.documentElement.dataset.navDir === 'back') {
      setNavDepth(navDepth() - 1);
    }
    last.current = key;
    delete document.documentElement.dataset.navDir;
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isPhone() || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition)
        return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      // Hash links and same-page filters scroll or replace: no slide.
      if (url.pathname === location.pathname) return;
      const dir = a.dataset.nav === 'back' ? 'back' : 'push';
      e.preventDefault();
      const href = url.pathname + url.search + url.hash;
      if (dir === 'back') popScreen(router, href);
      else pushScreen(router, href, a.dataset.scroll === 'false' ? { scroll: false } : undefined);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [router]);

  // Edge swipe back: standalone only, pushed screens only, from within 20px of the left edge.
  useEffect(() => {
    if (!isPhone() || !isStandalone()) return;
    if (!isPushedScreen(pathname, search ? `?${search}` : '')) return;
    let startX = -1;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX <= 20 ? t.clientX : -1;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (startX < 0) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      startX = -1;
      if (dx > 60 && dy < 60) popScreen(router, '/');
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [pathname, search, router]);

  return null;
}
