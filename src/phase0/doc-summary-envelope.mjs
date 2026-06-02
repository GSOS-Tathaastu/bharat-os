// Phase 13.0.2 — Doc-summary `source` envelope normaliser.
//
// When the FE saves an SLM-E document summary as a MemoryRecord, it
// passes the structured meta on the `source` field. This module
// validates that envelope at the boundary so the BE substrate can
// emit a `doc.summarised` ledger event with COUNT-ONLY meta —
// pointer-not-payload §15 binding.
//
// Why a strict allowlist (not a denylist)?
//   Phase 13.2 (ADR 0152) flipped the piiRedaction envelope to a
//   strict allowlist after the adversarial review caught synonym
//   leak vectors a denylist would have missed. This module uses
//   the same posture from day one: any key NOT in
//   PERMITTED_SOURCE_KEYS hard-rejects the call. There is no
//   "PII-impossible by construction" claim here — the FE could
//   in principle put PAN-shaped strings in `docKind` or `language`
//   if it tried, so the allowlist defence-in-depth matters.
//
// What lands on the ledger event:
//   - docKind (allowlist enum mirroring the FE DocKind union)
//   - modelPackId (pointer to the SLM pack used; ≤128 chars)
//   - titleLength + tldrLength + bulletCount (count-only)
//   - confidence (0..1, clamped)
//   - riskFlag (allowlist: none / attention / urgent)
//   - language (allowlist mirroring the FE DocLanguage union)
//   - pdfFingerprint? (count-only PDF provenance; never the bytes)
//   - generatedAt (ISO-8601 UTC instant at second precision —
//     mirrors the Phase 13.2 MF-3 fix that drops ms precision to
//     neutralise typing-speed timing fingerprints)
//
// What MUST NOT land on the ledger event:
//   - the title string, the TLDR string, the bullet strings
//   - the source PDF bytes, the extracted text, any raw hashes of
//     citizen-typed content. These all live encrypted in the
//     MemoryRecord bundle; the ledger event only carries the
//     POINTER (recordId) + the meta envelope below.

export const DOC_SUMMARY_PROTOCOL_VERSION = 'bos.phase13.doc-summary.v1';
export const DOC_SUMMARY_SOURCE_TYPE = 'doc_summary_v1';

// Allowlists kept in lockstep with the FE — convergence test in
// tests/node/doc-summary-envelope.test.mjs grep-asserts they match
// frontend/src/lib/doc-summariser.ts::DocKind + DocLanguage.
export const DOC_KIND_ALLOWLIST = Object.freeze([
  'electricity_bill',
  'form_16',
  'tncs',
  'insurance',
  'lender_doc',
  'generic'
]);
export const DOC_LANGUAGE_ALLOWLIST = Object.freeze([
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
]);
const RISK_FLAG_ALLOWLIST = Object.freeze(['none', 'attention', 'urgent']);
const PDF_TRUNCATED_REASON_ALLOWLIST = Object.freeze(['pages', 'chars', 'both']);

// Phase 13.0.2 adversarial fix SF-2 — single source of truth for
// the JSON-grep defence-in-depth substrings. Both the envelope test
// AND the ledger-event test import this and assert no forbidden
// substring appears in the serialised output. Grown to include
// synonyms a future regression could slip past a denylist
// (caption / excerpt / plain / summary / content / transcript /
// firstPageText / headline / paragraph).
export const FORBIDDEN_LEDGER_SUBSTRINGS = Object.freeze([
  'title',
  'tldr',
  'bullets',
  'text',
  'rawCompletion',
  'extractedText',
  'pdfBytes',
  'pdfSha256',
  'spans',
  'body',
  'snippet',
  'preview',
  'unmasked',
  'plaintext',
  'caption',
  'excerpt',
  'plain',
  'summary',
  'content',
  'transcript',
  'firstPageText',
  'headline',
  'paragraph'
]);

// Caps. All count-only fields are bounded so a misbehaving FE
// can't bloat the ledger with arbitrary integers.
const MAX_TITLE_LENGTH = 240;
const MAX_TLDR_LENGTH = 240;
const MAX_BULLETS = 16;
const MAX_MODEL_PACK_ID_LEN = 128;
const MAX_PDF_PAGES = 1024;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// Strict allowlist on top-level source keys + on the nested
// pdfFingerprint keys.
const PERMITTED_SOURCE_KEYS = Object.freeze([
  'type',
  'docKind',
  'modelPackId',
  'titleLength',
  'tldrLength',
  'bulletCount',
  'confidence',
  'riskFlag',
  'language',
  'pdfFingerprint',
  'generatedAt'
]);
const PERMITTED_PDF_FINGERPRINT_KEYS = Object.freeze([
  'pages',
  'truncatedReason'
]);

function assertNonNegativeIntInRange(value, label, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`${label} must be an integer in [0, ${max}].`);
  }
  return n;
}

function assertNonEmptyString(value, label, max) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertConfidence(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a finite number.`);
  if (n < 0 || n > 1) throw new Error(`${label} must be in [0, 1].`);
  return n;
}

function normalisePdfFingerprint(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('source.pdfFingerprint must be an object.');
  }
  for (const key of Object.keys(raw)) {
    if (!PERMITTED_PDF_FINGERPRINT_KEYS.includes(key)) {
      throw new Error(
        `source.pdfFingerprint.${key} is not a permitted field; envelope is count-only (pointer-not-payload).`
      );
    }
  }
  const pages = assertNonNegativeIntInRange(raw.pages, 'source.pdfFingerprint.pages', MAX_PDF_PAGES);
  let truncatedReason = null;
  if (raw.truncatedReason != null) {
    if (!PDF_TRUNCATED_REASON_ALLOWLIST.includes(raw.truncatedReason)) {
      throw new Error(
        `source.pdfFingerprint.truncatedReason must be one of: ${PDF_TRUNCATED_REASON_ALLOWLIST.join(', ')}.`
      );
    }
    truncatedReason = raw.truncatedReason;
  }
  return { pages, truncatedReason };
}

/**
 * Validate + normalise a citizen-supplied doc-summary `source`
 * envelope. Returns the validated envelope ready for persistence;
 * throws on any malformed input so the API handler surfaces 400.
 *
 * Caller responsibility: only invoke this when `raw.type ===
 * DOC_SUMMARY_SOURCE_TYPE`. For any other source.type the existing
 * memory-record substrate is used unchanged.
 */
export function normaliseDocSummarySource(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('source must be an object.');
  }
  for (const key of Object.keys(raw)) {
    if (!PERMITTED_SOURCE_KEYS.includes(key)) {
      throw new Error(
        `source.${key} is not a permitted field for doc_summary_v1; envelope is count-only (pointer-not-payload).`
      );
    }
  }
  if (raw.type !== DOC_SUMMARY_SOURCE_TYPE) {
    throw new Error(`source.type must be "${DOC_SUMMARY_SOURCE_TYPE}".`);
  }
  if (!DOC_KIND_ALLOWLIST.includes(raw.docKind)) {
    throw new Error(`source.docKind must be one of: ${DOC_KIND_ALLOWLIST.join(', ')}.`);
  }
  const modelPackId = assertNonEmptyString(
    raw.modelPackId,
    'source.modelPackId',
    MAX_MODEL_PACK_ID_LEN
  );
  const titleLength = assertNonNegativeIntInRange(
    raw.titleLength,
    'source.titleLength',
    MAX_TITLE_LENGTH
  );
  const tldrLength = assertNonNegativeIntInRange(
    raw.tldrLength,
    'source.tldrLength',
    MAX_TLDR_LENGTH
  );
  const bulletCount = assertNonNegativeIntInRange(
    raw.bulletCount,
    'source.bulletCount',
    MAX_BULLETS
  );
  const confidence = assertConfidence(raw.confidence, 'source.confidence');
  if (!RISK_FLAG_ALLOWLIST.includes(raw.riskFlag)) {
    throw new Error(`source.riskFlag must be one of: ${RISK_FLAG_ALLOWLIST.join(', ')}.`);
  }
  if (!DOC_LANGUAGE_ALLOWLIST.includes(raw.language)) {
    throw new Error(`source.language must be one of: ${DOC_LANGUAGE_ALLOWLIST.join(', ')}.`);
  }
  const pdfFingerprint = normalisePdfFingerprint(raw.pdfFingerprint);
  if (raw.generatedAt == null || typeof raw.generatedAt !== 'string' || !ISO_INSTANT_RE.test(raw.generatedAt)) {
    throw new Error('source.generatedAt must be an ISO-8601 UTC instant.');
  }
  // Phase 13.0.2 adversarial fix SF-3 — regex accepts structurally
  // valid but calendar-invalid instants (e.g. 2026-13-99T99:99:99Z).
  // Round-trip through Date.parse to reject them at the boundary so
  // a future audit replay can `new Date(generatedAt)` without NaN.
  const parsedMs = Date.parse(raw.generatedAt);
  if (!Number.isFinite(parsedMs)) {
    throw new Error('source.generatedAt must be a calendar-valid ISO-8601 UTC instant.');
  }
  // Phase 13.2 MF-3 — drop millisecond precision so the citizen's
  // typing speed can't be derived from the audit ledger.
  const generatedAt = raw.generatedAt.replace(/\.\d{1,3}Z$/, 'Z');
  return {
    type: DOC_SUMMARY_SOURCE_TYPE,
    protocolVersion: DOC_SUMMARY_PROTOCOL_VERSION,
    docKind: raw.docKind,
    modelPackId,
    titleLength,
    tldrLength,
    bulletCount,
    confidence,
    riskFlag: raw.riskFlag,
    language: raw.language,
    pdfFingerprint,
    generatedAt
  };
}

/**
 * Build the `doc.summarised` ledger event payload. Caller passes
 * the normalised source envelope + the recordId + the owner. The
 * event carries ONLY counts/enums/pointers — never the title /
 * TLDR / bullet strings themselves (those live encrypted in the
 * MemoryRecord bundle).
 */
export function buildDocSummarisedLedgerEvent({
  recordId,
  ownerId,
  source,
  at
}) {
  // Phase 13.0.2 adversarial fix MF-1 — strip millisecond precision
  // from `at` so the typing-speed fingerprint defence applied to
  // `generatedAt` (Phase 13.2 MF-3) isn't cosmetic. The caller
  // typically passes `record.createdAt` which comes from
  // `nowIso()` at full ms precision, and /api/ledger reads echo
  // events verbatim — so the ms-drop has to live in the event
  // builder.
  const atNormalised = typeof at === 'string' ? at.replace(/\.\d{1,3}Z$/, 'Z') : at;
  return {
    type: 'doc.summarised',
    recordId,
    ownerId,
    docKind: source.docKind,
    modelPackId: source.modelPackId,
    titleLength: source.titleLength,
    tldrLength: source.tldrLength,
    bulletCount: source.bulletCount,
    confidence: source.confidence,
    riskFlag: source.riskFlag,
    language: source.language,
    pdfFingerprint: source.pdfFingerprint
      ? {
          pages: source.pdfFingerprint.pages,
          truncatedReason: source.pdfFingerprint.truncatedReason
        }
      : null,
    generatedAt: source.generatedAt,
    at: atNormalised
  };
}
