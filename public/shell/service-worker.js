// Bharat OS vernacular shell service worker.
// Caches the app shell only; API calls always go to the network so the
// L4 audit ledger and §15 pointer-not-payload posture stay live.

const CACHE_NAME = 'bharat-os-shell-v29';
const APP_SHELL = [
  '/shell/',
  '/shell/index.html',
  '/shell/app.js',
  '/shell/sw-bootstrap.js',
  '/shell/network.mjs',
  '/shell/i18n.mjs',
  '/shell/ondevice-slm.mjs',
  '/shell/pairing.mjs',
  '/shell/vault-transfer.mjs',
  '/shell/local-training.mjs',
  '/shell/styles.css',
  '/shell/manifest.webmanifest',
  '/shell/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (request.method !== 'GET') return;

  // Cross-origin requests (e.g. Tesseract.js from esm.sh) — let them pass
  // straight through. Don't try to cache them (CORS / opaque-response
  // surprises) and don't fall back to /shell/index.html if they fail.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match('/shell/index.html'));
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() ?? {};
  } catch (_error) {
    payload = { body: event.data?.text?.() ?? 'Bharat OS worker alert' };
  }

  const title = payload.title ?? 'Bharat OS job alert';
  const options = {
    body: payload.body ?? 'Nearby work is available. Escrow is required.',
    tag: payload.notificationId ?? 'bharat-os-worker-alert',
    data: {
      url: payload.url ?? '/shell/',
      notificationId: payload.notificationId
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/shell/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.endsWith(targetUrl));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
