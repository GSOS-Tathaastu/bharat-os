// Phase 13.7.1 — Compute-serving dispatch + serve substrate.
//
// What this is. The mid-loop primitive between a citizen's
// compute request and a worker's served response.
//
//   Citizen (requesterId)                   Worker (workerId)
//      |                                          |
//      | POST /api/compute-serving-dispatches     |
//      |  body: {capacityId, promptHash,          |
//      |         estimatedTokens}                 |
//      |                                          |
//      |   <-- 201 dispatch (status='pending') -->|
//      |                                          |
//      |  (worker polls or is notified)           |
//      |                                          |
//      |                                          | POST /:id/serve
//      |                                          |  body: {responseHash,
//      |                                          |         actualTokens}
//      |                                          |
//      |   <-- 200 dispatch (status='served') --> |
//      |        + mesh contribution event         |
//      |          crediting worker (₹X)           |
//
// What this is NOT in v1:
//   - Encrypted prompt-at-dispatch. v1 carries the prompt hash
//     only — the actual prompt bytes flow out-of-band (citizen-
//     to-worker direct, or future Bharat OS courier). The
//     Phase 9.0c runtime serve-mode extension that automates
//     the byte flow lands as Phase 13.7.2.
//   - Server-side routing logic. v1 requires the citizen to
//     specify capacityId explicitly; auto-routing through the
//     orchestrator (intent → eligible workers → cheapest with
//     latency budget) lands as Phase 13.7.x.
//   - Sponsor-side compute serving. v1 is citizen → worker
//     only.
//
// §15 bindings:
//   - Pointer-not-payload — the dispatch record carries
//     promptHash + responseHash, NEVER the bytes. The §15
//     `pointer-not-payload` binding is the same one used for
//     citizen-data-offer purchases (ADR 0162) and labeling
//     submissions (Phase 10.x).
//   - Strict allowlist on top-level keys.
//   - DPDP §12 cascade: dispatches wipe on identity erase
//     (both requester and worker sides — whichever side erases,
//     their dispatch rows go).
//   - ms-stripped timestamps mirror Phase 13.5 / 13.7 typing-
//     speed defence.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION = 'bos.phase13.compute-serving-dispatch.v1';

export const COMPUTE_SERVING_DISPATCH_STATUSES = Object.freeze([
  'pending',   // citizen-created, awaiting worker serve
  'served',    // worker posted served + worker credited
  'expired',   // TTL elapsed without serve (future state machine)
  'failed'     // worker reported a serve failure (future)
]);

export const PERMITTED_DISPATCH_KEYS = Object.freeze([
  'dispatchId',
  'requesterId',
  'workerId',
  'capacityId',
  'promptHash',
  'estimatedTokens',
  'actualTokens',
  'responseHash',
  'payoutPaise',
  'protocolVersion',
  'status',
  'requestedAt',
  'servedAt',
  'expiresAt',
  'meshContributionEventId',
  'failureReason'
]);

// FORBIDDEN_SUBSTRINGS posture from ADR 0155 / 0156 / 0160 / 0164.
export const COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'prompt',           // raw prompt text
  'completion',
  'response',         // raw response text — only `responseHash` is permitted
  'content',
  'plaintext',
  'rawBody',
  'snippet',
  'preview',
  'unmasked',
  'phoneNumber',
  'deviceId',
  'imei',
  'imsi'
]);

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// Bounds. Estimated and actual tokens are positive integers within
// a single-dispatch budget. The 100K cap mirrors the per-dispatch
// ceiling implied by MAX_PAYOUT_PAISE / MIN_PRICE_PAISE in the
// capacity module — keeps a single dispatch from running away.
const MIN_TOKENS = 1;
const MAX_TOKENS = 100_000;

// Dispatch TTL — workers have up to 15 minutes from create to
// serve. Past that the dispatch transitions to `expired` (future
// state machine; v1 just records expiresAt and a background sweep
// can collect later).
const DISPATCH_TTL_MS = 15 * 60 * 1000;

function nowIso() {
  return new Date().toISOString().replace(/\.\d{1,3}Z$/, 'Z');
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertIntInRange(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be an integer in [${min}, ${max}].`);
  }
  return n;
}

function assertSha256Pointer(value, label) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new Error(`${label} must match /^sha256:[0-9a-f]{64}$/.`);
  }
  return value;
}

function assertIsoInstant(value, label) {
  if (typeof value !== 'string' || !ISO_INSTANT_RE.test(value)) {
    throw new Error(`${label} must be an ISO-8601 UTC instant.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a calendar-valid ISO-8601 UTC instant.`);
  }
  return value.replace(/\.\d{1,3}Z$/, 'Z');
}

function dispatchIdFrom(payload) {
  return `bos:compute-serving-dispatch:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Build a citizen-initiated compute-serving dispatch.
 *
 * Caller responsibility: validate the capacity (active, not
 * expired, not exhausted, etc.) BEFORE calling this — the entity
 * builder only validates the envelope shape.
 *
 * @param {object} input
 * @param {string} input.requesterId — the citizen requesting the inference
 * @param {string} input.workerId — the worker that owns the capacity
 * @param {string} input.capacityId — content-derived id from
 *   compute-serving-capacity.mjs
 * @param {string} input.promptHash — sha256:<hex64> of the prompt bytes
 *   (the bytes themselves never reach the dispatch record)
 * @param {number} input.estimatedTokens — citizen's estimate of the
 *   tokens this serve will consume. Worker can serve fewer/more
 *   within reason; final payout uses actualTokens from the serve.
 */
export function buildComputeServingDispatch(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('compute-serving-dispatch input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!PERMITTED_DISPATCH_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted compute-serving-dispatch field; envelope is pointer-only (prompts/responses live as hashes only).`
      );
    }
  }
  const requesterId = assertNonEmptyString(input.requesterId, 'requesterId', 200);
  const workerId = assertNonEmptyString(input.workerId, 'workerId', 200);
  const capacityId = assertNonEmptyString(input.capacityId, 'capacityId', 200);
  const promptHash = assertSha256Pointer(input.promptHash, 'promptHash');
  const estimatedTokens = assertIntInRange(
    input.estimatedTokens,
    'estimatedTokens',
    MIN_TOKENS,
    MAX_TOKENS
  );
  const requestedAt = assertIsoInstant(input.requestedAt ?? nowIso(), 'requestedAt');
  const expiresAt = new Date(Date.parse(requestedAt) + DISPATCH_TTL_MS).toISOString().replace(/\.\d{1,3}Z$/, 'Z');

  const dispatchId = dispatchIdFrom({
    requesterId,
    workerId,
    capacityId,
    promptHash,
    estimatedTokens,
    requestedAt
  });
  if (input.dispatchId != null && input.dispatchId !== dispatchId) {
    throw new Error('dispatchId does not match content-derived hash.');
  }
  return {
    dispatchId,
    requesterId,
    workerId,
    capacityId,
    promptHash,
    estimatedTokens,
    actualTokens: null,
    responseHash: null,
    payoutPaise: null,
    protocolVersion: COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION,
    status: 'pending',
    requestedAt,
    servedAt: null,
    expiresAt,
    meshContributionEventId: null,
    failureReason: null
  };
}

/**
 * Apply a worker-supplied serve to a pending dispatch. Pure state
 * transition — caller still has to validate the worker matches
 * the dispatch.workerId + the capacity is still active + the
 * timestamp is within the TTL.
 *
 * Computes payoutPaise from actualTokens × the capacity's
 * pricePerKTokensPaise (caller passes the capacity in).
 */
export function applyServeToDispatch(existing, capacity, { actualTokens, responseHash, servedAt }) {
  if (existing == null) throw new Error('compute-serving dispatch not found.');
  if (existing.status !== 'pending') {
    throw new Error(`cannot serve dispatch in status ${existing.status}.`);
  }
  if (capacity == null) {
    throw new Error('capacity is required to compute payout.');
  }
  if (capacity.capacityId !== existing.capacityId) {
    throw new Error('capacity does not match the dispatch.');
  }
  const tokens = assertIntInRange(actualTokens, 'actualTokens', MIN_TOKENS, MAX_TOKENS);
  const hash = assertSha256Pointer(responseHash, 'responseHash');
  const at = assertIsoInstant(servedAt ?? nowIso(), 'servedAt');
  // Payout = ceil(tokens / 1000) × pricePerKTokensPaise. We use
  // ceil so even a small fraction over a 1000-token boundary pays
  // for the next bucket — workers can't be cheated by a citizen
  // rounding down.
  const kBuckets = Math.ceil(tokens / 1000);
  const payoutPaise = kBuckets * capacity.pricePerKTokensPaise;
  return {
    ...existing,
    actualTokens: tokens,
    responseHash: hash,
    payoutPaise,
    status: 'served',
    servedAt: at
  };
}

/**
 * Build the `compute_serving.dispatched` audit-ledger event
 * payload. POINTER + count-only meta per §15.
 */
export function buildComputeServingDispatchedLedgerEvent({ dispatch, at }) {
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: 'compute_serving.dispatched',
    dispatchId: dispatch.dispatchId,
    requesterId: dispatch.requesterId,
    workerId: dispatch.workerId,
    capacityId: dispatch.capacityId,
    estimatedTokens: dispatch.estimatedTokens,
    at: atNormalised
  };
}

/**
 * Build the `compute_serving.served` audit-ledger event payload.
 * POINTER + count-only meta + final payoutPaise per §15.
 */
export function buildComputeServingServedLedgerEvent({ dispatch, at }) {
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: 'compute_serving.served',
    dispatchId: dispatch.dispatchId,
    requesterId: dispatch.requesterId,
    workerId: dispatch.workerId,
    capacityId: dispatch.capacityId,
    estimatedTokens: dispatch.estimatedTokens,
    actualTokens: dispatch.actualTokens,
    payoutPaise: dispatch.payoutPaise,
    at: atNormalised
  };
}
