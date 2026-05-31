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

// Service-area is intentionally opaque in this module — Phase
// 12.1a marketplace uses lat/lng + radius OR a polygon (TBD).
// The substrate stores whatever shape the caller passes and only
// asserts it's an object. Phase 12.1a + 12.2 will tighten the
// schema once geo semantics land.
function normalizeServiceArea(area) {
  if (area == null) return null;
  if (typeof area !== 'object') {
    throw new Error('serviceArea must be an object.');
  }
  return area;
}

export function createProviderIdentity({
  rootIdentityId,
  roleKind,
  displayName,
  serviceArea = null,
  ratePaisePerHour = 0,
  ratePaisePerService = 0,
  description = null,
  createdAt = nowIso()
} = {}) {
  const root = assertNonEmptyString(rootIdentityId, 'rootIdentityId', 160);
  if (!PROVIDER_ROLE_KINDS.includes(roleKind)) {
    throw new Error(`roleKind must be one of: ${PROVIDER_ROLE_KINDS.join(', ')}.`);
  }
  const name = assertNonEmptyString(displayName, 'displayName', 120);
  const hourly = assertNonNegativeInteger(ratePaisePerHour, 'ratePaisePerHour');
  const perService = assertNonNegativeInteger(ratePaisePerService, 'ratePaisePerService');
  const area = normalizeServiceArea(serviceArea);
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
  // Activation is a separate operator action (Phase 12.2).
  const nextStatus = provider.status === 'draft' ? 'submitted' : provider.status;
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
  at = nowIso()
} = {}) {
  const updates = { updatedAt: at };
  if (displayName !== undefined) {
    updates.displayName = assertNonEmptyString(displayName, 'displayName', 120);
  }
  if (serviceArea !== undefined) {
    updates.serviceArea = normalizeServiceArea(serviceArea);
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
  return { ...provider, ...updates };
}

// Public read — STRIPS sensitive fields before exposure to citizens
// or the marketplace. Citizens see what they need to book; they
// MUST NOT see rootIdentityId, kycAttestation envelope, or
// operator transition history.
export function publicProviderRecord(provider) {
  return {
    providerIdentityId: provider.providerIdentityId,
    protocolVersion: provider.protocolVersion,
    objectType: provider.objectType,
    roleKind: provider.roleKind,
    roleWave: provider.roleWave,
    displayName: provider.displayName,
    serviceArea: provider.serviceArea,
    ratePaisePerHour: provider.ratePaisePerHour,
    ratePaisePerService: provider.ratePaisePerService,
    description: provider.description,
    kycLevel: provider.kycLevel,
    status: provider.status,
    activatedAt: provider.activatedAt
  };
}

export function canAcceptBookings(provider) {
  return provider?.status === 'active';
}
