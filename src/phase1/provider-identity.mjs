// Phase 12.0 — Provider identity substrate.
//
// Marketplace providers (driver / cook / maid / kirana / skilled
// trades) carry a SEPARATE identity from micro-task workers
// (labelers / federated / mesh). Different KYC weight, different
// liability shape; same human can hold BOTH under one root
// recovery (Phase 1.19).
//
// What this module is. A pure validation + record-construction
// module over Phase 0 identity primitives. Creates `providerIdentity`
// objects bound to a `rootIdentityId` (the underlying citizen/worker
// identity), carrying:
//   - role (one of PROVIDER_ROLE_KINDS — wave 1 from the
//     direction memo; wave 2 deferred to Phase 12.3+)
//   - KYC level (none / basic / verified — server-attested only,
//     never self-attested)
//   - service area + rate (citizens see when ranking; provider
//     edits anytime)
//   - status (draft → submitted → active → suspended | revoked)
//
// What this module is NOT. The KYC verification logic itself
// (Phase 12.1b SLM dynamic-form does the form generation; an
// operator + Aadhaar e-KYC adapter does the actual verify in
// Phase 12.2). Booking lifecycle (Phase 12.1a citizen-booking-
// escrow). Trust Passport feedback loop (already substrate,
// extended in Phase 12.2). Per-role onboarding wizard (Phase 12.2
// wave 1).
//
// §15 bindings the design enforces:
//
//   • SEPARATE identity from workerIdentity. A workerIdentity
//     that earns from labeling cannot accidentally be elevated
//     to provider via a self-attestation; provider promotion
//     requires KYC attestation by an operator.
//   • Bound to a root. providerIdentity.rootIdentityId references
//     the underlying citizen/worker identity (Phase 0 record).
//     DPDP §12(3) cascade by `root_identity_id` is mandatory.
//   • Public read strips sensitive fields. Citizens browsing
//     the marketplace see role + display name + service area +
//     rate + Trust Passport score. They MUST NOT see KYC docs,
//     phone number, or the rootIdentityId.
//   • Operator attestation required to activate. A provider
//     identity starts as `draft`. KYC attestation by an operator
//     (Phase 12.2 adapter) moves it to `submitted`. A separate
//     operator review moves it to `active`. This separation is
//     §15 honesty about who is responsible for what.
//   • No commission. The substrate has NO field for a platform
//     commission rate. Bharat OS doesn't take a cut of provider
//     earnings — full citizen payment lands in provider mesh
//     balance (§13B + memory/service-booking-native-not-ola-uber).

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const PROVIDER_IDENTITY_PROTOCOL_VERSION = 'bos.phase12.provider-identity.v0';

// Roles match the EARN_ROLES catalog id strings (kept in sync via
// the wave-1 / wave-2 split documented in the direction memos).
// Wave 1 onboards in Phase 12.2 first batch.
export const PROVIDER_ROLE_KINDS_WAVE_1 = [
  'cab-driver',       // own commercial vehicle: taxi / auto / ride-hail
  'personal-driver',  // chauffeur for citizen's vehicle
  'labourers',        // construction / loading / factory / farm daily wage
  'household-help'    // maid + cook combined (police verification + references)
];

// Wave 2 is recognized by the substrate but per-role wizard ships
// later (Phase 12.3+). Creating a provider identity with a wave-2
// role is allowed today; activation will block on missing wizard
// until 12.3.
export const PROVIDER_ROLE_KINDS_WAVE_2 = [
  'kirana',           // shop license + GST optional
  'skilled-trades'    // ITI cert + portfolio
];

export const PROVIDER_ROLE_KINDS = [
  ...PROVIDER_ROLE_KINDS_WAVE_1,
  ...PROVIDER_ROLE_KINDS_WAVE_2
];

// KYC levels — server-attested only. A providerIdentity NEVER
// self-attests its KYC; an operator (Phase 12.2 adapter, eventually
// real Aadhaar e-KYC) calls kyc-attest with one of these values.
export const PROVIDER_KYC_LEVELS = ['none', 'basic', 'verified'];

// Phase 12.2.2 — KYC Level 1 (citizen-driven) submission shape.
//
// The provider supplies their identity + address + IDs themselves
// via the /onboarding/kyc-level-1 wizard. This is NOT the same as
// `attestProviderKyc` (operator action that elevates `kycLevel`).
//
// §15 bindings on KYC L1:
//   - Aadhaar last-4 ONLY. The substrate refuses anything that
//     could be a full Aadhaar (12 digits). Bharat OS never stores
//     the full 12-digit Aadhaar today; real e-KYC lands in a
//     Phase 12.2.x DigiLocker adapter that returns a signed
//     verification token, not the number itself.
//   - PAN last-4 ONLY. Same reasoning. The full PAN is held by
//     the citizen; we store the last-4 as a check-digit so
//     downstream consumers (operators reviewing the submission)
//     can verify a citizen-presented PAN matches the record
//     without ever transmitting the full PAN.
//   - Address PIN code (6-digit). The city + state are auto-
//     resolved via the India Post adapter; the citizen confirms
//     and the resolved values are persisted on the record.
//   - `publicProviderRecord` MUST NOT echo this field. Citizens
//     browsing the marketplace must not see the legal name +
//     last-4 IDs of providers.
export const KYC_L1_AADHAAR_LAST4_RE = /^[0-9]{4}$/;
export const KYC_L1_PAN_LAST4_RE = /^[A-Z0-9]{4}$/;
export const KYC_L1_PINCODE_RE = /^[1-9][0-9]{5}$/;
export const KYC_L1_FULL_LEGAL_NAME_MAX = 120;
export const KYC_L1_ADDRESS_LINE_MAX = 240;

export class KycLevel1ValidationError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'KycLevel1ValidationError';
    this.code = code;
    this.field = field;
  }
}

// Validate a KYC L1 submission. Returns the cleaned record on
// success; throws KycLevel1ValidationError on the FIRST failure.
// Pure — no IO. Caller persists the returned object verbatim.
export function validateKycLevel1Submission({
  fullLegalName,
  aadhaarLast4,
  panLast4,
  addressPinCode,
  addressLine,
  cityFromPincode,
  stateFromPincode
} = {}) {
  const name = fullLegalName == null ? '' : String(fullLegalName).trim();
  if (!name) throw new KycLevel1ValidationError('full_legal_name_required', 'fullLegalName is required.', 'fullLegalName');
  if (name.length > KYC_L1_FULL_LEGAL_NAME_MAX) {
    throw new KycLevel1ValidationError('full_legal_name_too_long', 'fullLegalName must be ≤ 120 chars.', 'fullLegalName');
  }

  const a = aadhaarLast4 == null ? '' : String(aadhaarLast4).trim();
  // §15 binding: anything that looks like a full Aadhaar (12 digits)
  // is rejected outright BEFORE the last-4 regex check. Defense in
  // depth against a UI bug that forwards the full input.
  if (/^[0-9]{12}$/.test(a)) {
    throw new KycLevel1ValidationError(
      'aadhaar_last4_full_aadhaar_rejected',
      'never send the full 12-digit Aadhaar; only the last 4 digits.',
      'aadhaarLast4'
    );
  }
  if (!KYC_L1_AADHAAR_LAST4_RE.test(a)) {
    throw new KycLevel1ValidationError('aadhaar_last4_invalid', 'aadhaarLast4 must be exactly 4 digits.', 'aadhaarLast4');
  }

  const p = panLast4 == null ? '' : String(panLast4).trim().toUpperCase();
  // Full PAN is exactly 10 chars (AAAAA9999A). Reject defensively.
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) {
    throw new KycLevel1ValidationError(
      'pan_last4_full_pan_rejected',
      'never send the full 10-character PAN; only the last 4 characters.',
      'panLast4'
    );
  }
  if (!KYC_L1_PAN_LAST4_RE.test(p)) {
    throw new KycLevel1ValidationError('pan_last4_invalid', 'panLast4 must be exactly 4 chars (A-Z / 0-9).', 'panLast4');
  }

  const pin = addressPinCode == null ? '' : String(addressPinCode).trim();
  if (!KYC_L1_PINCODE_RE.test(pin)) {
    throw new KycLevel1ValidationError('pincode_invalid', 'addressPinCode must be a 6-digit Indian PIN.', 'addressPinCode');
  }
  const line = addressLine == null ? '' : String(addressLine).trim();
  if (!line) throw new KycLevel1ValidationError('address_line_required', 'addressLine is required.', 'addressLine');
  if (line.length > KYC_L1_ADDRESS_LINE_MAX) {
    throw new KycLevel1ValidationError('address_line_too_long', 'addressLine must be ≤ 240 chars.', 'addressLine');
  }

  const city = cityFromPincode == null ? null : String(cityFromPincode).trim().slice(0, 120) || null;
  const state = stateFromPincode == null ? null : String(stateFromPincode).trim().slice(0, 120) || null;
  // City + state must both be present — the wizard auto-fills them
  // via the PIN adapter; if either is absent, the FE submitted a
  // bad envelope and we don't want a half-populated record.
  if (!city) throw new KycLevel1ValidationError('city_required', 'cityFromPincode is required.', 'cityFromPincode');
  if (!state) throw new KycLevel1ValidationError('state_required', 'stateFromPincode is required.', 'stateFromPincode');

  return {
    fullLegalName: name,
    aadhaarLast4: a,
    panLast4: p,
    addressPinCode: pin,
    addressLine: line,
    cityFromPincode: city,
    stateFromPincode: state
  };
}

// Persist (or replace) a KYC L1 submission on a draft providerIdentity.
// Does NOT change kycLevel — that remains an operator action. Does
// NOT change status — the operator review surface decides whether
// to elevate to `submitted`. This call is idempotent: re-submitting
// with the same fields produces the same record.
export function submitKycLevel1(provider, fields, { at = nowIso() } = {}) {
  if (!provider || provider.status !== 'draft') {
    const err = new Error('KYC L1 can only be submitted while the provider is in draft.');
    err.code = 'invalid_status_for_kyc_l1';
    throw err;
  }
  const cleaned = validateKycLevel1Submission(fields);
  return {
    ...provider,
    kycLevel1Submission: {
      ...cleaned,
      submittedAt: at
    },
    updatedAt: at
  };
}

// Lifecycle status. Substrate enforces single-direction transitions
// (draft → submitted → active → suspended | revoked). A revoked
// identity cannot return to active; the citizen creates a new one.
export const PROVIDER_IDENTITY_STATUSES = [
  'draft',      // created; can edit profile + rates + area; cannot accept bookings
  'submitted',  // KYC attested by operator; awaiting activation review
  'active',     // visible in marketplace + can accept bookings
  'suspended',  // operator paused; citizen cannot accept bookings until reinstated
  'revoked'     // terminated; permanent. New providerIdentity required.
];

const VALID_TRANSITIONS = {
  draft: new Set(['submitted', 'revoked']),
  submitted: new Set(['active', 'draft', 'revoked']),
  active: new Set(['suspended', 'revoked']),
  suspended: new Set(['active', 'revoked']),
  revoked: new Set([])
};

function nowIso() {
  return new Date().toISOString();
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function assertNonEmptyString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertNonNegativeInteger(value, label) {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

// Service-area schema (Phase 12.1a.1 — marketplace discovery).
//
// We accept exactly two shapes for forward-compat:
//
//   point-radius  — { kind:'point-radius', center:{lat,lng},
//                     radiusMeters, summary?, source, capturedAt }
//                   centroid persisted at 4 decimals (~11m grid)
//                   for forward-compat with a future booking flow;
//                   PUBLIC reads emit 2 decimals (~1.1km) via
//                   toPublicServiceArea() — this prevents
//                   reverse-doxing a household-help worker's
//                   home address from a sorted discovery list.
//
//   legacy-summary — { kind:'legacy-summary', summary } — a
//                    Phase 12.0 free-text record. Excluded from
//                    /api/marketplace/providers ranking because
//                    there's no geo to rank against. Owners are
//                    nudged to re-save with structured geo via
//                    the Phase 12.1a.1 ProviderOnboarding flow.
//
// Any other discriminator (e.g. 'polygon') is REJECTED loudly so
// a future Phase 12.2 polygon shape can't silently slip through
// an unknown-kind path. The discoverable predicate is hasDiscoverableGeo.
export const SERVICE_AREA_KINDS = ['point-radius', 'legacy-summary'];

const MIN_SERVICE_RADIUS_M = 500;       // 0.5 km
const MAX_SERVICE_RADIUS_M = 50000;     // 50 km
const SERVICE_AREA_SOURCES = ['geolocation', 'manual', 'city-default'];

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function assertLatLng(lat, lng) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('serviceArea.center.lat must be a finite number in [-90, 90].');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('serviceArea.center.lng must be a finite number in [-180, 180].');
  }
}

function normalizeServiceArea(area, { at = null } = {}) {
  if (area == null) return null;
  if (typeof area !== 'object') {
    throw new Error('serviceArea must be an object.');
  }
  // Forward-compat: a future Phase 12.2 may add 'polygon'. Reject
  // anything not in SERVICE_AREA_KINDS so we never silently store
  // a kind we can't rank.
  if (area.kind === 'polygon') {
    const err = new Error('service_area_polygon_not_yet_supported');
    err.code = 'service_area_polygon_not_yet_supported';
    throw err;
  }
  // Phase 12.0 callers that don't set `kind` but have a free-text
  // `summary` are coerced to legacy-summary so existing draft rows
  // don't fail validation when the owner saves again before
  // upgrading to point-radius.
  if (!area.kind && typeof area.summary === 'string') {
    return {
      kind: 'legacy-summary',
      summary: String(area.summary).slice(0, 120)
    };
  }
  if (!SERVICE_AREA_KINDS.includes(area.kind)) {
    throw new Error(
      `serviceArea.kind must be one of: ${SERVICE_AREA_KINDS.join(', ')}.`
    );
  }
  if (area.kind === 'legacy-summary') {
    const summary = area.summary == null ? '' : String(area.summary).slice(0, 120);
    return { kind: 'legacy-summary', summary };
  }
  // point-radius
  if (!area.center || typeof area.center !== 'object') {
    throw new Error('serviceArea.center is required for kind=point-radius.');
  }
  const lat = Number(area.center.lat);
  const lng = Number(area.center.lng);
  assertLatLng(lat, lng);
  const radiusMeters = Math.trunc(Number(area.radiusMeters));
  if (!Number.isFinite(radiusMeters) || radiusMeters < MIN_SERVICE_RADIUS_M || radiusMeters > MAX_SERVICE_RADIUS_M) {
    throw new Error(
      `serviceArea.radiusMeters must be an integer in [${MIN_SERVICE_RADIUS_M}, ${MAX_SERVICE_RADIUS_M}].`
    );
  }
  const source = area.source == null ? 'manual' : String(area.source);
  if (!SERVICE_AREA_SOURCES.includes(source)) {
    throw new Error(
      `serviceArea.source must be one of: ${SERVICE_AREA_SOURCES.join(', ')}.`
    );
  }
  const summary = area.summary == null ? null : String(area.summary).slice(0, 120);
  const capturedAt = area.capturedAt == null ? (at || nowIso()) : String(area.capturedAt);
  return {
    kind: 'point-radius',
    center: { lat: round4(lat), lng: round4(lng) },
    radiusMeters,
    summary,
    source,
    capturedAt
  };
}

// Read-time hydration — accepts any older record shape and produces
// the discriminated-union variant the rest of the substrate can
// reason about. Used by store hydration so existing rows survive.
export function coerceServiceAreaShape(area) {
  if (area == null) return null;
  if (typeof area !== 'object') return null;
  if (area.kind && SERVICE_AREA_KINDS.includes(area.kind)) return area;
  if (typeof area.summary === 'string') {
    return { kind: 'legacy-summary', summary: area.summary.slice(0, 120) };
  }
  // Unknown legacy shape — preserve as legacy-summary with empty
  // summary so it's excluded from discovery (not lost).
  return { kind: 'legacy-summary', summary: '' };
}

// Public projection for serviceArea — used by publicProviderRecord
// to coarsen provider centroid to 2 decimals (~1.1km) before
// citizens / discovery see it. This prevents reverse-doxing a
// provider's home address from a sorted nearby list.
export function toPublicServiceArea(area) {
  if (area == null) return null;
  const shape = coerceServiceAreaShape(area);
  if (!shape) return null;
  if (shape.kind === 'legacy-summary') {
    return { kind: 'legacy-summary', summary: shape.summary };
  }
  // point-radius
  return {
    kind: 'point-radius',
    center: { lat: round2(shape.center.lat), lng: round2(shape.center.lng) },
    radiusMeters: shape.radiusMeters,
    summary: shape.summary,
    // source + capturedAt are operational metadata; not exposed.
  };
}

// Does this serviceArea support marketplace discovery ranking?
// True only for point-radius with finite center.
export function hasDiscoverableGeo(area) {
  if (!area || typeof area !== 'object') return false;
  if (area.kind !== 'point-radius') return false;
  if (!area.center) return false;
  return Number.isFinite(area.center.lat) && Number.isFinite(area.center.lng);
}

// Store hydration — accepts a raw row (or null) and coerces
// serviceArea into the discriminated-union shape so older rows
// authored before Phase 12.1a.1 (free-text summary) still work.
// Returns null for null input.
export function hydrateProviderIdentity(p) {
  if (!p) return null;
  if (!p.serviceArea) return p;
  return { ...p, serviceArea: coerceServiceAreaShape(p.serviceArea) };
}

export function createProviderIdentity({
  rootIdentityId,
  roleKind,
  displayName,
  serviceArea = null,
  ratePaisePerHour = 0,
  ratePaisePerService = 0,
  description = null,
  // Phase 12.1b.3 — optional per-role light form envelope
  // (`{schemaVersion, values}`). Caller must validate via
  // src/phase1/provider-role-forms.mjs::validateRoleAnswers before
  // passing in; this function only stores the verified envelope.
  // Null when the role has no schema or the citizen skipped it.
  roleAnswers = null,
  createdAt = nowIso()
} = {}) {
  const root = assertNonEmptyString(rootIdentityId, 'rootIdentityId', 160);
  if (!PROVIDER_ROLE_KINDS.includes(roleKind)) {
    throw new Error(`roleKind must be one of: ${PROVIDER_ROLE_KINDS.join(', ')}.`);
  }
  const name = assertNonEmptyString(displayName, 'displayName', 120);
  const hourly = assertNonNegativeInteger(ratePaisePerHour, 'ratePaisePerHour');
  const perService = assertNonNegativeInteger(ratePaisePerService, 'ratePaisePerService');
  const area = normalizeServiceArea(serviceArea, { at: createdAt });
  const desc = description == null ? null : String(description).slice(0, 600);
  const wave = PROVIDER_ROLE_KINDS_WAVE_1.includes(roleKind) ? 1 : 2;

  const core = {
    protocolVersion: PROVIDER_IDENTITY_PROTOCOL_VERSION,
    objectType: 'provider-identity',
    rootIdentityId: root,
    roleKind,
    roleWave: wave,
    displayName: name,
    serviceArea: area,
    ratePaisePerHour: hourly,
    ratePaisePerService: perService,
    description: desc,
    roleAnswers: roleAnswers && typeof roleAnswers === 'object' ? roleAnswers : null,
    // Phase 12.2.2 — citizen-driven KYC L1 submission. Operator
    // review consumes this field via the admin queue; never exposed
    // by publicProviderRecord.
    kycLevel1Submission: null,
    kycLevel: 'none',
    kycAttestation: null,
    status: 'draft',
    createdAt,
    submittedAt: null,
    activatedAt: null,
    suspendedAt: null,
    revokedAt: null,
    updatedAt: createdAt
  };
  return {
    providerIdentityId: idFrom('bos:provider-identity', { ...core, t: createdAt }),
    ...core
  };
}

// KYC attestation — operator-only call. Asserts an operator has
// verified the provider's underlying credentials (Aadhaar e-KYC
// for level 'basic', Aadhaar + DigiLocker docs + role-specific
// proof for 'verified'). Records the attestation envelope on the
// provider identity for audit; the actual verification adapter
// lives in Phase 12.2.
export function attestProviderKyc(provider, {
  kycLevel,
  operatorId,
  evidenceRefs = [],
  notes = null,
  attestedAt = nowIso()
} = {}) {
  if (!PROVIDER_KYC_LEVELS.includes(kycLevel)) {
    throw new Error(`kycLevel must be one of: ${PROVIDER_KYC_LEVELS.join(', ')}.`);
  }
  if (kycLevel === 'none') {
    throw new Error('attestProviderKyc cannot set level back to none; use revoke.');
  }
  const op = assertNonEmptyString(operatorId, 'operatorId', 160);
  const notesTrim = notes == null ? null : String(notes).slice(0, 600);

  const attestation = {
    kycLevel,
    operatorId: op,
    evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 20) : [],
    notes: notesTrim,
    attestedAt
  };

  // KYC attestation moves draft -> submitted if not yet there.
  // Activation is a separate operator action (Phase 12.2). Phase
  // 12.1a.1 — same submitted-state geo guard as transitionProviderStatus:
  // a provider cannot enter the submitted state without a discoverable
  // point-radius serviceArea, regardless of which code path triggers
  // the transition.
  const willSubmit = provider.status === 'draft';
  if (willSubmit && !hasDiscoverableGeo(provider.serviceArea)) {
    const err = new Error('cannot submit provider without point-radius serviceArea.');
    err.code = 'service_area_required';
    throw err;
  }
  const nextStatus = willSubmit ? 'submitted' : provider.status;
  const nextSubmittedAt = nextStatus === 'submitted' && !provider.submittedAt ? attestedAt : provider.submittedAt;

  return {
    ...provider,
    kycLevel,
    kycAttestation: attestation,
    status: nextStatus,
    submittedAt: nextSubmittedAt,
    updatedAt: attestedAt
  };
}

// Status transition — operator-only call. The substrate enforces
// valid transitions per VALID_TRANSITIONS; callers cannot make a
// providerIdentity 'active' without first having KYC attested.
export function transitionProviderStatus(provider, nextStatus, {
  operatorId,
  reason = null,
  at = nowIso()
} = {}) {
  if (!PROVIDER_IDENTITY_STATUSES.includes(nextStatus)) {
    throw new Error(`nextStatus must be one of: ${PROVIDER_IDENTITY_STATUSES.join(', ')}.`);
  }
  const allowed = VALID_TRANSITIONS[provider.status] ?? new Set();
  if (!allowed.has(nextStatus)) {
    throw new Error(
      `cannot transition from ${provider.status} to ${nextStatus}.`
    );
  }
  // §15: cannot activate without KYC attestation.
  if (nextStatus === 'active' && provider.kycLevel === 'none') {
    throw new Error('cannot activate provider without KYC attestation.');
  }
  // Phase 12.1a.1: cannot submit a draft without a discoverable
  // serviceArea (point-radius with finite center). Forces existing
  // legacy {summary} drafts through a one-time geo capture before
  // KYC review — otherwise they'd silently be excluded from
  // marketplace discovery after activation.
  if (nextStatus === 'submitted' && !hasDiscoverableGeo(provider.serviceArea)) {
    const err = new Error('cannot submit provider without point-radius serviceArea.');
    err.code = 'service_area_required';
    throw err;
  }
  const op = assertNonEmptyString(operatorId, 'operatorId', 160);
  const reasonTrim = reason == null ? null : String(reason).slice(0, 400);

  const updates = {
    status: nextStatus,
    updatedAt: at
  };
  if (nextStatus === 'submitted' && !provider.submittedAt) updates.submittedAt = at;
  if (nextStatus === 'active' && !provider.activatedAt) updates.activatedAt = at;
  if (nextStatus === 'suspended') updates.suspendedAt = at;
  if (nextStatus === 'revoked') updates.revokedAt = at;

  return {
    ...provider,
    ...updates,
    lastTransition: {
      from: provider.status,
      to: nextStatus,
      operatorId: op,
      reason: reasonTrim,
      at
    }
  };
}

// Edit provider's profile fields. ONLY the rootIdentityId owner
// (the underlying citizen/worker) should call this — the API
// gate is in api.mjs. Substrate just validates the fields.
// Cannot edit role, status, KYC, or audit timestamps.
export function updateProviderProfile(provider, {
  displayName,
  serviceArea,
  ratePaisePerHour,
  ratePaisePerService,
  description,
  // Phase 12.1b.3 — optional roleAnswers envelope. When provided,
  // it MUST already be validated via validateRoleAnswers (the API
  // handler does this before calling here). When omitted, the
  // existing answers are preserved; when explicitly null, the
  // record is cleared.
  roleAnswers,
  at = nowIso()
} = {}) {
  const updates = { updatedAt: at };
  if (displayName !== undefined) {
    updates.displayName = assertNonEmptyString(displayName, 'displayName', 120);
  }
  if (serviceArea !== undefined) {
    // EC-1 (adversarial review) — once a provider is submitted /
    // active, the marketplace assumes they have a discoverable
    // geo. Nulling serviceArea would silently delist them while
    // status stays active. Refuse the mutation; provider must
    // first transition to draft if they want to reset their pin.
    if ((provider.status === 'active' || provider.status === 'submitted') && serviceArea === null) {
      const err = new Error('cannot clear serviceArea while provider is submitted or active.');
      err.code = 'service_area_required';
      throw err;
    }
    updates.serviceArea = normalizeServiceArea(serviceArea, { at });
  }
  if (ratePaisePerHour !== undefined) {
    updates.ratePaisePerHour = assertNonNegativeInteger(ratePaisePerHour, 'ratePaisePerHour');
  }
  if (ratePaisePerService !== undefined) {
    updates.ratePaisePerService = assertNonNegativeInteger(ratePaisePerService, 'ratePaisePerService');
  }
  if (description !== undefined) {
    updates.description = description == null ? null : String(description).slice(0, 600);
  }
  if (roleAnswers !== undefined) {
    // Caller is responsible for shape validation. Storing as-is
    // (or null to clear). publicProviderRecord does NOT echo this
    // field — answers are owner-readable, not citizen-readable.
    updates.roleAnswers = roleAnswers == null ? null : roleAnswers;
  }
  return { ...provider, ...updates };
}

// Public read — STRIPS sensitive fields before exposure to citizens
// or the marketplace. Citizens see what they need to book; they
// MUST NOT see rootIdentityId, kycAttestation envelope, or
// operator transition history.
//
// Phase 12.1a.1 — the serviceArea centroid is coarsened to 2
// decimals (~1.1km) via toPublicServiceArea so a sorted "nearby
// providers" list cannot pinpoint a household-help worker's home.
// The 4-decimal centroid stays in the substrate for forward-compat
// with a future booking flow that needs higher precision for
// pickup-confirmation; that access is gated behind owner identity.
export function publicProviderRecord(provider) {
  return {
    providerIdentityId: provider.providerIdentityId,
    protocolVersion: provider.protocolVersion,
    objectType: provider.objectType,
    roleKind: provider.roleKind,
    roleWave: provider.roleWave,
    displayName: provider.displayName,
    serviceArea: toPublicServiceArea(provider.serviceArea),
    ratePaisePerHour: provider.ratePaisePerHour,
    ratePaisePerService: provider.ratePaisePerService,
    description: provider.description,
    kycLevel: provider.kycLevel,
    status: provider.status,
    activatedAt: provider.activatedAt
  };
}

// Phase 12.2.2 — projection for the OWNER's own list of provider
// identities (GET /api/identities/:rootId/provider-identities).
// Stronger than publicProviderRecord (the owner sees their own
// kycLevel1Submission) but REDACTS the sensitive fields the
// adversarial review (OWNER-LIST-UNAUTHENTICATED) flagged:
// the endpoint trusts rootIdentityId from the URL today, so a
// network attacker who learns a victim's rootIdentityId would
// scrape full last-4 IDs + address line. Until Bharat ID lands
// a signed-session contract, redact those fields to "••••" so
// the worst the leak yields is the citizen's name + PIN +
// city/state — the same surface that's already on the operator
// queue today.
//
// The wizard's "edit" mode requires the citizen to re-type the
// last-4 Aadhaar/PAN; the city/state/PIN/name pre-fill from this
// redacted projection is enough to confirm "this is the right
// submission to edit."
export function selfProviderRecord(provider) {
  const sub = provider.kycLevel1Submission;
  return {
    providerIdentityId: provider.providerIdentityId,
    protocolVersion: provider.protocolVersion,
    objectType: provider.objectType,
    rootIdentityId: provider.rootIdentityId,
    roleKind: provider.roleKind,
    roleWave: provider.roleWave,
    displayName: provider.displayName,
    serviceArea: provider.serviceArea,
    ratePaisePerHour: provider.ratePaisePerHour,
    ratePaisePerService: provider.ratePaisePerService,
    description: provider.description,
    roleAnswers: provider.roleAnswers,
    kycLevel1Submission: sub
      ? {
        fullLegalName: sub.fullLegalName,
        aadhaarLast4: '••••',
        panLast4: '••••',
        addressPinCode: sub.addressPinCode,
        addressLine: '•••• (re-enter to edit)',
        cityFromPincode: sub.cityFromPincode,
        stateFromPincode: sub.stateFromPincode,
        submittedAt: sub.submittedAt
      }
      : null,
    kycLevel: provider.kycLevel,
    kycAttestation: provider.kycAttestation,
    status: provider.status,
    createdAt: provider.createdAt,
    submittedAt: provider.submittedAt,
    activatedAt: provider.activatedAt,
    suspendedAt: provider.suspendedAt,
    revokedAt: provider.revokedAt,
    updatedAt: provider.updatedAt,
    lastTransition: provider.lastTransition
  };
}

export function canAcceptBookings(provider) {
  return provider?.status === 'active';
}
