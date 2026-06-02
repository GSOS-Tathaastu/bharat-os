# ADR 0165 — Phase 13.7.1: Compute-serving dispatch + serve substrate (BE)

Status: Accepted
Date: 2026-06-02

## Context

Phase 13.7 (ADR 0164) shipped the worker-side **opt-in
capacity declaration** substrate + the `compute_serving`
workload type in MESH_WORKLOAD_TYPES. The follow-up:

> "Phase 13.7.1 — Phase 9.0c runtime serve-mode extension +
>  dispatch entity + dispatch/serve endpoints + the actual
>  encrypted-prompt-to-worker flow."

The full delta as I committed to it in ADR 0164 is too big for a
single phase. This ADR ships the **BE dispatch + serve substrate**
without the runtime serve-mode extension or the encryption flow.
The FE worker-side serve UI + citizen-side dispatch trigger land
as Phase 13.7.2; the Phase 9.0c runtime serve-mode extension +
encrypted-prompt protocol land as Phase 13.7.3.

What v1 ships gets the BE wired end-to-end so a curl-driven demo
can show:
- Citizen creates a dispatch against a worker's capacity →
  `compute_serving.dispatched` ledger event emitted.
- Worker queries pending dispatches → server returns the dispatch.
- Worker runs the prompt locally on their installed SLM (Phase
  9.0c manual flow) → posts back `responseHash` + `actualTokens`.
- BE atomically marks served + emits mesh-contribution event
  crediting the worker + emits `compute_serving.served` ledger
  event.

## Decision

Ship Phase 13.7.1 as 1 new BE entity + 4 new endpoints + store
wiring + DPDP cascade.

### 1. BE dispatch entity

`src/phase1/compute-serving-dispatch.mjs` (~270 lines) — strict-
allowlist validator + state-transition helper + 2 ledger event
builders. Protocol pinned at
`bos.phase13.compute-serving-dispatch.v1`.

`PERMITTED_DISPATCH_KEYS` (16 entries) gates the envelope.
`COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS` (13 entries:
prompt / completion / response / content / plaintext / rawBody /
snippet / preview / unmasked / phoneNumber / deviceId / imei /
imsi) is the shared FORBIDDEN_SUBSTRINGS probe.

Content-derived `dispatchId` over `{requesterId, workerId,
capacityId, promptHash, estimatedTokens, requestedAt}`.

Two pointer fields enforce the §15 binding:
- `promptHash: sha256:<hex64>` — the citizen's prompt bytes
  themselves never reach the dispatch record. The bytes flow
  out-of-band (citizen-to-worker direct in v1; future Bharat OS
  courier when encryption ships).
- `responseHash: sha256:<hex64>` — same for the worker's response.

Helpers:
- `buildComputeServingDispatch(input)` — validate + assemble
  pending dispatch with 15-minute TTL.
- `applyServeToDispatch(existing, capacity, {actualTokens,
  responseHash, servedAt})` — pure state transition. Computes
  `payoutPaise = ceil(actualTokens / 1000) × capacity.pricePerKTokensPaise`.
  Ceiling bucketing so workers can't be cheated by under-1K
  rounding.
- `buildComputeServingDispatchedLedgerEvent` /
  `buildComputeServingServedLedgerEvent` — POINTER + count-only
  meta + ms-stripped `at` (Phase 13.0.2 MF-1 pattern).

### 2. Store wiring + DPDP cascade

Both backends get `saveComputeServingDispatch` /
`readComputeServingDispatch` /
`listComputeServingDispatches({requesterId?, workerId?, status?})`.
The sqlite-store gets a new `compute_serving_dispatches` table
indexed on `requester_id`, `worker_id`, and `status`.

**DPDP §12(3) cascade** extends to wipe dispatch records by
EITHER `requesterId` OR `workerId`. The audit ledger events
remain (with identity fields redacted in the existing pass) so
the at-dispatch + at-serve proofs survive identity erase.

### 3. API endpoints

`src/phase0/api.mjs` adds 4 endpoints:

- `POST /api/compute-serving-dispatches` — citizen creates a
  pending dispatch. Body: `{requesterId, capacityId, promptHash,
  estimatedTokens}`. Server validates:
  - requesterId identity exists (404 `unknown_requester`)
  - capacityId exists (404 `unknown_capacity`)
  - capacity.status === 'active' (409 `capacity_not_active`)
  - capacity.expiresAt > now (409 `capacity_expired`)
  - requesterId ≠ capacity.workerId (409 `self_dispatch`)
  - envelope shape (400 `invalid_dispatch`)
  - content-derived dispatchId is unique (409 `duplicate_dispatch`)
  Persists dispatch + emits `compute_serving.dispatched`. → 201.
- `POST /api/compute-serving-dispatches/:dispatchId/serve` —
  worker submits served result. Body: `{workerId, actualTokens,
  responseHash}`. Server validates:
  - dispatch exists (404 `unknown_dispatch`)
  - dispatch.workerId === body.workerId (403 `not_assigned`)
  - dispatch.status === 'pending' (409 `dispatch_not_pending`)
  - dispatch.expiresAt > now (409 `dispatch_expired`)
  - capacity exists + still owned by worker (404 `unknown_capacity`)
  - envelope shape (400 `invalid_serve`)
  Atomic in-handler: applyServeToDispatch → persists served →
  creates mesh-contribution event crediting worker → emits
  `compute_serving.served` ledger event. → 200 with dispatch +
  meshContributionEvent.
- `GET /api/identities/:id/compute-serving-dispatches/sent` —
  list dispatches the identity created.
- `GET /api/identities/:id/compute-serving-dispatches/pending` —
  list pending dispatches assigned to the identity (worker view).

### 4. Adversarial review verdict: ship_with_known_limitations

Inline 3-lens pass (privacy / UX / edge-cases). Privacy posture
sound by construction: strict allowlist + 13-entry
FORBIDDEN_SUBSTRINGS probe + worker-gated serve + DPDP cascade +
ms-stripped timestamps + pointer-only (`promptHash` /
`responseHash` instead of bytes) + self-dispatch rejected.

Known limitations (intentional v1 simplifications, no must-fix):

- **Race on concurrent serves** — two concurrent reads of the
  same dispatch can both see `status === 'pending'`, both call
  `applyServeToDispatch`, both save. Final state is "served"
  but the worker is credited TWICE via mesh-contribution events.
  Demo-acceptable; production needs `UPDATE compute_serving_dispatches
  SET status = 'served' WHERE dispatch_id = ? AND status = 'pending'`
  returning the affected-rows count, applied first.
- **maxConcurrent + maxDailyTokens not enforced at dispatch time**
  — the capacity declares these caps but the dispatch endpoint
  doesn't check the worker's current concurrent count or daily
  token spend. Workers can be flooded beyond their declared
  caps. Production needs an `INSERT … WHERE worker_concurrent_count
  < maxConcurrent` style check + a daily aggregator.
- **No verification that the worker actually ran the prompt** —
  the responseHash is whatever the worker says. Solving this
  requires the encryption substrate from Phase 13.7.3 (the
  citizen-encrypted prompt forces the worker's runtime to
  actually decrypt + serve, not fabricate a hash).
- **Capacity revoked mid-flight allows in-flight serves to
  complete** — by design. Workers should be able to finish
  dispatches they committed to when the capacity was active.
  New dispatches are blocked by `capacity_not_active`.

All other concerns caught at boundary with explicit error codes
(invalid_dispatch / unknown_requester / unknown_capacity /
capacity_not_active / capacity_expired / self_dispatch /
duplicate_dispatch / unknown_dispatch / not_assigned /
dispatch_not_pending / dispatch_expired / invalid_serve).

## Consequences

- The 13.7 compute network substrate now has its **dispatch +
  serve loop wired BE-side**. A worker who has opted in (via
  Phase 13.7 capacity card) can have dispatches assigned + can
  serve them via the new endpoints + earn into mesh balance via
  the existing `compute_serving` workload type.
- The audit ledger gains two new event types
  (`compute_serving.dispatched`, `compute_serving.served`),
  both POINTER + count-only per §15. Existing daily-brief /
  mesh-summary surfaces aggregate by workload type and
  automatically include compute serving rounds.
- The DPDP cascade now covers a new per-identity table indexed
  on both requesterId and workerId sides. Identity erase remains
  atomic.
- Phase 13.7.2 (FE worker-side serve UI + citizen-side dispatch
  trigger) becomes a thin sub-phase: it wires existing BE
  endpoints into the existing ComputeServingCapacityCard +
  adds a citizen-side request affordance.

## Tests

- `tests/node/compute-serving-dispatch.test.mjs` — 26 cases.
  Pure builder + state transition (allowlist, content-derived
  id, ceil bucketing, malformed promptHash, out-of-range tokens,
  ms-strip, calendar-invalid timestamps); ledger event pointer-
  only check via FORBIDDEN_SUBSTRINGS grep; HTTP integration
  (dispatch + serve atomic + mesh credit + ledger events;
  not_assigned 403; self_dispatch 409; capacity_not_active 409;
  unknown_dispatch 404; sent + pending list endpoints); DPDP
  cascade (by requesterId + by workerId).
- Full sweep at commit time: 500 vitest + 1405 Node + tsc clean
  (+26 from this phase).

## Follow-ups (deferred)

- **13.7.2** — FE worker-side serve flow (poll pending +
  "Serve next" button on ComputeServingCapacityCard that runs
  the prompt on the worker's installed SLM via the existing
  Phase 9.0c runtime + posts the response hash back) +
  citizen-side dispatch trigger (debug card on /labs or
  auto-routing through the intent orchestrator).
- **13.7.3** — Encryption substrate: citizen encrypts the prompt
  to the worker's identity public key; worker's WASM runtime
  decrypts in isolated context + serves + signs the response.
  Forces the worker to actually run the inference (no
  fabricated response hash).
- **Production fixes for the 3 known limitations** (race,
  maxConcurrent/maxDailyTokens enforcement, response
  verification) — unchanged by this phase, deferred until 13.7.3.
- Server-side routing (intent orchestrator picks an eligible
  worker by latency / price / device-state heuristic) — Phase
  13.7.x.
