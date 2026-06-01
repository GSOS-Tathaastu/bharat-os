# ADR 0141 — Phase 12.2.1: External-adapter substrate + Nominatim reverse geocoder (first real API integration)

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.1b closed the on-device SLM arc (A → D). The next user
directive: *"continue and let's start integrating APIs also one by
one."* — first concrete step out of the offline-only / stub-only
posture the MVP has had since Phase 12.0.

Two problems we don't want to solve five times:

1. **Discipline.** Every future external API (DigiLocker, Aadhaar
   e-KYC, GST verification, UPI rails, NPCI) needs the same
   guard-rails: polite User-Agent, conservative rate limit,
   stub-vs-live mode, audit-ledger emission that records *meta*
   but never the response body, response cache keyed on the
   coarsened citizen pointer (§15). Hand-coding each adapter
   duplicates 200 lines and invites drift.
2. **Demo safety.** A demo deployment without UIDAI / DigiLocker
   keys should still produce deterministic responses so the
   citizen / provider flows can be smoke-tested without burning a
   real Aadhaar OTP.

The right design is a thin substrate (`createAdapter`) that owns
the cross-cutting concerns once, plus one concrete adapter that
proves the substrate end-to-end. Nominatim is the right choice for
the proof:

- It's the API behind OpenStreetMap reverse geocoding. Free, no
  API key needed, no PII upload required.
- It has a **strict** documented usage policy (1 req/sec, polite
  User-Agent with contact info, no bulk usage). If the substrate
  is wrong about rate-limiting or politeness, Nominatim is the
  loudest place to find out.
- The output is genuinely useful — "Near Shivajinagar, Pune"
  instead of "18.52, 73.86" everywhere a pickup point is
  rendered.

## Decision

### 1. `src/phase0/external-adapter.mjs` substrate

`createAdapter({name, userAgent, request, mode, modeEnvVar, rateLimit, cache, timeoutMs, liveFetch, store, logger, defaultMode}) → {name, mode, call, clearCache, inspectCache}`.

The caller-provided `request(args)` returns:
`{cacheKey: string, stub: any, build: () => {url, init, parse}}`.

Responsibilities the substrate owns:

- **Mode.** `stub | live`. Resolved from explicit `mode`, then
  `process.env[modeEnvVar]`, then `defaultMode` (`stub`).
  Invalid env values fall back to stub + log a warning.
- **Cache.** In-memory LRU per adapter with TTL + max-entries
  eviction. Pointer-not-payload — the caller MUST hand a
  coarsened key (eg `bubble1dp` for geo, `pan_last4` for KYC).
- **Rate limit.** Token-bucket, default 1 req/sec (Nominatim's
  policy). Returns `ExternalAdapterError(rate_limited, 429)`
  before reaching the upstream so retries are predictable.
- **Polite citizenship.** Injects `User-Agent: BharatOS/<v>
  (contact)` + `Accept: application/json` headers on every live
  call. Live mode throws at adapter construction if no UA was
  supplied.
- **Timeouts.** 6s default via `AbortController`. Surfaces as
  `network_error / 502`.
- **Audit ledger.** Every call emits an
  `external_adapter.call` event with `{adapter, mode, cacheKey,
  status, latencyMs, at}`. Status values: `cache_hit | stub_ok
  | live_ok | http_<status> | network_error`. **Never** the
  response body. Third-party PII never lands on the §15 ledger.

`ExternalAdapterError {code, message, status}` — kebab `code`
values stable across adapters: `adapter_invalid_request |
rate_limited | network_error | upstream_error | parse_error |
no_fetch`.

### 2. `src/phase1/nominatim-geocoder.mjs` adapter

Composes the substrate with:

- `name: 'osm-nominatim'`.
- `userAgent: 'BharatOS/0.1 (+https://github.com/bharat-os)'`.
- `modeEnvVar: 'BHARAT_OS_NOMINATIM_MODE'`.
- `rateLimit: {ratePerSecond: 1}` — matches the documented OSM
  cap exactly.
- `cache: {ttlMs: 24h, maxEntries: 5_000}` — 24h because
  reverse-geocode results don't move on geological timescales.
- `timeoutMs: 4_000`.
- `cacheKey = '<round1(lat)>,<round1(lng)>'` — the 1dp bubble
  (≈ 11 km). Two pickups in the same bubble share one upstream
  call; the upstream URL is built from the rounded value, so
  even the wire never sees the 4dp citizen pickup.
- Stub mode returns `{label: 'Near point <lat1dp>, <lng1dp>',
  countryCode: 'in', ...nullables}` so demo deployments without
  `BHARAT_OS_NOMINATIM_MODE=live` still render something
  sensible.
- Live mode hits
  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=<r1>&lon=<r1>&zoom=14&addressdetails=1&accept-language=en`
  and lifts `{label, suburb, city, state, countryCode, osmId}`
  from `display_name + address`. The full 50-key Nominatim
  response is NOT echoed downstream — the citizen-side UI can't
  accidentally render raw upstream PII.

### 3. `GET /api/geocode/reverse?lat&lng` endpoint

`createPhase0ApiServer({store, nominatim})` accepts an
optional `nominatim` injection (used by tests with `liveFetch`).
Default is a Nominatim singleton bound to the store so the
in-memory cache + rate-limit state persist across requests.

Response: `{ok, mode, source, place, latencyMs, at}`.
Failure modes:
- Missing lat/lng → `400 lat_lng_required`.
- Out-of-range / non-finite → `400 adapter_invalid_request`.
- Rate-limited → `429 rate_limited`.
- Network / upstream → `502`.
- Never proxies the raw upstream error message (would leak
  Nominatim version strings).

### 4. FE — `useReverseGeocode` hook + `PickupAreaHint` component

- `frontend/src/lib/use-reverse-geocode.ts`:
  - `useReverseGeocode({lat, lng, enabled})` — TanStack Query
    on `/api/geocode/reverse` keyed on the 1dp bubble. Disabled
    until lat/lng are finite. `staleTime: 24h` matches the
    server-side TTL.
  - `formatPlaceLabel(place)` — prefers "Suburb, City", falls
    back to "City, State", then the first 2 comma-tokens of
    the upstream label, then null.
- `frontend/src/components/geo/PickupAreaHint.tsx` — wraps the
  hook + renders nothing while pending / errored, so the
  existing fallback text stays visible. Accepts either
  `{lat, lng}` or a `bubble1dp` string and parses it.
- Wired into:
  - `ProviderBookingDetail.tsx` — both branches (post-accept
    full coord AND pre-accept `bubble1dp` masked branch).
  - `CitizenServices.tsx` booking detail — the citizen's view.

### 5. §15 bindings honored

- **No PII on the ledger.** `external_adapter.call` events
  carry `{adapter, mode, cacheKey, status, latencyMs, at}`. A
  vitest binding case asserts `!('body' in event)` and that
  the JSON-serialised event matches `!/[0-9]+\.[0-9]{4,}/`
  (no 4dp coord).
- **Pointer-not-payload.** The cache key is the 1dp bubble
  (~11 km coarsening). The substrate doesn't enforce
  coarsening for the caller, but Nominatim does explicitly,
  and the binding-grep test would catch a 4dp leak.
- **Polite citizenship.** UA `BharatOS/0.1
  (+https://github.com/bharat-os)` includes a contact URL.
  A vitest case asserts UA matches `/^BharatOS\//` and
  contains parens.
- **Stub-first default.** No upstream call until an operator
  explicitly sets `BHARAT_OS_NOMINATIM_MODE=live` in env.
  Test sweep runs entirely in stub mode.
- **Honest failure modes.** Rate-limited returns 429 with a
  human retry hint. Upstream non-OK returns 502 without
  leaking the upstream error body.

### 6. Tests

`tests/node/external-adapter.test.mjs` — 18 cases:

- Substrate: protocol version, missing-name / missing-request
  rejection, live-mode-needs-UA, stub-mode determinism +
  audit, live-mode fetch + UA injection + parse + cache,
  rate-limit 429 (must NOT hit upstream), network error,
  upstream 503 → upstream_error 502, missing cacheKey →
  adapter_invalid_request.
- Nominatim: protocol version, stub determinism, 1dp-bubble
  cache key + §15 binding (no 4dp in audit JSON), out-of-range
  lat/lng rejection, live-mode URL builder + UA + parse.
- HTTP: `GET /api/geocode/reverse` happy path / missing
  params / invalid input / injected-adapter end-to-end with
  a `liveFetch` mock recording the upstream URL + ledger
  state.

`frontend/src/lib/use-reverse-geocode.test.ts` — 4 vitest
cases for `formatPlaceLabel`.

### 7. What's NOT in 12.2.1 (deferred)

- Forward geocoding (text → coord). Phase 12.2.x if a
  citizen-side address-search surface emerges.
- Place autocomplete (typeahead). Phase 12.2.x.
- DigiLocker / Aadhaar e-KYC / GST adapters. Each is a Phase
  12.2.x once the user provisions sandbox keys.
- UPI / payment-rail adapter. Phase 12.2.x, larger surface
  (UDIR, NPCI vs bank-adapter split).
- Distributed rate-limit (multi-process). Phase 13.x when the
  server clusters; today the substrate is single-process.
- Adapter-versioned response schemas + migration. Phase 13.x
  if an upstream breaks compat — for now the lift functions
  defensively pick fields.
- Persistent audit cap / rotation. Phase 13.x once ledger
  growth becomes a thing.
- Operator console for `external_adapter.call` events. Phase
  12.2.x; the ledger is queryable from the existing operator
  endpoints already.

## Process

1. **Substrate design** — read the Phase 9.0c lazy-runtime
   pattern + Phase 12.1b.2 idempotency substrate to keep the
   shape consistent (factory function returning
   `{name, mode, call, ...}`).
2. **Adapter** — `nominatim-geocoder.mjs` composed the substrate
   in ~100 lines; OSM Nominatim was the proof because its strict
   policy forces the substrate's politeness disciplines to be
   correct on first contact.
3. **API + FE** — endpoint wired straight into
   `createPhase0ApiServer`, FE hook + `PickupAreaHint` component
   replace the bare lat/lng line on both booking detail pages.
4. **Tests** — substrate cases ran first (mode dispatch,
   rate-limit, audit shape), then adapter cases, then HTTP
   integration. All node + vitest green on first sweep.

## Files

NEW (BE):
- `src/phase0/external-adapter.mjs` (~320 lines).
- `src/phase1/nominatim-geocoder.mjs` (~110 lines).
- `tests/node/external-adapter.test.mjs` (18 cases).

NEW (FE):
- `frontend/src/lib/use-reverse-geocode.ts`.
- `frontend/src/lib/use-reverse-geocode.test.ts` (4 cases).
- `frontend/src/components/geo/PickupAreaHint.tsx`.

EXTENDED:
- `src/phase0/api.mjs` — new `GET /api/geocode/reverse`
  endpoint + nominatim singleton parameter on
  `createPhase0ApiServer`.
- `frontend/src/components/geo/index.ts` — re-exports
  `PickupAreaHint`.
- `frontend/src/routes/provider/ProviderBookingDetail.tsx` —
  PickupAreaHint above the lat/lng line on both branches.
- `frontend/src/routes/CitizenServices.tsx` — PickupAreaHint
  on the citizen booking detail pickup card.

## Test results

- Node tests: **1053/1053 green** (1035 baseline + 18 new
  external-adapter cases).
- Vitest: **119/119 green** (+4 reverse-geocode formatter
  cases).
- tsc: clean.
- Build: main bundle unchanged at 599 KB / 170 KB gzipped —
  the FE additions inline into the existing chunk.
