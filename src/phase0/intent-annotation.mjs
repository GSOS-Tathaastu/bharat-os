// Phase 12.1b.1 — On-device SLM intent annotation envelope.
//
// What this module is.
//
//   The FE pre-parses the citizen's raw `intentText` on-device via
//   wllama (Phase 9.0c runtime) and submits a structured annotation
//   alongside the intent. The annotation is OPT-IN: when the citizen
//   has an SLM installed AND consents to parsing, the FE sends it.
//   When the SLM isn't installed, the FE simply omits the annotation
//   and the server-side deterministic vernacular substrate
//   (src/phase1/vernacular.mjs) does the parse as it always has.
//
// What this module is NOT.
//
//   The annotation does NOT override the server-side actionType.
//   The server's deterministic parse remains the source of truth
//   for routing, consent scoping, and audit. The annotation is
//   recorded for transparency + audit comparison so the user can
//   see what their on-device SLM thought vs. what the substrate
//   actually routed to.
//
// §15 bindings:
//
//   • User controls their intent interpretation. The SLM is a
//     confidence signal, NEVER an override.
//   • The annotation never carries raw audio, raw video, or any
//     payload beyond what the citizen already typed.
//   • Annotation fields are validated + clipped at the boundary
//     so a misbehaving FE cannot pollute the ledger with arbitrary
//     blobs.

export const INTENT_ANNOTATION_PROTOCOL_VERSION = 'bos.phase12.intent-annotation.v0';

// Phase 13.2 — optional PII-redaction sub-envelope.
//
// The FE runs the Phase 13.1 SLM-F PII redactor over the intent
// text BEFORE handleSend runs. When PII was detected and the
// citizen Apply'd a mask, the FE may submit a COUNT-ONLY meta
// envelope so the ledger can later prove "the citizen scanned
// their intent before sending" without ever recording the spans
// or original values.
//
// §15 bindings:
//   • POINTER, NOT PAYLOAD. We accept ONLY counts + the PiiKind
//     allowlist + an applied-at ISO timestamp + a source tag.
//     Raw spans (start/end/raw/masked) are REJECTED at the
//     boundary if a misbehaving FE tries to slip them through.
//   • Count caps: detectedCount + maskedCount in [0, 64]; kinds
//     in [0, 11] entries from the allowlist. Bounds prevent
//     ledger bloat.
//   • The envelope is OPTIONAL. Older FE clients that don't ship
//     it stay valid (server falls back to a verdict-only ledger
//     row).
//   • The kinds array is sorted + deduplicated by the normaliser
//     so the ledger is stable across equivalent submissions.

// Action types must match the orchestrator's canonical taxonomy.
// We import them indirectly — the server-side validator only needs
// to reject empty strings; the agreement comparison happens after
// the deterministic parse runs.
const MAX_ACTION_TYPE_LEN = 64;
const MAX_LANG_LEN = 16;
const MAX_RATIONALE_LEN = 280;
const MAX_ENTITIES = 16;
const MAX_ENTITY_TYPE_LEN = 32;
const MAX_ENTITY_VALUE_LEN = 120;
const MAX_MODEL_ID_LEN = 128;

// Phase 13.2 — PII-redaction count caps + allowlist. The FE
// allowlist (`frontend/src/lib/pii-detectors.ts::PII_KINDS`) is the
// source of truth; this server-side list must match it 1:1. The
// FE↔BE convergence test in the Phase 13.1 deferred-D3 ticket lands
// here as the parity gate.
const MAX_PII_COUNT = 64;
export const PII_KIND_ALLOWLIST = Object.freeze([
  'pan',
  'aadhaar',
  'mobile',
  'gstin',
  'account',
  'dl',
  'rc',
  'abha',
  'upi',
  'email',
  'pin'
]);
const PII_SOURCE_ALLOWLIST = Object.freeze(['regex', 'regex+slm']);
// Phase 13.2 adversarial fix MF-3 — flip the leak-defence model
// from forbidden-key DENYLIST to strict ALLOWLIST. Denylists are
// brittle (any future synonym ships a leak); allowlists make every
// byte at the boundary justified or rejected. §15 binding.
const PII_ALLOWED_KEYS = Object.freeze([
  'detectedCount',
  'maskedCount',
  'kinds',
  'source',
  'appliedAt'
]);
// Phase 13.2 adversarial fix MF-3 — appliedAt is now strictly an
// ISO-8601 UTC instant at second precision. Earlier 40-char wildcard
// was a covert side-channel + timing fingerprint. Caller's
// millisecond precision is dropped to neutralise the fingerprint.
const PII_APPLIED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertConfidence(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`${label} must be a finite number in [0, 1].`);
  }
  return n;
}

function normaliseRationale(raw, max = MAX_RATIONALE_LEN) {
  if (raw == null) return null;
  const s = String(raw).replace(/\r\n/g, '\n').replace(/^﻿/, '').slice(0, max).trim();
  return s || null;
}

function assertNonNegativeIntInRange(value, label, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`${label} must be an integer in [0, ${max}].`);
  }
  return n;
}

// Phase 13.2 — strict count-only PII redaction sub-envelope
// normaliser. Returns the validated envelope OR null when the
// caller didn't provide one. Throws on any payload shape that
// looks like a PII leak (raw values, spans, redacted text, etc.).
function normalisePiiRedaction(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('intentAnnotation.piiRedaction must be an object.');
  }
  // Phase 13.2 adversarial fix MF-3 — strict allowlist. Any key
  // not in PII_ALLOWED_KEYS is rejected (no defensive denylist
  // gap, no covert channel via novel field names).
  for (const key of Object.keys(raw)) {
    if (!PII_ALLOWED_KEYS.includes(key)) {
      throw new Error(
        `intentAnnotation.piiRedaction.${key} is not a permitted field; envelope is count-only (pointer-not-payload).`
      );
    }
  }
  const detectedCount = assertNonNegativeIntInRange(
    raw.detectedCount,
    'intentAnnotation.piiRedaction.detectedCount',
    MAX_PII_COUNT
  );
  const maskedCount = assertNonNegativeIntInRange(
    raw.maskedCount,
    'intentAnnotation.piiRedaction.maskedCount',
    MAX_PII_COUNT
  );
  if (maskedCount > detectedCount) {
    throw new Error(
      'intentAnnotation.piiRedaction.maskedCount cannot exceed detectedCount.'
    );
  }
  if (!Array.isArray(raw.kinds)) {
    throw new Error('intentAnnotation.piiRedaction.kinds must be an array.');
  }
  const kinds = [];
  const seen = new Set();
  for (const k of raw.kinds) {
    if (typeof k !== 'string' || !PII_KIND_ALLOWLIST.includes(k)) {
      throw new Error(`intentAnnotation.piiRedaction.kinds contains unknown kind: ${k}.`);
    }
    if (seen.has(k)) continue;
    seen.add(k);
    kinds.push(k);
  }
  kinds.sort();
  // Phase 13.2 adversarial fix SF-10 — post-dedup invariant cap.
  // Pre-loop cap was bypassable via duplicates (Array(11).fill('pan')
  // passed length cap, deduped to ['pan']). Post-dedup cap is
  // unreachable by construction but kept as a guard.
  if (kinds.length > PII_KIND_ALLOWLIST.length) {
    throw new Error(
      `intentAnnotation.piiRedaction.kinds exceeds ${PII_KIND_ALLOWLIST.length}-entry cap.`
    );
  }
  if (raw.source != null && !PII_SOURCE_ALLOWLIST.includes(raw.source)) {
    throw new Error(
      `intentAnnotation.piiRedaction.source must be one of: ${PII_SOURCE_ALLOWLIST.join(', ')}.`
    );
  }
  const source = raw.source ?? 'regex';
  let appliedAt = null;
  if (raw.appliedAt != null) {
    if (typeof raw.appliedAt !== 'string' || !PII_APPLIED_AT_RE.test(raw.appliedAt)) {
      throw new Error(
        'intentAnnotation.piiRedaction.appliedAt must be an ISO-8601 UTC instant.'
      );
    }
    // Drop millisecond precision to neutralise the timing
    // fingerprint side-channel.
    appliedAt = raw.appliedAt.replace(/\.\d{1,3}Z$/, 'Z');
  }
  return {
    detectedCount,
    maskedCount,
    kinds,
    source,
    appliedAt
  };
}

function normaliseEntity(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('entity must be an object.');
  }
  const type = assertNonEmptyString(raw.type, 'entity.type', MAX_ENTITY_TYPE_LEN);
  const value = assertNonEmptyString(raw.value, 'entity.value', MAX_ENTITY_VALUE_LEN);
  const out = { type, value };
  if (raw.confidence != null) {
    out.confidence = assertConfidence(raw.confidence, 'entity.confidence');
  }
  return out;
}

// Validate + normalise an annotation envelope from the FE. Throws on
// malformed input so the API layer can surface 400. Returns the
// validated envelope ready for ledger / audit emission.
export function normaliseIntentAnnotation(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object') {
    throw new Error('intentAnnotation must be an object.');
  }
  const actionType = assertNonEmptyString(raw.actionType, 'intentAnnotation.actionType', MAX_ACTION_TYPE_LEN);
  const confidence = assertConfidence(raw.confidence, 'intentAnnotation.confidence');
  const detectedLanguage = raw.detectedLanguage == null
    ? null
    : assertNonEmptyString(raw.detectedLanguage, 'intentAnnotation.detectedLanguage', MAX_LANG_LEN);
  const rationale = normaliseRationale(raw.rationale);
  const modelPackId = raw.modelPackId == null
    ? null
    : assertNonEmptyString(raw.modelPackId, 'intentAnnotation.modelPackId', MAX_MODEL_ID_LEN);
  let entities = [];
  if (raw.entities != null) {
    if (!Array.isArray(raw.entities)) throw new Error('entities must be an array.');
    if (raw.entities.length > MAX_ENTITIES) {
      throw new Error(`entities exceeds the ${MAX_ENTITIES}-entry cap.`);
    }
    entities = raw.entities.map(normaliseEntity);
  }
  const generatedAt = raw.generatedAt == null
    ? null
    : assertNonEmptyString(raw.generatedAt, 'intentAnnotation.generatedAt', 40);
  // Phase 13.2 — optional PII-redaction sub-envelope.
  const piiRedaction = normalisePiiRedaction(raw.piiRedaction);
  return {
    protocolVersion: INTENT_ANNOTATION_PROTOCOL_VERSION,
    actionType,
    confidence,
    detectedLanguage,
    entities,
    rationale,
    modelPackId,
    generatedAt,
    piiRedaction
  };
}

// Compare an FE annotation with the server-side deterministic parse.
// Returns one of:
//   'agreed'        — both produced the same actionType
//   'disagreed'     — both produced an actionType, but different
//   'fe_only'       — FE annotated, server inferred nothing
//   'server_only'   — annotation absent; server's parse stands alone
//   'absent'        — neither produced an actionType
//
// The verdict is recorded on the orchestration for transparency; it
// NEVER changes what the orchestrator does.
export function compareIntentAnnotation(annotation, serverActionType) {
  if (!annotation && !serverActionType) return 'absent';
  if (!annotation) return 'server_only';
  if (!serverActionType) return 'fe_only';
  return annotation.actionType === serverActionType ? 'agreed' : 'disagreed';
}

// Build the ledger event payload for the agreement verdict. Keeps
// the payload terse so the audit log doesn't bloat: actionType from
// both sides, confidence, language, model pack id, verdict. No raw
// intent text (it's already on the orchestration record + ledger
// event for orchestration.created).
export function buildIntentAnnotationLedgerEvent({
  orchestrationId,
  annotation,
  serverActionType,
  verdict,
  at
}) {
  return {
    type: verdict === 'agreed'
      ? 'intent.slm_agreed'
      : verdict === 'disagreed'
        ? 'intent.slm_disagreed'
        : verdict === 'fe_only'
          ? 'intent.slm_fe_only'
          : verdict === 'server_only'
            ? 'intent.slm_server_only'
            : 'intent.slm_absent',
    orchestrationId,
    serverActionType: serverActionType || null,
    annotation: annotation
      ? {
          actionType: annotation.actionType,
          confidence: annotation.confidence,
          detectedLanguage: annotation.detectedLanguage,
          modelPackId: annotation.modelPackId,
          entityCount: annotation.entities?.length ?? 0,
          // Phase 13.2 — count-only PII redaction meta. Never the
          // spans, raws, or masked strings. Caller already
          // normalised against PII_FORBIDDEN_KEYS.
          piiRedaction: annotation.piiRedaction
            ? {
                detectedCount: annotation.piiRedaction.detectedCount,
                maskedCount: annotation.piiRedaction.maskedCount,
                kinds: [...annotation.piiRedaction.kinds],
                source: annotation.piiRedaction.source
              }
            : null
        }
      : null,
    verdict,
    at
  };
}

export const INTENT_ANNOTATION_VERDICTS = ['agreed', 'disagreed', 'fe_only', 'server_only', 'absent'];
