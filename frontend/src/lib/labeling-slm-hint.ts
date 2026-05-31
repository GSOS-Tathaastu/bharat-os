// Phase 10.6 — Labeling marketplace × on-device SLM pre-labeling hint.
//
// What this module is. Pure prompt template + completion parser per
// task kind. Given an item body and a task kind, `buildHintPrompt`
// returns a prompt the worker's installed SLM (Phi-3-mini via the
// Phase 9.0c runtime) can run; `parseHintCompletion` turns the SLM's
// free-form text back into a typed `labelValue` shape that matches
// what the worker would otherwise submit by hand.
//
// What this module is NOT. The SLM runtime itself. The Phase 9.0c
// adapter (`@/lib/slm-runtime`) handles weight loading + WASM init +
// token streaming. This module only knows how to talk to it.
//
// §15 bindings:
//
//   • Prompt + completion stay on-device. The SLM runtime runs in
//     WASM in the browser. Neither the prompt nor the suggested
//     label leaves the worker's device unless they tap [Use this
//     suggestion] to submit it — and even then, the label they
//     submit is the same shape they could have authored by hand.
//   • Suggestion is opt-in. The worker chooses whether to invoke
//     the SLM; if no SLM is installed, the badge is hidden.
//   • Suggestion is editable. The hint pre-fills the form; the
//     worker still has to accept (or edit). Server-side
//     validation runs exactly the same way regardless of whether
//     the label was hand-authored or SLM-suggested.
//   • No silent acceptance. We never auto-submit; the worker
//     always sees the suggestion before it lands.

import type { LabelingTaskKind } from './hooks';

// ─── Prompt builders ─────────────────────────────────────────────

interface ClassificationBody {
  prompt?: string;
  text: string;
  options: Array<{ value: string; label: string; description?: string }>;
}

interface PreferencePairBody {
  prompt?: string;
  a: string;
  b: string;
}

interface SpanAnnotationBody {
  text: string;
  instruction?: string;
  labelKind?: string;
}

interface TranscriptionBody {
  audioUrl?: string;
  languageHint?: string;
  asrPreFill?: string;
  instruction?: string;
}

interface SafetyLabelBody {
  prompt?: string;
  text: string;
  categories: Array<{ value: string; label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Build a task-kind-specific prompt for the worker's on-device SLM.
 * Returns null when the body shape doesn't match what the kind
 * expects — the caller should hide the suggestion UI rather than
 * pass a malformed prompt to the runtime.
 */
export function buildHintPrompt(taskKind: LabelingTaskKind, body: unknown): string | null {
  switch (taskKind) {
    case 'classification':
      return buildClassificationPrompt(body as ClassificationBody);
    case 'preference_pair':
      return buildPreferencePairPrompt(body as PreferencePairBody);
    case 'span_annotation':
      return buildSpanAnnotationPrompt(body as SpanAnnotationBody);
    case 'transcription':
      return buildTranscriptionPrompt(body as TranscriptionBody);
    case 'safety_label':
      return buildSafetyLabelPrompt(body as SafetyLabelBody);
    default:
      return null;
  }
}

function buildClassificationPrompt(body: ClassificationBody): string | null {
  if (!body?.text || !Array.isArray(body.options) || body.options.length === 0) return null;
  const optionList = body.options
    .map((opt) => `- ${opt.value}: ${opt.label}${opt.description ? ` (${opt.description})` : ''}`)
    .join('\n');
  const question = body.prompt ?? 'Pick the best category for the text.';
  return [
    'You are helping a human classify a short text snippet.',
    '',
    `Task: ${question}`,
    '',
    'Text:',
    body.text,
    '',
    'Options:',
    optionList,
    '',
    'Answer with the option value ONLY (no explanation). Answer:'
  ].join('\n');
}

function buildPreferencePairPrompt(body: PreferencePairBody): string | null {
  if (!body || typeof body.a !== 'string' || typeof body.b !== 'string') return null;
  const question = body.prompt ?? 'Which response is more helpful?';
  return [
    'You are helping a human compare two responses.',
    '',
    `Question: ${question}`,
    '',
    'Response A:',
    body.a,
    '',
    'Response B:',
    body.b,
    '',
    'Answer with "a" or "b" only. Answer:'
  ].join('\n');
}

function buildSpanAnnotationPrompt(body: SpanAnnotationBody): string | null {
  if (!body?.text || typeof body.text !== 'string') return null;
  const words = body.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const indexed = words.map((w, i) => `${i}: ${w}`).join('\n');
  const instruction = body.instruction ?? `Pick the words that are ${body.labelKind ?? 'relevant'}.`;
  return [
    'You are helping a human highlight specific words in a sentence.',
    '',
    `Task: ${instruction}`,
    '',
    'Words (with indices):',
    indexed,
    '',
    'Answer with the indices of the words you would highlight, comma-separated (e.g. "2, 3, 5"). If none, answer "none". Answer:'
  ].join('\n');
}

function buildTranscriptionPrompt(body: TranscriptionBody): string | null {
  // The SLM can refine the sponsor's ASR pre-fill but cannot
  // re-transcribe audio. If no pre-fill, no useful hint.
  if (!body?.asrPreFill || typeof body.asrPreFill !== 'string') return null;
  const language = body.languageHint ? ` (${body.languageHint})` : '';
  return [
    `You are helping a human clean up an automatic transcription${language}.`,
    '',
    'Raw transcript:',
    body.asrPreFill,
    '',
    'Rewrite this transcript fixing obvious errors. Keep the meaning. Reply with the corrected transcript ONLY. Transcript:'
  ].join('\n');
}

function buildSafetyLabelPrompt(body: SafetyLabelBody): string | null {
  if (!body?.text || !Array.isArray(body.categories) || body.categories.length === 0) return null;
  const cats = body.categories
    .map((c) => `- ${c.value}: ${c.label}${c.description ? ` (${c.description})` : ''}`)
    .join('\n');
  const question = body.prompt ?? 'Which safety categories apply to this text?';
  return [
    'You are helping a human flag potentially harmful content.',
    '',
    `Task: ${question}`,
    '',
    'Text:',
    body.text,
    '',
    'Categories:',
    cats,
    '',
    'Answer with the category values that apply, comma-separated (e.g. "harassment, threat"). If none apply, answer "safe". Answer:'
  ].join('\n');
}

// ─── Completion parsers ──────────────────────────────────────────

/**
 * Parse the SLM's free-form completion back into a typed labelValue
 * matching what the worker would otherwise submit by hand. Returns
 * null when parsing fails — the caller should fall back to letting
 * the worker label manually.
 */
export function parseHintCompletion(
  taskKind: LabelingTaskKind,
  body: unknown,
  completion: string
): unknown | null {
  const trimmed = String(completion ?? '').trim();
  if (!trimmed) return null;
  switch (taskKind) {
    case 'classification':
      return parseClassification(body as ClassificationBody, trimmed);
    case 'preference_pair':
      return parsePreferencePair(trimmed);
    case 'span_annotation':
      return parseSpanAnnotation(body as SpanAnnotationBody, trimmed);
    case 'transcription':
      return parseTranscription(trimmed);
    case 'safety_label':
      return parseSafetyLabel(body as SafetyLabelBody, trimmed);
    default:
      return null;
  }
}

// Find the first option whose value or label is mentioned in the
// completion. SLMs love to add extra words; we tolerate "the answer
// is business_loan" etc.
function parseClassification(body: ClassificationBody, completion: string): unknown | null {
  if (!Array.isArray(body?.options)) return null;
  const lower = completion.toLowerCase();
  for (const opt of body.options) {
    if (lower.includes(String(opt.value).toLowerCase())) {
      return { value: opt.value };
    }
  }
  for (const opt of body.options) {
    if (lower.includes(String(opt.label).toLowerCase())) {
      return { value: opt.value };
    }
  }
  return null;
}

function parsePreferencePair(completion: string): unknown | null {
  const m = completion.toLowerCase().match(/\b(a|b)\b/);
  if (!m) return null;
  return { choice: m[1] };
}

function parseSpanAnnotation(body: SpanAnnotationBody, completion: string): unknown | null {
  if (!body?.text) return null;
  const words = body.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const lower = completion.toLowerCase();
  if (lower.includes('none')) {
    return { wordIndices: [], labelKind: body.labelKind ?? 'span' };
  }
  const indices: number[] = [];
  // Pick up every plausible integer in the completion.
  for (const match of completion.matchAll(/\b(\d+)\b/g)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 0 && n < words.length && !indices.includes(n)) {
      indices.push(n);
    }
  }
  if (indices.length === 0) return null;
  indices.sort((a, b) => a - b);
  return { wordIndices: indices, labelKind: body.labelKind ?? 'span' };
}

function parseTranscription(completion: string): unknown | null {
  const cleaned = completion.replace(/^["']|["']$/g, '').trim();
  if (!cleaned) return null;
  return { transcript: cleaned };
}

function parseSafetyLabel(body: SafetyLabelBody, completion: string): unknown | null {
  if (!Array.isArray(body?.categories)) return null;
  const lower = completion.toLowerCase();
  if (lower.includes('safe') && !lower.match(/(harass|threat|self.?harm|abuse|hate)/)) {
    return { values: [] };
  }
  const picked: string[] = [];
  for (const cat of body.categories) {
    if (String(cat.value).toLowerCase() === 'safe') continue;
    if (
      lower.includes(String(cat.value).toLowerCase()) ||
      lower.includes(String(cat.label).toLowerCase())
    ) {
      picked.push(cat.value);
    }
  }
  if (picked.length === 0) return null;
  return { values: picked };
}

// Default max tokens to ask the SLM for. Small enough to keep
// generation fast (a couple of seconds on Phi-3-mini), large enough
// to cover the longest expected answer (a transcription).
export const HINT_MAX_TOKENS = 96;
export const HINT_TEMPERATURE = 0.3;
