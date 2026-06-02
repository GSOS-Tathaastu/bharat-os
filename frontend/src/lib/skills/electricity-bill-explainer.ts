// Phase 13.4 — first SLM-H skill: Electricity bill explainer.
//
// Composes the Phase 13.0 doc-summariser output (TITLE / TLDR /
// bullets / docKind=electricity_bill) into a richer guidance chip:
// is the amount in the expected range for this household tier?
// What concrete next steps make sense?
//
// Designed as a thin wrapper around the shared skill-agent
// substrate. The prompt template lives here; the parser uses
// `parseSkillBaseFields` from `skill-agent.ts` for the shared
// HEADLINE / ASSESSMENT / CONFIDENCE / RISK_FLAG / ACTIONS prefix
// and layers TARIFF_TIER / DEVIATION_FLAG / EXPECTED_RANGE_RUPEES
// on top.
//
// §15 bindings: same as parent skill-agent.ts. The citizen's
// extracted bill text is fed in via DocSummariserPanel → bridge
// → SkillAgentPanel; the SLM-F redactor runs first.

import {
  type SkillDefinition,
  type SkillBaseFields,
  type SkillResult,
  parseSkillBaseFields,
  clipLine,
  SKILL_AGENT_PROTOCOL_VERSION
} from '../skill-agent';

export const ELECTRICITY_BILL_EXPLAINER_SKILL_ID =
  'bos:skill-agent-fe:electricity-bill-explainer.v1';

// Mirrors the BE seed's content-derived `skillId` semantics for
// FE-local identification only. The BE's content-hash skillId is
// what the catalog endpoint returns; this FE constant is the
// pointer the runner uses to label its result. Convergence test
// asserts they remain aligned through the catalog hook.

export const TARIFF_TIERS = ['domestic_low', 'domestic_mid', 'domestic_high', 'commercial', 'industrial', 'unknown'] as const;
export type TariffTier = (typeof TARIFF_TIERS)[number];
const TARIFF_TIER_SET = new Set<TariffTier>(TARIFF_TIERS);

export const DEVIATION_FLAGS = ['under_expected', 'on_track', 'over_expected', 'far_over_expected'] as const;
export type DeviationFlag = (typeof DEVIATION_FLAGS)[number];
const DEVIATION_FLAG_SET = new Set<DeviationFlag>(DEVIATION_FLAGS);

export interface ElectricityBillInput {
  /** The original parsed summary fields from SLM-E. */
  docSummaryTitle: string;
  docSummaryTldr: string;
  docSummaryBullets: readonly string[];
  /** Citizen-supplied tier hint (typically from a Settings field
   *  in a future phase; v1 always passes 'domestic_mid'). */
  tierHint?: TariffTier;
}

export interface ElectricityBillFields extends SkillBaseFields {
  tariffTier: TariffTier;
  deviationFlag: DeviationFlag;
  expectedRangeMinPaise: number;
  expectedRangeMaxPaise: number;
}

const MAX_INPUT_CHARS = 2400;
const MAX_OUTPUT_CHARS = 1200;

// Tariff-tier guidance bands. v1 uses published all-India ranges
// for domestic consumers (BSES / Mahadiscom / TNEB / KSEB
// comparable). These are PROMPT HINTS for the SLM — not
// adjudicative. Citizens see "expected range" as a SLM-reasoned
// number, not a hard-coded answer.
const TIER_GUIDANCE: Record<TariffTier, string> = {
  domestic_low: 'a low-consumption household (under 150 units/month). Expected bill range typically ₹400-₹1200.',
  domestic_mid: 'a mid-consumption household (150-400 units/month). Expected bill range typically ₹1200-₹3500.',
  domestic_high: 'a high-consumption household (over 400 units/month). Expected bill range typically ₹3500-₹9000.',
  commercial: 'a commercial connection. Expected range varies widely by load; flag anything above ₹15000 for review.',
  industrial: 'an industrial connection. Expected range varies by sanctioned load; flag for review.',
  unknown: 'an unknown tier — infer the tier from the units consumed if visible in the summary, otherwise default to domestic_mid.'
};

function normaliseInput(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, MAX_INPUT_CHARS);
}

function buildPrompt(input: ElectricityBillInput, profileFragment?: string): string {
  const tier = input.tierHint && TARIFF_TIER_SET.has(input.tierHint) ? input.tierHint : 'domestic_mid';
  const guidance = TIER_GUIDANCE[tier];
  const bulletsBlock = input.docSummaryBullets
    .slice(0, 8)
    .map((b, i) => `BULLET_${i + 1}: ${b}`)
    .join('\n');
  const body = normaliseInput([
    `TITLE: ${input.docSummaryTitle}`,
    `TLDR: ${input.docSummaryTldr}`,
    bulletsBlock
  ].join('\n'));
  const preamble: string[] = [];
  if (profileFragment && profileFragment.length > 0) {
    preamble.push(profileFragment);
    preamble.push('');
  }
  return [
    ...preamble,
    'You are an on-device electricity-bill explainer for an Indian citizen using Bharat OS. You are given the structured summary of their discom bill. Reply with a brief, plain-language assessment plus 2-5 concrete next-step verbs from the FIXED action vocabulary. Never invent numbers that are not in the summary.',
    '',
    `Citizen tier hint: ${tier} — ${guidance}`,
    '',
    'Reply in EXACTLY this format and NOTHING else:',
    '',
    'HEADLINE: <one-line plain-language headline, max 120 characters>',
    'ASSESSMENT: <one or two sentences on whether the amount looks normal for the tier and what stands out, max 240 characters>',
    'TARIFF_TIER: <one of: domestic_low, domestic_mid, domestic_high, commercial, industrial, unknown>',
    'EXPECTED_RANGE_MIN_RUPEES: <integer rupees, lower bound>',
    'EXPECTED_RANGE_MAX_RUPEES: <integer rupees, upper bound>',
    'DEVIATION_FLAG: <one of: under_expected, on_track, over_expected, far_over_expected>',
    'CONFIDENCE: <0.00 to 1.00>',
    'RISK_FLAG: <one of: none, attention, urgent>',
    'ACTIONS: <comma-separated, 1 to 5 of: file_dispute_consumer_forum, request_meter_recheck, switch_tariff_plan, pay_via_upi, check_subsidy_eligibility, compare_with_neighbours, archive_for_records, flag_for_review>',
    '',
    'DOCUMENT SUMMARY:',
    body,
    '',
    'YOUR ANSWER:'
  ].join('\n');
}

// ─── Parser ───────────────────────────────────────────────────────

const TARIFF_TIER_RE = /^\s*TARIFF_TIER\s*[:=]\s*([a-z_]+)/im;
const DEVIATION_FLAG_RE = /^\s*DEVIATION_FLAG\s*[:=]\s*([a-z_]+)/im;
const RANGE_MIN_RE = /^\s*EXPECTED_RANGE_MIN_RUPEES\s*[:=]\s*(-?\d+)/im;
const RANGE_MAX_RE = /^\s*EXPECTED_RANGE_MAX_RUPEES\s*[:=]\s*(-?\d+)/im;

function coerceTariffTier(raw: string | undefined): TariffTier {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase().trim();
  return TARIFF_TIER_SET.has(lower as TariffTier) ? (lower as TariffTier) : 'unknown';
}

function coerceDeviationFlag(raw: string | undefined): DeviationFlag {
  if (!raw) return 'on_track';
  const lower = raw.toLowerCase().trim();
  return DEVIATION_FLAG_SET.has(lower as DeviationFlag) ? (lower as DeviationFlag) : 'on_track';
}

function coerceRangePaise(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Cap at 100k rupees to prevent absurd SLM outputs. (Bill above
  // this is industrial-grade and out of scope for v1.)
  return Math.min(Math.round(n * 100), 10_000_000);
}

function parseCompletion(raw: string): SkillResult<ElectricityBillFields> | null {
  const base = parseSkillBaseFields(raw);
  if (!base) return null;
  const normalised = raw.replace(/\r\n/g, '\n');
  const tariffTier = coerceTariffTier(TARIFF_TIER_RE.exec(normalised)?.[1]);
  const deviationFlag = coerceDeviationFlag(DEVIATION_FLAG_RE.exec(normalised)?.[1]);
  const expectedRangeMinPaise = coerceRangePaise(RANGE_MIN_RE.exec(normalised)?.[1]);
  const expectedRangeMaxPaise = coerceRangePaise(RANGE_MAX_RE.exec(normalised)?.[1]);
  // If the min exceeds the max (SLM drift), swap so the chip
  // never renders a contradictory "₹2000-₹500" range.
  const [minP, maxP] = expectedRangeMinPaise <= expectedRangeMaxPaise
    ? [expectedRangeMinPaise, expectedRangeMaxPaise]
    : [expectedRangeMaxPaise, expectedRangeMinPaise];
  return {
    protocolVersion: SKILL_AGENT_PROTOCOL_VERSION,
    skillId: ELECTRICITY_BILL_EXPLAINER_SKILL_ID,
    fields: {
      ...base,
      headline: clipLine(base.headline, 120) ?? base.headline,
      tariffTier,
      deviationFlag,
      expectedRangeMinPaise: minP,
      expectedRangeMaxPaise: maxP
    }
  };
}

function sampleInput(): ElectricityBillInput {
  return {
    docSummaryTitle: 'Mahadiscom electricity bill — May 2026',
    docSummaryTldr: '₹2,956 due on 24 May 2026 — 308 units consumed.',
    docSummaryBullets: [
      'Amount due: ₹2,956',
      'Due date: 24 May 2026',
      'Units consumed: 308',
      'Consumer number: DEMO-7782'
    ],
    tierHint: 'domestic_mid'
  };
}

export const ELECTRICITY_BILL_EXPLAINER: SkillDefinition<ElectricityBillInput, ElectricityBillFields> = Object.freeze({
  skillId: ELECTRICITY_BILL_EXPLAINER_SKILL_ID,
  category: 'utility_bill_explainer',
  displayName: 'Electricity bill explainer',
  supportedDocKinds: Object.freeze(['electricity_bill']),
  maxInputChars: MAX_INPUT_CHARS,
  maxOutputChars: MAX_OUTPUT_CHARS,
  buildPrompt,
  parseCompletion,
  sampleInput
});
