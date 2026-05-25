# ADR 0080: Phase 4.1 — Production Hardening

## Status

Accepted

## Context

Phase 4.0 made Bharat OS DPDP-compliant. Phase 4.1 makes it
production-deployable. Pre-launch threat surface:

| Threat | Pre-4.1 defence | Post-4.1 |
|---|---|---|
| XSS via injected script | None (no CSP) | Strict CSP with no `'unsafe-inline'` |
| Clickjacking | None | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| MIME sniffing attacks | None | `X-Content-Type-Options: nosniff` |
| Referrer leakage to third parties | None | `Referrer-Policy: strict-origin-when-cross-origin` |
| Camera / mic / geo abuse | None | `Permissions-Policy` allowlist (camera + mic for §7c QR + voice intent, geo denied) |
| FLoC / tracking-cohort exposure | None | `Permissions-Policy: interest-cohort=()` |
| Denial-of-service via request flood | None | Per-IP token-bucket rate limiter, 4 policy classes |
| Slow-loris connection holding | Default Node | Explicit `headersTimeout` + `requestTimeout` |
| OOM via large POST body | None | 1 MiB body-size cap on JSON reads |
| HTTPS-downgrade attacks | None | HSTS (opt-in via env) + CSP `upgrade-insecure-requests` |
| PII leakage via observability | Implicit (no logger) | Structured logger with explicit PII-forbidden key allowlist |
| Lack of operational visibility | Ad-hoc `console.log` | `/healthz`, `/readyz`, `/metrics` (Prometheus format) + per-request access logs |
| Ungraceful restarts dropping requests | Hard-kill on SIGTERM | Graceful shutdown drains in-flight + 10s force timeout |

## Decision

### Four new artifacts under `src/phase0/`

**`security-headers.mjs`** — single source of truth for the
production response headers.

- `buildContentSecurityPolicy({ extraScriptSrc, extraConnectSrc })`
  — emits a strict CSP. `default-src 'self'`. Script-src adds the
  two CDNs we legitimately load from (`esm.sh` for qrcode +
  transformers.js, `cdn.jsdelivr.net` for Tesseract.js OCR data).
  **No `'unsafe-inline'` and no `'unsafe-eval'`** in script-src.
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`. WebRTC media + camera blobs handled via
  `media-src 'self' blob:` and `img-src 'self' data: blob:`.
- `buildSecurityHeaders({ enableHsts, permissionsAllowlist })` —
  bundles CSP + `X-Frame-Options: DENY` + `X-Content-Type-Options:
  nosniff` + `Referrer-Policy: strict-origin-when-cross-origin` +
  `Permissions-Policy` (camera/mic to self, geolocation/payment/
  usb/interest-cohort denied) + COOP/CORP same-origin.
- `applySecurityHeaders(response)` — middleware-style; sets all
  the headers on the response in one call.

**`rate-limiter.mjs`** — in-memory token-bucket per `(key, policy)`
pair.

- Four policy classes: `read` (60 r/min), `write` (30 r/min),
  `expensive` (10 / 5 min — identity creation, deletion, export,
  erasure preview), `probe` (600 r/min for `/healthz` etc).
- `policyFor(method, pathname)` centralises the dispatch so all
  policy decisions live in one auditable table.
- `clientKey(request, { trustProxy })` extracts IP from the socket
  by default; honours `X-Forwarded-For` only when
  `BHARAT_OS_TRUST_PROXY=1` (set this behind a reverse proxy you
  control).
- Garbage-collects stale buckets every 60 s so memory stays bounded
  under churn.
- Pure functions; in-memory state is fine for single-instance
  launch; multi-instance production swaps to Redis-backed buckets
  with the same public surface.

**`logger.mjs`** — structured JSON logger to stdout/stderr.

- One JSON line per event with `{ timestamp, level, message, ...context }`.
- Severities: `ERROR` / `WARN` → stderr; `INFO` / `ACCESS` /
  `DEBUG` → stdout (matches Docker / k8s convention).
- **PII-scrub guard list** — silently replaces any context field
  whose key is in `PII_FORBIDDEN_KEYS` with `'<scrubbed>'`. Currently
  forbidden: `displayName`, `email`, `phone`, `phoneNumber`,
  `address`, `aadhaar`, `aadhaarNumber`, `pan`, `panNumber`,
  `intentText`, `recoveryPhrase`, `privateKeyPem`,
  `vaultKeyBase64`, `gradientBytesBase64`. Recurses into nested
  objects so a `{ flow: { request: { phoneNumber } } }` payload
  scrubs at any depth.
- `generateRequestId()` returns a `crypto.randomUUID()` per request
  (falls back to Math.random hex on pre-Node-18).
- `safePath(url)` strips query strings + replaces non-ASCII so a
  malicious User-Agent / path injection can't poison log lines.

**`metrics.mjs`** — Prometheus text-exposition format,
in-memory.

- `recordRequest({ method, pathname, status, durationSeconds })`
  increments a counter + samples into a histogram.
- `metricPath(pathname)` normalises ID-shaped segments to `:id`
  before recording so cardinality stays bounded AND no
  per-user identityId ever appears in metric labels. Patterns
  recognised: `bos:<type>:<hex>`, long hex IDs, 6-digit pairing
  codes, SHA-256 hashes.
- Histogram buckets biased toward request latencies we actually
  expect (0.005 … 10 seconds).
- `bos_api_process_uptime_seconds` gauge included so a scraper
  can detect restarts.

### Middleware preamble in `createPhase0ApiServer`

Every request now goes through this fixed preamble before any
route logic:

1. Generate `requestId` via `crypto.randomUUID()`.
2. Start nanosecond timer for access-log + histogram.
3. Apply all security headers (CSP, etc.). Add `x-request-id`.
4. CORS: if `BHARAT_OS_CORS_ORIGINS` env var includes the
   request's `Origin`, set permissive CORS headers. Otherwise
   same-origin only. `OPTIONS` preflight returns 204.
5. Token-bucket consume using the route's policy. On 429, set
   `Retry-After`, write the WARN log line, record the metric,
   return.
6. Register `finish` + `close` observer on the response that
   writes the ACCESS log line + records the metric exactly once.

After preamble:

- `GET /healthz` → 200 + uptime. Liveness probe.
- `GET /readyz` → 200 + check map if the store is reachable, else
  503. Readiness probe.
- `GET /metrics` → Prometheus text format. Scraper endpoint.

### Server hardening

- `headersTimeout = 30_000` — slow-loris guard.
- `requestTimeout = 60_000` — absolute ceiling per request.
- `keepAliveTimeout = 5_000` — match common reverse-proxy
  defaults (nginx, ALB).
- `MAX_REQUEST_BODY_BYTES = 1 MiB` — JSON body read aborts with
  `413 Payload Too Large` on overrun.

### Graceful shutdown

`installGracefulShutdown(server, { drainTimeoutMs })` registers
`SIGTERM` + `SIGINT` handlers that:

1. Mark shutting-down (idempotent — first signal wins).
2. Log `shutdown_initiated`.
3. `server.close(...)` waits for in-flight requests to finish.
4. 10-second force-timer in case close hangs — exits with
   code 1 if it fires.
5. On clean close: log `shutdown_complete`, exit 0.

`listenPhase0Api` automatically calls `installGracefulShutdown` on
the returned server so the CLI entry point gets safe shutdown
without extra wiring.

### De-inlined scripts for strict CSP

The shell `index.html` had an inline `<script>` registering the
service worker; the privacy page had an inline `<script>` loading
the DPO contact. Both moved to external files:

- `public/shell/sw-bootstrap.js`
- `public/legal/dpo-loader.js`

Now the strict CSP (`script-src 'self' https://esm.sh
https://cdn.jsdelivr.net`) accepts every script the shell needs
without `'unsafe-inline'`.

### Environment-variable knobs

- `BHARAT_OS_HSTS=1` → adds `Strict-Transport-Security` header.
  OFF by default so local dev (plain HTTP localhost) doesn't get
  locked into HTTPS-only.
- `BHARAT_OS_TRUST_PROXY=1` → trust `X-Forwarded-For` for rate-
  limiter client identification. Set this when behind nginx /
  Cloudflare / ALB.
- `BHARAT_OS_CORS_ORIGINS=https://foo.com,https://bar.com` →
  explicit CORS allowlist. Default is same-origin only.
- `BHARAT_OS_LOG_LEVEL=debug|info|warn|error` → log verbosity.
  Default `info`.

### Service worker

`bharat-os-shell-v24 → v25`. Added `/shell/sw-bootstrap.js` to
the precache list.

### Route listing

`GET /api` now includes `/healthz`, `/readyz`, `/metrics` so
ops can discover them.

## Tests

**`tests/node/security-headers.test.mjs`** — 7 tests
- strict default-src + frame-ancestors + object-src lockdown
- CDN allowlist (esm.sh + cdn.jsdelivr.net)
- **NO `'unsafe-inline'` and NO `'unsafe-eval'` in script-src**
- defence-in-depth fallback headers all present
- HSTS off by default, on with env var
- `applySecurityHeaders` writes headers via setHeader
- CSP extras let routes opt into additional origins

**`tests/node/rate-limiter.test.mjs`** — 13 tests
- token bucket initialises full, drains, refills linearly
- `tryConsume` reports `retryAfterSeconds` when over budget
- per-key isolation (Alice's quota ≠ Bob's)
- per-policy isolation (one route's quota ≠ another's)
- `policyFor` routes health probes / expensive routes correctly
- `clientKey` honours X-Forwarded-For only when trustProxy is on

**`tests/node/logger.test.mjs`** — 6 tests
- emits JSON-formatted lines with timestamp + level + message
- ERROR + WARN → stderr; INFO + ACCESS + DEBUG → stdout
- **PII keys silently replaced with `'<scrubbed>'`** (top-level
  AND nested)
- `generateRequestId` returns unique non-empty strings
- `safePath` strips query strings + non-ASCII

**`tests/node/metrics.test.mjs`** — 7 tests
- `metricPath` normalises bos:* IDs, pairing codes, SHA-256
- counters + histograms in Prometheus format
- **identity IDs never appear in metric labels** (the
  cardinality + privacy guard)
- histogram buckets are cumulative

Full suite: **322 / 322 green** (was 289; +33 new). SW cache to v25.

Live sanity confirmed every header, every endpoint, plus
end-to-end rate-limiter exhaustion (requests 1–10 → 201,
requests 11–12 → 429 with `Retry-After`, structured WARN log
emitted per rate-limit hit).

## §15 bindings — what changed

Nothing changed. All four artifacts are designed so observability
+ defence don't leak user data:

| Surface | §15-safe by design |
|---|---|
| Logs | PII-forbidden key allowlist scrubs at any depth. Path queries stripped. Non-ASCII replaced. User-Agent capped at 200 chars. |
| Metrics | `metricPath` strips identity IDs from labels. No per-user dimension exists. |
| Headers | No data about the user travels through Bharat OS's own headers (only the standard request-id which is per-request not per-user). |
| Rate limiter | Per-IP keying — does NOT consume `identityId` so there's no per-user log. Multi-tenant production should re-evaluate when bucket keys move to authenticated identity. |
| Health probes | No user data referenced. |

## Consequences

- **Bharat OS is now deployable.** Behind nginx / Cloudflare /
  ALB with `BHARAT_OS_TRUST_PROXY=1` + `BHARAT_OS_HSTS=1`, the
  server emits the correct headers, rate-limits per-IP, exposes
  liveness/readiness/metrics for the orchestrator, and shuts
  down gracefully on rolling deploys.
- **CSP is genuinely strict.** No `'unsafe-inline'` in script-src,
  no `'unsafe-eval'`, no broad CDN allowlist. Adding a new CDN
  needs an explicit ADR + a corresponding `extraScriptSrc` /
  `extraConnectSrc` opt-in.
- **PII discipline is enforceable.** A future contributor who
  accidentally logs `{ displayName: identity.displayName }` finds
  it silently scrubbed in production — and the test suite catches
  it before merge.
- **Observability without compromise.** Ops can scrape
  `/metrics` and pull per-route latency histograms without ever
  seeing a per-user dimension. The `metricPath` normalisation is
  one of the smaller-but-more-important §15 protections in the
  codebase.
- **322 / 322 tests**, SW cache to v25. Phase 4.2 (DB migration)
  can build on top of the stable, observable, hardened API.

## Future polish

- **Per-identity rate limiting** once we have authenticated
  routes — currently per-IP only. Identity-based quotas need a
  privacy-budget-style accountant (Phase 3.2 patterns apply).
- **Redis-backed rate-limiter** for multi-instance deployments.
  Public surface stays the same; swap the implementation behind
  `createLimiter`.
- **Pluggable log sinks** — today everything goes to stdout.
  Cloudwatch / Loki / Splunk / OpenTelemetry Collector can scrape
  stdout, but a direct shipper (with backpressure handling)
  reduces operational complexity.
- **Tracing** — request IDs exist but we don't yet emit
  OpenTelemetry spans. Cross-service tracing matters once Phase
  2b ships the Android-app side that calls into our API.
- **`/metrics` authentication** — currently public-read.
  Production behind a private network is fine; public-facing
  deployments should bind it to a private interface or require
  a bearer token.
- **CORS preflight cache** — currently a hard-coded 10-minute
  cache. Make this configurable per env.
- **Static page caching** — `/legal/*.html` could use a long
  cache TTL. Currently `no-store`.
- **Per-route timeout overrides** — federated round aggregation
  on a large round could exceed `requestTimeout`. Per-route
  override is a small addition.
