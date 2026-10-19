import { afterEach, describe, expect, it } from 'vitest';
import { detectInstall, iosShareAt, inAppName, type DetectInput } from '@/lib/install/detect';
import {
  EMPTY_SESSION,
  EMPTY_STATE,
  blockReason,
  dismissed,
  isSecondVisit,
  makeStore,
  type ShowInput,
} from '@/lib/install/rules';
import { dropAlertPayload, isPushEndpoint } from '@/lib/services/push';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0',
  facebook:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/470.0]',
  tiktok: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile musical_ly_2023',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

const det = (ua: string, over: Partial<DetectInput> = {}) =>
  detectInstall({ ua, standalone: false, maxTouchPoints: 0, hasInstallPrompt: false, ...over });

describe('install detection (test 6)', () => {
  it('iOS in any browser, including iPadOS reporting as a Mac with touch', () => {
    expect(det(UA.iphoneSafari, { maxTouchPoints: 5 })).toBe('ios');
    expect(det(UA.iphoneChrome, { maxTouchPoints: 5 })).toBe('ios');
    expect(det(UA.ipadOs, { maxTouchPoints: 5 })).toBe('ios');
    expect(det(UA.ipadOs, { maxTouchPoints: 0 })).toBe('unsupported');
  });

  it('points at Share in the bottom bar in Safari, top right in iOS Chrome', () => {
    expect(iosShareAt(UA.iphoneSafari)).toBe('bottom');
    expect(iosShareAt(UA.iphoneChrome)).toBe('top-right');
  });

  it('in-app browsers win over iOS and Android, with their name', () => {
    expect(det(UA.instagram, { maxTouchPoints: 5 })).toBe('in-app');
    expect(det(UA.facebook, { hasInstallPrompt: true })).toBe('in-app');
    expect(det(UA.tiktok)).toBe('in-app');
    expect(inAppName(UA.instagram)).toBe('Instagram');
    expect(inAppName(UA.facebook)).toBe('Facebook');
    expect(inAppName(UA.android)).toBeNull();
  });

  it('Android only with a captured install prompt', () => {
    expect(det(UA.android, { hasInstallPrompt: true })).toBe('android');
    expect(det(UA.android)).toBe('unsupported');
  });

  it('desktop is unsupported, even with an install prompt; standalone is installed', () => {
    expect(det(UA.desktopChrome, { hasInstallPrompt: true })).toBe('unsupported');
    expect(det(UA.iphoneSafari, { standalone: true })).toBe('installed');
    expect(det(UA.instagram, { standalone: true })).toBe('installed');
  });
});

const NOW = Date.UTC(2026, 9, 19, 2);
const DAY = 86_400_000;
const input = (over: Partial<ShowInput> = {}): ShowInput => ({
  situation: 'ios',
  path: '/discover',
  trigger: 'saved_piece',
  state: { ...EMPTY_STATE, visits: 1 },
  session: { ...EMPTY_SESSION, pageViews: 1 },
  now: NOW,
  overlayOpen: false,
  ...over,
});

describe('when the sheet shows', () => {
  it('never on desktop, unsupported or installed (test 1)', () => {
    expect(blockReason(input({ situation: 'unsupported' }))).toBe('unsupported');
    expect(blockReason(input({ situation: 'installed' }))).toBe('installed');
    expect(
      blockReason(input({ state: { ...EMPTY_STATE, visits: 1, installedAt: NOW - DAY } })),
    ).toBe('installed');
  });

  it('first page of a first visit: nothing unprompted, but a save shows it (test 2)', () => {
    expect(blockReason(input({ trigger: 'third_product_view' }))).toBe('first page view');
    expect(blockReason(input({ trigger: 'second_visit' }))).toBe('first page view');
    expect(blockReason(input({ trigger: 'saved_piece' }))).toBeNull();
  });

  it('never on checkout, sign-up, studio or admin, whatever fires (test 3)', () => {
    for (const path of [
      '/checkout',
      '/checkout/pay',
      '/signup',
      '/login',
      '/sell/apply',
      '/studio/orders',
      '/admin',
    ])
      expect(blockReason(input({ path }))).toBe('never path');
    // The order confirmation lives under /checkout and is where the order-placed version shows.
    expect(
      blockReason(input({ path: '/checkout/confirmed/OO-1', trigger: 'order_placed' })),
    ).toBeNull();
    expect(blockReason(input({ path: '/checkout', trigger: 'order_placed' }))).toBe('never path');
    expect(blockReason(input({ path: '/studiolike' }))).toBeNull();
  });

  it('Not now: quiet for 14 days, never again after 3 (test 4)', () => {
    let state = dismissed({ ...EMPTY_STATE, visits: 2 }, NOW);
    expect(blockReason(input({ state, now: NOW + 13 * DAY }))).toBe('cooling down');
    expect(blockReason(input({ state, now: NOW + 14 * DAY }))).toBeNull();
    state = dismissed(dismissed(state, NOW + 15 * DAY), NOW + 30 * DAY);
    expect(state.dismissals).toBe(3);
    expect(blockReason(input({ state, now: NOW + 365 * DAY }))).toBe('dismissed too often');
  });

  it('not while another overlay is open, and once per session', () => {
    expect(blockReason(input({ overlayOpen: true }))).toBe('overlay open');
    expect(blockReason(input({ session: { ...EMPTY_SESSION, pageViews: 3, shown: true } }))).toBe(
      'already shown this session',
    );
  });

  it('second visit means a new session 30 minutes or more after the last', () => {
    const state = { ...EMPTY_STATE, visits: 1, lastSeenAt: NOW - 29 * 60_000 };
    expect(isSecondVisit(state, NOW)).toBe(false);
    expect(isSecondVisit({ ...state, lastSeenAt: NOW - 30 * 60_000 }, NOW)).toBe(true);
    expect(isSecondVisit({ ...EMPTY_STATE }, NOW)).toBe(false);
  });
});

describe('storage blocked (test 8)', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('never throws, and keeps the session flag in memory so it shows at most once', () => {
    g.window = {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
      get sessionStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    const state = makeStore('local', 'oo:install', EMPTY_STATE);
    const session = makeStore('session', 'oo:install-session', EMPTY_SESSION);
    expect(state.read()).toEqual(EMPTY_STATE);
    expect(() => state.write({ ...EMPTY_STATE, visits: 1 })).not.toThrow();
    expect(state.read().visits).toBe(1);
    session.write({ ...session.read(), pageViews: 2, shown: true });
    expect(blockReason(input({ state: state.read(), session: session.read() }))).toBe(
      'already shown this session',
    );
  });

  it('survives storage that throws on write but not read', () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    };
    const s = makeStore('local', 'k', EMPTY_STATE);
    s.write({ ...EMPTY_STATE, dismissals: 2 });
    expect(s.read().dismissals).toBe(2);
  });
});

describe('drop alert copy and endpoints', () => {
  it('one piece names the maker and piece; several are batched', () => {
    expect(
      dropAlertPayload([
        { maker: 'Halde Studio', title: 'Butter silk slip', slug: 'butter-silk-slip' },
      ]),
    ).toMatchObject({
      body: 'New from Halde Studio: Butter silk slip',
      url: '/products/butter-silk-slip',
    });
    const three = Array.from({ length: 3 }, (_, i) => ({
      maker: 'M',
      title: `P${i}`,
      slug: `p${i}`,
    }));
    expect(dropAlertPayload(three).body).toBe('3 new pieces from makers you follow');
  });

  it('accepts real push services only', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushEndpoint('https://evilpush.apple.com.example.com/x')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
  });
});
