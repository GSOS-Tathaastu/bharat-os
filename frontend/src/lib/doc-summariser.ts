// Phase 13.0 — SLM-E on-device document summariser primitives.
//
// Pure prompt builder + completion parser + doc-kind taxonomy +
// bias-hint map + scrubbed sample fixtures. Given a pasted Indian-
// paperwork document (electricity bill / Form 16 / T&Cs /
// insurance policy / lender contract), returns a structured TITLE
// + TLDR + bullets + language + confidence + risk-flag envelope.
//
// §15 bindings:
//
//   • On-device only. The prompt + completion never leave the
//     browser — the consumer hook routes generation through the
//     Phase 9.0c wllama SlmRuntime, NEVER through fetch().
//   • Protocol version pinned. Bumping = new ADR. Vitest pins the
//     constant so prompt drift ships LOUD.
//   • Echo guardrail. The parser coerces the SLM's DOC_KIND back to
//     the expectedDocKind the caller supplied, so the chip stays
//     consistent even if the SLM hallucinates a different label.
//   • Allowlist enforcement. RISK_FLAG and LANGUAGE outputs that
//     don't match the substrate's allowlist are coerced to safe
//     defaults; defence-in-depth on the chip.
//   • Honest hide. parseDocSummaryCompletion returns null on
//     missing TITLE or TLDR so the panel hides the chip instead of
//     rendering a half-broken envelope.
//   • No PII in sample fixtures. Demo-persona conventions: PAN
//     ending 0000; consumer numbers prefixed DEMO-; policy numbers
//     prefixed POL-DEMO-. Vitest sanity-greps would reject real-
//     shaped PAN/Aadhaar in fixtures.

// Phase 13.1 — shared parser helpers extracted to slm-parse-helpers.
// Re-exported here so existing doc-summariser consumers (including
// the Phase 13.0 vitest pins) keep working unchanged.
import { clipLine, clampConfidence } from './slm-parse-helpers';
export { clipLine, clampConfidence };

export const DOC_SUMMARISER_PROTOCOL_VERSION = 'bos.phase13.doc-summariser.v1';

export type DocKind =
  | 'electricity_bill'
  | 'form_16'
  | 'tncs'
  | 'insurance'
  | 'lender_doc'
  | 'generic';

export const DOC_KINDS: readonly DocKind[] = Object.freeze([
  'electricity_bill',
  'form_16',
  'tncs',
  'insurance',
  'lender_doc',
  'generic'
]);

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  electricity_bill: 'Electricity bill',
  form_16: 'Form 16 (tax)',
  tncs: 'Terms & Conditions',
  insurance: 'Insurance policy',
  lender_doc: 'Lender contract',
  generic: 'Other document'
};

// Per-kind "pay attention to" hints injected into a single shared
// prompt template. Each hint biases the SLM toward the structured
// facts a citizen typically needs to extract from that doc class.
// SLM-F/G/H reuse this map shape via sibling DocKind variants.
export const DOC_KIND_BIAS_HINTS: Record<DocKind, string> = {
  electricity_bill:
    'the amount due in rupees; the due date; the consumer number; the units consumed; the billing period',
  form_16:
    'gross salary; TDS deducted; the employer name; the financial year; PAN last 4 digits ONLY (never the full PAN)',
  tncs:
    'cancellation policy; fees and penalties; auto-renewal terms; data sharing or third-party clauses',
  insurance:
    'premium amount; sum insured; policy number; renewal date; major exclusions or waiting periods',
  lender_doc:
    'interest rate (APR if shown); tenure in months; processing fee; prepayment penalty; default consequences',
  generic:
    'this may be an electricity bill, Form 16, terms & conditions, insurance policy, or lender contract — identify which and surface the most critical numbers (amount, dates, identifiers)'
};

// Input clamp — Phi-3-mini-4k has 2048 effective context here. 6000
// chars ≈ 1500 tokens for English; vernacular Devanagari is 2-3
// chars/token so input can run up to its limit. Helper text on the
// FE warns when input is truncated.
export const DOC_INPUT_CHAR_CAP = 6000;

const LANGUAGES = [
  'English',
  'Hindi',
  'Bengali',
  'Tamil',
  'Telugu',
  'Marathi',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Urdu',
  'Other'
] as const;

export type DocLanguage = (typeof LANGUAGES)[number];
const LANGUAGE_SET = new Set<string>(LANGUAGES);

export type RiskFlag = 'none' | 'attention' | 'urgent';
const RISK_FLAGS = new Set<string>(['none', 'attention', 'urgent']);

export interface DocSummaryFields {
  title: string;
  tldr: string;
  bullets: string[];
  language: DocLanguage;
  confidence: number;
  riskFlag: RiskFlag;
  docKind: DocKind;
}

export interface ParsedDocSummary {
  protocolVersion: typeof DOC_SUMMARISER_PROTOCOL_VERSION;
  fields: DocSummaryFields;
}

// CRLF normalise + clamp to cap. The prompt is line-oriented so a
// stray \r in the citizen's paste would otherwise pollute the
// parser's per-line regexes downstream.
function normaliseInput(text: string): string {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalised.length <= DOC_INPUT_CHAR_CAP) return normalised;
  return normalised.slice(0, DOC_INPUT_CHAR_CAP);
}

export function buildDocSummaryPrompt(docKind: DocKind, text: string): string {
  // Phase 13.0 adversarial fix SF-6 — DEV-only warn when an
  // integrator (eg future SLM-F/G/H) passes a docKind not in the
  // allowlist. Silent prod degradation to 'generic' was masking
  // bugs in calling code. Vite's client types aren't in tsconfig
  // for this package, so we touch import.meta dynamically.
  if (!DOC_KINDS.includes(docKind)) {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[doc-summariser] unknown docKind, coercing to generic:', docKind);
    }
  }
  const safeKind: DocKind = DOC_KINDS.includes(docKind) ? docKind : 'generic';
  const label = DOC_KIND_LABEL[safeKind];
  const hint = DOC_KIND_BIAS_HINTS[safeKind];
  const body = normaliseInput(text);
  return [
    'You are an on-device document summariser for Bharat OS. The citizen has pasted an Indian-paperwork document and needs a brief, plain-language summary they can act on. Be brief and factual. Never invent details that are not in the document.',
    '',
    `Document kind: ${label}`,
    `Pay particular attention to: ${hint}.`,
    '',
    'Reply in EXACTLY this format and NOTHING else:',
    '',
    'TITLE: <one-line label for the document, max 80 characters>',
    "TLDR: <one-sentence summary in the document's own language, max 140 characters>",
    'BULLET_1: <key fact 1, max 100 characters>',
    'BULLET_2: <key fact 2, max 100 characters>',
    'BULLET_3: <key fact 3, max 100 characters>',
    `LANGUAGE: <one of: ${LANGUAGES.join(', ')}>`,
    'CONFIDENCE: <0.00 to 1.00>',
    'RISK_FLAG: <one of: none, attention, urgent>',
    `DOC_KIND: <echo back: ${DOC_KINDS.join(' | ')}>`,
    '',
    'DOCUMENT:',
    body,
    '',
    'YOUR ANSWER:'
  ].join('\n');
}

// ─── Parser ──────────────────────────────────────────────────────

const TITLE_RE = /^\s*TITLE\s*[:=]\s*(.+)$/im;
const TLDR_RE = /^\s*TLDR\s*[:=]\s*(.+)$/im;
const BULLET_1_RE = /^\s*BULLET_1\s*[:=]\s*(.+)$/im;
const BULLET_2_RE = /^\s*BULLET_2\s*[:=]\s*(.+)$/im;
const BULLET_3_RE = /^\s*BULLET_3\s*[:=]\s*(.+)$/im;
const LANGUAGE_RE = /^\s*LANGUAGE\s*[:=]\s*(.+)$/im;
const CONFIDENCE_RE = /^\s*CONFIDENCE\s*[:=]\s*(-?[\d.]+)/im;
const RISK_FLAG_RE = /^\s*RISK_FLAG\s*[:=]\s*([a-z]+)/im;
const DOC_KIND_RE = /^\s*DOC_KIND\s*[:=]\s*([a-z_]+)/im;

function coerceLanguage(raw: string | undefined): DocLanguage {
  if (!raw) return 'Other';
  const trimmed = raw.trim().split(/\s/)[0];
  if (LANGUAGE_SET.has(trimmed)) return trimmed as DocLanguage;
  // Common SLM drift: "english" lowercase, "Hindi (Devanagari)".
  const titleCased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  if (LANGUAGE_SET.has(titleCased)) return titleCased as DocLanguage;
  return 'Other';
}

function coerceRiskFlag(raw: string | undefined): RiskFlag {
  if (!raw) return 'none';
  const lower = raw.toLowerCase().trim();
  return RISK_FLAGS.has(lower) ? (lower as RiskFlag) : 'none';
}

function coerceDocKind(_raw: string | undefined, expected: DocKind): DocKind {
  // Echo guardrail — the citizen's pill choice is the chip's source
  // of truth. The SLM's echoed DOC_KIND is read but always coerced
  // back to expected so the chip never disagrees with the picker.
  // SLM hallucinating a different kind would otherwise produce a
  // confusing label mismatch on screen.
  return expected;
}

export function parseDocSummaryCompletion(
  text: string,
  expectedDocKind: DocKind
): ParsedDocSummary | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalised = text.replace(/\r\n/g, '\n');

  const title = clipLine(TITLE_RE.exec(normalised)?.[1], 80);
  if (!title) return null;
  const tldr = clipLine(TLDR_RE.exec(normalised)?.[1], 140);
  if (!tldr) return null;

  const bullets: string[] = [];
  for (const re of [BULLET_1_RE, BULLET_2_RE, BULLET_3_RE]) {
    const bullet = clipLine(re.exec(normalised)?.[1], 100);
    if (bullet) bullets.push(bullet);
  }

  return {
    protocolVersion: DOC_SUMMARISER_PROTOCOL_VERSION,
    fields: {
      title,
      tldr,
      bullets,
      language: coerceLanguage(LANGUAGE_RE.exec(normalised)?.[1]),
      confidence: clampConfidence(CONFIDENCE_RE.exec(normalised)?.[1]),
      riskFlag: coerceRiskFlag(RISK_FLAG_RE.exec(normalised)?.[1]),
      docKind: coerceDocKind(DOC_KIND_RE.exec(normalised)?.[1], expectedDocKind)
    }
  };
}

// ─── Sample fixtures (scrubbed; demo-persona PII only) ──────────
//
// Each fixture is a small (~250-400 word) realistic-shaped excerpt
// the founder can demo on stage. Sanity-tested in vitest: no real
// 10-char PAN, no 12-digit Aadhaar, no real bank account format.

export const SAMPLE_FIXTURES: Record<DocKind, string> = {
  electricity_bill: [
    'MAHARASHTRA STATE ELECTRICITY DISTRIBUTION COMPANY LIMITED',
    'Consumer Number: DEMO-7782-9145-2',
    'Service Connection: Domestic LT-I',
    'Billing Period: 01-Apr-2026 to 30-Apr-2026',
    'Previous Reading: 14,820 units    Current Reading: 15,128 units',
    'Units Consumed: 308 units',
    '',
    'Energy charges: Rs. 2,184.50',
    'Wheeling charges: Rs. 412.00',
    'Fuel adjustment: Rs. 98.20',
    'Electricity duty: Rs. 261.30',
    'Total amount due: Rs. 2,956.00',
    'Due date: 24-May-2026',
    'Late payment surcharge after due date: 2% per month',
    '',
    'Pay online at mahadiscom.in or at any authorised collection centre.',
    'Avoid queues — use the Mahavitaran app.'
  ].join('\n'),

  form_16: [
    'FORM NO. 16 — Certificate under section 203 of the Income-tax Act',
    'Financial Year: 2025-26   Assessment Year: 2026-27',
    '',
    'Name of the Employer: Bharat OS Demo Pvt Ltd',
    'PAN of the Employer: AAACX0000Q',
    'Name of the Employee: Citizen Demo',
    'PAN of the Employee: ABCDX0000Z (last 4: 000Z)',
    '',
    'Period of Employment: 01-Apr-2025 to 31-Mar-2026',
    'Gross Salary: Rs. 12,40,000',
    '  Basic: Rs. 6,00,000',
    '  HRA: Rs. 2,40,000',
    '  Special allowance: Rs. 4,00,000',
    'Less: Allowances exempt under section 10 — Rs. 1,20,000',
    'Less: Standard deduction — Rs. 50,000',
    'Less: 80C — Rs. 1,50,000',
    'Taxable income: Rs. 9,20,000',
    'Tax payable: Rs. 96,200',
    'TDS deducted (and deposited): Rs. 96,200',
    '',
    'Acknowledgement number: DEMO-AK-2026-0042',
    'Date of issue: 15-May-2026'
  ].join('\n'),

  tncs: [
    'TERMS & CONDITIONS — DEMO ELECTRONICS PROTECTION PLAN',
    '',
    '1. SUBSCRIPTION. Your protection plan starts on the activation date and',
    'auto-renews each year unless cancelled at least 15 days before renewal.',
    '',
    '2. FEES. The annual fee is Rs. 1,499 and is debited to your saved',
    'payment method on the renewal date. Failed payments incur a Rs. 199',
    'recovery fee per attempt (max 3 attempts).',
    '',
    '3. CANCELLATION. You may cancel any time via the app or by writing to',
    'support@demo-electronics.example. Refunds are pro-rated minus a Rs. 299',
    'administrative fee. No refund after 11 months of use in any year.',
    '',
    '4. CLAIMS. Up to 3 claims per year. Each claim attracts a deductible',
    'of Rs. 500 for screen damage and Rs. 1,000 for liquid damage. Theft',
    'claims require a police FIR within 24 hours.',
    '',
    '5. DATA SHARING. We may share device-health telemetry with our',
    'underwriter and authorised repair partners. We do NOT sell your data',
    'to third-party advertisers.',
    '',
    '6. DISPUTE RESOLUTION. Any dispute is governed by the laws of India',
    'and subject to the exclusive jurisdiction of Mumbai courts.'
  ].join('\n'),

  insurance: [
    'POLICY SCHEDULE — DEMO HEALTH INSURANCE',
    'Policy Number: POL-DEMO-2026-7745',
    'Policyholder: Citizen Demo',
    'Plan: Family Floater 5L',
    '',
    'Premium: Rs. 14,820 per year (incl. GST)',
    'Sum Insured: Rs. 5,00,000',
    'Policy Period: 01-Jun-2026 to 31-May-2027',
    'Lives Covered: 4 (self, spouse, 2 children)',
    '',
    'WAITING PERIODS:',
    '  Initial waiting: 30 days from inception (accidents excluded)',
    '  Pre-existing diseases: 36 months',
    '  Specific illnesses (cataract, hernia, knee replacement): 24 months',
    '',
    'MAJOR EXCLUSIONS:',
    '  Cosmetic surgery, fertility treatment, self-inflicted injury,',
    '  any condition arising from war or nuclear contamination, dental',
    '  treatment except as outpatient after an accident.',
    '',
    'RENEWAL: Lifelong renewability subject to ongoing premium payment.',
    'A 30-day grace period applies after the policy end date.',
    '',
    'CLAIMS: Cashless at 5,200+ network hospitals. Reimbursement claims',
    'to be filed within 30 days of discharge.'
  ].join('\n'),

  lender_doc: [
    'PERSONAL LOAN AGREEMENT — DEMO FINANCE LTD',
    '',
    'Loan amount sanctioned: Rs. 3,00,000',
    'Tenure: 36 months',
    'Interest rate: 18.00% per annum (reducing balance)',
    'Equated Monthly Instalment (EMI): Rs. 10,847',
    'First EMI due: 05-Jul-2026',
    '',
    'Processing fee: 2.5% of loan amount + 18% GST (Rs. 8,850 net debited',
    'from disbursal). Documentation charges: Rs. 999.',
    '',
    'PREPAYMENT: Allowed after 6 EMIs. Prepayment penalty is 3% of the',
    'outstanding principal if paid before 18 months from disbursal,',
    '2% if paid between 18-30 months, and nil thereafter.',
    '',
    'DEFAULT: Failure to pay any EMI by its due date attracts a late',
    'payment charge of Rs. 600 + 24% per annum on the overdue amount.',
    'Three consecutive defaults will be reported to all credit bureaus',
    'and may trigger acceleration of the entire outstanding amount.',
    '',
    'SECURITY: This is an unsecured loan; no collateral is offered.',
    'The borrower is personally liable for the full outstanding amount.',
    '',
    'GOVERNING LAW: Indian Contract Act, 1872 + RBI Master Directions',
    'for NBFCs. Jurisdiction: Delhi courts.'
  ].join('\n'),

  generic: [
    'BHARAT OS DEMO DOCUMENT — GENERIC SAMPLE',
    '',
    'This is a placeholder sample so the panel demonstrates the on-device',
    'summariser even when the citizen has not chosen a specific document',
    'kind. The summariser is asked to identify the document class and',
    'surface the most critical numbers, dates, and identifiers.',
    '',
    'Reference number: DEMO-GEN-2026-0001',
    'Issued on: 01-Jun-2026',
    'Amount mentioned: Rs. 4,200',
    'Action required by: 30-Jun-2026'
  ].join('\n')
};
