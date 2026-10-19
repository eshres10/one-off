import { SITE } from '@/lib/site/config';
import type { InstallSituation } from './detect';

export type InstallTrigger = (typeof SITE.install.triggers)[number];

/** Kept in localStorage under KEY. */
export interface InstallState {
  dismissals: number;
  lastDismissedAt: number | null;
  installedAt: number | null;
  /** Last time this device was active here, for "second visit". */
  lastSeenAt: number | null;
  visits: number;
}

/** Kept in sessionStorage (or memory) for this visit. */
export interface SessionState {
  pageViews: number;
  productViews: number;
  shown: boolean;
}

export const KEY = 'oo:install';
export const SESSION_KEY = 'oo:install-session';
const DAY = 86_400_000;

export const EMPTY_STATE: InstallState = {
  dismissals: 0,
  lastDismissedAt: null,
  installedAt: null,
  lastSeenAt: null,
  visits: 0,
};
export const EMPTY_SESSION: SessionState = { pageViews: 0, productViews: 0, shown: false };

/**
 * Storage that never throws: localStorage/sessionStorage when they work, memory when they
 * don't (private mode, blocked storage). With no storage, the sheet shows at most once per
 * session because `shown` lives in memory.
 */
export function makeStore<T>(kind: 'local' | 'session', key: string, empty: T) {
  let memory: T = empty;
  const area = (): Storage | null => {
    try {
      return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    read(): T {
      try {
        const raw = area()?.getItem(key);
        return raw ? { ...empty, ...(JSON.parse(raw) as T) } : memory;
      } catch {
        return memory;
      }
    },
    write(next: T) {
      memory = next;
      try {
        area()?.setItem(key, JSON.stringify(next));
      } catch {
        // Kept in memory instead.
      }
    },
  };
}

export function isNeverPath(path: string): boolean {
  return SITE.install.neverOnPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/** A new visit: no session yet, and the device was last here more than 30 minutes ago. */
export function isSecondVisit(state: InstallState, now: number): boolean {
  return (
    state.visits >= 1 &&
    state.lastSeenAt !== null &&
    now - state.lastSeenAt >= SITE.install.secondVisitAfterMinutes * 60_000
  );
}

export interface ShowInput {
  situation: InstallSituation;
  path: string;
  trigger: InstallTrigger;
  state: InstallState;
  session: SessionState;
  now: number;
  /** Another sheet, modal or drawer is open. */
  overlayOpen: boolean;
}

/** Why the sheet won't show (for tests and debugging), or null when it should. */
export function blockReason(i: ShowInput): string | null {
  const c = SITE.install;
  if (!c.enabled) return 'disabled';
  if (!c.triggers.includes(i.trigger)) return 'trigger off';
  if (i.situation === 'installed' || i.situation === 'unsupported') return i.situation;
  if (i.state.installedAt) return 'installed';
  // The order confirmation lives under /checkout, and is where the order-placed version shows.
  const confirmation = i.trigger === 'order_placed' && i.path.startsWith('/checkout/confirmed');
  if (isNeverPath(i.path) && !confirmation) return 'never path';
  if (i.overlayOpen) return 'overlay open';
  if (i.session.shown) return 'already shown this session';
  if (i.state.dismissals >= c.maxDismissals) return 'dismissed too often';
  if (i.state.lastDismissedAt && i.now - i.state.lastDismissedAt < c.cooldownDays * DAY)
    return 'cooling down';
  // Never unprompted on the very first page of a first visit (a save or an order is a choice).
  const firstLook = i.state.visits <= 1 && i.session.pageViews <= 1;
  if (firstLook && (i.trigger === 'third_product_view' || i.trigger === 'second_visit'))
    return 'first page view';
  return null;
}

export const shouldShow = (i: ShowInput) => blockReason(i) === null;

/** "Not now" (or Escape, the dim, a swipe down): counts towards the cooldown and the cap. */
export function dismissed(state: InstallState, now: number): InstallState {
  return { ...state, dismissals: state.dismissals + 1, lastDismissedAt: now };
}
