# ADR 0150 — Phase 13.0.0a: Shared wllama runtime singleton

Status: Accepted
Date: 2026-06-01

## Context

The Phase 13.0 SLM-E adversarial review surfaced a latent bug
the codebase had been claiming was already fixed. The
`use-slm-booking-advisor.ts` header (line 1-7) asserts the
wllama runtime is "loaded at most once across the SLM intent
parser (12.1b.1), SLM-C field suggest (12.1b.3), and this
advisor (12.1b.4)" — but the implementation didn't actually
share anything. Each hook held its OWN `runtimeRef = useRef<
SlmRuntime | null>(null)` and called `loadSlmRuntime({ ggufBytes:
blob })` independently the first time its verb fired.

A warm session running intent-parse → field-suggest →
booking-advice → doc-summarise (the natural demo flow) loaded
the same 1.4 GB GGUF bytes into WASM **four separate times** —
~5 GB of redundant WASM memory churn and ~15-20s of redundant
load time. SlmTryPrompt on /labs added a fifth load path.

Phase 13.1 SLM-F (PII redactor) would have been a fifth clone
of the same bug. Landing the singleton substrate NOW prevents
that and unblocks SLM-F/G/H to compose the shared runtime by
default.

## Decision

Add a module-level shared runtime to `slm-runtime.ts`. Refactor
all 5 consumers (4 hooks + SlmTryPrompt) to compose it.

### 1. New primitives in `frontend/src/lib/slm-runtime.ts`

```ts
let _sharedPromise: Promise<SlmRuntime> | null = null;
let _sharedModelPackId: string | null = null;

export function getSharedSlmRuntime(
  modelPackId: string,
  blobLoader: () => Promise<Blob | ArrayBuffer | null>,
  opts?: Omit<LoadOptions, 'ggufBytes'>
): Promise<SlmRuntime>;

export async function releaseSharedSlmRuntime(modelPackId?: string): Promise<void>;
```

Semantics:

- Same `modelPackId` → returns the cached promise (concurrent
  callers share the same in-flight load; subsequent callers
  get the resolved runtime instantly).
- Different `modelPackId` → fire-and-forget unloads the prior
  runtime + builds a new one (citizen swapping installed
  packs still works).
- `blobLoader` runs at most once per (packId, cached lifetime).
  Returning `null` rejects the promise with `Error('no_blob')`
  so callers surface the honest "reinstall the pack" state.
- Rejected loads clear the cache so the next caller retries
  cleanly (otherwise every subsequent call would replay the
  same rejected promise).
- `releaseSharedSlmRuntime(packId?)`: drops the cache + calls
  `unload()` if no packId is supplied OR if the supplied
  packId matches the cached one. Best-effort; errors from
  `unload()` are swallowed.

### 2. Hook refactor

All four SLM hooks now call `getSharedSlmRuntime(packId, ...)`
instead of holding their own `runtimeRef + loadSlmRuntime({
ggufBytes })` path. Each hook keeps its OWN:

- `mountedRef + safeSetStatus` (per-feature unmount race guard)
- `inflightRef` (per-feature concurrent verb dedup)
- Rate-limit state (per-feature budget)
- Status union (per-feature loading / cooling-down / ready)

These are per-feature concerns; the runtime itself is shared.
The hooks' `runtimeRef.current` now holds a reference to the
SHARED runtime so the second-and-onwards verb call within a
single hook instance skips the await on `getSharedSlmRuntime`.

### 3. Unmount cleanup change

The hooks no longer call `runtime.unload()` on unmount — that
would pull the rug from concurrent hook instances on the same
runtime. Unmount only drops the local ref. WASM memory stays
warm for the page session.

Pack uninstall is now the explicit release point. `Labs.tsx`
`handleRemove` calls `releaseSharedSlmRuntime(install.modelPackId)`
so WASM memory is freed when the citizen removes the active
pack, without waiting for a page navigation.

### 4. SlmTryPrompt also composes the shared runtime

`SlmTryPrompt.handleClose` previously called
`runtime.unload()`. Now drops the local ref only — same
rationale.

### 5. No-blob handling

Every consumer's "model bytes missing from OPFS" branch now
catches `Error('no_blob')` from the shared promise and
surfaces its feature-specific message:

- intent-parser → `status: { kind: 'error', message: 'Model
  bytes not in this browser. Install the pack again.' }`
- booking-advisor → `status: { kind: 'unavailable', reason:
  'no_blob' }`
- field-suggest → `status: { kind: 'unavailable', reason:
  'no_blob' }`
- doc-summariser → `status: { kind: 'unavailable', reason:
  'no_blob' }` (renders the explicit "reinstall the pack"
  Card from Phase 13.0 MF-2)
- SlmTryPrompt → toast: `Model bytes not in OPFS. Install
  the pack first.`

### 6. Silent logger propagated

All hooks now pass `logger: 'silent'` to the shared runtime
load. Phase 13.0's SF-2 fix had already done this for the
doc summariser; this ADR extends it to the other 3 hooks +
SlmTryPrompt. Defence-in-depth on the §15 bytes-never-leave
binding — wllama tokenisation errors can no longer echo
prompt bytes to the DevTools console regardless of which SLM
verb fired.

### 7. Tests

New file `frontend/src/lib/slm-runtime-shared.test.ts` — 8
cases:
- Concurrent calls with same packId → same promise (load
  happens once)
- Sequential calls with same packId after settle → same
  promise (loader called once)
- Different packId → prior runtime unloaded + new build
- Loader returning null → rejected with `Error('no_blob')`
- Rejected load → cache cleared → retry rebuilds cleanly
- `releaseSharedSlmRuntime()` without packId → drops cache
  + unloads
- `releaseSharedSlmRuntime(packId)` only drops when packId
  matches
- `releaseSharedSlmRuntime` is safe with empty cache

Uses `vi.mock('@wllama/wllama')` to stub the dynamic import,
so the cache invariant is tested without needing a real
GGUF / WASM runtime.

## §15 bindings

| Binding | How honoured |
|---|---|
| Bundle code-split (ADR 0114) | Singleton wraps `loadSlmRuntime`; no direct `'@wllama/wllama'` import in the singleton OR in any hook. |
| Bytes-never-leave-device | The shared runtime runs WASM-side; bytes never cross fetch. Sharing the runtime across consumers does NOT widen the surface — each consumer's prompt + completion still live only in its own component state. |
| Silent logger | Now applied to ALL 4 hooks + SlmTryPrompt. Previously only doc-summariser hardened this. |
| No token storage | Shared runtime holds no completion text; per-feature state remains per-feature. |
| Honest empty state | `Error('no_blob')` is the explicit signal; each consumer surfaces it in its own UX language. |

## What's NOT in 13.0.0a (deferred)

- Refcounting consumers for stricter unload timing. Current
  policy: runtime stays warm until pack uninstall or page
  navigation. A consumer-count + debounced unload-on-zero
  is more sophisticated but unnecessary for v1 — the only
  way WASM memory becomes a real problem is if the citizen
  installs + removes packs repeatedly within a session,
  which the existing pack-uninstall release already covers.
- FederatedRoundsCard still calls `loadSlmRuntime` directly
  (one-off runtime per gradient computation). Using the
  shared runtime there would block other SLM consumers
  during the gradient compute window — left as a deferred
  decision.
- Per-modelPackId metrics / load-time telemetry.

## Files

EXTENDED:
- `frontend/src/lib/slm-runtime.ts` — added
  `getSharedSlmRuntime`, `releaseSharedSlmRuntime`,
  `_sharedSlmRuntimeModelPackIdForTesting` (test-only
  accessor for the cache state).
- `frontend/src/lib/use-slm-intent-parser.ts` — composes
  shared runtime; unmount no longer unloads.
- `frontend/src/lib/use-slm-booking-advisor.ts` — same.
- `frontend/src/lib/use-slm-field-suggest.ts` — same.
- `frontend/src/lib/use-slm-doc-summariser.ts` — same.
- `frontend/src/components/SlmTryPrompt.tsx` — composes
  shared runtime; handleClose no longer unloads.
- `frontend/src/routes/Labs.tsx` —
  `releaseSharedSlmRuntime(packId)` in `handleRemove`.

NEW:
- `frontend/src/lib/slm-runtime-shared.test.ts` — 8 cases.
- `docs/adr/0150-phase-13-0-0a-shared-wllama-runtime-singleton.md`.

## Test results

- Vitest: 193 → **201** (+8 shared-singleton cases).
- Node tests: 1217 unchanged (FE-only phase).
- tsc clean. Build green.
- Manual smoke: install Phi-3 → SlmTryPrompt → DocSummariser
  → confirm the second feature's "Loading model…" status
  never appears (runtime already warm from the first).
