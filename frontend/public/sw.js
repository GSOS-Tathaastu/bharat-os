// Bharat OS /app/ service worker.
//
// Minimal — handles push + notificationclick only. No caching;
// the /app/ build assets are immutable-hashed and the Vite SPA
// chunk-loads on demand. Keeping the SW thin avoids stale-bundle
// foot-guns.
//
// Phase 12.0.4 (ADR 0133).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() ?? {};
  } catch (_error) {
    payload = { body: event.data?.text?.() ?? 'Bharat OS' };
  }
  const title = payload.title ?? 'Bharat OS';
  const options = {
    body: payload.body ?? 'You have a new notification.',
    tag: payload.notificationId ?? 'bharat-os-app',
    icon: payload.icon,
    data: {
      url: payload.url ?? '/app/',
      notificationId: payload.notificationId
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/app/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(targetUrl));
        if (existing) return existing.focus();
        return self.clients.openWindow(targetUrl);
      })
  );
});
