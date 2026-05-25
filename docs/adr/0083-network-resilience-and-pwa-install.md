# ADR 0083: Phase 4.4 — Network Resilience + Offline Mode + PWA Install

## Status

Accepted

## Context

A launch-ready PWA on Indian mobile networks needs to be resilient
to:

- **Transient 5xx / 429s** — server hiccups during deploys,
  rate-limiter ramping after a burst.
- **Network drops** — moving between cells, walking into a basement,
  PoorNet outages.
- **Connection-quality variance** — high-latency 3G + perfectly-okay
  5G in the same session.

The Phase 4.1 hardening gave us server-side resilience (rate
limits, structured logs, health probes). Phase 4.4 gives us the
*client-side* counterpart: retry transient failures automatically,
detect network state, and tell the user clearly what's happening.

Plus a separate but related win for launch: **PWA install prompt**.
Browsers fire `beforeinstallprompt` when the app meets install
criteria (HTTPS + service worker + manifest). Capturing that event
and surfacing it on the Profile tab lets users pin Bharat OS to
their home screen — the single biggest UX upgrade between a
browser tab and a real app.

## Decision

### New artifact — `public/shell/network.mjs`

Three exports:

**`fetchWithRetry(url, init, { delaysMs })`** — wraps `fetch` with
exponential backoff. Defaults: 3 retries at 200ms / 600ms / 1.8s.
Retries on:
- Network errors (DNS, TCP, TLS, abort)
- HTTP **5xx**
- HTTP **429** (rate-limited)
- HTTP **408** (request timeout)

Does NOT retry:
- HTTP **4xx other than 408/429** — validation errors,
  unauthorised, forbidden. Retrying them is pointless.
- Any error after `delaysMs.length + 1` attempts — re-throws.

**`fetchJsonWithRetry(url, init, options)`** — same as above plus
JSON parsing + structured error. Errors carry `statusCode` and
`responseText` so the caller can render them.

**`onNetworkStatusChange(callback)`** — wraps `navigator.onLine`
+ browser `online`/`offline` events. Callback fires once with the
current state, then on every transition. Returns an unsubscribe
function.

**`categoriseError(error, response)`** — turns an exception or a
non-ok response into one of six structured categories with a
recommended user-facing action:

| Category | Trigger | Action |
|---|---|---|
| `offline` | `navigator.onLine === false` | wait |
| `auth` | 401 / 403 | sign_in |
| `rate_limited` | 429 | wait (with `retryAfterSeconds`) |
| `validation` | other 4xx | fix_input |
| `server_error` | 5xx | retry |
| `network_error` | DNS / TLS / abort | retry |

### Offline banner

A sticky red banner at the top of the viewport (`position: fixed;
top: 0; z-index: 40;`) shows when `navigator.onLine === false`:

> ⚡ You're offline. Bharat OS will retry when your connection is back.

The banner auto-hides on reconnect. When the offline transition
fires, the network setup also calls `stopMeshNode()` — running
the mesh ticker against a 503 endpoint is pointless and would
pollute the rate-limiter.

### Improved `showToast`

The new signature: `showToast(message, { tone, retry, durationMs })`.

When `retry` is a function, the toast becomes interactive:

```
┌──────────────────────────────────────────┐
│ Could not reach Bharat OS    [Retry] [×] │
└──────────────────────────────────────────┘
```

Tapping *Retry* dismisses the toast and calls the retry callback.
*×* dismisses without retrying. Interactive toasts persist 8s
(min) so users have time to act.

Plain (non-interactive) toasts retain the existing API — no
breakage.

### PWA install prompt

Browsers fire `beforeinstallprompt` when the user meets install
criteria. We `preventDefault()` to suppress the browser-default
banner and stash the event in `deferredInstallPrompt`.

A new card on the Profile tab — *"📥 Install Bharat OS"* — surfaces
the install button:

```
┌────────────────────────────────────────────────────┐
│ 📥 Install Bharat OS    Adds to your home screen  │
├────────────────────────────────────────────────────┤
│ Pin Bharat OS to your phone's home screen so it    │
│ opens like a real app — no browser bar, no tab     │
│ switching, works offline.                          │
│                                                    │
│ [Install]  Not now                                 │
└────────────────────────────────────────────────────┘
```

The card is hidden by default; appears only when the browser fires
`beforeinstallprompt`. Tapping *Install* triggers the native
install flow. *Not now* dismisses with a persistent flag
(`bharat-os.shell.pwaInstallDismissed.v1`) so the card doesn't
re-appear on every page load.

The `appinstalled` event fires when the user completes the
install — we hide the card permanently and show a confirmation
toast.

### Service worker

`bharat-os-shell-v26 → v27`. Added `/shell/network.mjs` to the
app-shell precache list so the helper is offline-ready.

## §15 bindings — what changed

Nothing. Network resilience is purely client-side defensive
behaviour. No new data flows, no telemetry beyond what was already
in place (the request-id + access log from Phase 4.1 are
unchanged).

One subtle improvement: when offline, the mesh ticker stops
firing — which means no contribution events get rejected by the
server's offline-receiving end, and the rate-limiter counter
stays clean. Better UX without any §15 trade-off.

## Tests

`tests/node/network.test.mjs` — 13 tests:

1. `fetchWithRetry` returns the response on first success
2. `fetchWithRetry` retries on 5xx and eventually succeeds
3. `fetchWithRetry` does NOT retry 4xx (validation errors)
4. `fetchWithRetry` retries 429 (rate-limited)
5. `fetchWithRetry` retries network errors, re-throws after exhaustion
6. `fetchJsonWithRetry` parses JSON on success
7. `fetchJsonWithRetry` throws structured error for non-ok responses
8. `categoriseError` returns offline when `navigator.onLine === false`
9. `categoriseError` classifies 401/403 as `sign_in`
10. `categoriseError` classifies 429 with `retryAfterSeconds`
11. `categoriseError` classifies 5xx as `server_error` → retry
12. `categoriseError` classifies pure network errors as retry
13. module exports the protocol version

Full suite: **360 / 360 green** (was 347; +13 new). SW cache to v27.

## Consequences

- **Transient failures auto-resolve.** A 502 during a server deploy
  no longer breaks the user's flow — three retries with backoff
  almost always succeed.
- **Network drops are visible.** A sticky red banner tells the
  user *"you're offline"* the moment connectivity goes — no more
  silent failures that the user mistakes for app bugs.
- **PWA install is a single tap.** Investors / users who like the
  shell on first visit can pin it to their home screen without
  going through a browser menu. The biggest UX delta between a
  PWA and a "real app" is closed in one place.
- **Toasts are actionable.** Network failures show a *Retry*
  button instead of just printing a message. The user doesn't
  have to figure out what to do next.
- **No new server-side state.** All resilience is client-side.
  Server stays clean, tested, observable per Phase 4.1.
- **360 / 360 tests**, SW cache to v27.

## Future polish

- **Background offline queue** — IndexedDB-backed queue for write
  actions while offline. Currently a failed write just shows the
  toast; a future commit could enqueue it and replay on
  reconnect. Big UX win on Indian rural mobile networks.
- **Connection-quality detector** — show *"slow connection"* hints
  when round-trip latency exceeds a threshold. Helps users
  understand why a request is taking 5 seconds.
- **Background sync** via the Service Worker's `sync` event so
  even a closed tab gets the queued writes replayed.
- **Adopt fetchWithRetry across the shell** — currently the new
  helper is available but the existing `fetchJson` in `app.js`
  is the default for most calls. A future commit migrates
  long-running flows (mesh ticker, federated round join) to
  fetchWithRetry so they auto-recover from transient 5xx.
- **Server-Sent Events / WebSocket** for live updates (federated
  round filling up, attestations expiring) — eliminates the need
  to poll, which means less work for the rate-limiter to absorb.
- **PWA install: track install completion** via the
  `appinstalled` event for ops metrics. Right now we just hide
  the card; capturing the event in `/metrics` as a counter would
  let us measure install-rate without per-user PII.
