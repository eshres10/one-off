'use client';

/**
 * Phone navigation: pushes slide in from the right and backs slide out, through the View
 * Transitions API where the browser has it (nothing elsewhere, and nothing with reduced
 * motion). The transition waits for the new pathname to render, see NavTransitions.
 */
type Dir = 'push' | 'back';

let resolvePending: (() => void) | null = null;
let pendingTimer: number | null = null;

const DEPTH_KEY = 'oo.nav.depth';

export const isPhone = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How many in-app navigations deep this session is (0 on a fresh load). */
export function navDepth(): number {
  try {
    return Number(sessionStorage.getItem(DEPTH_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export function setNavDepth(n: number) {
  try {
    sessionStorage.setItem(DEPTH_KEY, String(Math.max(0, n)));
  } catch {
    // Private mode: back falls back to the tab root.
  }
}

/** Called by NavTransitions once the pathname has changed: lets the transition finish. */
export function routeSettled() {
  if (resolvePending) {
    resolvePending();
    resolvePending = null;
  }
  if (pendingTimer) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

type Doc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown };

/** Runs `go` inside a slide transition on phones; plain navigation everywhere else. */
export function withTransition(dir: Dir, go: () => void) {
  const doc = document as Doc;
  if (!isPhone() || reducedMotion() || typeof doc.startViewTransition !== 'function') {
    go();
    return;
  }
  routeSettled();
  document.documentElement.dataset.navDir = dir;
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        resolvePending = resolve;
        // A navigation that never lands (same URL, say) mustn't freeze the page.
        pendingTimer = window.setTimeout(routeSettled, 700);
        go();
      }),
  );
}

export interface RouterLike {
  push: (href: string, opts?: { scroll?: boolean }) => void;
  back: () => void;
}

export function pushScreen(router: RouterLike, href: string, opts?: { scroll?: boolean }) {
  withTransition('push', () => router.push(href, opts));
}

/** Back, or the fallback when this is the first screen of the session. */
export function popScreen(router: RouterLike, fallback = '/') {
  if (navDepth() > 0) withTransition('back', () => router.back());
  else withTransition('back', () => router.push(fallback));
}
