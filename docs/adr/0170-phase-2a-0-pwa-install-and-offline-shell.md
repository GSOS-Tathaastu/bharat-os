# ADR 0170 — Phase 2a.0: PWA install + offline shell

Status: Accepted
Date: 2026-06-03

## Context

Per [[android-app-vs-os-readiness-2026-05-31]] and the recent
mode shift [[apis-going-live-mode]], the project is moving from
"localhost screenshots" to a real Android-installable artifact.
Two unlocks land in this phase:

1. **Investor demo on real hardware.** The whole §13.x SLM USP +
   citizen data + compute network revenue lines are
   substrate-complete (10 ADRs in §13.x). What's missing for an
   investor pitch is the felt sense of "I installed Bharat OS on
   my phone and used it" — not the localhost UI.
2. **Distribution path.** The "app first, OS later" sequencing
   ([[distribution-app-first-os-later]]) starts with a PWA wrap
   that can later become an Android TWA wrapper for the Play
   Store without rewriting the app.

Founder authorised the move 2026-06-03 with "Lets do the PWA
only as we need to test it first. From now onwards, we will be
adding the APIs to make the product live."

This phase ships the **install + offline-shell** half of Phase
2a. Hosting (HTTPS domain + COOP/COEP for wllama multi-thread)
+ Android TWA wrapper land in Phase 2a.1 and 2a.2 respectively.

## Decision

### 1. Zero new deps — hand-authored PWA assets

Considered `vite-plugin-pwa` (industry standard). Rejected for
v1 because:
- The whole PWA install criteria is satisfied by 5 hand-authored
  files (manifest, 2 icons, SW, offline shell) + 8 lines of
  registration JS. The plugin's value-add is Workbox-based
  precaching + auto-generated SW, neither of which is required
  for a v1 demo.
- Adding a new build-time plugin would also change how Vite
  generates the index.html (the plugin injects manifest links
  + SW registration), making the existing tests for SEO meta
  + iOS meta brittle.
- The substrate posture across the §13.x arc has been
  "zero-new-dep where possible". An npm-dep-justifying
  inflection point (PWA assets generator for PNG icons + offline
  page) hasn't been hit yet.

Hand-authored is the conservative choice. If 2a.1 hosting +
2a.2 TWA need workbox-style runtime caching strategies the plugin
can be adopted then.

### 2. Manifest

`frontend/public/manifest.webmanifest` declares Bharat OS for
installation:

- `name` / `short_name` / `description` — Bharat OS branding.
- `lang: en-IN` — locale binding for the substrate audience.
- `scope: "/app/"` + `start_url: "/app/"` — the SPA lives under
  Vite's `/app/` base; PWA install opens at the OnboardingPage
  (the citizen's actual entry). Marketing routes at `/about`,
  `/how-it-works`, `/for-citizens`, `/for-sponsors` are
  intentionally OUTSIDE the PWA scope — they stay
  share-card-friendly browsable pages, not parts of the installed
  app.
- `display: "standalone"` — Android Chrome / iOS Safari open the
  app without a browser chrome.
- `theme_color: "#FF9933"` — matches the existing index.html
  theme-color meta tag and the OnDeviceInferenceAnimation
  (Phase 13.6.1) Bharat saffron.
- `icons` — SVG-based (see §3).
- `shortcuts` — `/app/labs` (SLM demo) + `/app/settings` (data
  + consent management). Long-press the home-screen icon on
  Android → both pop as quick links.

### 3. Icons — SVG, not PNG

Two SVG files in `frontend/public/`:
- `icon.svg` — 512×512 tricolour (saffron / white / green) with
  "B" mark on a navy Ashok Chakra. The any-purpose icon.
- `icon-maskable.svg` — same brand mark inside the maskable
  safe zone (inner ~40%) with saffron bleed outside so Android
  can clip to circle/squircle/rounded-rect without cropping.

Why SVG, not PNG: PNG generation without external tooling
(sharp, canvas, ImageMagick) is brittle. Modern Chrome / Edge /
Samsung Internet / Firefox all accept SVG icons in the manifest
since 2022. iOS Safari accepts SVG for `apple-touch-icon` from
iOS 16+. The PNG fallback path is deferred to Phase 2a.1 when a
hosting CDN + image pipeline lands.

For older iOS Safari (pre-16), the icon won't render the brand
mark on the home screen — it'll render a default placeholder.
The install still works.

### 4. Service worker

`frontend/public/service-worker.js` (~125 lines, hand-authored).
Versioned via `SW_VERSION = 'bharat-os-pwa-v1'`; the activate
handler wipes any caches whose names don't match the current
version.

Strategy by request kind:
- **`/api/*` — NEVER cache.** Pinned by a regression test in
  `tests/node/pwa-manifest.test.mjs`. §15 binding: live state
  + audit-bearing ledger reads must never serve stale data.
- **Navigation requests** — network-first with offline fallback
  to a cached `/app/` (last-good index.html) or finally
  `/app/offline.html`.
- **Hashed static assets** under same origin
  (`.js / .css / .svg / .png / .woff2 / .wasm / .gguf`) —
  stale-while-revalidate.
- **Allowlisted cross-origin** (`fonts.googleapis.com` +
  `fonts.gstatic.com` + `cdn.jsdelivr.net`) — cache-first; the
  wllama CDN paths under jsdelivr are versioned so a wllama
  upgrade naturally cache-busts.
- **Everything else cross-origin** — passthrough; no SW
  intervention.

Listens for `SKIP_WAITING` postMessage so a future "Update
available · Reload" banner can activate a new SW without a
forced reload race.

Scope: `/app/` (matches Vite base). The SW does NOT control the
marketing pages at `/about`, `/how-it-works`, etc.

### 5. Offline shell

`frontend/public/offline.html` (standalone HTML, no
JS-dependency). Renders when the SW falls back during a
navigation request offline.

Honest about what works:
- ✅ On-device SLM (doc summary, PII redactor, skill agents) on
  pasted text — the model lives in OPFS.
- ✅ Previously-loaded shell pages from this device.
- ✅ Local personalisation profile (on-device only).

Honest about what doesn't:
- ❌ Publishing a citizen-data offer (needs BE signed envelope).
- ❌ Submitting an SLM-H skill action verb (BE skill registry).
- ❌ Compute-network dispatch + serve (real-time peer flow).

This matches the [[apis-going-live-mode]] honesty binding —
the offline shell doesn't pretend BE-backed surfaces work
without network.

### 6. Install banner + hook

`frontend/src/lib/use-pwa-install.ts` — captures the Chromium
`beforeinstallprompt` event so the FE can fire `.prompt()` from
a user gesture (browser policy: only on engagement-triggered
taps, not on page load). Detects iOS Safari via UA + falls back
to iOS-specific instructions (no programmatic install API).
Surfaces `isInstalled` via `display-mode: standalone` matchMedia
+ `navigator.standalone` (iOS).

`frontend/src/components/InstallPwaBanner.tsx` — small,
dismissible fixed-bottom banner. Three branches:
- Chromium with fired event → "Install Bharat OS" button +
  description.
- iOS Safari → instructions ("Tap Share → Add to Home Screen").
- Already installed OR unsupported browser → renders nothing.

Dismissal persisted in localStorage under
`bos:pwa-install-banner-dismissed-at`; 7-day cooldown before
re-showing. Mounted globally in App.tsx above the route tree so
it shows on every page that isn't already standalone.

### 7. Service worker registration

`frontend/src/lib/register-service-worker.ts` — pure-function
helper. Only registers when:
- `import.meta.env.PROD === true` (dev builds skip so HMR isn't
  disrupted by cached chunks),
- `navigator.serviceWorker` exists,
- `location.protocol === 'https:'` OR `location.hostname` is
  localhost / 127.0.0.1 / *.localhost.

Listens for `updatefound` → installed → controller-exists →
calls `onUpdateAvailable` so a future Settings affordance can
prompt the citizen to reload.

Called from `main.tsx` after React mounts.

### 8. Adversarial review verdict: ship_with_no_must_fix

3-lens pass:
- **Privacy / §15.** SW NEVER caches `/api/*` (regression-pinned);
  scope-limited to `/app/`; localStorage dismissal key has
  timestamp only (no PII); iOS install detection via
  `navigator.standalone` — no fingerprinting. Sound.
- **Honesty.** Offline shell lists what works offline vs what
  doesn't (matches [[apis-going-live-mode]]). Banner accurately
  describes the install experience. Manifest `start_url` points
  at the citizen's actual entry surface.
- **Edge cases.** SW registration skipped on dev (no HMR
  disruption); HTTPS-or-localhost guard prevents insecure
  registration; 7-day dismissal cooldown; iOS Safari gets
  Share→Add-to-Home-Screen instructions; banner hides when
  already-installed.

Notes for follow-up (not must-fix):
- **SF-1.** SVG icons may not render reliably on iOS Safari
  pre-16. PNG fallback (192px + 512px) deferred to Phase 2a.1
  with hosting CDN.
- **SF-2.** The 1.29 MB main JS bundle warning predates this
  phase. Code-splitting + manualChunks is a future polish.
- **SF-3.** No "Update available · Reload" banner UI when a new
  SW activates. SW supports SKIP_WAITING already; FE banner
  deferred.
- **SF-4.** No A2HS analytics — we don't know if a citizen
  actually installed. Could wire `appinstalled` event into a
  pointer-only telemetry call. Deferred.

## Consequences

- The substrate is now PWA-installable on Android Chrome /
  Microsoft Edge / Samsung Internet (programmatic install
  prompt) and on iOS Safari 16+ (Add to Home Screen).
- Investor / founder testing flow: open BE serving the SPA on a
  phone, install banner appears, tap → home-screen icon, app
  opens standalone.
- Phase 2a.1 lands HTTPS domain + COOP/COEP headers (needed for
  wllama multi-thread + SharedArrayBuffer). Phase 2a.2 lands the
  Android TWA wrapper for the Play Store.
- §13.x revenue lines + on-device SLM USP + marketplace are now
  demonstrable as an installed app, not just a localhost demo.

## Tests

- `tests/node/pwa-manifest.test.mjs` — 25 cases. Manifest
  fields (name + short_name + description + lang en-IN +
  start_url /app/ + scope /app/ + display standalone +
  theme_color #FF9933 + icons any+maskable + icon srcs resolve
  + shortcuts under /app/); SW file (precaches /app/* + never
  caches /api/* + activate skipWaiting + clients.claim +
  SKIP_WAITING listener + RUNTIME_HOST_ALLOWLIST exact entries);
  offline.html (lang en + theme-color + honest about needs-online
  + reload button targets /app/); index.html PWA wiring
  (manifest link + icon link + apple-touch-icon + iOS meta +
  mobile-web-app-capable); icon SVGs (valid SVG + saffron
  bleed + a11y label).
- `frontend/src/lib/use-pwa-install.test.ts` — 10 cases. Hook
  contract (chromium UA detect + ios-safari UA detect + canPrompt
  flips on beforeinstallprompt + prompt() forwards + accepted
  outcome sets isInstalled + appinstalled event + unavailable
  on no-event); registerServiceWorker (skips on dev + skips
  without serviceWorker + refuses plain http + accepts localhost
  http + uses correct path + scope).
- `frontend/src/components/InstallPwaBanner.test.tsx` — 6 cases.
  navigator.standalone hides banner; iOS UA renders Add-to-Home
  instructions; unsupported desktop browsers render nothing;
  fresh localStorage dismissal hides banner; 7-day cooldown
  expiry re-shows banner; Dismiss button persists.
- Full sweep at commit time: 542 vitest (+16) + 1466 Node (+25)
  + tsc clean + `vite build` succeeds.

## Follow-ups (deferred)

- **Phase 2a.1** — Hosting (HTTPS domain) + COOP / COEP headers
  for wllama multi-thread + Lighthouse PWA score audit + PNG
  icon fallbacks for iOS Safari pre-16.
- **Phase 2a.2** — Android TWA wrapper (Bubblewrap-generated
  Android Studio project) for Play Store distribution.
- **Phase 2a.3** — In-app "Update available · Reload" banner
  UI for new SW activation (SKIP_WAITING already supported).
- A2HS install analytics via `appinstalled` event →
  pointer-only telemetry. §15 must be preserved (no PII).
- **Phase 14.0** — Sahayak provider role (700M TAM unlock,
  still pending).

## §13.x + Phase 2a.0 backlog status

§13.x is fully closed (ADR 0157 → 0169). Phase 2a.0 (this
phase) opens the §2a distribution arc. Next sequential moves:

1. Phase 2a.1 hosting (small).
2. Phase 2a.2 TWA wrapper (small).
3. Phase 14.0 Sahayak (medium, the last revenue / TAM unlock
   pre-funding).

After all three, the substrate is investor-pitch-MVP-complete
with a real installable demo.
