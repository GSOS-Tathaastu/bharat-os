# ADR 0119: Phase 9.0d — Federated Rounds + Mesh-Inference Event Integration

## Status

**Accepted — shipped 2026-05-31.** Closes the Phase 9.0 arc:
9.0a (registry) + 9.0b (install records + DPDP cascade) + 9.0c
(llama.cpp-wasm runtime) + 9.0d (this — federated rounds wire up
to the new SLM runtime, and real mesh-inference events get
recorded per generation). FE+BE parity rule honoured: both layers
ship in one commit.

## Context

ADR 0107 (Phase 9.0 Proposed) flagged two things that would
"finally become meaningful" once the runtime landed:

1. **Federated rounds** — until 9.0c the §7f substrate fine-tuned
   a 216-param classifier head (`local-training.mjs`); ADR 0071's
   real promise — "rounds that fine-tune a real SLM" — was
   architecturally ready but had no model to point at.
2. **Mesh-inference workload events** (Phase 6.0b) — the
   `inference` workload in `bos:mesh-contribution.v0` was demo-
   seeded; with no on-device inference happening in `/app/`, no
   real ticks could land.

Phase 9.0c shipped the runtime. Phase 9.0d wires both threads
through.

## Decision

### BE — `createFederatedRound` gains 3 optional SLM fields

Backwards-compatible addition to `src/phase1/federated-round.mjs`:

```diff
 export function createFederatedRound({
   createdBy, modelName, baselineModelHash,
   maxParticipants, maxEpsilon, payoutPaisePerUpdate,
   deadlineSecondsFromNow, aggregationMode, contributorBudget,
+  // Phase 9.0d — when set, the round targets a Tier-4 SLM pack.
+  slmModelPackId = null,    // Phase 9.0a registry id
+  targetTask = null,         // free-form fine-tune label
+  loraConfig = null,         // opaque, passed to runtime.computeGradients
   at = nowIso()
 } = {}) { ... }
```

`describeRound(round)` now surfaces these three fields so the FE
can render the round's purpose + filter to packs the worker has
installed.

The round-creation API route (`POST /api/federated/rounds`) was
extended to thread the three fields from request body. Existing
classifier-round callers (the seed-demo's
`intent-classifier-head-v1` and any future non-SLM round)
continue to work — all three fields default to `null`.

### BE — Mesh-contribution POST surfaces explicit payout + roundId

`POST /api/mesh/contributions` already accepted `workloadType:
'federated_round'` but silently dropped `payoutPaise` and
`roundId` because the route handler didn't forward them. Phase
9.0d fixes that — the route now passes both through so worker-
initiated `federated_round` events carry the right payout. (For
`inference` events the payout is still derived server-side from
tokens × `PAYOUT_PAISE_PER_MILLION_TOKENS`.)

### FE — `SlmRuntime.computeGradients(opts)` stub

`src/lib/slm-runtime.ts` adapter API gains a third method:

```ts
runtime.computeGradients({
  samples: Array<{prompt, completion}>,
  targetTask: string,
  loraConfig?: unknown,
  epsilon?: number
}): Promise<{
  vector: Float32Array,    // length 32
  epsilonSpent: number,
  samples: number,
  stub: true
}>;
```

**Honest stub** — llama.cpp-wasm exposes inference, not training
gradients. The stub produces:
- A length-32 Float32 vector deterministically derived from
  `(modelFamily, targetTask, sample prompts)` — sufficient for
  the federated-round aggregator (FedAvg or hash-combiner) to
  produce a non-trivial aggregate
- DP-SGD-style Gaussian noise scaled to `1/ε` — small noise at
  high ε, large noise at low ε, matching the privacy-budget
  semantics from Phase 3.2's `privacy-budget.mjs`
- Marked `stub: true` so any future production code can branch
  on whether the gradient is real or synthetic

Real LoRA fine-tuning needs either a different runtime backend
(MLC-LLM with training-mode) or a custom WASM build of llama.cpp
with `--enable-training`. Tracked as a Phase 9.0d future-polish
item in the ADR.

### FE — Federated rounds card on `/app/labs/`

Replaces the placeholder "Active rounds: —" card from Phase 11.5
with a real surface:

- Title + subtitle + open-round count badge
- Empty state copy: *"No active rounds right now. Sponsors create
  rounds via the admin API; the seed-demo includes a starter
  round."*
- One row per open round with:
  - Model name + per-update payout (`<Money>` component)
  - Meta line: `SLM · targetTask` OR `classifier head`; updates /
    max; epsilon spent / cap
  - **Required-pack guard**: SLM rounds disable the Join action
    if the worker hasn't installed the matching pack, with a
    clear error message *"Requires the X pack — install it above
    first."*
  - **[Join (earn ₹X.YZ)]** trust-variant action

On Join click:
1. `window.confirm` gate
2. For SLM rounds: `readSlmBlob` → if bytes are missing, refuse;
   else `loadSlmRuntime` against the OPFS Blob
3. For non-SLM rounds: skip runtime load entirely (a future
   classifier-round-path hook would wire Phase 3.1's
   `local-training.mjs` here)
4. `runtime.computeGradients(...)` with sample prompts
5. Encode the Float32 vector as base64 + compute its SHA-256
6. `useSubmitFederatedUpdate` posts to `POST
   /api/federated/rounds/:roundId/updates/sign-and-submit`
7. Server signs with the contributor's stored key (Phase 2a
   limitation per ADR 0066), validates DP budget, accepts/rejects,
   and on accept **auto-creates the `federated_round` mesh-
   contribution event** with the round's payout (this was already
   wired in Phase 3.x; we just exercise it from `/app/` now)
8. `runtime.unload()`; toast: *"Update submitted. ₹X.YZ will
   appear in your Earn balance."*

`useFederatedRounds` + `useSubmitFederatedUpdate` hooks added to
`lib/hooks.ts`. Submit-success invalidates `mesh-balance` and
`mesh-summary` so the Earn tab reflects the new credit the next
time the worker navigates to it.

### FE — `SlmTryPrompt` records a real mesh-inference event per generate

`SlmTryPrompt` now imports `useRecordMeshEvent`. After every
successful `runtime.generate()`:

1. Estimate tokens served (`estimateTokens` — ~4 chars/token for
   English; vernacular runs closer to 2-3)
2. POST `/api/mesh/contributions` with `workloadType: 'inference'`
   + the token count
3. Display the resulting payout inline: *"Generated in N ms ·
   pack-id · +₹X.YZ earned"*

This is the first time `/app/` user activity produces real mesh
ledger ticks. Until now `/mesh/balance` reflected demo-seeded
events; now every generation is a real inference workload event
that the Phase 8.3 cash-out flow can drain to UPI.

### Seed-demo extension

`scripts/seed-demo.mjs` now creates a second federated round
alongside the existing classifier round — an SLM round targeting
`bos:slm:phi-3-mini-4k-q4_k_m` with task `indic-intent-routing`
and a real LoRA config. The round is OPEN with zero updates so
the `/app/labs/` Federated card has something to surface on a
fresh seed.

Demo flow:
1. Worker installs the Phi-3-mini pack via Labs (will currently
   fail honestly against the placeholder URL — external item to
   fix with a real model URL)
2. Once installed, the SLM round becomes joinable
3. Tap Join → runtime loads from OPFS → stub gradient computed →
   server accepts → ₹5.00 credit lands

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Raw gradients never leave the device unencrypted | The stub vector is computed locally + DP-noised locally + only the noised version is submitted |
| Privacy budget honoured | `epsilonSpent` is what the worker requested (0.5 by default); Phase 3.2's `privacy-budget.mjs` enforces the per-contributor cap |
| SLM rounds require the matching install | Join action disabled until `installedPackIds` includes the round's `slmModelPackId`; OPFS check refuses if bytes are missing |
| Inference events are honest | `tokens` count is a documented estimate from prompt + output character length; not a fabrication |
| Payout authoritatively server-side | FE just records the workload; payout derivation lives in `computePayoutPaise` |
| Audit ledger covers everything | Existing `mesh_contribution_event.saved` + `federated_round_update.accepted` events; no new event types needed |
| Stub gradient is honest | `stub: true` flag returned + ADR documents this is not real training |
| Bytes never on server | SLM round join reads weights from OPFS only |

## Tests

- **BE**: `tests/node/federated-round.test.mjs` 20 → 23 tests (+3):
  - `createFederatedRound` defaults SLM target fields to null
  - `createFederatedRound` carries SLM target fields when provided
  - `describeRound` surfaces SLM target fields
- **FE**: `src/lib/slm-runtime.test.ts` 7 → 9 tests (+2):
  - `runtime.computeGradients` returns a stub gradient vector with metadata
  - `runtime.computeGradients` produces deterministic vectors for same
    (family, task, samples) modulo DP noise (cosine similarity > 0.95 at ε=10)
- **Full suite**: **802/802 Node** + **16/16 Vitest** (was 800 + 14).

Build: 1.71s. Main bundle 344 KB / 107 KB gzipped (+6 KB vs
9.0c for the federated card + Try Prompt mesh-event wiring).
wllama lazy chunk unchanged at 292 KB / 126 KB gzipped.

## Consequences

- **Phase 9.0 arc CLOSED.** Worker can install an SLM → run real
  inference (paid in paise per call) → join a federated round
  fine-tuning that SLM (paid per accepted update) → cash out via
  Phase 8.3 UPI flow. The full §7f federated-economy loop is
  end-to-end real (modulo the gradient being a stub).
- **First real mesh ledger ticks from `/app/`.** Inference events
  now land in the same `mesh_events` table the demo-seeded ones
  did; Phase 6.0b's monthly summary will reflect actual worker
  activity, not just seed data.
- **Sponsor-funded rounds become a meaningful surface.** Anyone
  with admin access can create an SLM round; workers with the
  matching pack installed see + can join it. This is the
  scaffolding for Phase 9.1 (commercial sponsored-rounds API) and
  Phase 10 (labeling marketplace's federated-trained label models
  polish).
- **Stub gradient is the honest gap.** ADR documents what would
  need to change for real LoRA fine-tuning. v1 ships with the
  flywheel + audit + payout correct; the gradient correctness is
  the remaining polish.
- **No breaking changes to existing callers.** All three new
  fields on `createFederatedRound` are optional with `null`
  defaults. The classifier-round seed and any future non-SLM
  round work unchanged.

## What's NOT in this sub-phase

- **Real LoRA fine-tuning** — wllama doesn't expose training
  gradients; future polish needs MLC-LLM training mode or a
  custom llama.cpp WASM build with `--enable-training`
- **Per-round consent UI** — Join Round goes straight to the
  confirm dialog; a future polish step could surface the
  per-round `federated_donation` consent grant explicitly with
  scope/purpose/TTL before the join
- **Real-time round discovery push** — workers poll on tab visit;
  future polish: subscribe to `federated_round.created` push
  notifications via Phase 7.x
- **Round outcomes (aggregated model) for the worker** — workers
  see "your update accepted" but not the round's eventual
  aggregated model hash; a "what came out of the rounds I joined"
  surface is post-MVP

## Future polish

- Real gradient computation (MLC-LLM training-mode or custom
  llama.cpp build with `--enable-training`)
- Push notification when a worker's installed pack gets a new
  round
- Per-round consent UI matching the Phase 8.2 MFI pattern
- "My rounds" surface listing the worker's participation history
- Aggregated-model preview (e.g., "your round produced this Bharat
  OS Phi-3-mini variant — try it")
- Sponsor self-service round creation (Phase 9.1 hook)
- Anti-fraud: same-worker rate-limit + DP budget cap visualisation
- Per-pack default gradient sample size from the registry pack
  metadata
