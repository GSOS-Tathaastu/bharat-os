// Phase 2a.0 — Bharat OS service worker.
//
// Strategy summary:
//   • Vite-hashed asset URLs (/.../*.{js,css,svg,png,wasm,gguf,woff2})
//     are immutable — cache-first with stale-while-revalidate.
//   • Navigation requests (HTML for SPA routes) — network-first with
//     fallback to cached index.html when offline (SPA shell pattern).
//   • /api/* requests — NEVER cached. Citizens see the freshest BE
//     state; offline yields a real failure rather than a stale
//     pointer-record.
//   • Fonts (fonts.gstatic.com woff2) — cache-first with origin
//     allowlist so we don't accidentally cache anything unexpected.
//   • Wllama WASM (cdn.jsdelivr.net) — cache-first; immutable per
//     URL, so a versioned wllama upgrade naturally cache-busts.
//
// Versioning: bump SW_VERSION on any cache-strategy change. The
// activate handler wipes any caches whose names don't match.

const SW_VERSION = 'bharat-os-pwa-v1';
const PRECACHE = `${SW_VERSION}-precache`;
const RUNTIME = `${SW_VERSION}-runtime`;

// PWA assets all live under /app/ because vite.config base is /app/.
const PRECACHE_URLS = [
  '/app/',
  '/app/offline.html',
  '/app/manifest.webmanifest',
  '/app/icon.svg',
  '/app/icon-maskable.svg'
];

const RUNTIME_HOST_ALLOWLIST = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept')?.includes('text/html'))
  );
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // Phase 2a.1.5 — drop 'gguf' from the static-asset cache regex
  // as defence-in-depth alongside the explicit /models/* early-return
  // in the fetch handler. A multi-GB GGUF must NEVER hit the cache.
  return /\.(js|css|svg|png|jpg|jpeg|webp|ico|woff2|wasm)(\?.*)?$/.test(
    url.pathname
  );
}

function isAllowlistedRuntimeHost(url) {
  return RUNTIME_HOST_ALLOWLIST.has(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // §15 binding: never cache audit-bearing / live-state /api/*.
  if (isApiRequest(url)) {
    return;
  }

  // Phase 2a.1.5 — never let the SW touch /models/*. The GGUF packs
  // are multi-GB and already persisted to OPFS by the install flow.
  // Letting the SW also write them to CacheStorage would:
  //   • double the storage cost (~2 GB instead of 1 GB for Qwen,
  //     ~4.6 GB instead of 2.3 GB for Phi-3.5)
  //   • risk QuotaExceededError on devices near their cap
  //   • OOM-kill the SW thread on mobile when copying the response
  // Models are written-once + read-once + served from OPFS forever
  // after; the SW has no role.
  if (url.origin === self.location.origin && url.pathname.startsWith('/models/')) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the latest /app/ index.html so the offline shell
          // stays fresh after a successful online navigation.
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put('/app/', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('/app/')
            .then((cached) => cached || caches.match('/app/offline.html'))
        )
    );
    return;
  }

  if (isStaticAsset(url) || isAllowlistedRuntimeHost(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Default: passthrough to network without caching. Cross-origin
  // requests outside the allowlist get no SW intervention so we
  // never accidentally hold a stale cross-origin resource.
});

// Phase 2a.0 — listen for a manual SKIP_WAITING message so the
// in-app "Update available" banner can activate a new SW without
// a forced reload race.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
