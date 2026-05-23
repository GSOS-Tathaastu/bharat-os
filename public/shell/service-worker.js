// Bharat OS vernacular shell service worker.
// Caches the app shell only; API calls always go to the network so the
// L4 audit ledger and §15 pointer-not-payload posture stay live.

const CACHE_NAME = 'bharat-os-shell-v3';
const APP_SHELL = [
  '/shell/',
  '/shell/index.html',
  '/shell/app.js',
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
