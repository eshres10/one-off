'use client';

/** Fire-and-forget product analytics (stored in client_events). Never throws. */
export function track(name: string, props: Record<string, string | number | boolean | null> = {}) {
  try {
    const body = JSON.stringify({ name, props, path: window.location.pathname });
    if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' })))
      return;
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics are best effort.
  }
}
