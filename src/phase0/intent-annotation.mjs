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
  return {
    protocolVersion: INTENT_ANNOTATION_PROTOCOL_VERSION,
    actionType,
    confidence,
    detectedLanguage,
    entities,
    rationale,
    modelPackId,
    generatedAt
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
          entityCount: annotation.entities?.length ?? 0
        }
      : null,
    verdict,
    at
  };
}

export const INTENT_ANNOTATION_VERDICTS = ['agreed', 'disagreed', 'fe_only', 'server_only', 'absent'];
