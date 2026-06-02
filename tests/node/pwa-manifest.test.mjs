// Phase 2a.0 — PWA manifest + service worker + offline shell
// regression pin. Tests run cheaply against the on-disk source.
//
// We assert structure, not look-and-feel:
//   • Manifest carries every field the install criteria require.
//   • Theme color matches the existing index.html + meta defaults.
//   • Scope is broad enough to cover marketing + app routes.
//   • Start URL points at the post-install app surface.
//   • Service worker file exists + never caches /api/* (§15 binding).
//   • Offline fallback shell exists + is honest about what works
//     offline vs what doesn't.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'frontend', 'public', 'manifest.webmanifest');
const SW_PATH = resolve(REPO_ROOT, 'frontend', 'public', 'service-worker.js');
const OFFLINE_PATH = resolve(REPO_ROOT, 'frontend', 'public', 'offline.html');
const ICON_PATH = resolve(REPO_ROOT, 'frontend', 'public', 'icon.svg');
const ICON_MASKABLE_PATH = resolve(
  REPO_ROOT,
  'frontend',
  'public',
  'icon-maskable.svg'
);
const INDEX_PATH = resolve(REPO_ROOT, 'frontend', 'index.html');

describe('phase 2a.0 / manifest.webmanifest', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  it('declares name + short_name + description', () => {
    assert.equal(manifest.name, 'Bharat OS');
    assert.equal(manifest.short_name, 'Bharat OS');
    assert.ok(manifest.description && manifest.description.length > 20);
  });

  it('uses en-IN locale', () => {
    assert.equal(manifest.lang, 'en-IN');
  });

  it('start_url points at /app/ (post-install app surface)', () => {
    assert.equal(manifest.start_url, '/app/');
  });

  it('scope is /app/ (matches Vite base + SW scope)', () => {
    // Vite serves the SPA from public/app/build/ at the /app/ base.
    // The manifest scope MUST match the SW scope so post-install
    // navigation never escapes the app boundary by accident.
    assert.equal(manifest.scope, '/app/');
  });

  it('display mode is standalone', () => {
    assert.equal(manifest.display, 'standalone');
  });

  it('theme_color matches the Bharat saffron baseline', () => {
    assert.equal(manifest.theme_color, '#FF9933');
  });

  it('declares at least one any-purpose icon + one maskable icon', () => {
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
    const purposes = new Set(manifest.icons.map((i) => i.purpose));
    assert.ok(purposes.has('any'));
    assert.ok(purposes.has('maskable'));
  });

  it('icon srcs resolve to files in frontend/public (/app/ stripped)', () => {
    for (const icon of manifest.icons) {
      // Strip the served /app/ prefix to map back to the public/ source.
      const sourceName = icon.src.replace(/^\/app\//, '').replace(/^\//, '');
      const path = resolve(REPO_ROOT, 'frontend', 'public', sourceName);
      const text = readFileSync(path, 'utf8');
      assert.ok(text.length > 0, `icon ${icon.src} is empty`);
    }
  });

  it('declares shortcuts that resolve to in-app routes', () => {
    assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 1);
    for (const sc of manifest.shortcuts) {
      assert.ok(sc.url.startsWith('/app/'), `shortcut ${sc.name} must be under /app/`);
    }
  });
});

describe('phase 2a.0 / service-worker.js', () => {
  const sw = readFileSync(SW_PATH, 'utf8');

  it('precaches the offline shell + manifest + icons under /app/', () => {
    assert.match(sw, /\/app\/offline\.html/);
    assert.match(sw, /\/app\/manifest\.webmanifest/);
    assert.match(sw, /\/app\/icon\.svg/);
  });

  it('NEVER caches /api/* (§15 binding — live state only)', () => {
    // Sanity: there must be a hard branch that returns early for
    // /api/* requests. We pin the exact predicate so a refactor
    // can't accidentally cache audit-bearing endpoints.
    assert.match(sw, /isApiRequest/);
    assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  });

  it('falls back to /app/offline.html on navigation when offline', () => {
    assert.match(sw, /\/app\/offline\.html/);
  });

  it('claims clients + skipWaiting on activate', () => {
    assert.match(sw, /skipWaiting\(\)/);
    assert.match(sw, /clients\.claim\(\)/);
  });

  it('listens for SKIP_WAITING message for manual update activation', () => {
    assert.match(sw, /SKIP_WAITING/);
  });

  it('does not cache cross-origin hosts outside the allowlist', () => {
    // The allowlist contains fonts + the wllama CDN. No other host
    // should leak in here without being added explicitly.
    assert.match(sw, /RUNTIME_HOST_ALLOWLIST/);
    assert.match(sw, /'fonts\.googleapis\.com'/);
    assert.match(sw, /'fonts\.gstatic\.com'/);
    assert.match(sw, /'cdn\.jsdelivr\.net'/);
  });
});

describe('phase 2a.0 / offline.html', () => {
  const html = readFileSync(OFFLINE_PATH, 'utf8');

  it('declares lang="en" + theme-color saffron', () => {
    assert.match(html, /<html lang="en"/);
    assert.match(html, /name="theme-color"\s+content="#FF9933"/);
  });

  it('is honest about what works offline vs what does not', () => {
    // Pre-existing memory ([[apis-going-live-mode]]) — the offline
    // shell shouldn't pretend the BE-backed surfaces work offline.
    // We pin "needs you back online" so any refactor preserves
    // the honesty.
    assert.match(html, /needs you back online/i);
    assert.match(html, /on-device/i);
  });

  it('exposes a Try again button that lands back at /app/', () => {
    assert.match(html, /window\.location\.assign\('\/app\/'\)/);
  });
});

describe('phase 2a.0 / index.html PWA wiring', () => {
  const html = readFileSync(INDEX_PATH, 'utf8');

  it('links the manifest under /app/', () => {
    assert.match(html, /<link rel="manifest" href="\/app\/manifest\.webmanifest"/);
  });

  it('links the icon as SVG under /app/', () => {
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/app\/icon\.svg"/);
  });

  it('carries iOS install meta tags', () => {
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /apple-mobile-web-app-capable.*yes/);
    assert.match(html, /apple-mobile-web-app-status-bar-style/);
    assert.match(html, /apple-mobile-web-app-title.*Bharat OS/);
  });

  it('carries the legacy mobile-web-app-capable for older Android', () => {
    assert.match(html, /name="mobile-web-app-capable"\s+content="yes"/);
  });
});

describe('phase 2a.0 / icon SVGs', () => {
  const icon = readFileSync(ICON_PATH, 'utf8');
  const maskable = readFileSync(ICON_MASKABLE_PATH, 'utf8');

  it('icon.svg is a valid 512x512 SVG', () => {
    assert.match(icon, /<svg/);
    assert.match(icon, /viewBox="0 0 512 512"/);
  });

  it('icon-maskable.svg uses the maskable safe zone with saffron bleed', () => {
    assert.match(maskable, /<svg/);
    // Bleed colour must match theme — Bharat saffron.
    assert.match(maskable, /#FF9933/);
  });

  it('both icons carry an a11y label', () => {
    assert.match(icon, /aria-label="Bharat OS"/);
    assert.match(maskable, /aria-label="Bharat OS"/);
  });
});
