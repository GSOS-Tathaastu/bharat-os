// Phase 13.0.2 — FE-side builder for the doc-summary `source`
// envelope passed to POST /api/memory-records.
//
// The BE substrate at `src/phase0/doc-summary-envelope.mjs` validates
// this strictly (allowlist on every key, allowlist enums, count
// caps, ISO-8601 generatedAt with ms drop). This helper produces a
// payload the BE accepts on the happy path; defence-in-depth lives
// at the BE boundary so a misbehaving FE caller surfaces a 400 with
// `invalid_doc_summary_source` rather than silently leaking a field.

import type { ParsedDocSummary, DocKind } from './doc-summariser';

export const DOC_SUMMARY_PROTOCOL_VERSION = 'bos.phase13.doc-summary.v1' as const;
export const DOC_SUMMARY_SOURCE_TYPE = 'doc_summary_v1' as const;

export type DocPdfTruncatedReason = 'pages' | 'chars' | 'both' | null;

export interface DocPdfFingerprintInput {
  pages: number;
  truncatedReason: DocPdfTruncatedReason;
}

export interface DocSummarySourceEnvelope {
  type: typeof DOC_SUMMARY_SOURCE_TYPE;
  docKind: DocKind;
  modelPackId: string;
  titleLength: number;
  tldrLength: number;
  bulletCount: number;
  confidence: number;
  riskFlag: ParsedDocSummary['fields']['riskFlag'];
  language: ParsedDocSummary['fields']['language'];
  pdfFingerprint: { pages: number; truncatedReason: 'pages' | 'chars' | 'both' | null } | null;
  generatedAt: string;
}

/**
 * Build the `source` envelope from a parsed SLM-E summary and the
 * optional PDF provenance (when the input came via a PDF pick
 * rather than paste). Caller passes `now()` so tests can pin the
 * timestamp; production callers pass `new Date().toISOString()`.
 */
export function buildDocSummarySource(args: {
  parsed: ParsedDocSummary;
  modelPackId: string;
  pdf?: DocPdfFingerprintInput | null;
  now: string;
}): DocSummarySourceEnvelope {
  const { parsed, modelPackId, pdf, now } = args;
  const { fields } = parsed;
  return {
    type: DOC_SUMMARY_SOURCE_TYPE,
    docKind: fields.docKind,
    modelPackId,
    titleLength: fields.title.length,
    tldrLength: fields.tldr.length,
    bulletCount: fields.bullets.length,
    confidence: fields.confidence,
    riskFlag: fields.riskFlag,
    language: fields.language,
    pdfFingerprint: pdf
      ? { pages: pdf.pages, truncatedReason: pdf.truncatedReason }
      : null,
    generatedAt: now
  };
}

/**
 * Render the citizen-confirmed summary text in a stable shape so
 * the encrypted MemoryRecord body is human-readable when later
 * decrypted. The BE never inspects this — it's the citizen's data.
 */
export function renderSummaryPlaintext(parsed: ParsedDocSummary): string {
  const { fields } = parsed;
  const lines = [
    `TITLE: ${fields.title}`,
    `TLDR: ${fields.tldr}`
  ];
  fields.bullets.forEach((b, i) => {
    lines.push(`BULLET_${i + 1}: ${b}`);
  });
  lines.push(`LANGUAGE: ${fields.language}`);
  lines.push(`CONFIDENCE: ${fields.confidence.toFixed(2)}`);
  lines.push(`RISK_FLAG: ${fields.riskFlag}`);
  lines.push(`DOC_KIND: ${fields.docKind}`);
  return lines.join('\n');
}
