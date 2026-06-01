// Phase 12.2.4 — FE mirror of provider-role-extras schemas.
//
// The wizard renders the per-role verification fields + attachment
// slots from this map. The shape MUST stay in sync with the BE
// (src/phase1/provider-role-extras.mjs); a future Phase 12.2.4.x
// can replace this static mirror with a GET
// /api/provider-role-extras-schemas hydrate.

import type { AttachmentKind } from './use-attachment-upload';

export type RoleExtrasFieldKind = 'text' | 'date' | 'phone' | 'integer';

export interface RoleExtrasFieldSpec {
  id: string;
  label: string;
  kind: RoleExtrasFieldKind;
  maxLen?: number;
  min?: number;
  max?: number;
  // Phase 12.3 adversarial fix — per-field regex pattern. Both
  // FE and BE check; FE gives the citizen immediate feedback.
  pattern?: RegExp;
  // 'upper' coerces the input to uppercase before regex test +
  // submission (GSTIN expected uppercase).
  normalize?: 'upper';
}

export interface RoleExtrasAttachmentSlot {
  kind: AttachmentKind;
  label: string;
  helper: string;
  // 'image' covers selfies + simple ID photos; 'image+pdf'
  // covers documents that citizens often upload as scans
  // (vehicle RC, police clearance certificate).
  acceptMode: 'image' | 'image+pdf';
}

export interface RoleExtrasSchema {
  schemaVersion: number;
  required: RoleExtrasFieldSpec[];
  optional: RoleExtrasFieldSpec[];
  requiredAttachments: RoleExtrasAttachmentSlot[];
}

export const ROLE_EXTRAS_SCHEMAS: Record<string, RoleExtrasSchema> = {
  'cab-driver': {
    schemaVersion: 1,
    required: [
      { id: 'drivingLicenceNumber', label: 'Driving licence number', kind: 'text', maxLen: 32 },
      { id: 'vehicleRegistrationNumber', label: 'Vehicle registration (eg MH12AB1234)', kind: 'text', maxLen: 16 },
      { id: 'commercialPermitNumber', label: 'Commercial permit number', kind: 'text', maxLen: 32 }
    ],
    optional: [
      { id: 'insuranceExpiryDate', label: 'Insurance expiry (YYYY-MM-DD)', kind: 'date' },
      { id: 'fitnessCertificateExpiry', label: 'Fitness certificate expiry (YYYY-MM-DD)', kind: 'date' }
    ],
    requiredAttachments: [
      { kind: 'driving_licence', label: 'Driving licence photo', helper: 'Front side; all corners visible.', acceptMode: 'image+pdf' },
      { kind: 'vehicle_registration', label: 'Vehicle registration certificate', helper: 'RC book — first page with number + owner.', acceptMode: 'image+pdf' }
    ]
  },
  'personal-driver': {
    schemaVersion: 1,
    required: [
      { id: 'drivingLicenceNumber', label: 'Driving licence number', kind: 'text', maxLen: 32 },
      { id: 'policeVerificationNumber', label: 'Police verification ref number', kind: 'text', maxLen: 32 },
      { id: 'priorEmployerName', label: 'Prior employer name', kind: 'text', maxLen: 120 }
    ],
    optional: [
      { id: 'priorEmployerContact', label: 'Prior employer phone (10 digits)', kind: 'phone' },
      { id: 'yearsAtPriorEmployer', label: 'Years at prior employer (0-60)', kind: 'integer', min: 0, max: 60 }
    ],
    requiredAttachments: [
      { kind: 'driving_licence', label: 'Driving licence photo', helper: 'Front side; all corners visible.', acceptMode: 'image+pdf' },
      { kind: 'police_verification', label: 'Police verification certificate', helper: 'State PCC scan or photo.', acceptMode: 'image+pdf' },
      { kind: 'employer_reference', label: 'Prior employer reference letter', helper: 'On letterhead if possible.', acceptMode: 'image+pdf' }
    ]
  },
  'labourers': {
    schemaVersion: 1,
    required: [
      { id: 'contractorName', label: 'Contractor / sardar name', kind: 'text', maxLen: 120 },
      { id: 'contractorAttestationNumber', label: 'Attestation reference number', kind: 'text', maxLen: 32 }
    ],
    optional: [
      { id: 'unionMembershipId', label: 'Union membership ID (optional)', kind: 'text', maxLen: 32 },
      { id: 'preferredWorkRadiusKm', label: 'Preferred work radius (km)', kind: 'integer', min: 1, max: 200 }
    ],
    requiredAttachments: [
      { kind: 'contractor_attestation', label: 'Contractor attestation', helper: 'Signed letter or stamped slip from your sardar/thekedar.', acceptMode: 'image+pdf' }
    ]
  },
  'household-help': {
    schemaVersion: 1,
    required: [
      { id: 'policeVerificationNumber', label: 'Police verification ref number', kind: 'text', maxLen: 32 },
      { id: 'priorEmployerName', label: 'Prior employer name', kind: 'text', maxLen: 120 },
      { id: 'priorEmployerContact', label: 'Prior employer phone (10 digits)', kind: 'phone' }
    ],
    optional: [
      { id: 'yearsAtPriorEmployer', label: 'Years at prior employer (0-60)', kind: 'integer', min: 0, max: 60 },
      { id: 'noticePeriodDays', label: 'Notice period (days)', kind: 'integer', min: 0, max: 90 }
    ],
    requiredAttachments: [
      { kind: 'police_verification', label: 'Police verification certificate', helper: 'State PCC scan or photo.', acceptMode: 'image+pdf' },
      { kind: 'employer_reference', label: 'Prior employer reference', helper: 'Letter, message screenshot, or signed slip.', acceptMode: 'image+pdf' }
    ]
  },
  // Phase 12.3 — wave-2 roles.
  'kirana': {
    schemaVersion: 1,
    required: [
      { id: 'shopName', label: 'Shop name', kind: 'text', maxLen: 120 },
      { id: 'shopLicenseNumber', label: 'Shop license / trade license number', kind: 'text', maxLen: 32 }
    ],
    optional: [
      { id: 'gstinNumber', label: 'GSTIN (15 chars; leave blank if below threshold)', kind: 'text', maxLen: 15, pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, normalize: 'upper' },
      { id: 'fssaiLicenseNumber', label: 'FSSAI license number (14 digits)', kind: 'text', maxLen: 14, pattern: /^[0-9]{14}$/ },
      { id: 'yearsInBusiness', label: 'Years in business (0-99)', kind: 'integer', min: 0, max: 99 }
    ],
    requiredAttachments: [
      { kind: 'shop_license', label: 'Shop / trade license', helper: 'Photo or scan of the shop license certificate.', acceptMode: 'image+pdf' }
    ]
  },
  'skilled-trades': {
    schemaVersion: 1,
    required: [
      { id: 'itiCertificateNumber', label: 'ITI certificate number', kind: 'text', maxLen: 32 },
      { id: 'itiInstituteName', label: 'ITI institute name', kind: 'text', maxLen: 120 }
    ],
    optional: [
      { id: 'yearsExperience', label: 'Years of trade experience (0-50)', kind: 'integer', min: 0, max: 50 },
      { id: 'portfolioUrl', label: 'Portfolio URL (Instagram / YouTube link)', kind: 'text', maxLen: 240 }
    ],
    requiredAttachments: [
      { kind: 'iti_certificate', label: 'ITI certificate', helper: 'Photo or scan of your vocational training certificate.', acceptMode: 'image+pdf' }
    ]
  }
};

export function getRoleExtrasSchema(role: string | null | undefined): RoleExtrasSchema | null {
  if (!role) return null;
  return ROLE_EXTRAS_SCHEMAS[role] || null;
}

export function roleRequiresExtras(role: string | null | undefined): boolean {
  return Boolean(role && role in ROLE_EXTRAS_SCHEMAS);
}

// Pure client-side validator mirroring the BE (best-effort; the
// BE re-validates on POST). Phase 12.2.4 fix UX-1 — collects
// ALL failing fields instead of bailing on the first one, so the
// wizard can paint every offending Field at once.
export function validateRoleExtrasClientSide(
  schema: RoleExtrasSchema,
  answers: Record<string, string | number | null>
): { ok: boolean; fieldErrors: Record<string, string>; firstFieldError: { field: string; code: string } | null } {
  const fieldErrors: Record<string, string> = {};
  for (const spec of schema.required) {
    const raw = answers[spec.id];
    if (raw == null || raw === '') {
      fieldErrors[spec.id] = `${spec.id}_required`;
      continue;
    }
    const result = validateField(spec, raw);
    if (!result.ok) fieldErrors[spec.id] = result.code!;
  }
  for (const spec of schema.optional) {
    const raw = answers[spec.id];
    if (raw == null || raw === '') continue;
    const result = validateField(spec, raw);
    if (!result.ok) fieldErrors[spec.id] = result.code!;
  }
  const keys = Object.keys(fieldErrors);
  return {
    ok: keys.length === 0,
    fieldErrors,
    firstFieldError: keys.length === 0 ? null : { field: keys[0], code: fieldErrors[keys[0]] }
  };
}

function validateField(spec: RoleExtrasFieldSpec, raw: string | number): { ok: true } | { ok: false; code: string } {
  switch (spec.kind) {
    case 'text': {
      const s = String(raw).trim();
      const cap = spec.maxLen ?? 120;
      if (s.length === 0 || s.length > cap) return { ok: false, code: `${spec.id}_too_long` };
      const normalized = spec.normalize === 'upper' ? s.toUpperCase() : s;
      if (spec.pattern && !spec.pattern.test(normalized)) {
        return { ok: false, code: `${spec.id}_pattern_invalid` };
      }
      return { ok: true };
    }
    case 'date': {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, code: `${spec.id}_date_invalid` };
      const d = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
        return { ok: false, code: `${spec.id}_date_invalid` };
      }
      return { ok: true };
    }
    case 'phone': {
      const digits = String(raw).replace(/[^0-9]/g, '');
      if (!/^[6-9][0-9]{9}$/.test(digits)) return { ok: false, code: `${spec.id}_phone_invalid` };
      return { ok: true };
    }
    case 'integer': {
      const n = Number(raw);
      if (!Number.isInteger(n)) return { ok: false, code: `${spec.id}_integer_invalid` };
      const lo = spec.min ?? 0;
      const hi = spec.max ?? 1000;
      if (n < lo || n > hi) return { ok: false, code: `${spec.id}_out_of_range` };
      return { ok: true };
    }
    default:
      return { ok: false, code: `${spec.id}_unknown_kind` };
  }
}
