# ADR 0169 — Phase 13.7.4: wllama runtime auto-serve mode (closes compute-network manual-click step)

Status: Accepted
Date: 2026-06-03

## Context

Phase 13.7.3 (ADR 0167) closed the **verifiable** serve loop: the
worker actually sees the citizen's prompt on-device via P-256
ECDH + HKDF-SHA256 + AES-256-GCM. But the worker still had to
click "Fetch & decrypt prompt", paste the SLM output into a
textbox, and click "Confirm served". The 13.7.3 ADR explicitly
deferred the no-manual-click automation to this phase:

> "Phase 13.7.4 closes the last manual step: a Phase 9.0c wllama
>  runtime serve-mode extension that decrypts + serves + posts
>  the response without human interaction. The encryption
>  substrate this phase ships is the prerequisite."

This phase delivers exactly that — without inventing a new
runtime API. The existing shared wllama runtime
(`getSharedSlmRuntime` from Phase 13.0.0a) already exposes a
`generate(prompt, onToken)` contract that's identical to what
the auto-serve loop needs. So this phase wires the existing
runtime through a tiny new helper + the existing
PendingDispatchRow component.

The §13.x compute network revenue line is now substrate-complete
for v1 demo with end-to-end automation.

## Decision

### 1. BE — opt-in `autoServe` flag on capacity

`src/phase1/compute-serving-capacity.mjs` PERMITTED_CAPACITY_KEYS
extends with one new optional field:

```js
'autoServe'  // boolean; defaults to false; opt-in FE-side
             // instruction to auto-decrypt + auto-generate +
             // auto-post each incoming dispatch.
```

Validation: optional boolean; non-boolean rejected. Default is
`false` so existing capacities published before 13.7.4 keep
working unchanged.

The capacity ledger event `compute_serving_capacity.{published|
paused|revoked}` includes the `autoServe` boolean — POINTER +
count meta only; no PII; matches §15 binding.

No store/sqlite schema change: capacities persist as JSON blobs,
so the new field round-trips through the existing column.

### 2. FE — auto-serve helper

NEW `frontend/src/lib/compute-auto-serve.ts` (~70 lines).
Pure-function generator:

```ts
generateAutoServedResponse({
  plaintextPrompt: string,
  runtime: SlmRuntime,
  onToken?: (token, partial) => void,
  maxTokens?: number,
  temperature?: number
}): Promise<{ responseText, approxTokenCount, generationMs }>
```

Calls `runtime.generate({prompt, maxTokens, temperature,
onToken})` — uses the same wllama contract the doc-summariser
and skill-agent already use. The runtime is shared via
`getSharedSlmRuntime(modelPackId, () => readSlmBlob(modelPackId))`
so the WASM weights load once across all SLM consumers.

`approxTokenCount` is computed via the ~4-chars-per-token
heuristic (the same one citizen-side estimation uses in
13.7.1). The BE uses it to compute worker payout against the
capacity's per-1000-tokens price. SF-3 below: a future polish
could ask the runtime for a real token count.

### 3. FE — auto-serve effect on PendingDispatchRow

`frontend/src/components/ComputeServingCapacityCard.tsx`:

`PendingDispatchesSection` now receives the worker's own
capacity list and an installed SLM lookup. For each pending
dispatch:
- Look up `dispatch.capacityId` in the worker's ACTIVE
  capacities (revoked / paused excluded by construction).
- If matched + capacity has `autoServe: true` + an SLM is
  installed, set `autoServeMode={true}` on the row.

`PendingDispatchRow` adds a useEffect that, when
`autoServeMode === true` and `autoServeAttemptedRef.current ===
false`, fires the full auto-serve chain in sequence:

1. `setAutoServeStatus('decrypting')` → fetch encrypted
   envelope → decrypt with the local worker keypair.
2. `setAutoServeStatus('generating')` → load shared SLM runtime
   via `getSharedSlmRuntime` + `readSlmBlob` (dynamic imports
   keep wllama out of the main bundle until auto-serve fires) →
   call `generateAutoServedResponse`.
3. `setAutoServeStatus('posting')` → `sha256Pointer(response)`
   → submit serve via `useServeComputeServingDispatch`.
4. `setAutoServeStatus('served')` on success; manual-form
   fields filled in with the generated response + token count
   so the user can inspect what their device served.

The `cancelled` flag in the effect cleanup prevents state
updates after unmount. The `autoServeAttemptedRef` prevents
the effect from re-firing if the dispatch list re-renders
mid-flight (single-shot per dispatch).

On error, `setAutoServeStatus('error')` + a clear honest
message ("Auto-serve failed: <reason>. You can still serve
manually below.") + the manual form stays available as
fallback.

Error-code mapping:
- `envelope_not_found` → "envelope not yet posted"
- `dispatch_not_pending` → "someone already served this"
- `dispatch_expired` → "dispatch expired before auto-serve
  completed"
- `no_keypair` (local) → "no encryption keypair on this device
  for this persona"
- everything else → "unexpected error — falling back to manual"

### 4. UI affordances

- Publish form: new "Auto-serve (needs an installed SLM — no
  manual click)" checkbox. Default off.
- Capacity status line: "auto-serve on" suffix when the flag
  is set.
- PendingDispatchRow: live status badge during auto-serve
  ("Auto-serving · Decrypting envelope…" → "Running on
  installed SLM…" → "Posting served response…" → "Served · mesh
  balance credited").
- "How this works" copy now distinguishes manual vs auto-serve
  flows explicitly.

### 5. Adversarial review verdict: ship_with_no_must_fix

Three-lens pass:

- **Privacy / §15.** Plaintext + SLM response live in component
  state only — never persisted to OPFS, localStorage, or the
  BE. SLM runtime is WASM-isolated; no network IO during
  generation. Only sha256 hash + approxTokenCount cross the
  wire. The autoServe flag is FE-side only — the BE never
  inspects SLM output. Sound.
- **Honesty.** Capacity card distinguishes manual vs auto-serve;
  publish-form label warns "needs an installed SLM"; live
  status badge during auto-serve; clear fallback message on
  error. The approxTokenCount comment explicitly names it as a
  heuristic.
- **Edge cases.** cancelled flag prevents post-unmount state
  updates; revoked/paused capacities excluded from autoServe
  map by construction; no-keypair fallback; envelope_not_found
  fallback (no auto-retry — SF-1); SLM not installed → effect
  bails early (autoServeMode would have been false).

Notes for follow-up (not must-fix):
- **SF-1.** No auto-retry on `envelope_not_found` race (citizen
  posts envelope shortly after dispatch). A small
  retry-with-delay (~2s, max 3 tries) would smooth this. v1
  user falls back to manual.
- **SF-2.** Without TEE attestation a malicious worker COULD
  toggle autoServe but run a fake stub instead of the real SLM
  and still earn payout. This is the fundamental v2 problem
  the whole compute network needs to solve eventually. The
  current substrate is honest-by-labelling in v1; a future
  phase introduces TEE attestation at the worker-side runtime
  boundary.
- **SF-3.** `approxTokenCount` uses the ~4-chars-per-token
  heuristic. A future polish would ask wllama for the real
  generated-token count + use that for payout.
- **SF-4.** No update-autoServe endpoint after publish. Workers
  toggle the flag by revoke + republish for v1.

## Consequences

- The §13.x compute network revenue line is **substrate-complete
  with end-to-end automation** for the v1 demo. Worker can
  publish a capacity, tick "Auto-serve", install an SLM once,
  and earn mesh balance every time a citizen sends a dispatch —
  no manual interaction required.
- Phase 13.7 / 13.7.1 / 13.7.2 / 13.7.3 / 13.7.4 — the whole
  sub-arc is now closed.
- The §13.6.1 LICENSE + SEO + landing polish (ADR 0168) +
  this phase together close all OPEN §13.x items
  pre-Phase-14. Next sequential move is Phase 14.0 (Sahayak)
  or Phase 2a (PWA + Android TWA).
- The wllama runtime ADR 0114 contract is preserved — no new
  API on the SlmRuntime interface. Auto-serve composes the
  existing `generate(prompt, onToken)`.

## Tests

- `tests/node/compute-serving-capacity.test.mjs` extended:
  PERMITTED_CAPACITY_KEYS regression-pin includes `autoServe`;
  3 new cases (default false; autoServe=true round-trips;
  rejects non-boolean; ledger event carries the flag).
- `frontend/src/lib/compute-auto-serve.test.ts` — 4 cases.
  Forwards plaintext prompt + returns response + token
  estimate; invokes onToken per token; approxTokenCount ≥ 1
  for trivial responses; maxTokens / temperature overrides
  forwarded to runtime.generate.
- Full sweep at commit time: 526 vitest (+4) + 1441 Node (+3) +
  tsc clean.

## Follow-ups (deferred)

- **Phase 2a** — PWA wrap + COOP/COEP hosting + Android TWA
  (the distribution unlock).
- **Phase 14.0** — Sahayak provider role + double-signature
  substrate.
- Optional: SF-1 retry-with-delay on envelope_not_found race.
- Optional: SF-3 real token count from wllama API.
- Out of scope until TEE attestation: SF-2 verifiable
  serve-mode that proves the SLM actually ran.
