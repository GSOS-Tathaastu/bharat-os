# ADR 0166 — Phase 13.7.2: Compute network FE wiring (manual-serve demo cut)

Status: Accepted
Date: 2026-06-03

## Context

Phase 13.7.1 (ADR 0165) shipped the BE substrate for the compute
network dispatch + serve loop. The endpoints are ready; the
ledger emits both `compute_serving.dispatched` and `compute_serving.served`;
the worker's mesh balance ticks up on serve.

The FE was the deferred piece. This ADR ships the worker-side
pending-dispatch list with manual-serve confirmation + the
citizen-side test-dispatch card on /labs, both polling at 5s.

What v1 does NOT do (deferred to Phase 13.7.3): the citizen's
prompt text never flows through the BE, so the worker can't
SEE what the citizen typed. The worker's serve UI is "manual" —
the worker types in their response text + actual tokens; the
text is sha256-hashed client-side and posted as `responseHash`.
The BE has no way to verify the worker actually ran the
citizen's prompt. This honor-system v1 is well-framed in both
cards' "How this works" details panels.

Phase 13.7.3 closes the verifiable-serve loop with the
encryption substrate: citizen encrypts prompt to worker's
identity public key; worker's WASM runtime auto-decrypts and
serves; signed response forces the worker to actually run the
inference.

## Decision

Ship Phase 13.7.2 as a thin FE-only sub-phase on top of the
existing BE substrate. No BE changes.

### 1. FE types + helpers

`frontend/src/lib/compute-serving-capacity.ts` extended:
- `COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION` pin
- `COMPUTE_SERVING_DISPATCH_STATUSES` frozen enum + label map
- `ComputeServingDispatch` + `ComputeServingDispatchesResponse`
  types
- `sha256Pointer(text)` Web Crypto helper — used by both
  citizen-side dispatch creation and worker-side serve to
  derive the sha256:<hex64> pointer from a typed string. Tests
  pin against RFC 6234 test vector.

### 2. FE hooks

`frontend/src/lib/hooks.ts` extended with 4 hooks:
- `useComputeServingDispatchesPending(identityId)` — worker
  view; polls every 5s
- `useComputeServingDispatchesSent(identityId)` — citizen
  view; polls every 5s
- `useCreateComputeServingDispatch()` — citizen creates new
  dispatch
- `useServeComputeServingDispatch()` — worker submits served
  result; invalidates mesh-balance on success

### 3. Worker-side: ComputeServingCapacityCard extension

`PendingDispatchesSection` mounted at the bottom of the existing
ComputeServingCapacityCard (above the "How this works" details).
Shows the pending-count + per-dispatch row with:
- Pending badge + estimated tokens + expiry UTC time
- prompt hash prefix (24 chars + "…") for visual confirmation
- "Mark as served" button → opens inline form for response text
  + actual tokens

On submit: `sha256Pointer(responseText)` → `useServeComputeServingDispatch.mutate`
with the resulting hash. Error path maps BE error codes to
citizen-readable messages (`not_assigned`, `dispatch_not_pending`,
`dispatch_expired`, generic fallback).

### 4. Citizen-side: ComputeNetworkTestCard

New `frontend/src/components/ComputeNetworkTestCard.tsx`
mounted on `/labs` between CitizenDataOffersPanel and
FederatedRoundsCard. The card:

- Walks all identities on this BE server (via the existing
  `useIdentities` hook), filters out self, fetches each one's
  `compute-serving-capacity` list, narrows to active +
  non-expired. The list is refreshable via a "Refresh
  workers" button.
- Presents a select with active worker capacities (showing
  price per 1K + concurrency + battery threshold) + a prompt
  textarea + estimated tokens input.
- On Send: `sha256Pointer(promptText)` → `useCreateComputeServingDispatch.mutate`.
- Below the form: sent dispatches list, polling every 5s,
  shows status badge + estimated tokens + (once served) actual
  tokens + payout the worker received.

Honest framing in the "How this works" details: v1's
prompt-doesn't-flow-through-BE limitation is explicitly noted +
the 13.7.3 deferral is named.

### 5. Mount on /labs

`frontend/src/routes/Labs.tsx` mounts the new card keyed on
`compute-test-<identityId>` for the identity-flip remount
protection pattern.

### 6. Adversarial review verdict

ship_with_no_new_fixes. The §15 binding holds — both the
citizen's prompt and the worker's response stay on-device;
only sha256 hashes cross the wire. Known limitations are
inherited from Phase 13.7.1 (ADR 0165):

1. Race on concurrent serves (mirrors 13.5.1)
2. maxConcurrent + maxDailyTokens not enforced at dispatch
3. No verification worker actually ran the prompt — manual-
   serve UI relies on the worker's honor + the response-text-
   hashed-client-side affordance to encourage genuine serves

All other concerns surfaced through the existing BE error
codes; the FE maps each to a citizen-readable inline message.

Specific to v1 FE patterns:
- The citizen-side capacity browse walks ALL identities on the
  server (O(N) on identity count). For a demo with a few
  identities this is fine. Production needs a proper
  `GET /api/compute-serving-capacities/browse` endpoint.
- Polling at 5s for both sent + pending lists. React Query
  handles offline retry. OK for v1.

### 7. Tests

- `tests/node/compute-serving-dispatch.test.mjs` extended with
  a FE↔BE convergence test that reads `compute-serving-capacity.ts`
  at runtime and regex-extracts `COMPUTE_SERVING_DISPATCH_STATUSES`,
  asserting set-equality with the BE list.
- `frontend/src/components/ComputeNetworkTestCard.test.tsx` —
  6 cases: render null when no identityId; render title for
  logged-in identity; `sha256Pointer` produces the canonical
  format; deterministic for same input; different hashes for
  different inputs; matches RFC 6234 test vector for `sha256("hello")`.
- Full sweep: 506 vitest + 1406 Node + tsc clean.

## Consequences

- The compute network is now demo-able end-to-end through the
  UI. A citizen on /labs can pick an active worker capacity,
  type a prompt, send a dispatch. The worker on /settings sees
  the pending dispatch within ~5 seconds, types in their
  response + actual tokens, confirms served. The citizen sees
  the served status (and the worker's payout) within another
  ~5 seconds.
- The §13.x compute network revenue track is now fully shipped
  for v1: capacity (13.7) + BE dispatch (13.7.1) + FE wiring
  (this phase). Phase 13.7.3 (encryption + automated WASM
  serving) is the production polish that closes the
  verifiable-serve loop.

## Follow-ups (deferred to 13.7.3+)

- **13.7.3** — Encryption substrate + Phase 9.0c runtime
  serve-mode. Citizen encrypts prompt to worker's identity
  public key; worker's WASM runtime auto-decrypts + serves +
  signs response. Forces the worker to actually run the
  inference (no fabricated response hashes).
- `GET /api/compute-serving-capacities/browse` endpoint for a
  paginated public capacity listing (replaces the O(N)
  per-identity walk in the citizen-side card).
- Server-side routing (orchestrator picks an eligible worker
  by latency / price / device-state heuristic) — Phase 13.7.x.
- Production fixes for the 3 known limitations from 13.7.1 —
  unchanged by this phase.
