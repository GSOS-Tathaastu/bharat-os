# ADR 0136 — Phase 12.1a.2: Booking + Escrow + Provider Surface

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.1a.1 (ADR 0135) shipped marketplace discovery + citizen
browse + the "Express interest" stub. The stub emitted a typed
`marketplace.interest_expressed` ledger row so 12.1a.2 would have
a real precedent to upgrade.

Phase 12.1a.2 closes the loop: citizens can now lock escrow against
a Bharat-OS-native provider, providers receive push notifications
and accept / reject / mark-complete from `/provider/*`, and the
booking flows through a CAS-guarded state machine to either
`citizen_confirmed` (payout) or `cancelled_after_dispute` (refund).
A 24h auto-release window covers citizens who never re-open the
app; a 4h pre-accept expiry refunds idle bookings.

Per the founder directive `common-features-as-core-substrates`
(2026-06-01), reusable bits land in `src/phase0/` (BE) or
`frontend/src/lib/` + `components/<topic>/` (FE) — not under a
marketplace-shaped namespace.

## Decision

### 1. Booking record + state machine

`src/phase1/booking.mjs` (~620 lines). The booking is canonical;
frozen fields enforce rate immutability + identity binding.

```
{
  bookingId,                         // FROZEN
  citizenRootIdentityId,             // FROZEN
  providerIdentityId,                // FROZEN
  providerRootIdentityId,            // FROZEN (snapshotted)
  roleKind,                          // FROZEN (snapshotted)
  status,                            // mutable, CAS-guarded
  seq,                               // monotonic +1 / write
  rateSnapshot: {
    pricingBasis, ratePaisePerHour,
    ratePaisePerService, estimatedHours,
    quotedAmountPaise,               // ← what we lock; FROZEN
    snapshotAt
  },                                 // FROZEN
  pickupPoint: {
    lat, lng,                        // 4dp persist
    address, capturedAt,
    bubble1dp                        // 1dp for ledger emit
  },                                 // FROZEN
  distanceMetersAtBooking,           // FROZEN
  citizenNote,                       // FROZEN
  createdAt,                         // FROZEN
  /* lifecycle timestamps */
  transitions: [ {from, to, by, at, reason} ]   // APPEND-ONLY
}
```

State machine — 6 live + 4 terminal-refund:

```
  pre_authorized
    ├─ accept ─► in_progress
    │             ├─ mark-complete ─► provider_marked_complete
    │             │                       ├─ confirm ──► citizen_confirmed (T-release)
    │             │                       ├─ 24h elapsed ► auto_released (T-release, LAZY)
    │             │                       └─ dispute ──► disputed
    │             ├─ dispute ─────► disputed
    │             └─ cancel ──────► cancelled_by_citizen (T-refund)
    ├─ reject ─────────────────► rejected_by_provider (T-refund)
    ├─ cancel ─────────────────► cancelled_by_citizen (T-refund)
    └─ 4h elapsed ─────────────► expired_unaccepted (T-refund, LAZY)

  disputed
    └─ operator adjudicate ──► citizen_confirmed | cancelled_after_dispute
```

Lazy on read: `maybeAutoRelease(booking, {now})` is called by every
list / detail endpoint BEFORE returning. No node-cron. Operator
backstop at `POST /api/admin/bookings/sweep-stale` is CAS-safe so
it's idempotent.

### 2. CAS concurrency

Every transition increments `seq`. The API requires `expectedSeq`
in the body. `store.casUpdateBooking(bookingId, expectedSeq,
nextRecord, ledgerEvents)` atomically check+writes the booking
and appends the ledger events under `BEGIN IMMEDIATE / COMMIT`.
Second concurrent caller sees `rowsAffected === 0` and gets a
typed `stale_seq` (HTTP 409 with the current seq returned).

`node:sqlite` does NOT expose `db.transaction()` (a better-sqlite3
helper) — explicit BEGIN/COMMIT/ROLLBACK is used instead.

Per the adversarial review's ESCROW-CAS must-fix, the citizen
escrow envelope ALSO has `seq` + a parallel
`casUpdateCitizenEscrow`. The booking-create path uses this so
two parallel booking-creates for the same citizen cannot both
pass the available-balance check.

### 3. Provider auth — root identity, NO new bearer

`src/phase0/provider-auth.mjs` exports:

- `requireProviderOwnerAuth({store, providerIdentityId, request,
  body})` — asserts the acting identity owns the provider.
- `requireBookingPartyAuth({store, bookingId, request, body})`
  — resolves the booking and asserts the acting identity is
  citizen OR providerRoot.
- `requireCitizenOwnerAuth({store, citizenRootIdentityId,
  request, body})` — added per adversarial review PRIV-1+2
  (citizen booking + escrow GETs were originally trusting the
  URL identifier).

All three accept the acting identity via `actingRootIdentityId`
in body OR `X-Bharat-OS-Acting-Identity` header.

Bearer-mint for delegation (spouse / dispatcher / fleet) is an
honest Phase 12.3 follow-up — providers are citizens with
already-authenticated phones; a separate bearer is unnecessary
weight in 12.1a.2.

### 4. Push notifications — §15-redacted payloads

`src/phase0/booking-push.mjs` is the SINGLE payload builder. A
binding-grep test on the source asserts: no `displayName`,
no `phoneNumber`, no `.phone` accessor, no 4dp coordinate
literals or `.toFixed(4+)`.

Citizen-facing pushes carry generic body ("Tap to view in Bharat
OS"). The ONE exception is the provider's own payout push — its
body shows `₹{amount}` because it's the provider's own earnings,
not citizen PII.

### 5. Extracted core shared modules

Per the founder binding `common-features-as-core-substrates`:

- `src/phase0/escrow-paise.mjs` — entity-agnostic paise primitives
  (`depositPaise / lockPaise / debitLockedPaise / refundLockedPaise
  / availablePaise`). `sponsor.mjs` is a thin wrapper; 47 existing
  sponsor tests pass as the regression gate.
- `src/phase0/provider-auth.mjs` — also exports
  `requireCitizenOwnerAuth`, reusable for any future citizen-scoped
  read endpoint.
- `src/phase0/booking-push.mjs` — payload builders. Any future
  booking-like event (12.2 ratings, 12.3 mesh-payout) can compose.
- `src/phase0/geo.mjs::bubbleAt1dp(lat, lng)` — ledger-safe
  coarsening helper, reused for any module emitting location.

FE:

- `frontend/src/lib/format-paise.ts` — `Intl.NumberFormat`-based
  ₹ helpers.
- `frontend/src/lib/format-distance.ts` — distance bucketing.
- `frontend/src/lib/provider-context-store.ts` — Zustand persist
  for "which provider hat am I wearing" (not an auth credential).
- `frontend/src/components/booking/` — `BookingCard`,
  `BookingStatusPill`, `AutoReleaseCountdown`, `DisputeFileSheet`
  — composable by both surfaces.

### 6. API surface

```
POST /api/marketplace/bookings                      (citizen create, locks escrow with CAS)
GET  /api/marketplace/bookings/:bookingId           (party-aware projection; sweeps)
POST /api/marketplace/bookings/:bookingId/accept    (provider; CAS+expectedSeq)
POST /api/marketplace/bookings/:bookingId/reject    (provider; refunds escrow)
POST /api/marketplace/bookings/:bookingId/cancel    (citizen; refunds escrow)
POST /api/marketplace/bookings/:bookingId/mark-complete    (provider; starts 24h window)
POST /api/marketplace/bookings/:bookingId/confirm-complete (citizen; payout)
POST /api/marketplace/bookings/:bookingId/dispute   (either party; holds escrow)
GET  /api/citizens/:rootIdentityId/bookings         (owner-gated; sweeps)
GET  /api/citizens/:rootIdentityId/escrow           (owner-gated)
GET  /api/provider-identities/:providerIdentityId/bookings  (owner-gated; sweeps)
POST /api/admin/citizens/:rootIdentityId/escrow/deposit     (admin; bookkeeping-v1)
GET  /api/admin/bookings?status                     (admin; operator queue)
POST /api/admin/bookings/:bookingId/adjudicate      (admin; release_to_provider | refund_to_citizen)
POST /api/admin/bookings/sweep-stale                (admin; backstop)
```

### 7. FE surface

- `/citizen/services/book/:providerIdentityId` — BookingComposer
  with rate-basis chooser, geolocation pickup capture at 2dp
  ('medium' precision), address + note, "Lock escrow + send
  booking" CTA.
- `/citizen/services/bookings` — citizen list.
- `/citizen/services/bookings/:bookingId` — detail with
  Confirm / Cancel / Dispute actions and AutoReleaseCountdown.
- `/provider/*` — new 5-tab surface (Inbox / Active / History /
  Profile / Settings), rooted on root-identity ownership +
  provider-context-store hat-toggle.
- `/provider/bookings/:bookingId` — ProviderBookingDetail with
  Accept / Reject / Mark-complete / Dispute actions.

The existing `/citizen/services/provider/:id` detail page gained
a primary "Book now" CTA above the (preserved) "Express interest"
soft-touch.

### 8. Bookkeeping-v1 funding mode

Citizens fund their escrow via `POST /api/admin/citizens/:id/
escrow/deposit` (admin-token gated). This stands in for a real
UPI / PSP rail until Phase 12.2+ ships the adapter. Every escrow
envelope carries `fundingMode: 'bookkeeping-v1'` so the design
is honest about not pretending to settle real money.

## Process

1. **Understand** — reused 12.1a.1's substrate map (7 parallel
   Explore agents from the prior phase).
2. **Design** — 3 lenses (simplicity-first, safety-first,
   provider-UX) × 2 judges → synthesis. Critical convergences:
   6-state machine, CAS+seq, lazy auto-release, root-identity
   auth not bearer, `/provider/*` route, citizen-side admin
   deposit endpoint.
3. **Implement** — substrate → store → API → tests → FE lib →
   FE components → FE routes.
4. **Adversarial review** — 3 lenses (privacy, safety, UX) +
   triage. **3 must-fix + 10 should-fix** identified; the 3
   must-fix + 6 of the should-fix landed before commit.

## Adversarial fixes applied

Must-fix:
- **PRIV-1**: `GET /api/citizens/:id/bookings` was unauthenticated.
  Now requires acting identity match via new
  `requireCitizenOwnerAuth` helper.
- **PRIV-2**: `GET /api/citizens/:id/escrow` was unauthenticated.
  Same fix.
- **ESCROW-CAS**: `saveCitizenEscrow` had no CAS — two parallel
  booking-creates could both lock past available balance. Added
  `seq` to the citizen-escrow record and `casUpdateCitizenEscrow`
  store helper with `BEGIN IMMEDIATE` serialisation. Booking-create
  path now retries once on stale_seq, returns 409
  `escrow_concurrent_update` on second failure.

Should-fix:
- **UX-1**: rate-basis picker now renders honestly when only one
  rate is set (and useEffect auto-flips state).
- **UX-2**: replaced "top up via admin (bookkeeping-v1)" with
  user-facing "Add funds to your account" copy.
- **UX-4**: warmer ProviderInbox empty state.
- **UX-8**: re-framed provider pre-accept pickup mask as a
  citizen-safety feature, not a paywall.
- **UX-10**: ProviderHistory empty state aligned tone with inbox.
- **TEST-AUTH**: 3 new tests covering PRIV-1 / PRIV-2 / ESCROW-CAS
  + 1 new fixture-update covering the auth header.

Deferred to 12.2 / 12.3 / polish:
- DOUBLE-SWEEP reorder (settle/refund vs CAS) — current ordering
  is correct; the concern was speculative.
- ATOMICITY / LEDGER-TIMING — documentation, not bugs.
- DISPUTE-RACE — CAS already serialises.
- UX-3 (disabled fieldset during create) — visual polish.
- UX-5 (AutoReleaseCountdown post-0 state) — minor.
- UX-6 (post-dispute next-step card) — minor.
- UX-7 (sign-out confirmation modal) — defensive but optional.
- PRIV-3 (citizenRootIdentityId in `booking.escrow_refunded`)
  — necessary for refund routing; the ledger is an internal
  audit surface, not a public read.

## Consequences

- **The marketplace loop closes.** A citizen can browse → book →
  pay via on-device escrow → receive completion → confirm or
  dispute → see refund or payout. A provider receives push,
  accepts, marks complete, and sees their earnings.
- **CAS bake-in at two layers** (booking + citizen-escrow) gives
  honest concurrency guarantees the §15 binding requires:
  citizens cannot accidentally double-book past their balance;
  providers cannot accidentally double-accept the same booking.
- **Operator audit surface is real**. Disputed bookings show up
  on `GET /api/admin/bookings?status=disputed` and adjudication
  flows through `/adjudicate`. Operator console FE comes in 12.2;
  for now demo uses curl.
- **No new npm dep**. Web Crypto + Node stdlib only on BE; React
  + react-query + zustand + tailwind on FE (already there).
- **The §15 NO-COMMISSION binding holds at code level**. Grep
  tests on `booking.mjs` + `booking-push.mjs` forbid commission/
  takeRate/platformFee/platformShare fields. Ledger PII replay
  asserts no 4dp coords in any `booking.*` event.

## What's NOT in 12.1a.2 (deferred)

- Real money rail (UPI VPA verification + PSP-validated
  settlement) — bookkeeping-v1 funding stands in for the demo.
- Per-role booking forms (Phase 12.2 SLM dynamic-form).
- Ratings + Trust Passport feedback loop into provider rank
  (Phase 12.2).
- Active ONDC bridge integration.
- Operator console FE for dispute adjudication (API ready; UI
  later).
- Multi-day, recurring, slot-calendar bookings (Phase 12.2+).
- Split dispute outcome (currently release-to-provider OR
  refund-to-citizen only).
- Bearer-mint flow for delegation (spouse / dispatcher / fleet)
  — Phase 12.3.
- "start" transition between accept and complete (collapsed to
  single in_progress).
- Provider availability toggle (online/offline) — Phase 12.2.
- Cancellation fee on cancel-after-accept (documented griefing
  surface; awaits Phase 12.2 ratings to dampen).

## Files

NEW (BE):
- `src/phase0/escrow-paise.mjs` — entity-agnostic paise primitives.
- `src/phase0/provider-auth.mjs` — provider + citizen owner-auth
  + booking-party-auth gates.
- `src/phase0/booking-push.mjs` — §15-redacted payload builders.
- `src/phase1/citizen-escrow.mjs` — per-citizen escrow envelope
  with seq.
- `src/phase1/booking.mjs` — booking record + state machine +
  immutability + lazy auto-release.
- `tests/node/booking.test.mjs` — 30 cases.

EXTENDED (BE):
- `src/phase1/sponsor.mjs` — escrow helpers now thin wrappers
  over `escrow-paise`.
- `src/phase0/geo.mjs` — added `bubbleAt1dp`.
- `src/phase0/store.mjs` + `src/phase0/sqlite-store.mjs` —
  bookings + citizen_escrows tables + CAS update helpers + DPDP
  cascade.
- `src/phase0/api.mjs` — 11 new endpoints (booking lifecycle,
  citizen escrow, admin adjudicate, admin sweep, admin deposit).

NEW (FE):
- `frontend/src/lib/format-paise.ts` + `format-distance.ts`.
- `frontend/src/lib/provider-context-store.ts`.
- `frontend/src/components/booking/{BookingCard, BookingStatusPill,
  AutoReleaseCountdown, DisputeFileSheet, index.ts}`.
- `frontend/src/routes/provider/{ProviderSurface, ProviderBottomNav,
  ProviderInbox, ProviderActive, ProviderHistory, ProviderProfile,
  ProviderSettings, ProviderBookingDetail}`.
- `frontend/src/lib/format-paise.test.ts` + `format-distance.test.ts`
  vitest contracts.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — BookingStatus / PricingBasis /
  RateSnapshot / PickupPoint / PublicBooking / PublicCitizenEscrow
  types + 6 hooks (useCitizenEscrow, useCitizenBookings, useBooking,
  useProviderInbox, useCreateBooking, useBookingTransition).
- `frontend/src/routes/CitizenServices.tsx` — Book now CTA on
  provider detail; BookingComposer; CitizenBookingsList;
  CitizenBookingDetail.
- `frontend/src/App.tsx` — `/provider/*` under ProtectedSurface.

## Test results

- Node tests: **975/975 green** (up from 971; 30 new booking tests
  including PRIV-1 / PRIV-2 / ESCROW-CAS regression cases).
- Vitest: **66/66 green** (+2 new from format-paise / format-distance).
- tsc: clean.
- Build: 528 → 557 KB / 156 KB gzipped (+29 KB for provider
  surface + booking components + hooks + format helpers).
