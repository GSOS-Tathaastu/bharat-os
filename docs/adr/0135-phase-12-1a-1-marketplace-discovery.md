# ADR 0135 — Phase 12.1a.1: Marketplace Discovery Substrate + Citizen Browse

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.0 stood up the providerIdentity substrate (Aug 2026: roles, KYC
levels, state machine, ledger events, DPDP §12(3) cascade). At the close
of Phase 12.0.5 (sponsor admin surface, ADR 0134), the substrate sweep
arc was complete — every Phase 1→12 substrate any persona could plausibly
use is now wired into `/app/*`.

The next phase, **Phase 12.1a** (marketplace substrate), was scoped at ~2
weeks in the ROADMAP. To respect the FE-BE parity binding while staying
shippable, we split it into two sub-phases:

- **12.1a.1 — discovery + browse (this ADR).** Geo schema on
  providerIdentity, marketplace discovery endpoint, citizen browse
  surface, "Express interest" stub for the deferred booking flow.
- **12.1a.2 — booking + escrow + provider surface (next session).**
  Booking entity, parallel citizen→provider escrow, /app/provider/*
  surface, push notification on incoming booking.

This ADR locks the 12.1a.1 substrate. Per the founder directive
2026-05-31, geolocation primitives are extracted as a **core shared
module** (`src/phase0/geo.mjs` + `frontend/src/lib/geo.ts` +
`frontend/src/lib/geolocation.ts` + `frontend/src/components/geo/*`) so
12.1a.2 booking, 12.2 provider tracking, mesh node locality, and
regulator audits can all build on the same chokepoint.

## Decision

### 1. Geo schema on providerIdentity (discriminated union)

`serviceArea` accepts exactly two shapes:

```js
// point-radius (the marketplace-discoverable shape)
{
  kind: 'point-radius',
  center: { lat, lng },        // WGS84-ish, persisted at 4dp (~11 m)
  radiusMeters,                // integer, 500..50000
  summary,                     // optional landmark label, ≤120 chars
  source,                      // 'geolocation' | 'manual' | 'city-default'
  capturedAt                   // ISO timestamp
}

// legacy-summary (Phase 12.0 free-text record, read-coerced)
{ kind: 'legacy-summary', summary }
```

- Polygon (and any other `kind`) is **rejected loudly** with
  `service_area_polygon_not_yet_supported`. Forward-compat surface for
  Phase 12.2+ polygon picker without a silent unknown-kind path.
- `coerceServiceAreaShape()` is wired into `BosStore` + `SqliteStore`
  read paths so Phase 12.0 rows hydrate as `legacy-summary` and are
  silently excluded from discovery (but not lost).
- `hasDiscoverableGeo(area)` predicate gates marketplace inclusion.
- `transitionProviderStatus(draft→submitted)` AND `attestProviderKyc`
  auto-submit BOTH refuse without `point-radius` geo. Operators cannot
  KYC-attest a provider that has no pin.

### 2. Asymmetric privacy: persist 4dp, emit 2dp

The publicProviderRecord centroid is coarsened from **4dp (~11 m, the
persisted value) → 2dp (~1.1 km, the emitted value)** via the new
`toPublicServiceArea()` helper.

Rationale: a sorted "nearby providers" list returned to citizens with
4dp centroids would pinpoint a household-help worker's home address to
a single building. Solo women workers have a sharper threat model than
a citizen searcher; the asymmetric rounding closes that gap. The 4dp
value stays internal for forward-compat with a future booking flow
that needs higher precision for pickup confirmation (gated behind
owner identity, not the public read).

### 3. Shared geo module (cross-phase reuse)

Per founder directive: geo helpers are extracted as a **core
substrate**, not marketplace-specific.

Backend `src/phase0/geo.mjs` exports:
- `EARTH_RADIUS_M`, `INDIA_BBOX`
- `round1` (~11 km, ledger buckets), `round2` (~1.1 km, public emit),
  `round4` (~11 m, substrate persist) — all short-circuit on null
- `isFiniteLat`, `isFiniteLng`, `isInsideIndiaBbox`
- `haversineMeters`, `distanceBand`, `bubblesOverlap`

Backend `src/phase1/marketplace-discovery.mjs` imports + re-exports the
shared geo primitives and adds marketplace-specific:
- `kycRank` (verified > basic > none for ranking)
- `rankProviders({origin, candidates, radiusMeters, role, limit})`
- `DEFAULT_QUERY_RADIUS_M = 5000`, `MAX_QUERY_RADIUS_M = 25000`

Frontend mirrors:
- `frontend/src/lib/geo.ts` — same primitives + `distanceBandLabel` +
  `INDIA_CITIES` (30 centroids) + `findCityCentroid`.
- `frontend/src/lib/geolocation.ts` — `useGeolocationCapture({precision:
  'coarse'|'medium'|'fine'})` hook + verbatim consent copy
  (`LOCATION_CONSENT_COPY`, `PROVIDER_CONSENT_COPY`). Raw
  `GeolocationPosition` is consumed in the success-callback closure;
  ONLY the rounded value crosses any `setState` boundary.
- `frontend/src/components/geo/` — `LocationConsentSheet`,
  `CityPickerSheet`, `ServiceAreaPicker` (provider-side capture).

Phase 12.1a.2 and beyond can compose any of these without reimporting
marketplace concepts.

### 4. Marketplace API

- `GET /api/marketplace/providers?lat&lng&radiusMeters&role&limit`
  - Public. Wrapped by existing rate-limiter (`policyFor → 'read'`).
  - Defensively re-rounds query lat/lng to 1dp; validates ranges
    (400 `invalid_geo_query`) and role (400 `invalid_role`).
  - Returns ranked `publicProviderRecord` shape + `distanceBand` pill
    + `withinServiceRadius` bool. **No precise distanceMeters in
    response.**
  - Emits one anonymous `marketplace.searched` ledger event per call
    with `{roleKind, radiusMeters, providerCount, latBucket,
    lngBucket, at}` — **no citizen identity attached even when a
    session is present**.

- `POST /api/marketplace/providers/:providerIdentityId/express-interest`
  - Stub for the deferred booking flow (12.1a.2). Validates citizen
    identity EXISTS in the store (PRIV-1 adversarial fix), then emits
    typed `marketplace.interest_expressed` ledger event carrying
    `{providerIdentityId, citizenRootIdentityId, roleKind, note, at}`.
  - Session-binding (full auth) deferred to 12.1a.2 when escrow lands.
  - Note normalised: CRLF→LF, BOM stripped, trimmed, empty→null
    (EC-2 adversarial fix).

### 5. Citizen browse surface (no 6th tab)

Three nested routes under `/citizen/services` (via App.tsx ordering
that places the more-specific path before `/citizen/*`):

- `/citizen/services` — role tiles for wave-1 (cab-driver,
  personal-driver, household-help, labourers).
- `/citizen/services/role/:roleKind` — geolocation consent + city
  fallback → nearby providers list with `distanceBand` pill.
- `/citizen/services/provider/:providerIdentityId` — public profile +
  "Express interest" stub.

No 6th bottom-nav tab. CitizenHome intercepts "Book a cab" + "Hire
household help" suggestions to deep-link directly into the role browse
(makes discovery feel native to the intent box) and adds a sticky
"Browse providers near you" card above the suggestions.

### 6. Provider onboarding upgrade

`ProviderOnboarding.tsx` replaces the free-text `areaSummary` field
with the shared `<ServiceAreaPicker/>` component:
- "Use my current location" → fine-precision (4dp) capture.
- "Pick a city" → 30 India city centroids with tier-1 (8–10 km) /
  tier-2 (5 km) default radii.
- Radius slider 500m..50km, default 5 km.
- Optional area label (≤120 chars).
- Plain-language warning: "Citizens will see this pin — choose a
  landmark near you, not your home." (Adversarial review UX-2: the
  legacy-summary migration banner renders at the TOP, before the
  form, so providers returning to an old draft see action is required
  pre-flight, not after they've already touched controls.)

### 7. ONDC suppression (binding)

`marketplace-discovery.mjs` never imports `tools.mjs` (which hosts the
ONDC-beckn bridge stub). The discovery endpoint is **native-only by
construction**. A grep test in `marketplace-discovery.test.mjs`
asserts: (a) no `tools.mjs` import; (b) no `commission` /
`commissionPaise` / `commissionPct` / `takeRate` / `platformFee` /
`bharatOsFee` field in the source.

When supply is thin, the citizen sees: "No Bharat OS providers near
you yet. We don't fall back to other apps automatically — that would
mean a cut. Invite someone you trust to onboard, or check a nearby
city." — matches the `ondc-bridge-hidden-v1` direction memo verbatim.

### 8. Adversarial review (2 must-fix + 7 should-fix applied)

Two parallel Workflow passes:
1. Understanding (7 Explore agents mapping providerIdentity /
   booking-escrow / geo / ONDC / citizen-surface / provider-surface /
   roadmap-and-ADRs).
2. Design (3 lenses × 2 judges → final spec).
3. Implementation.
4. Adversarial review (3 lenses: privacy / UX / edge-case → triage).

Triage produced 2 must-fix (both applied):
- **PRIV-1**: express-interest endpoint accepted spoofed
  `citizenRootIdentityId`. Fixed by adding `store.readIdentity` check
  that returns 404 `citizen_not_found` before ledger emit.
- **EC-2**: `note` field passed CRLF + UTF-8 BOM through to ledger.
  Fixed with `replace(/\r\n/g,'\n').replace(/^﻿/, '').trim()`,
  empty→null collapse.

7 should-fix (all applied):
- **EC-1**: `updateProviderProfile({serviceArea: null})` on an
  active/submitted provider would silently delist. Now throws
  `service_area_required`.
- **EC-3**: `rankProviders({radiusMeters: 0})` produced empty bubble.
  Now falls back to `DEFAULT_QUERY_RADIUS_M`.
- **UX-1**: stale "interest sent" card persisted after sign-out toast.
  Fixed by resetting `sent` + `note` in the error branch.
- **UX-2**: legacy-summary migration warning was buried at the bottom
  of `ServiceAreaPicker`. Moved to the top.
- **UX-5**: provider-list error state had no retry button. Added
  `<Action onClick={() => nearby.refetch()}>Retry</Action>`.
- **UX-11**: `KYC_TONE.none = 'warning'` falsely alarmed citizens
  about Phase-12.0-era providers waiting for the Phase 12.2 KYC
  adapter. Changed to `'neutral'`.
- **UX-12**: service-only providers (no hourly rate) looked
  priceless. Now show whichever rate is set + honest "discuss with
  provider" fallback when both are zero.
- **PRIV-5**: no opt-out path from the location consent prompt. Added
  optional `onDontAskAgain` prop to `LocationConsentSheet`; wired in
  `CitizenServices` so a session-scoped flag suppresses future
  prompts and steers to `CityPickerSheet`.

Defer (in 12.1a.2 / 12.2 / polish):
- PRIV-2 (geolocation hook strict-mode closure — speculative; coords
  rounded synchronously inside callback before any state).
- PRIV-3 (full session auth on express-interest — deferred to
  12.1a.2 booking flow).
- PRIV-4 (per-IP rate-limit on marketplace.searched against
  micro-movement reconstruction — coords already 1dp coarse).
- PRIV-6 (manual coordinate edit UI — not present today).
- UX-3 / UX-4 / UX-6 / UX-7 / UX-8 / UX-9 / UX-10 / UX-13 (visual
  + navigation polish).
- EC-4 / EC-5 / EC-6 / EC-7 / EC-8 (test coverage gaps; backlog
  for 12.1a.2 hardening pass).

## Consequences

- **Phase 12.1a substrate started.** Providers can publish a real
  geo-pinned profile; citizens can find them. Booking remains stubbed
  via "Express interest" (typed ledger row that 12.1a.2 can upgrade
  to a real booking entity).
- **Geo as a shared core substrate**, not marketplace-specific. Three
  rounding chokepoints (`round1`/`round2`/`round4`) cover ledger
  emit, public response, and substrate persist respectively. Any
  future module that touches location should compose these helpers
  rather than reinventing rounding.
- **Asymmetric privacy bake-in.** Provider centroid 4dp internal /
  2dp public; citizen lat/lng 1dp in ledger / never raw anywhere.
  Centroids carry no operational metadata (`source`, `capturedAt`)
  on the public surface.
- **ONDC suppression codified.** Native-only discovery enforced by
  the import-graph + binding tests. Phase 12.1a.2 booking will
  reinforce this: invite-a-provider empty state, not ONDC fallback.
- **No new npm dep.** Web Crypto + browser geolocation API only on
  the FE; Node stdlib only on the BE.

## What 12.1a.1 explicitly defers to 12.1a.2

- Booking entity + state machine (draft → pending → accepted →
  in_progress → provider_marked_complete → citizen_confirmed |
  disputed | auto_released_24h).
- Citizen-booking escrow (parallel to sponsor escrow: deposit / lock
  / release / refund).
- `/app/provider/*` surface for accepting incoming bookings.
- Push notification to provider on new booking.
- Rate snapshot at booking time (immutable in booking record).
- Dispute resolution.

## What 12.1a.1 explicitly defers to 12.2+

- Per-role KYC wizard (Aadhaar e-KYC + role-specific docs).
- Maps library (Leaflet / Mapbox) for polygon picker.
- Trust Passport feedback loop on provider ratings.
- Active ONDC bridge integration.
- Geo SQL indexing (currently full-scan; fine for pilot scale).

## Files

NEW (BE):
- `src/phase0/geo.mjs` — shared geo primitives.
- `src/phase1/marketplace-discovery.mjs` — kycRank + rankProviders +
  constants; re-exports phase0/geo helpers.
- `tests/node/geo.test.mjs` — 14 cases pinning the shared primitives.
- `tests/node/marketplace-discovery.test.mjs` — 37 cases covering
  rank order, bubble overlap, polygon rejection, public centroid
  2dp, anonymous ledger, ONDC suppression grep, PRIV-1/EC-1/EC-2/EC-3
  regression tests.

NEW (FE):
- `frontend/src/lib/geo.ts` — primitives + INDIA_CITIES.
- `frontend/src/lib/geolocation.ts` — `useGeolocationCapture` hook +
  consent copy constants.
- `frontend/src/lib/geo.test.ts` — 13 vitest cases.
- `frontend/src/components/geo/{LocationConsentSheet,CityPickerSheet,ServiceAreaPicker,index.ts}`.
- `frontend/src/routes/CitizenServices.tsx`.

EXTENDED (BE):
- `src/phase1/provider-identity.mjs` — discriminated-union schema,
  `toPublicServiceArea`, `hasDiscoverableGeo`, state-machine guards.
- `src/phase0/api.mjs` — `GET /api/marketplace/providers` + `POST
  .../express-interest`; help-text inventory.
- `src/phase0/store.mjs` + `src/phase0/sqlite-store.mjs` — read-time
  serviceArea hydration.
- `tests/node/provider-identity.test.mjs` — fixtures updated.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `ServiceArea` discriminated-union
  type, `useNearbyProviders`, `usePublicProvider`, `useExpressInterest`.
- `frontend/src/routes/ProviderOnboarding.tsx` — replaced free-text
  with `ServiceAreaPicker`.
- `frontend/src/routes/CitizenHome.tsx` — SUGGESTIONS now
  `{text, target?}`; "Book a cab" deep-links; "Browse providers"
  card.
- `frontend/src/App.tsx` — `/citizen/services/*` route added before
  `/citizen/*`.

## Test results

- Node tests: **945/945 green** (up from 941; 4 new tests added).
- Vitest: **58/58 green**.
- tsc: clean.
- Build: 528 KB main / 150 KB gzipped (+23 KB from 12.0.5's 505 KB —
  the new browse routes + ServiceAreaPicker + city-centroids data +
  hooks). wllama lazy chunk unchanged 292 KB / 126 KB gzipped.
