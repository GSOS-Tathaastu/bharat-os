// Phase 13.5 — Citizen data offer substrate.
//
// A "citizen data offer" is the citizen-side counterpart to the
// Phase 10.x labeling job: the citizen publishes "I am willing to
// sell my [dataPointKind] data points for [pricePerSalePaise] each,
// up to [maxSales] sales, for the purposes [sponsorPurposeAllowlist],
// expiring at [expiresAt]". A sponsor may later purchase against
// this offer through the sponsor purchase endpoint (Phase 13.5.1);
// each purchase debits the sponsor's escrow and credits the
// citizen's mesh balance.
//
// This phase ships ONLY the citizen-side substrate: validator +
// store + create / list / revoke endpoints + DPDP cascade. The
// purchase flow + sponsor browse surface land in Phase 13.5.1.
//
// §15 bindings:
//   - Strict allowlist on top-level keys (mirrors Phase 13.0.2
//     doc-summary-envelope + Phase 13.4 skill-agent posture).
//   - dataPointKind / sponsorPurposeAllowlist enums frozen.
//   - Content-derived offerId so re-publishing the same offer is
//     idempotent (no spam offers from one citizen).
//   - Audit ledger emits POINTER + count-only meta (offerId /
//     dataPointKind / pricePerSalePaise / maxSales) — never the
//     underlying data points themselves (those stay on-device
//     until a sponsor purchases AND the citizen explicitly
//     publishes for that purchase, per the future 13.5.1 flow).
//   - DPDP §12 cascade: offers wipe on identity erase. Outstanding
//     offers from a since-erased citizen become unhoneurable.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const CITIZEN_DATA_OFFER_PROTOCOL_VERSION = 'bos.phase13.citizen-data-offer.v1';

// What KIND of data the citizen is offering. Each kind maps to an
// existing Bharat OS data-producing surface (Phase 11 citizen
// intents / Phase 13.0 doc summariser / Phase 13.1 PII redactor /
// Phase 13.4 skill runs / Phase 3.x mesh contributions).
export const DATA_POINT_KINDS = Object.freeze([
  'intent_text',          // citizen intent prompts (Phase 11 / 12.1b SLM-A)
  'doc_summary',          // SLM-E doc summary outputs (Phase 13.0)
  'pii_redaction',        // SLM-F redaction outputs (Phase 13.1)
  'skill_run',            // SLM-H skill input + output pair (Phase 13.4.x)
  'mesh_contribution'     // federated learning gradient (Phase 3.x)
]);

// What PURPOSE the sponsor may use the data for. Each purpose maps
// to a citizen-meaningful category. Sponsors must declare their
// purpose at purchase time (Phase 13.5.1); the BE matches against
// the allowlist on the offer.
export const SPONSOR_PURPOSES = Object.freeze([
  'model_training',       // train new SLM / fine-tune
  'model_evaluation',     // eval suites / benchmarks
  'safety_benchmark',     // red-team / safety
  'product_research',     // sponsor's product research
  'academic_research',    // university / academic study
  'gov_audit'             // government compliance audit
]);

export const CITIZEN_DATA_OFFER_STATUSES = Object.freeze([
  'active',     // accepting purchases
  'paused',     // citizen-paused; existing salesCount preserved
  'revoked',    // citizen-revoked; no further purchases
  'exhausted'   // salesCount === maxSales; auto-transitioned
]);

// Strict allowlist on top-level entity keys. Adding a field
// requires extending this list AND updating the validator.
export const PERMITTED_CITIZEN_DATA_OFFER_KEYS = Object.freeze([
  'offerId',
  'publisherId',
  'dataPointKind',
  'pricePerSalePaise',
  'maxSales',
  'salesCount',
  'sponsorPurposeAllowlist',
  'protocolVersion',
  'status',
  'publishedAt',
  'expiresAt',
  'revokedAt',
  'revokeReason',
  'pausedAt'
]);

// FORBIDDEN_REGISTRY_SUBSTRINGS posture from ADR 0155 / 0156. Both
// the validator-rejection probe + ledger-event JSON-grep test
// import this and assert no forbidden substring appears.
export const CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'dataPoint',           // never the actual data points
  'content',             // never raw content
  'intentText',          // never the intent body
  'docSummary',          // never the summary body
  'piiRedaction',        // never the redaction trail
  'plaintext',
  'rawBody',
  'snippet',
  'preview',
  'unmasked'
]);

// Caps. All bounded so a misbehaving FE can't bloat the registry.
const MIN_PRICE_PAISE = 100;                 // ₹1.00
const MAX_PRICE_PAISE = 10_000_000;          // ₹100,000
const MIN_MAX_SALES = 1;
const MAX_MAX_SALES = 1000;
const MIN_PURPOSES = 1;
const MAX_PURPOSES = SPONSOR_PURPOSES.length;
const MAX_OFFER_TTL_MS = 365 * 24 * 60 * 60 * 1000;   // 365 days
const MIN_OFFER_TTL_MS = 24 * 60 * 60 * 1000;          // 24 hours
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function nowIso() {
  return new Date().toISOString();
}

function assertIntInRange(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be an integer in [${min}, ${max}].`);
  }
  return n;
}

function assertStringArray(value, label, allowlist, { min, max }) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length < min || value.length > max) {
    throw new Error(`${label} must have between ${min} and ${max} entries.`);
  }
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error(`${label} entries must be strings.`);
    if (!allowlist.includes(entry)) {
      throw new Error(`${label} entry "${entry}" is not in the allowlist.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${label} contains duplicate entry "${entry}".`);
    }
    seen.add(entry);
  }
  return [...value].sort();
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
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

function offerIdFrom(payload) {
  return `bos:citizen-data-offer:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

/**
 * Validate + build a citizen-supplied data-offer publication.
 * Returns the validated record ready for persistence; throws on
 * malformed input so the API handler surfaces a 400.
 *
 * Strict allowlist posture mirrors ADR 0155 / 0156.
 */
export function buildCitizenDataOffer(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('citizen-data-offer input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!PERMITTED_CITIZEN_DATA_OFFER_KEYS.includes(key)) {
      throw new Error(
        `${key} is not a permitted citizen-data-offer field; envelope is pointer-only (the data points themselves never reach the registry).`
      );
    }
  }
  const publisherId = assertNonEmptyString(input.publisherId, 'publisherId', 200);
  if (!DATA_POINT_KINDS.includes(input.dataPointKind)) {
    throw new Error(`dataPointKind must be one of: ${DATA_POINT_KINDS.join(', ')}.`);
  }
  const pricePerSalePaise = assertIntInRange(
    input.pricePerSalePaise,
    'pricePerSalePaise',
    MIN_PRICE_PAISE,
    MAX_PRICE_PAISE
  );
  const maxSales = assertIntInRange(input.maxSales, 'maxSales', MIN_MAX_SALES, MAX_MAX_SALES);
  const sponsorPurposeAllowlist = assertStringArray(
    input.sponsorPurposeAllowlist,
    'sponsorPurposeAllowlist',
    SPONSOR_PURPOSES,
    { min: MIN_PURPOSES, max: MAX_PURPOSES }
  );
  const publishedAt = assertIsoInstant(input.publishedAt ?? nowIso(), 'publishedAt');
  const expiresAt = assertIsoInstant(input.expiresAt, 'expiresAt');

  // TTL bounds — relative to publishedAt.
  const publishedMs = Date.parse(publishedAt);
  const expiresMs = Date.parse(expiresAt);
  if (expiresMs - publishedMs < MIN_OFFER_TTL_MS) {
    throw new Error('expiresAt must be at least 24 hours after publishedAt.');
  }
  if (expiresMs - publishedMs > MAX_OFFER_TTL_MS) {
    throw new Error('expiresAt cannot be more than 365 days after publishedAt.');
  }

  const offerId = offerIdFrom({
    publisherId,
    dataPointKind: input.dataPointKind,
    sponsorPurposeAllowlist,
    pricePerSalePaise,
    maxSales,
    publishedAt
  });
  if (input.offerId != null && input.offerId !== offerId) {
    throw new Error('offerId does not match content-derived hash.');
  }
  return {
    offerId,
    publisherId,
    dataPointKind: input.dataPointKind,
    pricePerSalePaise,
    maxSales,
    salesCount: 0,
    sponsorPurposeAllowlist,
    protocolVersion: CITIZEN_DATA_OFFER_PROTOCOL_VERSION,
    status: 'active',
    publishedAt,
    expiresAt,
    revokedAt: null,
    revokeReason: null,
    pausedAt: null
  };
}

/**
 * Soft-delete a citizen data offer (no further purchases allowed).
 * Preserves history per the ledger event below.
 */
export function revokeCitizenDataOffer(existing, { revokedBy, reason }) {
  if (existing == null) throw new Error('citizen data offer not found.');
  if (existing.status === 'revoked') {
    throw new Error('citizen data offer is already revoked.');
  }
  if (existing.publisherId !== revokedBy) {
    throw new Error('only the publisher can revoke their own data offer.');
  }
  const revokeReason = reason == null ? null : assertNonEmptyString(reason, 'reason', 240);
  return {
    ...existing,
    status: 'revoked',
    revokedAt: nowIso(),
    revokeReason
  };
}

/**
 * Pause a citizen data offer. Existing salesCount preserved; future
 * purchases reject until resume. v1 ships the BE state machine only;
 * the FE resume action lands in 13.5.1.
 */
export function pauseCitizenDataOffer(existing) {
  if (existing == null) throw new Error('citizen data offer not found.');
  if (existing.status !== 'active') {
    throw new Error(`cannot pause offer in status ${existing.status}.`);
  }
  return {
    ...existing,
    status: 'paused',
    pausedAt: nowIso()
  };
}

/**
 * Build the `citizen_data_offer.published` audit-ledger event
 * payload. Count-only + pointers; never the data point bodies.
 */
export function buildCitizenDataOfferLedgerEvent({ offer, eventType, at }) {
  const atNormalised =
    typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: eventType,
    offerId: offer.offerId,
    publisherId: offer.publisherId,
    dataPointKind: offer.dataPointKind,
    pricePerSalePaise: offer.pricePerSalePaise,
    maxSales: offer.maxSales,
    salesCount: offer.salesCount,
    purposeCount: offer.sponsorPurposeAllowlist.length,
    at: atNormalised
  };
}
