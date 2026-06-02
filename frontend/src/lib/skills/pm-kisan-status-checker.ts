// Phase 13.4.2 — third SLM-H skill: PM-KISAN status checker.
//
// PM-KISAN (Pradhan Mantri Kisan Samman Nidhi) is the direct
// income-support scheme for small + marginal Indian farmers:
// ₹6,000/year disbursed in three ₹2,000 installments
// (Apr-Jul, Aug-Nov, Dec-Mar). This skill reads the citizen's
// free-form description of their PM-KISAN concern (status check
// / missing payment / eligibility doubt) and emits structured
// guidance about the likely blocker + next steps.
//
// v1 is informational. No PM-KISAN adapter — the SLM reasons
// from the description and the canonical scheme rules. A future
// 13.4.x will wire the pmkisan.gov.in beneficiary-status API
// once the partner / scraping path is decided.
//
// §15 bindings: same as parent skill-agent.ts. The citizen's
// description never leaves the device; the SLM runs locally.

import {
  type SkillDefinition,
  type SkillBaseFields,
  type SkillResult,
  parseSkillBaseFields,
  clipLine,
  SKILL_AGENT_PROTOCOL_VERSION
} from '../skill-agent';

export const PM_KISAN_STATUS_CHECKER_SKILL_ID =
  'bos:skill-agent-fe:pm-kisan-status-checker.v1';

export const SCHEME_STATUSES = [
  'likely_active',
  'likely_inactive',
  'eligibility_uncertain',
  'unknown'
] as const;
export type SchemeStatus = (typeof SCHEME_STATUSES)[number];
const SCHEME_STATUS_SET = new Set<SchemeStatus>(SCHEME_STATUSES);

// The four common reasons a PM-KISAN payment fails to land,
// plus 'none' (no blocker visible) and 'unknown' (insufficient
// info). The SLM is biased toward the four real causes; drift
// coerces to 'unknown'.
export const LIKELY_BLOCKERS = [
  'ekyc_pending',
  'bank_aadhaar_unseeded',
  'land_record_mismatch',
  'ineligible_landholding',
  'none',
  'unknown'
] as const;
export type LikelyBlocker = (typeof LIKELY_BLOCKERS)[number];
const LIKELY_BLOCKER_SET = new Set<LikelyBlocker>(LIKELY_BLOCKERS);

export interface PmKisanInput {
  /** Citizen-typed free-form description of their concern. */
  concernText: string;
  /** Current date in YYYY-MM-DD form. Used to anchor the
   *  next-installment-window reasoning. Tests pass an explicit
   *  date so the prompt stays byte-stable; the panel passes
   *  today's date. */
  currentDateIso: string;
}

export interface PmKisanFields extends SkillBaseFields {
  schemeStatus: SchemeStatus;
  likelyBlocker: LikelyBlocker;
  nextInstallmentWindow: string;
  keyChecks: readonly string[];
}

const MAX_INPUT_CHARS = 2400;
const MAX_OUTPUT_CHARS = 1400;
const MAX_NEXT_WINDOW_CHARS = 120;
const MAX_KEY_CHECKS = 5;
const MIN_KEY_CHECKS = 1;
const MAX_CHECK_CHARS = 160;

// Canonical PM-KISAN installment windows (Indian financial year
// pattern). These are PROMPT HINTS for the SLM; the actual
// disbursement dates within each window vary by year. The SLM
// uses the citizen-supplied `currentDateIso` to pick the next
// window.
const INSTALLMENT_WINDOWS = Object.freeze([
  '1st installment: April to July',
  '2nd installment: August to November',
  '3rd installment: December to March'
]);

function normaliseInput(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, MAX_INPUT_CHARS);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validateDate(dateIso: string): string {
  if (typeof dateIso !== 'string' || !ISO_DATE_RE.test(dateIso)) {
    throw new Error('currentDateIso must be a YYYY-MM-DD string.');
  }
  // The skill prompt embeds this verbatim; reject calendar-invalid
  // dates so the SLM can't see e.g. 2026-13-99.
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error('currentDateIso must be a calendar-valid date.');
  }
  return dateIso;
}

function buildPrompt(input: PmKisanInput, profileFragment?: string): string {
  const concern = normaliseInput(input.concernText);
  const today = validateDate(input.currentDateIso);
  const parts: string[] = [];
  if (profileFragment && profileFragment.length > 0) {
    parts.push(profileFragment);
    parts.push('');
  }
  parts.push(
    'You are an on-device PM-KISAN (Pradhan Mantri Kisan Samman Nidhi) scheme-status assistant for an Indian farmer using Bharat OS. The citizen describes their concern about PM-KISAN status, missing payments, or eligibility. Reply with a brief, factual guidance envelope. Never invent specific beneficiary numbers or amounts. PM-KISAN disburses ₹6,000/year in three ₹2,000 installments per Indian-fiscal cycle:',
    ...INSTALLMENT_WINDOWS.map((w) => `  ${w}.`),
    '',
    `Today's date: ${today}.`,
    '',
    'The four common reasons a PM-KISAN payment fails to land:',
    '  1. eKYC pending — citizen has not completed Aadhaar OTP / biometric eKYC.',
    '  2. Bank account not seeded with Aadhaar — NPCI mapper missing.',
    '  3. Land record mismatch — name / area on Bhulekh does not match PM-KISAN registration.',
    '  4. Ineligible landholding — exceeds the small/marginal threshold OR institutional / non-farmer status.',
    '',
    'Reply in EXACTLY this format and NOTHING else:',
    '',
    'HEADLINE: <one-line plain-language headline of the situation, max 120 characters>',
    'ASSESSMENT: <one or two sentences on what the citizen most likely needs to do, max 240 characters>',
    'SCHEME_STATUS: <one of: likely_active, likely_inactive, eligibility_uncertain, unknown>',
    'LIKELY_BLOCKER: <one of: ekyc_pending, bank_aadhaar_unseeded, land_record_mismatch, ineligible_landholding, none, unknown>',
    'NEXT_INSTALLMENT_WINDOW: <free-form description of when the next installment is expected, max 120 characters>',
    'KEY_CHECK_1: <a thing the citizen should verify, max 160 characters>',
    'KEY_CHECK_2: <another, max 160 characters>',
    'KEY_CHECK_3: <another, max 160 characters>',
    'CONFIDENCE: <0.00 to 1.00>',
    'RISK_FLAG: <one of: none, attention, urgent>',
    'ACTIONS: <comma-separated, 1 to 5 of: complete_pm_kisan_ekyc, check_aadhaar_bank_seeding, verify_land_records, contact_pm_kisan_helpline, visit_csc_for_correction, archive_for_records, flag_for_review>',
    '',
    'CONCERN DESCRIPTION:',
    concern,
    '',
    'YOUR ANSWER:'
  );
  return parts.join('\n');
}

// ─── Parser ───────────────────────────────────────────────────────

const SCHEME_STATUS_RE = /^\s*SCHEME_STATUS\s*[:=]\s*([a-z_]+)/im;
const LIKELY_BLOCKER_RE = /^\s*LIKELY_BLOCKER\s*[:=]\s*([a-z_]+)/im;
const NEXT_WINDOW_RE = /^\s*NEXT_INSTALLMENT_WINDOW\s*[:=]\s*(.+)$/im;
const KEY_CHECK_RES = [
  /^\s*KEY_CHECK_1\s*[:=]\s*(.+)$/im,
  /^\s*KEY_CHECK_2\s*[:=]\s*(.+)$/im,
  /^\s*KEY_CHECK_3\s*[:=]\s*(.+)$/im,
  /^\s*KEY_CHECK_4\s*[:=]\s*(.+)$/im,
  /^\s*KEY_CHECK_5\s*[:=]\s*(.+)$/im
];

function coerceSchemeStatus(raw: string | undefined): SchemeStatus {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase().trim();
  return SCHEME_STATUS_SET.has(lower as SchemeStatus)
    ? (lower as SchemeStatus)
    : 'unknown';
}

function coerceLikelyBlocker(raw: string | undefined): LikelyBlocker {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase().trim();
  return LIKELY_BLOCKER_SET.has(lower as LikelyBlocker)
    ? (lower as LikelyBlocker)
    : 'unknown';
}

function collectKeyChecks(normalised: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of KEY_CHECK_RES) {
    const match = re.exec(normalised);
    const check = clipLine(match?.[1], MAX_CHECK_CHARS);
    if (!check) continue;
    if (seen.has(check)) continue;
    seen.add(check);
    out.push(check);
    if (out.length >= MAX_KEY_CHECKS) break;
  }
  return out;
}

function parseCompletion(raw: string): SkillResult<PmKisanFields> | null {
  const base = parseSkillBaseFields(raw);
  if (!base) return null;
  const normalised = raw.replace(/\r\n/g, '\n');
  const nextInstallmentWindow = clipLine(NEXT_WINDOW_RE.exec(normalised)?.[1], MAX_NEXT_WINDOW_CHARS);
  if (!nextInstallmentWindow) return null;
  const keyChecks = collectKeyChecks(normalised);
  if (keyChecks.length < MIN_KEY_CHECKS) return null;
  const schemeStatus = coerceSchemeStatus(SCHEME_STATUS_RE.exec(normalised)?.[1]);
  const likelyBlocker = coerceLikelyBlocker(LIKELY_BLOCKER_RE.exec(normalised)?.[1]);
  return {
    protocolVersion: SKILL_AGENT_PROTOCOL_VERSION,
    skillId: PM_KISAN_STATUS_CHECKER_SKILL_ID,
    fields: {
      ...base,
      schemeStatus,
      likelyBlocker,
      nextInstallmentWindow,
      keyChecks: Object.freeze(keyChecks)
    }
  };
}

function sampleInput(): PmKisanInput {
  return {
    concernText:
      'I am a marginal farmer from Maharashtra. I received the first two PM-KISAN installments last year but the third one in December never came. My Aadhaar is linked to my SBI account. I am not sure if my eKYC was renewed this year.',
    currentDateIso: '2026-06-02'
  };
}

export const PM_KISAN_STATUS_CHECKER: SkillDefinition<PmKisanInput, PmKisanFields> = Object.freeze({
  skillId: PM_KISAN_STATUS_CHECKER_SKILL_ID,
  category: 'government_scheme_status',
  displayName: 'PM-KISAN status checker',
  supportedDocKinds: Object.freeze(['generic']),
  maxInputChars: MAX_INPUT_CHARS,
  maxOutputChars: MAX_OUTPUT_CHARS,
  buildPrompt,
  parseCompletion,
  sampleInput
});
