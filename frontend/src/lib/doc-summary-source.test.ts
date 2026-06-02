import { describe, expect, it } from 'vitest';
import {
  buildDocSummarySource,
  renderSummaryPlaintext,
  DOC_SUMMARY_PROTOCOL_VERSION,
  DOC_SUMMARY_SOURCE_TYPE
} from './doc-summary-source';
import type { ParsedDocSummary } from './doc-summariser';

function makeParsed(): ParsedDocSummary {
  return {
    protocolVersion: 'bos.phase13.doc-summariser.v1',
    fields: {
      title: 'Mahadiscom electricity bill — May 2026',
      tldr: '₹2,956 due on 24 May 2026 — 308 units consumed.',
      bullets: ['Amount due: ₹2,956', 'Due date: 24 May 2026', 'Consumer: DEMO-7782'],
      language: 'English',
      confidence: 0.92,
      riskFlag: 'attention',
      docKind: 'electricity_bill'
    }
  };
}

describe('constants', () => {
  it('protocol version pinned', () => {
    expect(DOC_SUMMARY_PROTOCOL_VERSION).toBe('bos.phase13.doc-summary.v1');
    expect(DOC_SUMMARY_SOURCE_TYPE).toBe('doc_summary_v1');
  });
});

describe('buildDocSummarySource', () => {
  it('builds a strict-allowlist-shaped envelope without PDF provenance', () => {
    const out = buildDocSummarySource({
      parsed: makeParsed(),
      modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
      pdf: null,
      now: '2026-06-02T10:05:00.000Z'
    });
    expect(out.type).toBe('doc_summary_v1');
    expect(out.docKind).toBe('electricity_bill');
    expect(out.modelPackId).toBe('bos:slm-model-pack:phi-3-mini-q4');
    expect(out.titleLength).toBe(makeParsed().fields.title.length);
    expect(out.tldrLength).toBe(makeParsed().fields.tldr.length);
    expect(out.bulletCount).toBe(3);
    expect(out.confidence).toBeCloseTo(0.92, 2);
    expect(out.riskFlag).toBe('attention');
    expect(out.language).toBe('English');
    expect(out.pdfFingerprint).toBeNull();
    expect(out.generatedAt).toBe('2026-06-02T10:05:00.000Z');
  });

  it('includes pdfFingerprint when the input was a PDF', () => {
    const out = buildDocSummarySource({
      parsed: makeParsed(),
      modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
      pdf: { pages: 4, truncatedReason: 'chars' },
      now: '2026-06-02T10:05:00.000Z'
    });
    expect(out.pdfFingerprint).toEqual({ pages: 4, truncatedReason: 'chars' });
  });

  it('§15 — envelope contains ONLY count/enum/pointer keys (no body bytes)', () => {
    const out = buildDocSummarySource({
      parsed: makeParsed(),
      modelPackId: 'bos:slm-model-pack:phi-3-mini-q4',
      pdf: { pages: 4, truncatedReason: null },
      now: '2026-06-02T10:05:00.000Z'
    });
    const allowedKeys = new Set([
      'type', 'docKind', 'modelPackId', 'titleLength', 'tldrLength',
      'bulletCount', 'confidence', 'riskFlag', 'language',
      'pdfFingerprint', 'generatedAt'
    ]);
    for (const key of Object.keys(out)) {
      expect(allowedKeys.has(key), `unexpected envelope key: ${key}`).toBe(true);
    }
    // Defensive serialize-and-grep: no piece of the parsed strings
    // ends up on the envelope by accident.
    const json = JSON.stringify(out);
    expect(json).not.toContain('Mahadiscom');
    expect(json).not.toContain('₹2,956');
    expect(json).not.toContain('Amount due');
    expect(json).not.toContain('DEMO-7782');
  });
});

describe('renderSummaryPlaintext', () => {
  it('produces a stable line-shaped citizen-readable string', () => {
    const out = renderSummaryPlaintext(makeParsed());
    expect(out).toMatch(/^TITLE: Mahadiscom electricity bill/);
    expect(out).toMatch(/\nTLDR: ₹2,956/);
    expect(out).toMatch(/\nBULLET_1: Amount due/);
    expect(out).toMatch(/\nBULLET_3: Consumer:/);
    expect(out).toMatch(/\nLANGUAGE: English/);
    expect(out).toMatch(/\nCONFIDENCE: 0\.92/);
    expect(out).toMatch(/\nRISK_FLAG: attention/);
    expect(out).toMatch(/\nDOC_KIND: electricity_bill$/);
  });

  it('is byte-stable for the same input (no Date / random)', () => {
    expect(renderSummaryPlaintext(makeParsed())).toBe(renderSummaryPlaintext(makeParsed()));
  });
});
