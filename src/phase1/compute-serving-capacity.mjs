// Phase 13.7 — Compute serving capacity declaration.
//
// What this is. A worker's signed declaration that they're
// willing to serve on-device Phi-3-mini / Gemma-2B / Qwen-class
// SLM inferences to OTHER citizens for fiat-credit. The worker
// names a per-1000-tokens price + concurrency cap + daily token
// cap + device-state constraints (battery / WiFi / charging).
//
// This phase ships the SUBSTRATE only:
//   - Worker can publish, pause, or revoke a capacity.
//   - BE persists with strict allowlist + DPDP cascade.
//   - Mesh workload type `compute_serving` extends the existing
//     MESH_WORKLOAD_TYPES so future dispatch events can credit
//     workers from existing mesh-balance + withdrawal substrates.
//   - Dispatch + serve flow (the actual routing of a citizen
//     prompt to a worker's WASM runtime + the served-response
//     ledger event) is DEFERRED — it needs a Phase 9.0c serve-
//     mode runtime extension.
//
// §15 bindings the entity shape enforces:
//   - Strict allowlist on top-level keys. Adding a field
//     requires extending PERMITTED_CAPACITY_KEYS AND the
//     validator together.
//   - No PII in the envelope: the worker is identified by
//     workerId; the constraints are device-state thresholds,
//     not phone-identifying. The price + caps are public.
//   - Content-derived capacityId: re-publishing an identical
//     declaration is a no-op (idempotent).
//   - DPDP §12 cascade: capacities wipe on identity erase.
//   - ms-stripped publishedAt / expiresAt mirrors the
//     Phase 13.2 / 13.5 typing-speed defence.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION = 'bos.phase13.compute-serving-capacity.v1';

export const COMPUTE_SERVING_CAPACITY_STATUSES = Object.freeze([
  'active',
  'paused',
  'revoked',
  'expired'
]);

// Strict allowlist on top-level entity keys. Same posture as
// Phase 13.5 citizen-data-offer (ADR 0160) and Phase 13.4 skill-
// agent (ADR 0156).
export const PERMITTED_CAPACITY_KEYS = Object.freeze([
  'capacityId',
  'workerId',
  'pricePerKTokensPaise',
  'maxConcurrent',
  'maxDailyTokens',
  'constraints',
  'protocolVersion',
  'status',
  'publishedAt',
  'expiresAt',
  'revokedAt',
  'revokeReason',
  'pausedAt'
]);

// Strict allowlist on the nested constraints envelope.
export const PERMITTED_CONSTRAINT_KEYS = Object.freeze([
  'batteryMinPercent',
  'requireWifi',
  'requireCharging'
]);

// FORBIDDEN_SUBSTRINGS posture from ADR 0155 / 0156 / 0160. Both
// the validator-rejection probe + the ledger-event JSON-grep
// test import this and assert no forbidden substring leaks.
export const COMPUTE_SERVING_CAPACITY_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'prompt',
  'completion',
  'response',
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

// Caps + bounds.
const MIN_PRICE_PAISE = 50;              // ₹0.50 / 1000 tokens
const MAX_PRICE_PAISE = 50_000;          // ₹500 / 1000 tokens
const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 4;
const MIN_DAILY_TOKENS = 10_000;         // 10K tokens / day
const MAX_DAILY_TOKENS = 10_000_000;     // 10M tokens / day
const MIN_BATTERY_PERCENT = 20;
const MAX_BATTERY_PERCENT = 100;
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days
const MIN_TTL_MS = 24 * 60 * 60 * 1000;         // 24 hours
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function nowIso() {
  return new Date().toISOString();
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

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
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

function normaliseConstraints(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('constraints must be an object.');
  }
  for (const key of Object.keys(raw)) {
    if (!PERMITTED_CONSTRAINT_KEYS.includes(key)) {
      throw new Error(
        `constraints.${key} is not a permitted constraint field; envelope is pointer-only.`
      );
    }
  }
  const batteryMinPercent = assertIntInRange(
    raw.batteryMinPercent,
    'constraints.batteryMinPercent',
    MIN_BATTERY_PERCENT,
    MAX_BATTERY_PERCENT
  );
  const requireWifi = assertBoolean(raw.requireWifi, 'constraints.requireWifi');
  const requireCharging = assertBoolean(raw.requireCharging, 'constraints.requireCharging');
  return { batteryMinPercent, requireWifi, requireCharging };
}

function capacityIdFrom(payload) {
  return `bos:compute-serving-capacity:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Validate + build a worker-supplied compute-serving capacity
 * declaration. Returns the validated record ready for persistence;
 * throws on malformed input so the API handler surfaces 400.
 */
export function buildComputeServingCapacity(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('compute-serving-capacity input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!PERMITTED_CAPACITY_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted compute-serving-capacity field; envelope is pointer-only (prompts/responses never reach the registry).`
      );
    }
  }
  const workerId = assertNonEmptyString(input.workerId, 'workerId', 200);
  const pricePerKTokensPaise = assertIntInRange(
    input.pricePerKTokensPaise,
    'pricePerKTokensPaise',
    MIN_PRICE_PAISE,
    MAX_PRICE_PAISE
  );
  const maxConcurrent = assertIntInRange(input.maxConcurrent, 'maxConcurrent', MIN_CONCURRENT, MAX_CONCURRENT);
  const maxDailyTokens = assertIntInRange(
    input.maxDailyTokens,
    'maxDailyTokens',
    MIN_DAILY_TOKENS,
    MAX_DAILY_TOKENS
  );
  const constraints = normaliseConstraints(input.constraints);
  const publishedAt = assertIsoInstant(input.publishedAt ?? nowIso(), 'publishedAt');
  const expiresAt = assertIsoInstant(input.expiresAt, 'expiresAt');

  const publishedMs = Date.parse(publishedAt);
  const expiresMs = Date.parse(expiresAt);
  if (expiresMs - publishedMs < MIN_TTL_MS) {
    throw new Error('expiresAt must be at least 24 hours after publishedAt.');
  }
  if (expiresMs - publishedMs > MAX_TTL_MS) {
    throw new Error('expiresAt cannot be more than 90 days after publishedAt.');
  }

  const capacityId = capacityIdFrom({
    workerId,
    pricePerKTokensPaise,
    maxConcurrent,
    maxDailyTokens,
    constraints,
    publishedAt
  });
  if (input.capacityId != null && input.capacityId !== capacityId) {
    throw new Error('capacityId does not match content-derived hash.');
  }
  return {
    capacityId,
    workerId,
    pricePerKTokensPaise,
    maxConcurrent,
    maxDailyTokens,
    constraints,
    protocolVersion: COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION,
    status: 'active',
    publishedAt,
    expiresAt,
    revokedAt: null,
    revokeReason: null,
    pausedAt: null
  };
}

/**
 * Soft-delete a capacity (worker-side opt-out). Preserves history
 * via the ledger event the store emits on save.
 */
export function revokeComputeServingCapacity(existing, { revokedBy, reason }) {
  if (existing == null) throw new Error('compute-serving capacity not found.');
  if (existing.status === 'revoked') {
    throw new Error('compute-serving capacity is already revoked.');
  }
  if (existing.workerId !== revokedBy) {
    throw new Error('only the publishing worker can revoke their own capacity.');
  }
  const revokeReason = reason == null ? null : assertNonEmptyString(reason, 'reason', 240);
  return {
    ...existing,
    status: 'revoked',
    revokedAt: nowIso().replace(/\.\d{1,3}Z$/, 'Z'),
    revokeReason
  };
}

/**
 * Pause a capacity (worker-side temporary off-state). Existing
 * dispatches in flight remain valid; future dispatches reject
 * until resume. Resume lands in Phase 13.7.x along with the
 * dispatch flow.
 */
export function pauseComputeServingCapacity(existing) {
  if (existing == null) throw new Error('compute-serving capacity not found.');
  if (existing.status !== 'active') {
    throw new Error(`cannot pause capacity in status ${existing.status}.`);
  }
  return {
    ...existing,
    status: 'paused',
    pausedAt: nowIso().replace(/\.\d{1,3}Z$/, 'Z')
  };
}

/**
 * Build the `compute_serving_capacity.{published|paused|revoked}`
 * audit-ledger event payload. POINTER + count-only meta per §15.
 */
export function buildComputeServingCapacityLedgerEvent({ capacity, eventType, at }) {
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: eventType,
    capacityId: capacity.capacityId,
    workerId: capacity.workerId,
    pricePerKTokensPaise: capacity.pricePerKTokensPaise,
    maxConcurrent: capacity.maxConcurrent,
    maxDailyTokens: capacity.maxDailyTokens,
    batteryMinPercent: capacity.constraints?.batteryMinPercent,
    requireWifi: Boolean(capacity.constraints?.requireWifi),
    requireCharging: Boolean(capacity.constraints?.requireCharging),
    at: atNormalised
  };
}
