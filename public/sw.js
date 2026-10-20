/* Off One service worker: makes the site installable and shows drop alerts.
   No offline caching yet: every request goes straight to the network. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Pass-through: let the browser handle every request as normal.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Off One', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Off One';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  );
  // Only ever open Off One pages.
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  url = url.href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an open Off One window: bring it forward and take it to the page.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
