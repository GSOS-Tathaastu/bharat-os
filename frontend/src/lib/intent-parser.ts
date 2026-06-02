// Phase 12.1b.1 — On-device SLM intent parser.
//
// What this module is. Pure prompt template + completion parser for
// the citizen's raw `intentText`. Given a free-form line of Hindi /
// Marathi / Bhojpuri / Tamil / Bengali / English, `buildIntentParsePrompt`
// returns a prompt the wllama runtime (Phase 9.0c) can complete;
// `parseIntentCompletion` turns the SLM's free-form text back into
// a typed `IntentAnnotation` shape the backend's
// `src/phase0/intent-annotation.mjs` will accept.
//
// What this module is NOT. The wllama runtime. The Phase 9.0c
// adapter (`@/lib/slm-runtime`) handles weight loading + WASM init.
// This module only knows how to talk to it.
//
// §15 bindings:
//
//   • Prompt + completion stay on-device. The SLM runs in WASM in
//     the browser. The PARSED annotation is sent alongside the
//     orchestration POST only when the citizen confirms (the FE
//     surfaces a "we understood: …" chip first).
//   • Annotation is opt-in. If no SLM is installed, the chip is
//     hidden and the orchestration POST omits the annotation —
//     server-side deterministic vernacular substrate is the
//     source of truth either way.
//   • Annotation NEVER overrides server-side actionType. The server
//     compares both interpretations and emits an agreement-verdict
//     ledger event for audit, but the citizen's consent + routing
//     remain bound to the deterministic parse.

// Canonical action types — must match orchestrator.mjs taxonomy.
export const INTENT_ACTION_TYPES = [
  'service_booking',
  'scheme_delivery',
  'regulated_onboarding',
  'health_record_read',
  'labor_match_post',
  'mesh_storage',
  'trust_attestation',
  'daily_brief'
] as const;

export type IntentActionType = typeof INTENT_ACTION_TYPES[number];

export interface ParsedIntentEntity {
  type: string;
  value: string;
  confidence?: number;
}

export interface ParsedIntent {
  actionType: IntentActionType;
  confidence: number;
  detectedLanguage: string | null;
  entities: ParsedIntentEntity[];
  rationale: string | null;
}

const ACTION_GLOSS: Record<IntentActionType, string> = {
  service_booking: 'Book a Bharat OS marketplace service (cab, cook, maid, labour, kirana).',
  scheme_delivery: 'Help me access a government scheme I am eligible for.',
  regulated_onboarding: 'Complete a regulated onboarding flow (KYC / banking).',
  health_record_read: 'Read my ABHA health record summary.',
  labor_match_post: 'Post a labour request and match me with workers.',
  mesh_storage: 'Store this on my mesh node.',
  trust_attestation: 'Mint a selective-disclosure trust attestation about me.',
  daily_brief: 'Compose my on-device daily brief.'
};

// ─── Prompt builder ─────────────────────────────────────────────

/**
 * @param intentText The citizen's raw intent text.
 * @param profileFragment Phase 13.3 — optional preamble from the
 *   on-device personalization profile. Empty string or undefined
 *   keeps the prompt BYTE-EQUAL to the pre-13.3 baseline (vitest
 *   regression-pinned). When non-empty, the fragment is injected
 *   ABOVE the role line as a citizen-preferences preamble.
 */
export function buildIntentParsePrompt(intentText: string, profileFragment?: string): string {
  const trimmed = (intentText || '').replace(/\r\n/g, '\n').trim().slice(0, 600);
  const lines: string[] = [];
  if (profileFragment && profileFragment.length > 0) {
    lines.push(profileFragment);
    lines.push('');
  }
  lines.push('You are an intent classifier for Bharat OS, an India-first on-device assistant.');
  lines.push('The user speaks Hindi, Marathi, Bhojpuri, Tamil, Bengali, or English (often code-mixed).');
  lines.push('');
  lines.push('Classify the user\'s intent into EXACTLY ONE of the following action types:');
  for (const t of INTENT_ACTION_TYPES) {
    lines.push(`- ${t}: ${ACTION_GLOSS[t]}`);
  }
  lines.push('');
  lines.push('Reply in this format and NOTHING else:');
  lines.push('ACTION: <one of the action types above>');
  lines.push('LANGUAGE: <BCP-47 tag, e.g. hi-IN, mr-IN, bho-IN, ta-IN, bn-IN, en-IN>');
  lines.push('CONFIDENCE: <number 0.00 to 1.00>');
  lines.push('RATIONALE: <one short sentence in English, max 20 words>');
  lines.push('');
  lines.push('USER INTENT:');
  lines.push(trimmed);
  lines.push('');
  lines.push('YOUR ANSWER:');
  return lines.join('\n');
}

// ─── Completion parser ──────────────────────────────────────────

const ACTION_LINE_RE = /^\s*ACTION\s*[:=]\s*([A-Za-z][A-Za-z_\- ]*)/im;
const LANG_LINE_RE = /^\s*LANGUAGE\s*[:=]\s*([A-Za-z-]+)/im;
const CONFIDENCE_LINE_RE = /^\s*CONFIDENCE\s*[:=]\s*([\d.]+)/im;
const RATIONALE_LINE_RE = /^\s*RATIONALE\s*[:=]\s*(.+)$/im;

function clampConfidence(raw: string | undefined): number {
  if (!raw) return 0.5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return Math.min(1, n / 100);
  return n;
}

function asActionType(raw: string | undefined): IntentActionType | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (INTENT_ACTION_TYPES as readonly string[]).includes(norm)
    ? (norm as IntentActionType)
    : null;
}

function normaliseLanguage(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length > 16) return null;
  return t;
}

function normaliseRationale(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().slice(0, 280);
  return t || null;
}

/**
 * Parse a free-form SLM completion into a typed `ParsedIntent`.
 * Returns null when no usable action type could be extracted —
 * the caller should hide the chip and let the server-side
 * deterministic substrate parse from the raw intentText alone.
 */
export function parseIntentCompletion(completion: string): ParsedIntent | null {
  if (typeof completion !== 'string' || !completion.trim()) return null;
  const text = completion.replace(/\r\n/g, '\n');
  const actionMatch = ACTION_LINE_RE.exec(text);
  const actionType = asActionType(actionMatch?.[1]);
  if (!actionType) return null;
  const langMatch = LANG_LINE_RE.exec(text);
  const confMatch = CONFIDENCE_LINE_RE.exec(text);
  const rationaleMatch = RATIONALE_LINE_RE.exec(text);
  return {
    actionType,
    confidence: clampConfidence(confMatch?.[1]),
    detectedLanguage: normaliseLanguage(langMatch?.[1]),
    entities: [],
    rationale: normaliseRationale(rationaleMatch?.[1])
  };
}

// Friendly action label used in the "we understood:" chip.
export function actionTypeFriendlyLabel(actionType: IntentActionType): string {
  switch (actionType) {
    case 'service_booking': return 'Book a service';
    case 'scheme_delivery': return 'Government scheme';
    case 'regulated_onboarding': return 'KYC / onboarding';
    case 'health_record_read': return 'Health record read';
    case 'labor_match_post': return 'Find workers';
    case 'mesh_storage': return 'Mesh storage';
    case 'trust_attestation': return 'Trust attestation';
    case 'daily_brief': return 'Daily brief';
  }
}
