// Phase 13.4.1 — second SLM-H skill: Consumer complaint drafter.
//
// Composes the citizen's free-form complaint description (plus an
// optional related document summary from SLM-E) into a structured
// complaint envelope that helps them file under the Consumer
// Protection Act 2019 (CPA 2019). The skill emits:
//
//   - DRAFT_SUBJECT (one-line subject for the formal complaint)
//   - FORUM_LEVEL  (district / state / national, per CPA 2019
//     jurisdictional tiers)
//   - RELIEF_KIND  (refund / replacement / service_redo /
//     compensation / apology / mixed)
//   - ESTIMATED_PROCESSING_DAYS (typical CPA 2019 timeline)
//   - KEY_FACTS    (3-5 facts the complaint should include)
//
// Composes the same `parseSkillBaseFields` substrate from
// `skill-agent.ts` for the shared HEADLINE / ASSESSMENT /
// CONFIDENCE / RISK_FLAG / ACTIONS prefix.
//
// §15 bindings: same as parent skill-agent.ts. The citizen's
// complaint text + optional doc summary text are fed in via the
// ConsumerComplaintPanel; everything runs on the shared wllama
// runtime, never fetch().

import {
  type SkillDefinition,
  type SkillBaseFields,
  type SkillResult,
  parseSkillBaseFields,
  clipLine,
  SKILL_AGENT_PROTOCOL_VERSION
} from '../skill-agent';

export const CONSUMER_COMPLAINT_DRAFTER_SKILL_ID =
  'bos:skill-agent-fe:consumer-complaint-drafter.v1';

// Consumer Protection Act 2019 jurisdictional tiers, by relief
// amount sought.
export const FORUM_LEVELS = ['district', 'state', 'national'] as const;
export type ForumLevel = (typeof FORUM_LEVELS)[number];
const FORUM_LEVEL_SET = new Set<ForumLevel>(FORUM_LEVELS);

// What the complainant wants. Tightly enumerated — drift coerces
// to `mixed` so a chip can render the safest interpretation.
export const RELIEF_KINDS = [
  'refund',
  'replacement',
  'service_redo',
  'compensation',
  'apology',
  'mixed'
] as const;
export type ReliefKind = (typeof RELIEF_KINDS)[number];
const RELIEF_KIND_SET = new Set<ReliefKind>(RELIEF_KINDS);

export interface ConsumerComplaintInput {
  /** Citizen-typed free-form complaint description. */
  complaintText: string;
  /** Optional: a recent SLM-E doc-summary title to use as context. */
  relatedDocTitle?: string;
  /** Optional: the doc-summary TLDR. */
  relatedDocTldr?: string;
}

export interface ConsumerComplaintFields extends SkillBaseFields {
  draftSubject: string;
  forumLevel: ForumLevel;
  reliefKind: ReliefKind;
  estimatedProcessingDays: number;
  keyFacts: readonly string[];
}

const MAX_INPUT_CHARS = 3000;
const MAX_OUTPUT_CHARS = 1600;
const MAX_DRAFT_SUBJECT_CHARS = 120;
const MAX_KEY_FACTS = 5;
const MIN_KEY_FACTS = 1;
const MAX_FACT_CHARS = 160;

// Reasonable bounds for the CPA 2019 timeline. Drift past 720
// days (2 years) caps. The Act itself says district commissions
// should decide within 90 days (3 months) for non-evidentiary
// matters; state + national often take longer.
const MAX_PROCESSING_DAYS = 720;
const MIN_PROCESSING_DAYS = 30;

function normaliseInput(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, MAX_INPUT_CHARS);
}

function buildPrompt(input: ConsumerComplaintInput, profileFragment?: string): string {
  const complaint = normaliseInput(input.complaintText);
  const docContextLines: string[] = [];
  if (input.relatedDocTitle) docContextLines.push(`RELATED_DOC_TITLE: ${input.relatedDocTitle}`);
  if (input.relatedDocTldr) docContextLines.push(`RELATED_DOC_TLDR: ${input.relatedDocTldr}`);
  // Phase 13.4.1 — build the prompt by pushing into a single array
  // and joining with '\n'. We deliberately DO NOT call
  // `.filter(Boolean)` because that would also strip the
  // intentional blank-line spacers between sections. (An earlier
  // draft used filter; removed when adversarial review caught it
  // collapsing the spacer between profileFragment and the role
  // line, and between the complaint body and YOUR ANSWER.)
  const parts: string[] = [];
  if (profileFragment && profileFragment.length > 0) {
    parts.push(profileFragment);
    parts.push('');
  }
  parts.push(
    'You are an on-device consumer-complaint drafter for an Indian citizen using Bharat OS. You are given the citizen\'s description of a grievance against a product or service provider. Draft a structured complaint outline under the Consumer Protection Act 2019. Be brief, factual, and never invent specific names, amounts, or dates that are not in the description. Forum routing under CPA 2019: District Commission for relief up to ₹50 lakh; State Commission for ₹50 lakh to ₹2 crore; National Commission above ₹2 crore.',
    '',
    'Reply in EXACTLY this format and NOTHING else:',
    '',
    'HEADLINE: <one-line plain-language headline of the grievance, max 120 characters>',
    'ASSESSMENT: <one or two sentences on whether this looks like a clear CPA 2019 complaint and what is missing for a strong filing, max 240 characters>',
    'DRAFT_SUBJECT: <subject line for the formal complaint, max 120 characters>',
    'FORUM_LEVEL: <one of: district, state, national>',
    'RELIEF_KIND: <one of: refund, replacement, service_redo, compensation, apology, mixed>',
    'ESTIMATED_PROCESSING_DAYS: <integer in days, typical CPA 2019 timeline at that forum>',
    'KEY_FACT_1: <a fact the complaint must include, max 160 characters>',
    'KEY_FACT_2: <another fact, max 160 characters>',
    'KEY_FACT_3: <another fact, max 160 characters>',
    'CONFIDENCE: <0.00 to 1.00>',
    'RISK_FLAG: <one of: none, attention, urgent>',
    'ACTIONS: <comma-separated, 1 to 5 of: file_complaint_district_commission, file_complaint_state_commission, file_complaint_national_commission, escalate_to_consumer_helpline, send_legal_notice, file_dispute_consumer_forum, archive_for_records, flag_for_review>',
    ''
  );
  if (docContextLines.length > 0) {
    parts.push(...docContextLines, '');
  }
  parts.push('COMPLAINT DESCRIPTION:', complaint, '', 'YOUR ANSWER:');
  return parts.join('\n');
}

// ─── Parser ───────────────────────────────────────────────────────

const DRAFT_SUBJECT_RE = /^\s*DRAFT_SUBJECT\s*[:=]\s*(.+)$/im;
const FORUM_LEVEL_RE = /^\s*FORUM_LEVEL\s*[:=]\s*([a-z_]+)/im;
const RELIEF_KIND_RE = /^\s*RELIEF_KIND\s*[:=]\s*([a-z_]+)/im;
const PROCESSING_DAYS_RE = /^\s*ESTIMATED_PROCESSING_DAYS\s*[:=]\s*(-?\d+)/im;
const KEY_FACT_RES = [
  /^\s*KEY_FACT_1\s*[:=]\s*(.+)$/im,
  /^\s*KEY_FACT_2\s*[:=]\s*(.+)$/im,
  /^\s*KEY_FACT_3\s*[:=]\s*(.+)$/im,
  /^\s*KEY_FACT_4\s*[:=]\s*(.+)$/im,
  /^\s*KEY_FACT_5\s*[:=]\s*(.+)$/im
];

function coerceForumLevel(raw: string | undefined): ForumLevel {
  if (!raw) return 'district';
  const lower = raw.toLowerCase().trim();
  return FORUM_LEVEL_SET.has(lower as ForumLevel) ? (lower as ForumLevel) : 'district';
}

function coerceReliefKind(raw: string | undefined): ReliefKind {
  if (!raw) return 'mixed';
  const lower = raw.toLowerCase().trim();
  return RELIEF_KIND_SET.has(lower as ReliefKind) ? (lower as ReliefKind) : 'mixed';
}

function coerceProcessingDays(raw: string | undefined): number {
  if (!raw) return 90;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return MIN_PROCESSING_DAYS;
  if (n < MIN_PROCESSING_DAYS) return MIN_PROCESSING_DAYS;
  if (n > MAX_PROCESSING_DAYS) return MAX_PROCESSING_DAYS;
  return Math.round(n);
}

function collectKeyFacts(normalised: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const re of KEY_FACT_RES) {
    const match = re.exec(normalised);
    const fact = clipLine(match?.[1], MAX_FACT_CHARS);
    if (!fact) continue;
    if (seen.has(fact)) continue;
    seen.add(fact);
    out.push(fact);
    if (out.length >= MAX_KEY_FACTS) break;
  }
  return out;
}

function parseCompletion(raw: string): SkillResult<ConsumerComplaintFields> | null {
  const base = parseSkillBaseFields(raw);
  if (!base) return null;
  const normalised = raw.replace(/\r\n/g, '\n');
  const draftSubject = clipLine(DRAFT_SUBJECT_RE.exec(normalised)?.[1], MAX_DRAFT_SUBJECT_CHARS);
  if (!draftSubject) return null;
  const keyFacts = collectKeyFacts(normalised);
  if (keyFacts.length < MIN_KEY_FACTS) return null;
  const forumLevel = coerceForumLevel(FORUM_LEVEL_RE.exec(normalised)?.[1]);
  const reliefKind = coerceReliefKind(RELIEF_KIND_RE.exec(normalised)?.[1]);
  const estimatedProcessingDays = coerceProcessingDays(
    PROCESSING_DAYS_RE.exec(normalised)?.[1]
  );
  return {
    protocolVersion: SKILL_AGENT_PROTOCOL_VERSION,
    skillId: CONSUMER_COMPLAINT_DRAFTER_SKILL_ID,
    fields: {
      ...base,
      draftSubject,
      forumLevel,
      reliefKind,
      estimatedProcessingDays,
      keyFacts: Object.freeze(keyFacts)
    }
  };
}

function sampleInput(): ConsumerComplaintInput {
  return {
    complaintText:
      'I bought a refrigerator from a major appliance retailer 4 months ago for ₹38,000. It stopped cooling after 6 weeks. The retailer has refused 3 service requests, citing "no fault found" without actually opening it. I have the original invoice and all service-request confirmation messages. I want a refund or a replacement.',
    relatedDocTitle: undefined,
    relatedDocTldr: undefined
  };
}

export const CONSUMER_COMPLAINT_DRAFTER: SkillDefinition<
  ConsumerComplaintInput,
  ConsumerComplaintFields
> = Object.freeze({
  skillId: CONSUMER_COMPLAINT_DRAFTER_SKILL_ID,
  category: 'consumer_complaint_drafter',
  displayName: 'Consumer complaint drafter',
  // Complaint applies to any doc kind (or none) — the skill accepts
  // free-form text. We use `generic` here so the registry strict-
  // allowlist accepts it and the FE catalog gating still works.
  supportedDocKinds: Object.freeze(['generic']),
  maxInputChars: MAX_INPUT_CHARS,
  maxOutputChars: MAX_OUTPUT_CHARS,
  buildPrompt,
  parseCompletion,
  sampleInput
});
