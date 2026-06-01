// Phase 12.1b.2 — Ledger-backed idempotency substrate.
//
// What this module is. A generic `withIdempotency` wrapper that
// turns any mutation-handler into an idempotent-on-replay handler
// using the existing append-only ledger as state. No new SQL table.
// On first call: run the worker, append the cached response body
// to the ledger under an `<scope>.idempotency_key_minted` event,
// return the response. On replay (same scope + actorId + key):
// look up the minted event, return the cached body byte-for-byte,
// append an `<scope>.idempotent_replay` marker — and the worker
// is NEVER re-entered, so downstream side-effects (decision rows,
// skill preflights, push notifications) fire exactly ONCE per
// real mutation.
//
// What this module is NOT. A general queue. A scheduler. A
// background-sync handler. Those are FE concerns (Phase 12.1b.2
// FE substrate). This is the BE side of the replay contract.
//
// §15 bindings:
//
//   • Audit-ledger integrity. The ledger is the source of truth.
//     Replays append a distinct marker event so an auditor can
//     count `<scope>.created` for "did this actually happen?" and
//     `<scope>.idempotent_replay` for "how chatty was the
//     client?".
//
//   • Pointer-not-payload. Minted + reused events carry the
//     idempotency key + a server-computed request fingerprint
//     (sha256 of canonical body), NEVER the raw request body —
//     the canonical record lives on the existing object (the
//     orchestration record itself, in v1) which the ledger
//     references by id.
//
//   • Tamper-evident. Same key + different request fingerprint
//     → 409 `idempotency_key_reused_with_different_payload` AND
//     a tripwire ledger event. This catches an attacker who
//     steals an Idempotency-Key but tries to replay it with a
//     different intent text.
//
//   • Per-actor scoping. The minted event MUST carry actorId; a
//     replay search compares (scope, actorId, key) — never key
//     alone. An attacker who steals a key cannot replay another
//     citizen's intent because actorId on their side won't match.

import { sha256Hex, stableStringify } from './core.mjs';

export const IDEMPOTENCY_PROTOCOL_VERSION = 'bos.phase0.idempotency.v0';

// 32-hex string (lowercase). Validate the shape ONCE at the API
// boundary so the FE can't drift to bare UUIDs that wouldn't
// give the cryptographic-determinism property the §15 audit
// design depends on.
const IDEMPOTENCY_KEY_RE = /^[0-9a-f]{32}$/;

export function isValidIdempotencyKey(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY_RE.test(value);
}

// Compute the request fingerprint deterministically — the same
// canonical-JSON sha256 the FE used to derive the key, so server
// and client agree.
export function computeRequestFingerprint(body) {
  return sha256Hex(stableStringify(body ?? {}));
}

const MINTED_SUFFIX = '.idempotency_key_minted';
const REPLAY_SUFFIX = '.idempotent_replay';
const REUSED_SUFFIX = '.idempotency_key_reused_with_different_payload';

export function mintedEventType(scope) {
  return `${scope}${MINTED_SUFFIX}`;
}

export function replayEventType(scope) {
  return `${scope}${REPLAY_SUFFIX}`;
}

export function reusedEventType(scope) {
  return `${scope}${REUSED_SUFFIX}`;
}

// Find a previously-minted record for (scope, actorId, key).
// Returns null when not found.
//
// We bound the scan to the last 500 minted events of THIS scope
// because typical replay windows are seconds-to-minutes; in
// practice the match is at index 0 or 1 with `newestFirst: true`.
// At investor-pilot scale this is O(1) wall-clock. If volume ever
// grows past tens-of-thousands per day the substrate gains a
// dedicated table in Phase 12.1b.3 without changing the wire
// contract.
const DEFAULT_SCAN_LIMIT = 500;

export async function findMintedRecord(store, { scope, actorId, idempotencyKey, limit = DEFAULT_SCAN_LIMIT } = {}) {
  if (!scope || !actorId || !idempotencyKey) return null;
  const events = await store.listLedger({ type: mintedEventType(scope), newestFirst: true, limit });
  for (const event of events) {
    if (
      event.actorId === actorId &&
      event.idempotencyKey === idempotencyKey
    ) {
      return event;
    }
  }
  return null;
}

// Wrap a mutation handler with idempotency semantics.
//
// Contract:
//   • If `idempotencyKey` is null/undefined → run the worker
//     unconditionally. Returns `{ source: 'fresh', body }`.
//     Legacy callers that never send the header continue to work.
//   • If `idempotencyKey` is malformed (not 32 hex) → throw
//     `IdempotencyError({code: 'idempotency_key_malformed', status: 400})`.
//     Caller maps to 400 JSON response.
//   • If a previous minted record exists for (scope, actorId, key)
//     AND fingerprint matches → append a replay marker event and
//     return `{ source: 'replay', body: cachedBody }`. Worker NOT
//     re-entered.
//   • If a previous minted record exists but fingerprint mismatches
//     → append a `reused_with_different_payload` event and throw
//     `IdempotencyError({code: 'idempotency_key_reused_with_different_payload', status: 409})`.
//     Worker NOT re-entered.
//   • Otherwise → run the worker, append a minted event recording
//     (key, fingerprint, response body), return
//     `{ source: 'fresh', body: workerBody }`.
//
// `worker()` returns a JSON-serialisable response body. The
// substrate stores it on the minted event so replays return it
// byte-for-byte.
export async function withIdempotency(store, {
  scope,
  actorId,
  idempotencyKey,
  requestBody,
  at = new Date().toISOString()
} = {}, worker) {
  if (typeof worker !== 'function') {
    throw new Error('withIdempotency: worker function is required.');
  }
  if (idempotencyKey == null) {
    const body = await worker();
    return { source: 'fresh', body };
  }
  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new IdempotencyError({
      code: 'idempotency_key_malformed',
      status: 400,
      message: 'Idempotency-Key must be 32 lowercase hex characters.'
    });
  }
  if (!actorId || typeof actorId !== 'string') {
    throw new IdempotencyError({
      code: 'idempotency_actor_required',
      status: 400,
      message: 'actorId is required for idempotent requests.'
    });
  }
  const fingerprint = computeRequestFingerprint(requestBody);
  const prior = await findMintedRecord(store, { scope, actorId, idempotencyKey });
  if (prior) {
    if (prior.requestFingerprint !== fingerprint) {
      // Tripwire — same key, different payload. Append a marker
      // event so a security review can find it, and refuse.
      await store.appendLedger({
        type: reusedEventType(scope),
        actorId,
        idempotencyKey,
        expectedFingerprint: prior.requestFingerprint,
        observedFingerprint: fingerprint,
        at
      });
      throw new IdempotencyError({
        code: 'idempotency_key_reused_with_different_payload',
        status: 409,
        message: 'Idempotency-Key was previously used with a different request body.'
      });
    }
    // Replay hit. Worker NOT re-entered.
    await store.appendLedger({
      type: replayEventType(scope),
      actorId,
      idempotencyKey,
      originalAt: prior.at,
      replayedAt: at
    });
    return { source: 'replay', body: prior.responseBody };
  }
  // First-time mint. Run worker, cache body verbatim, append the
  // minted event so subsequent calls within the scan window match.
  const body = await worker();
  await store.appendLedger({
    type: mintedEventType(scope),
    actorId,
    idempotencyKey,
    requestFingerprint: fingerprint,
    responseBody: body,
    at
  });
  return { source: 'fresh', body };
}

export class IdempotencyError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'IdempotencyError';
    this.status = status;
    this.code = code;
  }
}
