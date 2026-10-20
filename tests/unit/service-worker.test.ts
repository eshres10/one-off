import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Loads public/sw.js against a fake service worker global and returns its handlers. */
function loadSw(windows: Array<{ url: string }> = []) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const calls = {
    shown: [] as unknown[],
    opened: [] as string[],
    focused: 0,
    navigated: [] as string[],
  };
  const clients = windows.map((w) => ({
    url: w.url,
    focus: async () => {
      calls.focused++;
    },
    navigate: async (u: string) => {
      calls.navigated.push(u);
    },
  }));
  const self = {
    location: { origin: 'https://shoponeoff.com.au' },
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      handlers[name] = fn;
    },
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification: async (title: string, opts: unknown) => {
        calls.shown.push({ title, ...(opts as object) });
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => clients,
      openWindow: async (u: string) => {
        calls.opened.push(u);
      },
    },
  };
  const code = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
  new Function('self', code)(self);
  return { handlers, calls };
}

async function fire(handler: (e: unknown) => void, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

const click = (url: string) => ({
  notification: { data: { url }, close: () => {} },
});

describe('service worker push (test 10)', () => {
  it('shows the notification with the OO icon, badge and the URL to open', async () => {
    const { handlers, calls } = loadSw();
    await fire(handlers.push!, {
      data: {
        json: () => ({
          title: 'Off One',
          body: 'Your order is on its way',
          url: '/account/orders/1',
          tag: 'o',
        }),
      },
    });
    expect(calls.shown[0]).toMatchObject({
      title: 'Off One',
      body: 'Your order is on its way',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: '/account/orders/1' },
    });
  });

  it('a click with no Off One window open opens the URL', async () => {
    const { handlers, calls } = loadSw();
    await fire(handlers.notificationclick!, click('/products/butter-silk-slip'));
    expect(calls.opened).toEqual(['https://shoponeoff.com.au/products/butter-silk-slip']);
  });

  it('a click with Off One already open focuses it and goes to the URL', async () => {
    const { handlers, calls } = loadSw([{ url: 'https://shoponeoff.com.au/discover' }]);
    await fire(handlers.notificationclick!, click('/account/orders/abc'));
    expect(calls.focused).toBe(1);
    expect(calls.navigated).toEqual(['https://shoponeoff.com.au/account/orders/abc']);
    expect(calls.opened).toEqual([]);
  });

  it('never opens another site', async () => {
    const { handlers, calls } = loadSw();
    await fire(handlers.notificationclick!, click('https://evil.example/phish'));
    expect(calls.opened).toEqual(['https://shoponeoff.com.au/']);
  });
});
