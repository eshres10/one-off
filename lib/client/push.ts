'use client';

/** Drop alerts in the browser: permission, the service worker's push subscription, our API. */

export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration> {
  // Production registers sw.js on load; this also covers dev and a first visit.
  return (
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  );
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!supported() || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Asks for permission (only ever from a button) and subscribes this browser. Resolves to the
 * new state: 'on', 'denied' if they said no, 'off' if it didn't work.
 */
export async function turnOnPush(): Promise<PushState> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!supported() || !key) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'off';
    await navigator.serviceWorker.ready.catch(() => undefined);
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(key),
      }));
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function turnOffPush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {
    // Already gone.
  }
  return 'off';
}
