// Bharat OS operator-console service worker.
// Phase 2a (§13 / §17): the operator console doubles as a PWA so a solo
// founder can side-load it onto a phone for an investor demo without going
// through Play Store. Offline-shell only — API calls always go to the
// network so the policy/audit story stays live.

const CACHE_NAME = 'bharat-os-console-v2';
const APP_SHELL = [
  '/console/',
  '/console/index.html',
  '/console/app.js',
  '/console/styles.css',
  '/console/manifest.webmanifest',
  '/console/icon.svg'
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

  // API calls always go to the network — the L4 audit ledger and §15
  // pointer-not-payload posture only hold if we don't fake them with
  // stale cache responses.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match('/console/index.html'));
    })
  );
});
