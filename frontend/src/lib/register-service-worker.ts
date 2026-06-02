// Phase 2a.0 — Service worker registration helper.
//
// Called from main.tsx after React mounts. Only registers when
// the runtime SUPPORTS service workers AND we're served over a
// secure context (HTTPS or localhost). On dev (Vite dev server)
// the SW intentionally NOT registered so HMR isn't disrupted by
// cached chunks.
//
// Returns the registration for tests; nothing user-facing.

// Vite base is /app/, so the SW file is served at /app/service-worker.js.
// Scope is /app/ — broad enough to cover every SPA route under /app/*
// without overreaching into the marketing pages at /about, /how-it-works,
// /for-citizens, /for-sponsors.
const SW_PATH = '/app/service-worker.js';
const SW_SCOPE = '/app/';

export interface RegisterServiceWorkerOptions {
  /** Override `import.meta.env.PROD`. Set true in main.tsx prod path. */
  isProductionBuild: boolean;
  /** Override navigator + window for tests. */
  navigator?: Pick<Navigator, 'serviceWorker'>;
  location?: Pick<Location, 'protocol' | 'hostname'>;
  /** Called with the swReg + update event so a banner can prompt. */
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
}

export async function registerServiceWorker(
  opts: RegisterServiceWorkerOptions
): Promise<ServiceWorkerRegistration | null> {
  if (!opts.isProductionBuild) return null;

  const nav = opts.navigator ?? (typeof navigator === 'undefined' ? null : navigator);
  const loc = opts.location ?? (typeof location === 'undefined' ? null : location);
  if (!nav || !loc) return null;
  if (!('serviceWorker' in nav)) return null;

  const isSecure =
    loc.protocol === 'https:' ||
    loc.hostname === 'localhost' ||
    loc.hostname === '127.0.0.1' ||
    loc.hostname.endsWith('.localhost');
  if (!isSecure) return null;

  try {
    const registration = await nav.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });

    // Phase 2a.0 — listen for an installed-but-waiting SW so the
    // app can offer a "Reload to apply update" affordance.
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (
          installing.state === 'installed' &&
          nav.serviceWorker.controller !== null
        ) {
          opts.onUpdateAvailable?.(registration);
        }
      });
    });

    return registration;
  } catch (err) {
    // Log to console but don't fail the app — the PWA install is
    // a progressive enhancement, not a blocker.
    // eslint-disable-next-line no-console
    console.warn('[bharat-os] service worker registration failed', err);
    return null;
  }
}
