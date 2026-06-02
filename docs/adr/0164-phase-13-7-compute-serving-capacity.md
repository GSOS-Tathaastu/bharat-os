# ADR 0164 — Phase 13.7: Compute-serving capacity substrate

Status: Accepted
Date: 2026-06-02

## Context

The next item in the ROADMAP §13.x revenue-line track per the
[[compute-network-mesh-workload]] binding (2026-05-31):

> "Compute network extends today's `inference` workload: a user's
>  idle phone serves Phi-3-mini inferences to OTHER citizens for
>  fiat-credit. Same SLM runtime, different beneficiary."

The full compute-network demo requires three substrates working
together:

1. Worker opt-in capacity declaration (this phase, 13.7).
2. Citizen→worker dispatch routing — the orchestrator picks an
   opted-in worker when a citizen's intent needs an inference the
   citizen's own device can't satisfy (or wants redundancy).
3. WASM-isolated serve mode in the Phase 9.0c wllama runtime — the
   worker's runtime decrypts the dispatched prompt, serves the
   inference, signs the response, earns the payout.

This phase ships #1 only — the worker-side substrate. The dispatch
+ serve flow (#2 + #3) is a substantial Phase 9.0c runtime
extension and lands as Phase 13.7.1.

## Decision

Ship Phase 13.7 as the **opt-in substrate**: worker can publish,
pause, or revoke a capacity declaration; BE persists with strict
allowlist + DPDP cascade; mesh workload type `compute_serving`
extends `MESH_WORKLOAD_TYPES` so when 13.7.1 lands, the existing
mesh-balance + withdrawal substrates credit workers without
further plumbing.

### 1. BE entity validator

`src/phase1/compute-serving-capacity.mjs` (~250 lines) — strict-
allowlist validator + revoke + pause + ledger-event builder.
Protocol pinned at `bos.phase13.compute-serving-capacity.v1`.

`PERMITTED_CAPACITY_KEYS` (13 entries) + `PERMITTED_CONSTRAINT_KEYS`
(3 entries) gate the envelope. `COMPUTE_SERVING_CAPACITY_FORBIDDEN_
SUBSTRINGS` (13 entries: prompt / completion / response / content
/ plaintext / rawBody / snippet / preview / unmasked /
phoneNumber / deviceId / imei / imsi) is the shared
FORBIDDEN_SUBSTRINGS probe used by the validator rejection test
AND the ledger-event JSON-grep test.

Caps + bounds:
- `pricePerKTokensPaise` ∈ [50 (₹0.50), 50_000 (₹500)] per 1000
  tokens
- `maxConcurrent` ∈ [1, 4] dispatches
- `maxDailyTokens` ∈ [10_000, 10_000_000]
- `constraints.batteryMinPercent` ∈ [20, 100]
- `constraints.requireWifi` boolean
- `constraints.requireCharging` boolean
- TTL ∈ [24 hours, 90 days]

Content-derived `capacityId` over
`{workerId, pricePerKTokensPaise, maxConcurrent, maxDailyTokens,
constraints, publishedAt}` — re-publishing identical envelope
returns 409 `duplicate_capacity` (no spam).

ms-stripped `publishedAt` + `expiresAt` mirror the Phase 13.2 / 13.5
typing-speed defence. `revokeComputeServingCapacity` requires the
revoker match the workerId (defence-in-depth alongside the API
handler gate). `pauseComputeServingCapacity` only allows
`active → paused`.

`buildComputeServingCapacityLedgerEvent` emits POINTER + count-only
meta. Never any device-identifying data.

### 2. Mesh workload type extension

`src/phase1/mesh-contribution.mjs` — `MESH_WORKLOAD_TYPES` grows
from 6 to 7 with `compute_serving`. `createMeshContributionEvent`
handles the new type:
- Requires `tokens` (numeric count served).
- Computes payout from caller-supplied `payoutPaise` capped at
  5000 paise (₹50) as a per-dispatch defence-in-depth ceiling.
- Two new optional pointer fields: `computeServingCapacityId` +
  `computeServingDispatchId` (the latter set by the future
  Phase 13.7.1 dispatch flow).

The existing `mesh-contribution.test.mjs` workload-types pin
updated to include `compute_serving` in the 7-entry list.

### 3. Store wiring + DPDP cascade

Both backends get `saveComputeServingCapacity` (with
`{skipLedger}` option for future dispatch-driven updates) /
`readComputeServingCapacity` /
`listComputeServingCapacities({workerId?})`. The sqlite-store
gets a new `compute_serving_capacities` table indexed on
`worker_id`.

**DPDP §12(3) cascade**: capacities wipe on identity erase. Both
backends extend `eraseUserData` / `deleteIdentityCascade` to
sweep `compute_serving_capacities` by `worker_id`.

### 4. API endpoints

`src/phase0/api.mjs` adds 4 endpoints under
`/api/identities/:id/compute-serving-capacity`:

- `GET` — list worker's capacities + supported statuses.
- `POST` — publish a new capacity; 400
  `invalid_compute_serving_capacity` on validator throw; 409
  `duplicate_capacity` on identical re-publish.
- `DELETE /:capacityId` — worker-gated revoke. Body:
  `{reason?: string}`.
- `POST /:capacityId/pause` — pause an active capacity.

### 5. FE substrate + Settings card

`frontend/src/lib/compute-serving-capacity.ts` mirrors the BE
enums + adds labels + default values + helpers. Node-side
convergence test reads this file at runtime to assert
`COMPUTE_SERVING_CAPACITY_STATUSES` matches the BE list.

`frontend/src/lib/hooks.ts` adds 4 TanStack hooks:
`useComputeServingCapacities`, `useCreateComputeServingCapacity`,
`useRevokeComputeServingCapacity`,
`usePauseComputeServingCapacity`.

`frontend/src/components/ComputeServingCapacityCard.tsx` (~340
lines) — worker-facing card. Honest empty state when no
capacities; form with 6 fields (price, maxConcurrent,
maxDailyTokens, batteryMin, requireWifi, requireCharging);
inline error surface on 409 / 400; per-capacity Pause/Revoke
actions. "How this works" details panel surfaces the honest
substrate-only framing for v1.

Mounted on `/settings` below the PersonalizationCard.

### 6. Adversarial review verdict: ship_with_no_fixes

Inline 3-lens pass (privacy / UX / edge-cases). Privacy posture
sound by construction: strict allowlist + FORBIDDEN_SUBSTRINGS
probe + worker-gated revoke + content-derived capacityId + ms-
stripped timestamps + DPDP cascade. UX is honest (substrate-only
v1 clearly framed; pause/revoke per capacity; status badges).
Edge cases covered at boundary (calendar-invalid timestamps;
off-range integers; off-allowlist constraint keys; same-second
duplicate → 409).

## Why dispatch + serve is deferred to 13.7.1

The actual on-device serve mode requires a Phase 9.0c runtime
extension that lets the wllama runtime accept an incoming
dispatched prompt (encrypted-to-this-worker), decrypt in WASM-
isolated context, serve, sign the response, and emit the served
event. That's a substantial cross-cutting change to the runtime
that warrants its own ADR.

Shipping the substrate first means: when 13.7.1 lands, the worker
opt-in surface, the mesh workload type, the audit ledger event
types, and the DPDP cascade are all already in place. The 13.7.1
delta is just the runtime extension + dispatch entity + dispatch
endpoint.

## Consequences

- The 13.x revenue-line track now includes the compute network
  substrate. When 13.7.1 ships, workers can earn into mesh
  balance from compute serving without further BE plumbing.
- `MESH_WORKLOAD_TYPES` grows to 7. Existing daily-brief +
  mesh-summary surfaces already account for all workload types
  by name; no FE change needed for the aggregation surfaces.
- The /settings page now has 3 worker-revenue-line cards
  (mesh balance / labeling stats elsewhere, personalization
  privacy, and now compute serving opt-in).
- Storage network from the memory binding remains low-priority;
  no work this phase.

## Tests

- `tests/node/compute-serving-capacity.test.mjs` — 32 cases.
  Protocol pin; happy path; content-derived capacityId; strict
  allowlist rejections (FORBIDDEN_SUBSTRINGS as the probe);
  off-allowlist constraint key rejection; price/concurrent/
  daily-tokens/battery range rejections; non-boolean constraint
  rejection; TTL bounds; calendar-invalid timestamps; ms-strip;
  revoke worker-gated; pause active-only; mesh-contribution
  compute_serving event shape + payout cap + tokens-required;
  FE↔BE convergence (reads FE source for status enum); HTTP
  integration (publish + duplicate 409 + malformed 400 + list
  + revoke + pause + 404 + DPDP cascade).
- `tests/node/mesh-contribution.test.mjs` pin updated for the
  7-entry workload-types list.
- Full sweep at commit time: 500 vitest + 1379 Node + tsc clean.

## Follow-ups (deferred to 13.7.1+)

- **13.7.1** — Phase 9.0c runtime serve-mode extension + dispatch
  entity (`compute-serving-dispatch.mjs`) + dispatch endpoint
  (`POST /api/compute-serving-dispatches`) + served-event endpoint
  (`POST /api/compute-serving-dispatches/:id/serve`) + the actual
  encrypted-prompt-to-worker flow.
- Daily-token-cap + concurrent-dispatch enforcement at routing
  time (BE checks against worker's current usage).
- Storage network surface (deferred per the memory binding —
  substrate exists; UI is low-priority).
- Production fixes for the 13.5.1 known limitations (race,
  atomicity) — unchanged by this phase.
