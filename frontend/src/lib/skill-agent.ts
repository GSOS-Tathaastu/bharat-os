// Phase 13.4 — SLM-H on-device skill-agent primitives.
//
// A "skill agent" is a tightly-scoped on-device task agent that
// composes existing SLM substrates (SLM-A intent parser, SLM-E
// doc summariser, SLM-F PII redactor, SLM-G personalization) plus
// a skill-specific prompt template + structured-output parser to
// give an Indian citizen concrete, actionable guidance for a
// specific paperwork-class task.
//
// This module is the shared substrate. Each concrete skill ships
// as a sibling file under `frontend/src/lib/skills/<skill>.ts`
// and exports a `SkillDefinition<TInput, TFields>` plus a
// `parseCompletion` parser. The runner in
// `use-slm-skill-agent.ts` is skill-agnostic.
//
// §15 bindings:
//
//   • On-device only. The prompt + completion + parser all run in
//     this browser. The runtime is the Phase 9.0c wllama shared
//     singleton (Phase 13.0.0a) — NEVER through fetch().
//   • Pointer-not-payload. The BE skill-agent registry carries
//     skillId / category / capability pointers; the prompt body
//     itself ships in this FE bundle and never crosses the
//     network into a registry record.
//   • Strict allowlist enforcement. Parsed RISK_FLAG / actions
//     coerce to safe defaults when SLM drift produces off-list
//     values. Defence-in-depth.
//   • Honest hide. `parseSkillCompletion` returns null when
//     mandatory fields are missing so the panel hides the chip
//     instead of rendering a half-broken envelope (mirrors
//     SLM-E binding).
//   • PII never to SLM unredacted. Callers SHOULD route the input
//     through the Phase 13.1/13.2 SLM-F redactor first. The
//     runner doesn't enforce this — that's the caller's
//     responsibility — but the panel wiring does.

import { clipLine, clampConfidence } from './slm-parse-helpers';

export const SKILL_AGENT_PROTOCOL_VERSION = 'bos.phase13.skill-agent.v1';

// Mirrored from the BE — convergence test asserts set-equality
// against `src/phase1/skill-agent.mjs::SKILL_AGENT_CATEGORIES`.
export const SKILL_AGENT_CATEGORIES = Object.freeze([
  'utility_bill_explainer',
  'consumer_complaint_drafter',
  'government_scheme_status'
] as const);
export type SkillAgentCategory = (typeof SKILL_AGENT_CATEGORIES)[number];

export type RiskFlag = 'none' | 'attention' | 'urgent';
const RISK_FLAGS = new Set<RiskFlag>(['none', 'attention', 'urgent']);

// Allowlist of action verbs a skill agent may emit. Each verb maps
// to a deterministic citizen-facing label (see ACTION_LABEL below).
// Adding a verb is a cross-cutting change — bump it AND the parser
// AND every skill that emits it. The grep guard on the rendered
// chip rejects any verb not in this list.
export const SKILL_ACTION_VERBS = [
  'file_dispute_consumer_forum',
  'request_meter_recheck',
  'switch_tariff_plan',
  'pay_via_upi',
  'check_subsidy_eligibility',
  'compare_with_neighbours',
  'archive_for_records',
  'flag_for_review'
] as const;
export type SkillActionVerb = (typeof SKILL_ACTION_VERBS)[number];
const SKILL_ACTION_VERBS_SET = new Set<SkillActionVerb>(SKILL_ACTION_VERBS);

export const ACTION_LABEL: Record<SkillActionVerb, string> = {
  file_dispute_consumer_forum:
    'File a dispute with the consumer forum (consumerhelpline.gov.in)',
  request_meter_recheck: 'Request a meter recheck from your discom',
  switch_tariff_plan: 'Switch to a different tariff plan',
  pay_via_upi: 'Pay this bill via UPI',
  check_subsidy_eligibility: 'Check if you qualify for a subsidy',
  compare_with_neighbours:
    'Compare consumption with your neighbours / last year',
  archive_for_records: 'Archive for records (no action needed now)',
  flag_for_review: 'Flag for review by a Sahayak agent'
};

// Bounded caps on every count-only chip field. Mirrors the BE
// registry maxOutputChars (1200 for utility_bill_explainer); a
// misbehaving SLM can't bloat the chip output.
export const MAX_HEADLINE_CHARS = 120;
export const MAX_ASSESSMENT_CHARS = 240;
export const MAX_ACTIONS = 5;
export const MIN_ACTIONS = 1;

/**
 * A SkillDefinition describes ONE concrete skill: which category
 * it belongs to, which docKind(s) it consumes, the prompt template
 * builder, and the structured-output parser. The skill module
 * itself owns its prompt template; the runner is generic.
 */
export interface SkillDefinition<TInput, TFields> {
  readonly skillId: string;
  readonly category: SkillAgentCategory;
  readonly displayName: string;
  readonly supportedDocKinds: readonly string[];
  readonly maxInputChars: number;
  readonly maxOutputChars: number;
  buildPrompt(input: TInput, profileFragment?: string): string;
  parseCompletion(raw: string): SkillResult<TFields> | null;
  sampleInput(): TInput;
}

export interface SkillResult<TFields> {
  protocolVersion: typeof SKILL_AGENT_PROTOCOL_VERSION;
  skillId: string;
  fields: TFields;
}

// Shared base fields every skill emits (regardless of category).
// Concrete skills extend with category-specific fields.
export interface SkillBaseFields {
  headline: string;
  assessment: string;
  confidence: number;
  riskFlag: RiskFlag;
  actions: readonly SkillActionVerb[];
}

// ─── Shared parser helpers ────────────────────────────────────────
//
// Every skill emits at minimum HEADLINE / ASSESSMENT / CONFIDENCE /
// RISK_FLAG / ACTIONS. Sibling skill modules use these to parse
// their shared prefix, then layer their own ACTION_*-style fields
// on top.

const HEADLINE_RE = /^\s*HEADLINE\s*[:=]\s*(.+)$/im;
const ASSESSMENT_RE = /^\s*ASSESSMENT\s*[:=]\s*(.+)$/im;
const CONFIDENCE_RE = /^\s*CONFIDENCE\s*[:=]\s*(-?[\d.]+)/im;
const RISK_FLAG_RE = /^\s*RISK_FLAG\s*[:=]\s*([a-z_]+)/im;
const ACTIONS_RE = /^\s*ACTIONS\s*[:=]\s*(.+)$/im;

function coerceRiskFlag(raw: string | undefined): RiskFlag {
  if (!raw) return 'none';
  const lower = raw.toLowerCase().trim();
  return RISK_FLAGS.has(lower as RiskFlag) ? (lower as RiskFlag) : 'none';
}

function coerceActions(raw: string | undefined): SkillActionVerb[] {
  if (!raw) return [];
  // Allow comma or pipe separators; SLM drift produces both.
  const tokens = raw
    .split(/[,|]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  const out: SkillActionVerb[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (out.length >= MAX_ACTIONS) break;
    if (seen.has(token)) continue;
    if (SKILL_ACTION_VERBS_SET.has(token as SkillActionVerb)) {
      out.push(token as SkillActionVerb);
      seen.add(token);
    }
  }
  return out;
}

/**
 * Parse the SHARED prefix every skill emits. Returns null when
 * mandatory fields (HEADLINE + ACTIONS) are missing so the caller
 * can short-circuit before layering category-specific fields.
 *
 * Sibling skill modules call this first, then peel their own
 * category-specific lines off the same raw text.
 */
export function parseSkillBaseFields(text: string): SkillBaseFields | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalised = text.replace(/\r\n/g, '\n');
  const headline = clipLine(HEADLINE_RE.exec(normalised)?.[1], MAX_HEADLINE_CHARS);
  if (!headline) return null;
  const assessment = clipLine(ASSESSMENT_RE.exec(normalised)?.[1], MAX_ASSESSMENT_CHARS) ?? '';
  const confidence = clampConfidence(CONFIDENCE_RE.exec(normalised)?.[1]);
  const riskFlag = coerceRiskFlag(RISK_FLAG_RE.exec(normalised)?.[1]);
  const actions = coerceActions(ACTIONS_RE.exec(normalised)?.[1]);
  if (actions.length < MIN_ACTIONS) return null;
  return {
    headline,
    assessment,
    confidence,
    riskFlag,
    actions
  };
}

// Re-export so consumers can reach the shared coercers without
// importing slm-parse-helpers directly.
export { clipLine, clampConfidence };
