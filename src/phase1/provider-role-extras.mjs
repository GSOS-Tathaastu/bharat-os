// Phase 12.2.4 — Per-role "heavy" extras substrate (wave-1).
//
// What this module is.
//
//   The identity-grade documentation + verification layer for the
//   4 wave-1 provider roles. Sits ON TOP of:
//   - Phase 12.1b.3 light forms (`provider-role-forms.mjs`) —
//     citizen-declared filterable preferences (vehicle type, seats,
//     languages spoken). Free-edit, low-trust.
//   - Phase 12.2.2 KYC L1 — generic identity (legal name + Aadhaar
//     last-4 + PAN last-4 + address). Common across roles.
//   - Phase 12.2.3 Attachment CORE — content-addressed blob substrate.
//
//   What 12.2.4 adds: role-specific verification fields (driving
//   licence #, vehicle registration #, police verification #, etc.)
//   paired with document attachments (DL photo, RC scan, PCC PDF).
//   The operator review cross-checks the typed fields against the
//   bytes in the documents.
//
// §15 bindings:
//
//   - Each verification field is BOUNDED (max length, regex where
//     stable like the DL plate-region pattern). No free-form text
//     larger than 240 chars.
//   - Required attachment kinds are CONSTRAINED to the role-specific
//     allowlist. Substrate refuses a `kyc_l1_selfie` in the
//     `driving_licence` slot — preserves operator queue legibility.
//   - Ledger event carries field NAMES + attachment ID handles only.
//     Never the licence number, employer name, etc. The record is
//     the source of truth for those values; the ledger only answers
//     "this happened, at this time, for this provider."
//   - publicProviderRecord does NOT echo roleExtrasSubmission —
//     citizens browsing the marketplace see role + display name +
//     KYC level. They do NOT see the provider's licence number.

import { ATTACHMENT_KINDS } from './attachment.mjs';

export const PROVIDER_ROLE_EXTRAS_PROTOCOL_VERSION = 'bos.phase12.provider-role-extras.v0';

// Field length caps. Conservative — most government IDs are <40
// chars (driving licence ≤ 16, vehicle reg ≤ 13). Padding to 80
// is generous for state-variation + future tightening.
export const ROLE_EXTRAS_FIELD_MAX = 120;
export const ROLE_EXTRAS_NOTES_MAX = 240;
export const ROLE_EXTRAS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ROLE_EXTRAS_NUMBER_MAX = 1_000;

// Roles in this map MUST submit role extras before activation.
// Roles NOT in this map can still submit role extras (the schema
// is empty) but the substrate doesn't gate on it. For wave-1 all
// 4 roles require extras; this map is the gate enforced by
// `transitionProviderStatus`.
//
// schemaVersion is bumped when fields are added / removed; the
// citizen client must re-submit on bump (we surface the
// `schema_version_stale` error from the validator so the FE can
// re-render the new wizard schema).
// Phase 12.2.4 adversarial fix PII-Q4 — deep-freeze each field
// spec object. The outer Object.freeze + frozen arrays were
// shallow; an in-process mutation like
// `PROVIDER_ROLE_EXTRAS['cab-driver'].required[0].maxLen = 999999`
// silently survived and weakened every subsequent validation.
function deepFreezeSchemas(map) {
  for (const role of Object.keys(map)) {
    const schema = map[role];
    for (const arr of [schema.required, schema.optional]) {
      for (const spec of arr) Object.freeze(spec);
    }
  }
  return map;
}

export const PROVIDER_ROLE_EXTRAS = deepFreezeSchemas(Object.freeze({
  'cab-driver': Object.freeze({
    schemaVersion: 1,
    required: Object.freeze([
      { id: 'drivingLicenceNumber', label: 'Driving licence number', kind: 'text', maxLen: 32 },
      { id: 'vehicleRegistrationNumber', label: 'Vehicle registration number', kind: 'text', maxLen: 16 },
      { id: 'commercialPermitNumber', label: 'Commercial permit number', kind: 'text', maxLen: 32 }
    ]),
    optional: Object.freeze([
      { id: 'insuranceExpiryDate', label: 'Insurance expiry (YYYY-MM-DD)', kind: 'date' },
      { id: 'fitnessCertificateExpiry', label: 'Fitness certificate expiry (YYYY-MM-DD)', kind: 'date' }
    ]),
    requiredAttachmentKinds: Object.freeze(['driving_licence', 'vehicle_registration'])
  }),
  'personal-driver': Object.freeze({
    schemaVersion: 1,
    required: Object.freeze([
      { id: 'drivingLicenceNumber', label: 'Driving licence number', kind: 'text', maxLen: 32 },
      { id: 'policeVerificationNumber', label: 'Police verification ref number', kind: 'text', maxLen: 32 },
      { id: 'priorEmployerName', label: 'Prior employer name', kind: 'text', maxLen: ROLE_EXTRAS_FIELD_MAX }
    ]),
    optional: Object.freeze([
      { id: 'priorEmployerContact', label: 'Prior employer phone (10 digits)', kind: 'phone' },
      { id: 'yearsAtPriorEmployer', label: 'Years at prior employer (0-60)', kind: 'integer', min: 0, max: 60 }
    ]),
    requiredAttachmentKinds: Object.freeze(['driving_licence', 'police_verification', 'employer_reference'])
  }),
  'labourers': Object.freeze({
    schemaVersion: 1,
    required: Object.freeze([
      { id: 'contractorName', label: 'Contractor / sardar name', kind: 'text', maxLen: ROLE_EXTRAS_FIELD_MAX },
      { id: 'contractorAttestationNumber', label: 'Attestation reference number', kind: 'text', maxLen: 32 }
    ]),
    optional: Object.freeze([
      { id: 'unionMembershipId', label: 'Union membership ID (optional)', kind: 'text', maxLen: 32 },
      { id: 'preferredWorkRadiusKm', label: 'Preferred work radius (km)', kind: 'integer', min: 1, max: 200 }
    ]),
    requiredAttachmentKinds: Object.freeze(['contractor_attestation'])
  }),
  'household-help': Object.freeze({
    schemaVersion: 1,
    required: Object.freeze([
      { id: 'policeVerificationNumber', label: 'Police verification ref number', kind: 'text', maxLen: 32 },
      { id: 'priorEmployerName', label: 'Prior employer name', kind: 'text', maxLen: ROLE_EXTRAS_FIELD_MAX },
      { id: 'priorEmployerContact', label: 'Prior employer phone (10 digits)', kind: 'phone' }
    ]),
    optional: Object.freeze([
      { id: 'yearsAtPriorEmployer', label: 'Years at prior employer (0-60)', kind: 'integer', min: 0, max: 60 },
      { id: 'noticePeriodDays', label: 'Notice period (days)', kind: 'integer', min: 0, max: 90 }
    ]),
    requiredAttachmentKinds: Object.freeze(['police_verification', 'employer_reference'])
  })
}));

export const ROLES_REQUIRING_EXTRAS = Object.freeze(Object.keys(PROVIDER_ROLE_EXTRAS));

export class RoleExtrasValidationError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'RoleExtrasValidationError';
    this.code = code;
    this.field = field;
  }
}

export function getRoleExtrasSchema(role) {
  if (!role || typeof role !== 'string') return null;
  return PROVIDER_ROLE_EXTRAS[role] || null;
}

export function roleRequiresExtras(role) {
  return ROLES_REQUIRING_EXTRAS.includes(role);
}

// Per-kind field validators — pure, no IO.
function validateFieldValue(spec, raw) {
  if (raw == null || raw === '') return null; // caller decides if required
  switch (spec.kind) {
    case 'text': {
      const s = String(raw).trim();
      if (!s) return null;
      const cap = Number.isFinite(spec.maxLen) ? spec.maxLen : ROLE_EXTRAS_FIELD_MAX;
      if (s.length > cap) {
        throw new RoleExtrasValidationError(
          `${spec.id}_too_long`,
          `${spec.id} must be ≤ ${cap} characters.`,
          spec.id
        );
      }
      return s;
    }
    case 'date': {
      const s = String(raw).trim();
      if (!s) return null;
      if (!ROLE_EXTRAS_DATE_RE.test(s)) {
        throw new RoleExtrasValidationError(
          `${spec.id}_date_invalid`,
          `${spec.id} must be YYYY-MM-DD.`,
          spec.id
        );
      }
      // Verify it's a real calendar date.
      const d = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
        throw new RoleExtrasValidationError(
          `${spec.id}_date_invalid`,
          `${spec.id} must be a valid calendar date.`,
          spec.id
        );
      }
      return s;
    }
    case 'phone': {
      // Indian mobile — 10 digits, leading 6/7/8/9. Strip
      // separators conservatively; refuse country code (the FE is
      // India-only for v1, country code rejection avoids parser
      // ambiguity with future internationalisation).
      const digits = String(raw).replace(/[^0-9]/g, '');
      if (digits.length === 0) return null;
      if (!/^[6-9][0-9]{9}$/.test(digits)) {
        throw new RoleExtrasValidationError(
          `${spec.id}_phone_invalid`,
          `${spec.id} must be a 10-digit Indian mobile (no country code).`,
          spec.id
        );
      }
      return digits;
    }
    case 'integer': {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new RoleExtrasValidationError(
          `${spec.id}_integer_invalid`,
          `${spec.id} must be an integer.`,
          spec.id
        );
      }
      const lo = Number.isFinite(spec.min) ? spec.min : 0;
      const hi = Number.isFinite(spec.max) ? spec.max : ROLE_EXTRAS_NUMBER_MAX;
      if (n < lo || n > hi) {
        throw new RoleExtrasValidationError(
          `${spec.id}_out_of_range`,
          `${spec.id} must be between ${lo} and ${hi}.`,
          spec.id
        );
      }
      return n;
    }
    default:
      throw new RoleExtrasValidationError(
        `${spec.id}_unknown_kind`,
        `${spec.id} has an unknown kind: ${spec.kind}.`,
        spec.id
      );
  }
}

// validateRoleExtras
//
// inputs:
//   role: 'cab-driver' | 'personal-driver' | 'labourers' | 'household-help'
//   raw: { answers: {...}, attachments: { [kind]: attachmentId } }
//
// Returns the cleaned envelope on success; throws
// RoleExtrasValidationError on the first failure.
//
// The optional `attachmentVerifier(attachmentId, kind)` is the API
// handler's hook to verify an attachment exists AND is owned by the
// same root identity. The substrate doesn't read from storage —
// the caller does the cross-check.
export async function validateRoleExtras(role, raw, { attachmentVerifier } = {}) {
  const schema = getRoleExtrasSchema(role);
  if (!schema) {
    throw new RoleExtrasValidationError(
      'role_unsupported',
      `role "${role}" has no extras schema; nothing to submit.`,
      'role'
    );
  }
  if (!raw || typeof raw !== 'object') {
    throw new RoleExtrasValidationError('envelope_invalid', 'expected {answers, attachments}.');
  }
  // Phase 12.2.4 adversarial fix PII-Q6 — when the client
  // explicitly sends a schemaVersion that doesn't match the
  // current substrate, fail loudly so the FE knows to re-render
  // against the new schema. Previously the BE silently
  // overwrote the version, masking client/server drift behind
  // confusing per-field errors.
  if (raw.schemaVersion != null && Number(raw.schemaVersion) !== schema.schemaVersion) {
    throw new RoleExtrasValidationError(
      'schema_version_stale',
      `client sent schemaVersion ${raw.schemaVersion} but substrate is on ${schema.schemaVersion}; refresh and re-submit.`,
      'schemaVersion'
    );
  }
  const answersIn = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  const attachmentsIn = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};

  // Validate REQUIRED answers (presence + type + range).
  const answers = {};
  for (const spec of schema.required) {
    const observed = answersIn[spec.id];
    const cleaned = validateFieldValue(spec, observed);
    if (cleaned == null || cleaned === '') {
      throw new RoleExtrasValidationError(
        `${spec.id}_required`,
        `${spec.id} is required.`,
        spec.id
      );
    }
    answers[spec.id] = cleaned;
  }
  // Validate OPTIONAL answers (only when present).
  for (const spec of schema.optional) {
    const observed = answersIn[spec.id];
    if (observed == null || observed === '') continue;
    answers[spec.id] = validateFieldValue(spec, observed);
  }

  // Reject any answer keys NOT in the schema — the substrate is
  // closed; future fields require a schemaVersion bump.
  const allKnown = new Set([
    ...schema.required.map((s) => s.id),
    ...schema.optional.map((s) => s.id)
  ]);
  for (const key of Object.keys(answersIn)) {
    if (!allKnown.has(key)) {
      throw new RoleExtrasValidationError(
        'unknown_field',
        `unknown answer field: ${key}.`,
        key
      );
    }
  }

  // Validate REQUIRED attachments (presence + id shape + verifier).
  const attachments = {};
  for (const kind of schema.requiredAttachmentKinds) {
    const observed = attachmentsIn[kind];
    if (!observed || typeof observed !== 'string') {
      throw new RoleExtrasValidationError(
        `${kind}_attachment_required`,
        `attachment for ${kind} is required.`,
        kind
      );
    }
    if (!/^bos:att:[0-9a-f]{32}$/.test(observed)) {
      throw new RoleExtrasValidationError(
        `${kind}_attachment_invalid`,
        `attachment ${observed} is not a valid bos:att:<32hex> id.`,
        kind
      );
    }
    if (typeof attachmentVerifier === 'function') {
      const ok = await attachmentVerifier(observed, kind);
      if (!ok) {
        throw new RoleExtrasValidationError(
          `${kind}_attachment_not_owned`,
          `attachment ${observed} does not resolve to an owned blob for kind ${kind}.`,
          kind
        );
      }
    }
    attachments[kind] = observed;
  }

  // Reject any attachment kinds OUTSIDE the schema's required list
  // — closed substrate; misc / extra kinds need a substrate update.
  for (const kind of Object.keys(attachmentsIn)) {
    if (!schema.requiredAttachmentKinds.includes(kind)) {
      throw new RoleExtrasValidationError(
        'unknown_attachment_kind',
        `attachment kind ${kind} is not allowed for role ${role}.`,
        kind
      );
    }
    if (!ATTACHMENT_KINDS.includes(kind)) {
      throw new RoleExtrasValidationError(
        'unknown_attachment_kind',
        `attachment kind ${kind} is not in the substrate allowlist.`,
        kind
      );
    }
  }

  return {
    schemaVersion: schema.schemaVersion,
    role,
    answers,
    attachments
  };
}
