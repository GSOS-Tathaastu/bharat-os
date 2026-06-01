// Phase 13.1 — SLM-F on-device PII redactor (prompt + parser).
//
// Pure prompt builder + completion parser + bias-hint map + sample
// fixtures for the SLM second pass that augments the deterministic
// regex pass in `pii-detectors.ts`.
//
// Architecture: regex-primary + SLM-secondary.
//   - `pii-detectors.ts::scanWithRegex` runs synchronously the moment
//     the chip is tapped. Hits render IMMEDIATELY in the badge count
//     even with no SLM installed — honours the Phase 9.0b lazy-load
//     contract.
//   - This module is the SLM augmentation: it prompts the on-device
//     model to surface context-only PII the regex layer can't catch
//     deterministically (eg "my licence is MH1420130012345" where the
//     regex would have caught it as DL anyway, OR softer signals like
//     "I bank with HDFC", which the regex can't formalise).
//   - The merge step lives in `use-slm-pii-redactor.ts`. Regex wins
//     on overlap. SLM spans are dropped when text.slice(start, end)
//     does NOT equal raw (anti-hallucination guard).
//
// §15 bindings:
//   - On-device only. The prompt + completion never leave the
//     browser; route generation through the SlmRuntime contract.
//   - Echo guardrail. Parser drops any span where the SLM-reported
//     offsets don't reconstruct the same substring it claimed.
//   - Allowlist enforcement on PiiKind; non-allowlist → dropped.
//   - Protocol version pinned; vitest pins the constant.
//   - Honest fixtures: demo-persona PII only (PAN ending 0000Z,
//     mobile 9000000000 family, GSTIN demo state code 27, etc.).

import { clipLine, clampConfidence } from './slm-parse-helpers';
import { PII_KINDS, type PiiKind } from './pii-detectors';

export const PII_REDACTOR_PROTOCOL_VERSION = 'bos.phase13.pii-redactor.v1';

export const PII_INPUT_CHAR_CAP = 6000;
export const PII_MAX_SPANS = 32;

export interface SlmSpan {
  kind: PiiKind;
  start: number;
  end: number;
  raw: string;
  confidence: number;
  source: 'slm';
}

export interface ParsedPiiScan {
  protocolVersion: typeof PII_REDACTOR_PROTOCOL_VERSION;
  spans: SlmSpan[];
}

// Per-kind hint the SLM is asked to focus on. Demo conventions only
// — never a real PAN / Aadhaar in the prompt template.
const PII_KIND_BIAS_HINTS: Record<PiiKind, string> = {
  pan: 'Indian PAN — 5 letters + 4 digits + 1 letter (eg demo ABCDX0000Z)',
  aadhaar: 'Aadhaar — 12 digits, sometimes spaced 4-4-4 (eg demo 9999 9999 9999)',
  mobile: 'Indian mobile — 10 digits starting 6-9, optional +91 (eg demo 9000000000)',
  gstin: 'GSTIN — 15 chars, 2-digit state + 10-char PAN + 1 + Z + check',
  account: 'Bank account — 10-16 digits, usually preceded by a/c or account',
  dl: 'Driving Licence — state-prefixed alphanumeric (eg MH1420130012345)',
  rc: 'Vehicle registration — state + RTO + alpha + 4-digit serial',
  abha: 'ABHA / Health ID — 14 digits, distinct from 12-digit Aadhaar',
  upi: 'UPI VPA — user@bank handle',
  email: 'Email address — RFC-5322 subset',
  pin: 'Indian PIN code — 6 digits, not starting with 0'
};

/**
 * Build the SLM-F PII scan prompt for `text`. `focusKinds` biases
 * the model toward the kinds the regex layer didn't surface; pass
 * the full PII_KINDS list to ask for everything.
 */
export function buildPiiScanPrompt(
  text: string,
  focusKinds: ReadonlyArray<PiiKind> = PII_KINDS
): string {
  // Defensive: filter out any unknown kind a future caller might
  // pass (SLM-G/H wiring). DEV-warn on the unknown so integrators
  // notice during dev; prod stays silent.
  const safeFocus = focusKinds.filter((k): k is PiiKind => PII_KINDS.includes(k));
  for (const k of focusKinds) {
    if (!PII_KINDS.includes(k)) {
      const meta = import.meta as unknown as { env?: { DEV?: boolean } };
      if (meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[pii-redactor] unknown PiiKind in focusKinds, ignoring:', k);
      }
    }
  }
  const body =
    text.length <= PII_INPUT_CHAR_CAP
      ? text
      : text.slice(0, PII_INPUT_CHAR_CAP);
  const focusList = safeFocus.join(', ');
  const biasBlock = safeFocus
    .map((k) => `- ${k}: ${PII_KIND_BIAS_HINTS[k]}`)
    .join('\n');
  return [
    'You are a privacy assistant running fully on-device for Bharat OS. Identify Indian PII spans in the user text below. Be brief and factual. Never invent details that are not in the text.',
    '',
    `Focus on these kinds: ${focusList}.`,
    '',
    biasBlock,
    '',
    'Output ONE line per span in EXACTLY this format and NOTHING else:',
    'KIND: <one of: ' + PII_KINDS.join(' | ') + '>',
    'ORIGINAL: <the exact substring from the text, no quotes>',
    'START: <character offset where ORIGINAL begins, 0-indexed>',
    'END: <character offset where ORIGINAL ends, exclusive>',
    'CONFIDENCE: <0.00 to 1.00>',
    '',
    'If no PII is found, output exactly NONE_FOUND on a single line.',
    'Do NOT include explanations. Do NOT echo the user text. Do NOT invent spans not present in the text.',
    '',
    'USER_TEXT:',
    '```',
    body,
    '```',
    '',
    'YOUR ANSWER:'
  ].join('\n');
}

// ─── Parser ──────────────────────────────────────────────────────

const KIND_LINE_RE = /^\s*KIND\s*[:=]\s*([a-z_]+)/i;
const ORIGINAL_LINE_RE = /^\s*ORIGINAL\s*[:=]\s*(.+)$/i;
const START_LINE_RE = /^\s*START\s*[:=]\s*(-?[0-9]+)/i;
const END_LINE_RE = /^\s*END\s*[:=]\s*(-?[0-9]+)/i;
const CONFIDENCE_LINE_RE = /^\s*CONFIDENCE\s*[:=]\s*(-?[\d.]+)/i;

const NONE_FOUND_RE = /^\s*NONE_FOUND\s*$/im;

function isAllowedKind(s: string | undefined): s is PiiKind {
  return !!s && (PII_KINDS as readonly string[]).includes(s);
}

interface ParseLineCtx {
  text: string;
  textLen: number;
  seenKeys: Set<string>;
  spans: SlmSpan[];
}

interface PendingSpan {
  kind?: string;
  original?: string;
  start?: number;
  end?: number;
  confidence?: number;
}

function commitSpan(pending: PendingSpan, ctx: ParseLineCtx): void {
  const { kind, original, start, end, confidence } = pending;
  if (!isAllowedKind(kind)) return;
  if (!original) return;
  if (typeof start !== 'number' || typeof end !== 'number') return;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  if (start < 0 || end > ctx.textLen || end <= start) return;
  // Anti-hallucination guard: SLM's claimed offsets must
  // reconstruct exactly the substring it claims.
  if (ctx.text.slice(start, end) !== original) return;
  // Per-span dedup (some models repeat themselves).
  const key = `${kind}:${start}:${end}`;
  if (ctx.seenKeys.has(key)) return;
  ctx.seenKeys.add(key);
  ctx.spans.push({
    kind: kind as PiiKind,
    start,
    end,
    raw: original,
    confidence: clampConfidence(String(confidence ?? '')),
    source: 'slm'
  });
}

/**
 * Parse a completion produced by `buildPiiScanPrompt`. Returns a
 * `ParsedPiiScan` envelope. The spans array is empty when the
 * model reported NONE_FOUND, when all reported spans failed the
 * anti-hallucination guard, or when the completion is empty.
 *
 * Bookended by:
 *   - PII_REDACTOR_PROTOCOL_VERSION stamped on every envelope.
 *   - At most `PII_MAX_SPANS` spans returned (defence-in-depth on
 *     a runaway model).
 */
export function parsePiiScanCompletion(
  completion: string,
  text: string
): ParsedPiiScan {
  if (typeof completion !== 'string' || typeof text !== 'string') {
    return { protocolVersion: PII_REDACTOR_PROTOCOL_VERSION, spans: [] };
  }
  const normalised = completion.replace(/\r\n/g, '\n').trim();
  if (!normalised) {
    return { protocolVersion: PII_REDACTOR_PROTOCOL_VERSION, spans: [] };
  }
  if (NONE_FOUND_RE.test(normalised)) {
    return { protocolVersion: PII_REDACTOR_PROTOCOL_VERSION, spans: [] };
  }

  const ctx: ParseLineCtx = {
    text,
    textLen: text.length,
    seenKeys: new Set(),
    spans: []
  };
  let pending: PendingSpan = {};
  const lines = normalised.split('\n');
  for (const rawLine of lines) {
    if (ctx.spans.length >= PII_MAX_SPANS) break;
    const line = rawLine.trim();
    if (!line) {
      // Blank line — commit current pending and reset.
      if (pending.kind || pending.original) commitSpan(pending, ctx);
      pending = {};
      continue;
    }
    const kindMatch = KIND_LINE_RE.exec(line);
    if (kindMatch) {
      // Starting a new span — commit any pending first.
      if (pending.kind || pending.original) {
        commitSpan(pending, ctx);
        pending = {};
      }
      pending.kind = kindMatch[1].toLowerCase();
      continue;
    }
    const originalMatch = ORIGINAL_LINE_RE.exec(line);
    if (originalMatch) {
      pending.original = clipLine(originalMatch[1], 240) ?? undefined;
      continue;
    }
    const startMatch = START_LINE_RE.exec(line);
    if (startMatch) {
      pending.start = Number(startMatch[1]);
      continue;
    }
    const endMatch = END_LINE_RE.exec(line);
    if (endMatch) {
      pending.end = Number(endMatch[1]);
      continue;
    }
    const confMatch = CONFIDENCE_LINE_RE.exec(line);
    if (confMatch) {
      pending.confidence = Number(confMatch[1]);
      continue;
    }
    // Unknown line — ignore.
  }
  // Flush trailing pending span.
  if (pending.kind || pending.original) commitSpan(pending, ctx);

  return {
    protocolVersion: PII_REDACTOR_PROTOCOL_VERSION,
    spans: ctx.spans
  };
}

// ─── Sample fixtures (demo-persona PII only) ────────────────────
//
// Used in tests + the chip's "Try sample" demo. Conform to the
// same hygiene rule as doc-summariser: vitest sanity-greps
// reject real-shaped PAN / Aadhaar / mobile that isn't in the
// demo-persona family.

export const SAMPLE_FIXTURES = Object.freeze({
  shopping: [
    "Hi! I'd like to order 2 kg of basmati rice. My UPI is alice@demo-bank,",
    "and my phone is 9000000000. If you need PAN it's ABCDX0000Z. Deliver to",
    "PIN 411014.",
  ].join('\n'),
  loan_intent: [
    'I want to apply for a personal loan of 3 lakh. My Aadhaar is 9999 9999 9999.',
    'PAN: PQRSY0000Z. Bank account 1234567890123 with a/c at HDFC. Mobile 8000000000.'
  ].join('\n'),
  health_check: [
    'Booking a health checkup. My ABHA ID is 12345678901234. Mobile 7000000000.',
    'Email demo@example.com. PIN 560001.'
  ].join('\n'),
  shop_kyc: [
    'Onboarding my kirana shop. Shop GSTIN 27ABCDE1234F1Z5, owner PAN ABCDX0000Z.',
    'WhatsApp 9000000000. Pickup PIN 110001.'
  ].join('\n')
});

export type PiiFixtureKey = keyof typeof SAMPLE_FIXTURES;
