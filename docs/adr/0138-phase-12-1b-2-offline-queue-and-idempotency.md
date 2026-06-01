# ADR 0138 — Phase 12.1b.2: SLM-B offline-first decisioning + queued sync

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.1b.1 (ADR 0137) shipped on-device SLM intent parsing. The
next sequencing block per ROADMAP is SLM-B — making Bharat OS
honest about poor-connectivity India: an intent typed while
offline must persist on the citizen's device and replay safely
when the network returns. The §15 binding is non-negotiable: the
ledger remains the source of truth, replays must NEVER double-fire
downstream effects, and the queued state must be VISIBLE so the
citizen never believes a queued intent has been executed.

Current state (mapped by parallel Explore agents): no idempotency
header support, no IndexedDB usage, no online/offline detection,
and a deliberately push-only `/app/sw.js` per the §15 carveout
that `/shell/` and `/console/` SWs skip `/api/*` for audit-ledger
compliance. Phase 12.1b.2 closes the offline gap without
reintroducing the SW fetch-interception surface those earlier
phases walled off.

## Decision

### 1. Scope — orchestrations only

Only `POST /api/orchestrations` is queueable in this sub-phase.
Bookings, consents, flags, and express-interest stay online-only
with their existing error toasts. The reasons are §15-binding:
bookings touch escrow paise (CAS), consents mint timestamp-bound
signed DPDP grants, flags carry §9A audit weight. Putting any of
them in v1 either burns the session on per-surface §15 correctness
work or risks a money/signature bug. The substrates
(`src/phase0/idempotency.mjs`, `frontend/src/lib/offline-queue.ts`)
are written generically so Phase 12.1b.3 wraps the others without
refactor — `withIdempotency({scope})` parameterizes the wire
contract, and the queue row carries no orchestration-specific
fields.

### 2. Backend — ledger-backed idempotency, no new SQL table

`src/phase0/idempotency.mjs` (NEW) exports a generic
`withIdempotency(store, {scope, actorId, idempotencyKey,
requestBody}, worker)`. The substrate uses three new ledger event
types instead of a dedicated table:

- `<scope>.idempotency_key_minted` — first call. Carries
  `{actorId, idempotencyKey, requestFingerprint, responseBody, at}`.
- `<scope>.idempotent_replay` — cache hit. Worker NOT re-entered.
  Carries `{actorId, idempotencyKey, orchestrationId,
  originalAt, replayedAt}`.
- `<scope>.idempotency_key_reused_with_different_payload` — 409
  tripwire. Same key + different request fingerprint. Carries
  `{actorId, idempotencyKey, expectedFingerprint,
  observedFingerprint, at}` — fingerprints only, NO payload
  echoed.

Lookup uses the already-shipped
`store.listLedger({type, newestFirst: true, limit})` API.
Replay-window scan caps at 500 minted events of THIS scope; in
practice the match is at index 0–1 because retries happen within
seconds-to-minutes. At pilot scale the scan is O(1) wall-clock;
if production volume grows past tens-of-thousands per day a
dedicated table can land without changing the wire contract.

Per-actor scoping is structural: `findMintedRecord` compares
`(scope, actorId, idempotencyKey)` — never key alone. An
attacker who steals an Idempotency-Key cannot replay another
citizen's intent because actorId on their side won't match.

Audit invariant: the worker closure is the orchestration's
side-effect surface (saveDecision, saveSkillPreflight,
saveOrchestration, saveAttestation, intent-annotation verdict
event). The substrate runs it exactly ONCE per real mutation.
Replay returns the cached response body byte-for-byte — the
orchestrator code path is NEVER re-entered.

The request fingerprint is `sha256Hex(stableStringify(body))`
computed server-side. The FE derives the Idempotency-Key from a
canonical join that includes the same fields, so the
fingerprint check catches a "stolen key + different intent text"
attack.

### 3. Key shape

32 lowercase hex characters. The FE derives:

```
sha256(actorId + ':' + intentText + ':' +
       canonicalize(intentAnnotation) + ':' +
       enqueuedAtIso + ':' + clientNonce).slice(0, 32)
```

The server validates the exact shape (`isValidIdempotencyKey`)
and rejects malformed keys with 400 `idempotency_key_malformed`.
Bare UUIDs are not accepted — the cryptographic determinism is
the §15 tamper-evidence property we depend on.

### 4. Health endpoint

`GET /api/health` (and `HEAD`) returns `200 { ok: true, at }`
with `cache-control: no-store`. Used by the FE
`useOnlineStatus` hook to detect captive-portal "your wifi says
online but everything 401s" cases.

### 5. Frontend — per-identity IndexedDB queue

`frontend/src/lib/offline-queue.ts` (NEW) wraps raw IndexedDB.
**Per-identity database name** (`bharat-os-offline-<sanitised
actorId>`) so two profiles on the same device cannot enumerate
each other's queue — judge panel flagged this as a §15 binding
requirement, not a v2 polish item.

Schema:

```
db: bharat-os-offline-<actorId>
store: intent_queue (keyPath: localId)
index: by-status-enqueuedAt (compound)

row: {
  localId: string,            // ULID (monotonic, sortable; inline, no npm dep)
  idempotencyKey: string,     // 32-hex, computed ONCE at enqueue
  payload: { intentText, intentAnnotation, locale, actionType? },
  enqueuedAt: ISO string,
  attemptCount: number,
  lastError: string | null,
  lastAttemptAt: ISO string | null,
  status: 'queued' | 'sending' | 'failed_permanent'
}
```

Hard caps: 50 rows per identity, 7-day age-out, 5 attempt max.
`QueueFullError` typed so callers can surface honest UX. ULID
is ~10 LOC inline — no `dexie` or `idb` dependency.

### 6. Online/offline detection

`frontend/src/lib/use-online-status.ts` (NEW). Hybrid signal:
`navigator.onLine` seed → `online`/`offline` window events →
HEAD `/api/health` probe every 30 seconds **only while offline**
(4-second timeout per probe). A pure `resolveOnlineState`
helper is exported for vitest. No service-worker fetch
interception — the §15 carveout that `/app/` SW skips `/api/*`
is preserved deliberately.

### 7. Drainer — sequential FIFO, Web Locks single-flight

`frontend/src/lib/use-queue-drainer.ts` (NEW). Mounted once in
`App.tsx` as `<GlobalQueueDrainer/>`. Fires on:

- offline → online transition
- first mount when already online
- (caller can also force-drain via the returned `drain()` for
  per-tab retry actions)

Drain loop is sequential FIFO. The row's `idempotencyKey` is
**reused across all attempts** — recomputing per attempt would
defeat the very case idempotency exists for (mid-drain reconnect
flicker).

Single-flight is via `navigator.locks.request(LOCK_NAME,
{ifAvailable: true})` when available (multi-tab safe) with a
module-level promise-chain fallback for environments lacking
Web Locks (jsdom test, older browsers).

Backoff: 1s → 4s → 16s → 60s, max 5 attempts. Transient errors
(no status, 5xx, 408, 429) bump attemptCount and revert to
`queued`; the loop breaks so the next online event re-arms.
Hard 4xx (except 408/429) → `failed_permanent`. 409
`idempotency_key_reused_with_different_payload` → `failed_permanent`
with `lastError: 'replay_conflict'`.

Stranded-row recovery: at the start of every drain, sweep
`sending` rows older than 5 minutes back to `queued` —
otherwise a row stranded by a tab close or transaction abort
would never retry.

### 8. Smart send hook

`frontend/src/lib/use-send-intent-smart.ts` (NEW). Wraps the
intent submission:

- Offline (navigator says no) → `enqueueLocally` + return
  `{kind: 'queued', reason: 'offline'}`.
- Online + success → return `{kind: 'sent', orchestration}`.
- Online + network error (fetch threw TypeError) → enqueue +
  `{kind: 'queued', reason: 'network_error'}`.
- Queue full → `{kind: 'queue_full'}`.
- Crypto unavailable (insecure context) →
  `{kind: 'crypto_unavailable'}` — adversarial MF-1.

The Idempotency-Key is derived ONCE per send and stored on the
queue row, so a drain attempt uses the same key the original
POST attempt would have used.

### 9. Surface

`<OfflineQueuePill/>` above the intent textarea on
`/citizen/home`:
- Hidden when online + empty queue.
- Grey "Offline — your next intent will queue on this phone".
- Amber "Queued (N) — will send when back online".
- Blue "Sending queued (N)…".
- Red "N didn't go through — review in queue tab".

`<QueuedIntentsPanel/>` on a new `/citizen/queue` route:
- Top card with verbatim "N queued — not yet on Bharat OS"
  copy (§15 no-silent-acceptance).
- Per-row intent text preview + status badge + Retry (on
  `failed_permanent`) / Discard.

Global drainer fires a toast on successful background drain:
"Sent N queued intent[s]. Check your activity feed."

### 10. Bindings honored

- **Audit-ledger integrity**: worker fires exactly once per real
  mutation; replays return cached body byte-for-byte; downstream
  effects (decision, skillPreflight, push, attestations) do NOT
  re-fire on replay.
- **Pointer-not-payload**: minted event carries fingerprint
  hash, response body, and key — never the raw request body
  (the canonical intent text lives on the orchestration record).
  Reused event carries fingerprints only.
- **Per-identity isolation**: IDB DB name per actorId.
- **No silent acceptance**: verbatim "N queued — not yet on
  Bharat OS" copy + non-dismissible pill + enqueue toast.
- **Tamper tripwire**: same key + different payload → 409 +
  ledger tripwire event.
- **Per-actor scoping**: minted record lookup compares
  (scope, actorId, key); stolen keys cannot cross-replay.

## Adversarial review

3 lenses (audit / safety / UX) + triage Workflow.

- **Audit verdict: ship_clean.** Worker closure inviolate;
  per-actor scoping holds; fingerprint check catches stolen-key
  + different-payload attacks; replay events distinct from
  minted events.
- **Safety verdict: ship_with_fixes.** 1 must-fix
  (SubtleCrypto + getRandomValues guards), 3 should-fix
  (stale-sending recovery, Web Locks fallback serialization,
  toast copy + background drain notification).
- **UX verdict: ship_with_fixes.** All UX should-fix items
  deferred to 12.1b.3 polish batch except toast copy + drain
  success notification (applied).

Applied:
- **MF-1**: explicit guards in `sha256Hex` and `newClientNonce`
  + new `crypto_unavailable` SmartSendResult arm + honest
  toast "Your browser blocked secure crypto. Open Bharat OS
  over HTTPS." Vitest case pins the typed-error contract.
- **SF-1**: stranded-`sending`-row recovery sweeps rows older
  than 5 minutes back to `queued` at every drain start.
- **SF-2**: module-level promise chain serializes the Web Locks
  fallback path so React strict-mode double-mount cannot
  interleave drains.
- **SF-3**: toast copy mirrors the "queued — not yet on Bharat
  OS" phrasing; global drainer dispatches "Sent N queued
  intents" toast on successful background drain.

Deferred (with rationale):
- Concurrent-tab `updateRow` CAS race — single-tab focus for
  12.1b.2; full multi-tab CAS lands with bookings/consents in
  12.1b.3.
- Device clock skew on 7-day purge — out of scope; monotonic
  timestamps are a polish item.
- All other UX items — queue-feedback batch in 12.1b.3.

## Files

NEW (BE):
- `src/phase0/idempotency.mjs`.
- `tests/node/idempotency.test.mjs` (15 cases).

EXTENDED (BE):
- `src/phase0/api.mjs` — wrap POST /api/orchestrations + add
  GET/HEAD /api/health.

NEW (FE):
- `frontend/src/lib/idempotency-key.ts`.
- `frontend/src/lib/offline-queue.ts`.
- `frontend/src/lib/use-online-status.ts`.
- `frontend/src/lib/use-queue-drainer.ts`.
- `frontend/src/lib/use-send-intent-smart.ts`.
- `frontend/src/lib/idempotency-key.test.ts` (8 vitest cases).
- `frontend/src/lib/use-online-status.test.ts` (3 vitest cases).
- `frontend/src/components/OfflineQueuePill.tsx`.
- `frontend/src/components/QueuedIntentsPanel.tsx`.

EXTENDED (FE):
- `frontend/src/App.tsx` — `<GlobalQueueDrainer/>` mounted at
  top of Routes; passes onDrainSuccess toast callback.
- `frontend/src/routes/CitizenHome.tsx` — handleSend now uses
  smart send; `/citizen/queue` route added; OfflineQueuePill
  above intent Card.

## Consequences

- **Bharat OS now works in poor-connectivity India.** A citizen
  whose connection drops mid-intent gets an honest "Saving
  offline — will send when you're back online." toast; the
  intent persists on their phone; on reconnect the drainer
  replays it with the same Idempotency-Key; the server returns
  either the cached response (if a duplicate POST happened on
  the way) or a fresh orchestration (if the replay is the first
  real success).
- **Ledger integrity bake-in**. The auditor's question "did
  this action actually happen?" answers via
  `orchestration.created` count regardless of replay count.
- **Common-features extraction discipline** holds: the
  substrate is scope-generic; 12.1b.3 wraps bookings / consents
  / flags by passing a different `scope` argument, no refactor
  to `withIdempotency` required.
- **Cumulative file inventory** for Phase 12.1b so far:
  intent-parser, intent-annotation, offline-queue, idempotency.

## What's NOT in 12.1b.2 (deferred)

- Bookings / consents / flags / express-interest offline queue
  (CAS / escrow / signed-artifact concerns — Phase 12.1b.3).
- Background Sync API (browser support uneven; investor demo
  doesn't need it).
- Service-worker fetch interception (audit-ledger carveout
  preserved deliberately).
- Multi-tab queue coordination beyond Web Locks single-flight
  (BroadcastChannel / SharedWorker — Phase 12.1b.3).
- Real offline-first daily brief (would need cached signals —
  substantial separate phase).
- 17 more Indic languages (separate effort tied to SLM model
  packs).
- UX polish queue: transient-failure countdowns + human-readable
  error map + per-flow "needs internet" copy (12.1b.3 queue-
  feedback batch).

## Test results

- Node tests: **1008/1008 green** (+15 idempotency tests).
- Vitest: **92/92 green** (+11 — 8 idempotency-key cases
  including SubtleCrypto guard + 3 online-status helper cases).
- tsc: clean.
- Build: main 565 → 577 KB / 163 KB gzipped (+12 KB for
  idempotency-key + offline-queue + drainer + smart-send +
  online-status + 2 new components). wllama lazy chunk
  unchanged.
