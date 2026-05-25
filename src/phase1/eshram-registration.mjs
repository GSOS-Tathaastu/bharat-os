// State e-Shram registration + welfare-scheme entitlement substrate
// — Phase 6.3.
//
// e-Shram is the Ministry of Labour & Employment's National Database
// of Unorganised Workers — ~300M registered workers as of FY 2024-25.
// Each registration issues a 12-digit UAN (Universal Account Number)
// and links the worker to a basket of welfare schemes (PMJJBY life
// insurance, PMSBY accident insurance, PM-SYM pension, Atmanirbhar
// Bharat Rozgar Yojana, state-specific welfare boards, etc.).
//
// What this module ships: the SUBSTRATE a state labor commissioner
// or central scheme administrator can sign attestations against.
// Bharat OS does NOT integrate with the e-Shram database itself —
// that requires a partnership. We model the envelope shape so
// when the partnership lands, the issuing endpoint is one curl.
//
// Two primitives:
//
//   1. `createEShramRegistration` — the issuer (a blessed identity
//      per Phase 6.2's blessed_collectives registry, semantically
//      generalised) signs an envelope: "this worker holds e-Shram
//      UAN X, occupation Y, registered in state Z."
//
//   2. `createSchemeEntitlement` — the issuer signs: "this worker
//      is enrolled in scheme S as of date D, with optional
//      validTo + benefit amount."
//
// §15 bindings:
//
//   • UAN is the worker's government-issued identifier. It's PII.
//     We store the full UAN on the signed envelope (needed for
//     downstream verification with the e-Shram database when the
//     partnership exists) but `maskUan()` reduces it to the last
//     4 digits for any audit / metric / log surface.
//
//   • Aadhaar number is NEVER stored. e-Shram registration uses
//     Aadhaar at the government layer; Bharat OS receives only
//     the UAN.
//
//   • Income / scheme-benefit amounts use coarse brackets where
//     possible. Precise amounts are stored in paise (integer) to
//     avoid float drift.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const ESHRAM_REGISTRATION_PROTOCOL_VERSION =
  'bos.phase1.eshram-registration.v0';

// e-Shram's published occupation taxonomy contains ~30 categories.
// We expose the broadest 8 used in the e-Shram dashboard; consumers
// can extend via the free-text `occupationDetail` field.
export const OCCUPATION_CATEGORIES = Object.freeze([
  'agriculture',
  'construction',
  'domestic',
  'transport',
  'manufacturing',
  'gig_platform',
  'retail',
  'other'
]);

// e-Shram links workers to a basket of welfare schemes. We model
// the most-cited central + state schemes plus an `other` escape
// hatch for schemes specific to a state board.
export const WELFARE_SCHEME_CODES = Object.freeze([
  'PMJJBY',         // life insurance
  'PMSBY',          // accident insurance
  'PM-SYM',         // unorganised-worker pension
  'PMJAY',          // Ayushman Bharat health
  'MGNREGA',        // rural employment
  'PMAY',           // housing
  'NSAP',           // social assistance
  'STATE_WELFARE',  // catch-all for state welfare boards
  'OTHER'
]);

export const INCOME_BRACKETS = Object.freeze([
  'under_10k',      // < ₹10,000 / month
  '10k_to_25k',
  '25k_to_50k',
  '50k_to_1L',
  '1L_to_3L',
  'over_3L'
]);

export const EDUCATION_LEVELS = Object.freeze([
  'no_formal',
  'primary',
  'secondary',
  'higher_secondary',
  'graduate',
  'postgraduate',
  'unspecified'
]);

const UAN_PATTERN = /^\d{12}$/;
const STATE_PATTERN = /^[A-Z]{2,3}$/; // ISO-3166-2 sub-code or RTO style
const DEFAULT_REGISTRATION_TTL_DAYS = 365;
const MAX_REGISTRATION_TTL_DAYS = 5 * 365;
const DEFAULT_ENTITLEMENT_TTL_DAYS = 365;

function nowIso() {
  return new Date().toISOString();
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidUan(value) {
  if (typeof value !== 'string') return false;
  return UAN_PATTERN.test(value);
}

// `123456789012` → `xxxx-xxxx-9012`. Mandatory for any audit /
// ledger / metric / log surface. Full UAN lives ONLY on the
// stored attestation record.
export function maskUan(uan) {
  if (!isValidUan(uan)) return null;
  return `xxxx-xxxx-${uan.slice(-4)}`;
}

// ─── e-Shram registration attestation ────────────────────────────────

export function createEShramRegistration({
  issuer,
  memberId,
  issuerName,
  uan,
  occupationCategory = 'other',
  occupationDetail = null,
  state,
  district = null,
  educationLevel = 'unspecified',
  monthlyIncomeBracket = null,
  ncoCode = null,
  registeredAt = null,
  ttlDays = DEFAULT_REGISTRATION_TTL_DAYS,
  at = nowIso()
} = {}) {
  if (!issuer?.id) throw new Error('issuer identity is required.');
  if (!memberId || typeof memberId !== 'string') {
    throw new Error('memberId is required.');
  }
  if (memberId === issuer.id) {
    throw new Error('issuer cannot self-issue a registration.');
  }
  if (!issuerName || typeof issuerName !== 'string') {
    throw new Error('issuerName is required.');
  }
  if (issuerName.length > 120) throw new Error('issuerName must be <= 120 chars.');
  if (!isValidUan(uan)) {
    throw new Error('uan must be a 12-digit string.');
  }
  if (!OCCUPATION_CATEGORIES.includes(occupationCategory)) {
    throw new Error(
      `occupationCategory must be one of: ${OCCUPATION_CATEGORIES.join(', ')}`
    );
  }
  if (occupationDetail !== null && occupationDetail !== undefined) {
    if (typeof occupationDetail !== 'string' || occupationDetail.length > 120) {
      throw new Error('occupationDetail must be a string <= 120 chars.');
    }
    occupationDetail = occupationDetail.trim().slice(0, 120) || null;
  }
  if (!state || typeof state !== 'string' || !STATE_PATTERN.test(state)) {
    throw new Error('state must be a 2-3 letter uppercase code (e.g., TN, MH, KA).');
  }
  if (district !== null && district !== undefined) {
    if (typeof district !== 'string' || district.length > 80) {
      throw new Error('district must be a string <= 80 chars.');
    }
    district = district.trim().slice(0, 80) || null;
  }
  if (!EDUCATION_LEVELS.includes(educationLevel)) {
    throw new Error(
      `educationLevel must be one of: ${EDUCATION_LEVELS.join(', ')}`
    );
  }
  if (monthlyIncomeBracket !== null && monthlyIncomeBracket !== undefined) {
    if (!INCOME_BRACKETS.includes(monthlyIncomeBracket)) {
      throw new Error(
        `monthlyIncomeBracket must be one of: ${INCOME_BRACKETS.join(', ')}`
      );
    }
  }
  if (ncoCode !== null && ncoCode !== undefined) {
    if (typeof ncoCode !== 'string' || !/^\d{2,4}$/.test(ncoCode)) {
      throw new Error('ncoCode must be a 2-4 digit string (NCO 2015 code).');
    }
  }
  if (registeredAt !== null && registeredAt !== undefined) {
    if (!isValidIsoDate(registeredAt)) {
      throw new Error('registeredAt must be YYYY-MM-DD.');
    }
  }
  if (
    !Number.isFinite(ttlDays) ||
    ttlDays < 30 ||
    ttlDays > MAX_REGISTRATION_TTL_DAYS
  ) {
    throw new Error(`ttlDays must be between 30 and ${MAX_REGISTRATION_TTL_DAYS}.`);
  }

  const expiresAt = new Date(
    Date.parse(at) + ttlDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const core = {
    protocolVersion: ESHRAM_REGISTRATION_PROTOCOL_VERSION,
    objectType: 'eshram-registration',
    issuerId: issuer.id,
    issuerName: issuerName.trim().slice(0, 120),
    memberId,
    uan,
    uanMasked: maskUan(uan),
    occupationCategory,
    occupationDetail,
    state,
    district,
    educationLevel,
    monthlyIncomeBracket: monthlyIncomeBracket ?? null,
    ncoCode: ncoCode ?? null,
    registeredAt: registeredAt ?? null,
    issuedAt: at,
    expiresAt,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  };
  const registrationId = `bos:eshram-registration:${sha256Hex(
    stableStringify(core)
  ).slice(0, 32)}`;
  const payloadText = stableStringify({ ...core, registrationId });
  const signature = signText(issuer, payloadText);
  return {
    ...core,
    registrationId,
    signature
  };
}

export function verifyEShramRegistration(
  registration,
  issuerPublicRecord,
  { at = nowIso() } = {}
) {
  if (!registration || registration.objectType !== 'eshram-registration') {
    return { ok: false, status: 'malformed' };
  }
  if (!registration.signature) return { ok: false, status: 'malformed' };
  if (
    !issuerPublicRecord ||
    issuerPublicRecord.id !== registration.issuerId
  ) {
    return { ok: false, status: 'unknown_issuer' };
  }
  if (registration.status === 'revoked' || registration.revokedAt) {
    return { ok: false, status: 'revoked' };
  }
  if (registration.expiresAt && at >= registration.expiresAt) {
    return { ok: false, status: 'expired' };
  }
  const {
    signature,
    status: _s,
    revokedAt: _r,
    revokedReason: _rr,
    ...canonical
  } = registration;
  const payloadText = stableStringify({
    ...canonical,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  });
  const valid = verifySignature(issuerPublicRecord, payloadText, signature);
  return valid
    ? { ok: true, status: 'valid' }
    : { ok: false, status: 'signature_invalid' };
}

export function revokeEShramRegistration(
  registration,
  { reason, at = nowIso() } = {}
) {
  if (!registration || registration.objectType !== 'eshram-registration') {
    throw new Error('registration must be an eshram-registration.');
  }
  if (!reason || typeof reason !== 'string' || reason.length < 4) {
    throw new Error('reason is required (>= 4 chars) for revocation.');
  }
  return {
    ...registration,
    status: 'revoked',
    revokedAt: at,
    revokedReason: reason.slice(0, 240)
  };
}

// ─── Welfare scheme entitlement attestation ──────────────────────────

export function createSchemeEntitlement({
  issuer,
  memberId,
  issuerName,
  schemeCode,
  schemeName = null,
  enrolledAt = null,
  benefitPaise = null,
  benefitDescription = null,
  validThrough = null,
  ttlDays = DEFAULT_ENTITLEMENT_TTL_DAYS,
  at = nowIso()
} = {}) {
  if (!issuer?.id) throw new Error('issuer identity is required.');
  if (!memberId || typeof memberId !== 'string') {
    throw new Error('memberId is required.');
  }
  if (memberId === issuer.id) {
    throw new Error('issuer cannot self-issue an entitlement.');
  }
  if (!issuerName || typeof issuerName !== 'string') {
    throw new Error('issuerName is required.');
  }
  if (issuerName.length > 120) throw new Error('issuerName must be <= 120 chars.');
  if (!WELFARE_SCHEME_CODES.includes(schemeCode)) {
    throw new Error(
      `schemeCode must be one of: ${WELFARE_SCHEME_CODES.join(', ')}`
    );
  }
  if (schemeName !== null && schemeName !== undefined) {
    if (typeof schemeName !== 'string' || schemeName.length > 160) {
      throw new Error('schemeName must be a string <= 160 chars.');
    }
    schemeName = schemeName.trim().slice(0, 160) || null;
  }
  if (enrolledAt !== null && enrolledAt !== undefined) {
    if (!isValidIsoDate(enrolledAt)) {
      throw new Error('enrolledAt must be YYYY-MM-DD.');
    }
  }
  if (benefitPaise !== null && benefitPaise !== undefined) {
    if (!Number.isInteger(benefitPaise) || benefitPaise < 0) {
      throw new Error('benefitPaise must be a non-negative integer.');
    }
    if (benefitPaise > 1_00_00_00_000_00) {
      throw new Error('benefitPaise exceeds sanity ceiling.');
    }
  }
  if (benefitDescription !== null && benefitDescription !== undefined) {
    if (typeof benefitDescription !== 'string' || benefitDescription.length > 240) {
      throw new Error('benefitDescription must be a string <= 240 chars.');
    }
    benefitDescription = benefitDescription.trim().slice(0, 240) || null;
  }
  if (validThrough !== null && validThrough !== undefined) {
    if (!isValidIsoDate(validThrough)) {
      throw new Error('validThrough must be YYYY-MM-DD.');
    }
  }
  if (!Number.isFinite(ttlDays) || ttlDays < 30 || ttlDays > MAX_REGISTRATION_TTL_DAYS) {
    throw new Error(`ttlDays must be between 30 and ${MAX_REGISTRATION_TTL_DAYS}.`);
  }

  const expiresAt = new Date(
    Date.parse(at) + ttlDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const core = {
    protocolVersion: ESHRAM_REGISTRATION_PROTOCOL_VERSION,
    objectType: 'scheme-entitlement',
    issuerId: issuer.id,
    issuerName: issuerName.trim().slice(0, 120),
    memberId,
    schemeCode,
    schemeName,
    enrolledAt: enrolledAt ?? null,
    benefitPaise: benefitPaise ?? null,
    benefitDescription,
    validThrough: validThrough ?? null,
    issuedAt: at,
    expiresAt,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  };
  const entitlementId = `bos:scheme-entitlement:${sha256Hex(
    stableStringify(core)
  ).slice(0, 32)}`;
  const payloadText = stableStringify({ ...core, entitlementId });
  const signature = signText(issuer, payloadText);
  return {
    ...core,
    entitlementId,
    signature
  };
}

export function verifySchemeEntitlement(
  entitlement,
  issuerPublicRecord,
  { at = nowIso() } = {}
) {
  if (!entitlement || entitlement.objectType !== 'scheme-entitlement') {
    return { ok: false, status: 'malformed' };
  }
  if (!entitlement.signature) return { ok: false, status: 'malformed' };
  if (!issuerPublicRecord || issuerPublicRecord.id !== entitlement.issuerId) {
    return { ok: false, status: 'unknown_issuer' };
  }
  if (entitlement.status === 'revoked' || entitlement.revokedAt) {
    return { ok: false, status: 'revoked' };
  }
  if (entitlement.expiresAt && at >= entitlement.expiresAt) {
    return { ok: false, status: 'expired' };
  }
  // Also check scheme-validity end-date if the issuer set one.
  if (entitlement.validThrough && at.slice(0, 10) > entitlement.validThrough) {
    return { ok: false, status: 'scheme_validity_expired' };
  }
  const {
    signature,
    status: _s,
    revokedAt: _r,
    revokedReason: _rr,
    ...canonical
  } = entitlement;
  const payloadText = stableStringify({
    ...canonical,
    status: 'active',
    revokedAt: null,
    revokedReason: null
  });
  const valid = verifySignature(issuerPublicRecord, payloadText, signature);
  return valid
    ? { ok: true, status: 'valid' }
    : { ok: false, status: 'signature_invalid' };
}

export function revokeSchemeEntitlement(
  entitlement,
  { reason, at = nowIso() } = {}
) {
  if (!entitlement || entitlement.objectType !== 'scheme-entitlement') {
    throw new Error('entitlement must be a scheme-entitlement.');
  }
  if (!reason || typeof reason !== 'string' || reason.length < 4) {
    throw new Error('reason is required (>= 4 chars) for revocation.');
  }
  return {
    ...entitlement,
    status: 'revoked',
    revokedAt: at,
    revokedReason: reason.slice(0, 240)
  };
}

// Given a list of registrations + entitlements + the blessed
// registry, return the subset that are signed by a blessed
// issuer AND currently valid. Mirrors the Phase 6.2
// `filterBlessedMemberships` pattern.
export function filterBlessedEShramRegistrations(
  registrations,
  blessedRegistry,
  { at = nowIso() } = {}
) {
  const blessedSet = new Set(
    (blessedRegistry ?? []).map((b) => b.collectiveId)
  );
  return (registrations ?? []).filter((r) => {
    if (!blessedSet.has(r.issuerId)) return false;
    if (r.status !== 'active') return false;
    if (r.revokedAt) return false;
    if (r.expiresAt && at >= r.expiresAt) return false;
    return true;
  });
}

export function filterBlessedSchemeEntitlements(
  entitlements,
  blessedRegistry,
  { at = nowIso() } = {}
) {
  const blessedSet = new Set(
    (blessedRegistry ?? []).map((b) => b.collectiveId)
  );
  return (entitlements ?? []).filter((e) => {
    if (!blessedSet.has(e.issuerId)) return false;
    if (e.status !== 'active') return false;
    if (e.revokedAt) return false;
    if (e.expiresAt && at >= e.expiresAt) return false;
    if (e.validThrough && at.slice(0, 10) > e.validThrough) return false;
    return true;
  });
}
