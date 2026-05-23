# ADR 0062: §13B Mesh Contribution Loop in the PWA

## Status

Accepted

## Context

§13B builds the entire compute/storage marketplace economics on the
**Net Contribution Score (NCS) fair-use lever** — operators earn fiat
credits as their idle device serves real work; NCS ≥ 0 means free
service, NCS < 0 means pay on a progressive curve. ADR 0046 surfaced
NCS as a derived read-model (capacity minus consumption). What was
missing: actual *events* that grow the contributed side dynamically as
the device serves work. Without that, the "your phone earns ₹
overnight" demo is just a static table; the §13B story stays paper.

§17 Phase 2a queue #9 — "Background Sync mesh: not as persistent as a
system daemon (that's Phase 2b) but enough to demonstrate the mesh
story on a PWA-only device" — is the gap this ADR closes.

## Decision

Phase 2a.13 adds the contribution event primitive and a live PWA loop.

### `src/phase1/mesh-contribution.mjs`

- `createMeshContributionEvent({ operatorId, nodeId, workloadType,
  tokens?, bytes?, peerId?, charging, wifi, batteryPercent, at })`
  returns a canonical artifact with a deterministic ID.
- `workloadType` ∈ {`inference`, `storage_serve`, `storage_store`}.
  Inference carries `tokens`, storage workloads carry `bytes`.
- Per-event **operator payout** in paise is computed from §13B
  midpoints:
  - Inference: ₹8/M tokens (800 paise/M).
  - Storage egress: ₹2/GB served (200 paise/GB).
  - Storage available: ₹70/TB-month prorated to a per-minute tick —
    deliberately tiny per-tick (sub-paise), earnings accrue across
    many ticks. This matches §13B intent: operators earn through
    sustained availability, not big bursts.
- `meshContributionSummary(operatorId, events)` aggregates counts +
  total paise + total tokens + total bytes served.
- `MESH_PAYOUT_RATES` exports the constants so the shell / API can
  surface the pricing transparently.

### Persistence + ledger

`BosStore` gains `saveMeshContributionEvent` / `readMeshContributionEvent`
/ `listMeshContributionEvents` + a `mesh-contributions/` directory.
Every save appends a `mesh_contribution.recorded` event to the audit
ledger with operator / node / workload type / volume / payout.

### `computeContribution` is now dynamic

`store.computeContribution(identityId)` previously summed `node.storageBytes`
(static advertised capacity) minus owned memory record bytes. It now also:

- Sums **bytes served** from `storage_serve` + `storage_store` events
  (`servedBytes`) into the contributed side.
- Sums **tokens served** from `inference` events into a separate
  `tokensServed` field for evidence.
- Sums all `payoutPaise` into `earningsPaise` + `earningsRupees`.
- Exposes `contributionEventCount`, `advertisedCapacityBytes` (the
  static baseline), and the dynamic `servedBytes` separately so the
  Trust Passport and shell can render the story.

The NCS computation (`contributedBytes − consumedBytes`) now grows as
the user serves real work. This is what makes §13B's fair-use lever
real: a heavy *consumer* who also runs a node overnight can climb out
of the consumer bracket through actual service.

### API

- `GET /api/mesh/contributions` — list events, with optional
  `?operatorId=` filter and `?limit=` cap.
- `POST /api/mesh/contributions` — create a signed event.
- `GET /api/mesh/contributions/summary/:operatorId` — aggregated
  summary.
- `GET /api/mesh/rates` — exposes the §13B operator-payout rates so
  any UI can show pricing transparently.

### Shell — live earnings ticker

`/shell/` gains a new **💎 Mesh node — §13B fair-use lever** card
between the profile and the worker-alert section:

- Three stat tiles: today's earnings (paise/rupees), bytes/tokens
  served, and the live NCS class (producer/consumer + magnitude).
- A "Start earning" button kicks off an 8-second foreground tick:
  a random workload type (60% inference, 30% storage egress, 10%
  storage availability) → POST to `/api/mesh/contributions` → live
  ticker update.
- The last event surfaces below the ticker with workload type and
  payout in paise. Stop button halts the loop.
- Switching profile or stopping zeroes the tick state but the
  store persists everything.
- The shell also registers a **Periodic Background Sync** via the
  service worker (best-effort — Chrome gates this behind site
  engagement + installed-PWA status; most platforms silently no-op).
  Foreground ticking is the primary demo path; background is a
  bonus for installed-PWA users with high engagement.

### Why this stays §15 compliant

- Payouts are **fiat credits in paise** — settled on UPI per §15
  binding, never tokens.
- Operators serve from devices they own; consumers pay; the platform
  spread accrues as the difference between sell price and payout
  (§13A stream #1).
- Each event records `deviceState` (charging / wifi / battery) per
  §7b, so a future hardening step can enforce the charging+wifi
  guardrail server-side (today the demo bypasses checks so the ticker
  works on any laptop).

## Consequences

- The §13B unit economics story has a live, visible representation
  in the PWA. "Click Start earning, watch the ticker climb" is a real
  investor moment — small numbers (a few paise per tick) but the
  math is transparent and the audit ledger reflects every event.
- NCS is no longer a static read-model; it grows dynamically as
  events accrue, which makes §13B's "producer vs consumer" framing
  observable in the Trust Passport mesh block.
- 10 new tests in `tests/node/mesh-contribution.test.mjs` cover the
  artifact creation, payout math for all three workloads, summary
  aggregation, store persistence + ledger, and the
  `computeContribution` integration. 189 / 189 total green.
- Phase 2a queue #9 is closed in foreground. Hidden-tab continuation
  via Periodic Background Sync is registered best-effort; full
  reliability needs Phase 2b's system-service daemon (§7b is explicit
  about this — the OS layer is what makes the mesh node truly
  persistent).
- Service worker bumped to v9. ADR 0061's transformers.js model loads
  remain CDN-passthrough; the new mesh events are same-origin and
  cache-skipped (they go to `/api/mesh/*` which the SW deliberately
  bypasses so the audit ledger and §15 pointer-not-payload posture
  stay live).
