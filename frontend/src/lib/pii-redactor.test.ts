import { describe, expect, it } from 'vitest';
import {
  PII_REDACTOR_PROTOCOL_VERSION,
  PII_INPUT_CHAR_CAP,
  PII_MAX_SPANS,
  buildPiiScanPrompt,
  parsePiiScanCompletion,
  SAMPLE_FIXTURES,
  type PiiFixtureKey
} from './pii-redactor';
import { PII_KINDS } from './pii-detectors';

describe('PII_REDACTOR_PROTOCOL_VERSION', () => {
  it('is pinned to bos.phase13.pii-redactor.v1', () => {
    expect(PII_REDACTOR_PROTOCOL_VERSION).toBe('bos.phase13.pii-redactor.v1');
  });

  it('exports input char cap 6000 + max-spans 32', () => {
    expect(PII_INPUT_CHAR_CAP).toBe(6000);
    expect(PII_MAX_SPANS).toBe(32);
  });
});

describe('buildPiiScanPrompt', () => {
  it('includes the format spec + NONE_FOUND sentinel + USER_TEXT block', () => {
    const p = buildPiiScanPrompt('some user text');
    expect(p).toMatch(/KIND:/);
    expect(p).toMatch(/ORIGINAL:/);
    expect(p).toMatch(/START:/);
    expect(p).toMatch(/END:/);
    expect(p).toMatch(/CONFIDENCE:/);
    expect(p).toMatch(/NONE_FOUND/);
    expect(p).toMatch(/USER_TEXT:/);
    expect(p).toMatch(/YOUR ANSWER:\s*$/);
  });

  it('embeds the input text inside triple-backtick fenced block', () => {
    const p = buildPiiScanPrompt('hello world');
    expect(p).toMatch(/```\nhello world\n```/);
  });

  it('clamps input to 6000 chars', () => {
    const long = 'A'.repeat(8000);
    const p = buildPiiScanPrompt(long);
    expect(p).toMatch(/A{6000}/);
    expect(p).not.toMatch(/A{6001}/);
  });

  it('lists every focus kind in the focus directive', () => {
    const p = buildPiiScanPrompt('x');
    expect(p).toMatch(/Focus on these kinds: pan, aadhaar, mobile, gstin, account, dl, rc, abha, upi, email, pin/);
  });

  it('honours a custom focusKinds subset', () => {
    const p = buildPiiScanPrompt('x', ['pan', 'aadhaar']);
    expect(p).toMatch(/Focus on these kinds: pan, aadhaar\b/);
    expect(p).toMatch(/- pan:/);
    expect(p).toMatch(/- aadhaar:/);
    expect(p).not.toMatch(/- gstin:/);
  });

  it('ignores unknown PiiKind in focus + DEV-warns', () => {
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      // @ts-expect-error — exercising defence-in-depth on invalid input.
      const p = buildPiiScanPrompt('x', ['pan', 'fake-kind']);
      expect(p).toMatch(/- pan:/);
      expect(p).not.toMatch(/fake-kind/);
      expect(warned).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe('parsePiiScanCompletion — happy path', () => {
  const text = 'My PAN is ABCDX0000Z and mobile 9000000000.';

  it('extracts a single span with offsets that reconstruct the substring', () => {
    const completion = [
      'KIND: pan',
      'ORIGINAL: ABCDX0000Z',
      'START: 10',
      'END: 20',
      'CONFIDENCE: 0.95'
    ].join('\n');
    const out = parsePiiScanCompletion(completion, text);
    expect(out.protocolVersion).toBe('bos.phase13.pii-redactor.v1');
    expect(out.spans).toHaveLength(1);
    expect(out.spans[0]).toEqual({
      kind: 'pan',
      start: 10,
      end: 20,
      raw: 'ABCDX0000Z',
      confidence: 0.95,
      source: 'slm'
    });
  });

  it('extracts multiple spans across blank-separated blocks', () => {
    const completion = [
      'KIND: pan',
      'ORIGINAL: ABCDX0000Z',
      'START: 10',
      'END: 20',
      'CONFIDENCE: 0.9',
      '',
      'KIND: mobile',
      'ORIGINAL: 9000000000',
      'START: 32',
      'END: 42',
      'CONFIDENCE: 0.85'
    ].join('\n');
    const out = parsePiiScanCompletion(completion, text);
    expect(out.spans.map((s) => s.kind).sort()).toEqual(['mobile', 'pan']);
  });
});

describe('parsePiiScanCompletion — honest-hide bindings', () => {
  it('NONE_FOUND sentinel → empty spans', () => {
    const out = parsePiiScanCompletion('NONE_FOUND', 'any text');
    expect(out.spans).toEqual([]);
    expect(out.protocolVersion).toBe('bos.phase13.pii-redactor.v1');
  });

  it('empty completion → empty spans', () => {
    expect(parsePiiScanCompletion('', 'text').spans).toEqual([]);
    expect(parsePiiScanCompletion('   ', 'text').spans).toEqual([]);
  });

  it('drops spans with non-allowlist KIND', () => {
    const completion = [
      'KIND: zodiac-sign',
      'ORIGINAL: virgo',
      'START: 0',
      'END: 5'
    ].join('\n');
    expect(parsePiiScanCompletion(completion, 'virgo').spans).toEqual([]);
  });

  it('drops spans where text.slice(start, end) does NOT equal ORIGINAL (anti-hallucination)', () => {
    const text = 'My PAN is ABCDX0000Z.';
    const completion = [
      'KIND: pan',
      'ORIGINAL: ZZZZZ0000Z',
      'START: 10',
      'END: 20',
      'CONFIDENCE: 0.9'
    ].join('\n');
    expect(parsePiiScanCompletion(completion, text).spans).toEqual([]);
  });

  it('drops spans with out-of-range offsets', () => {
    const text = 'short';
    const completion = [
      'KIND: pan',
      'ORIGINAL: ABCDX0000Z',
      'START: 0',
      'END: 99'
    ].join('\n');
    expect(parsePiiScanCompletion(completion, text).spans).toEqual([]);
  });

  it('drops spans with end <= start', () => {
    const completion = [
      'KIND: pan',
      'ORIGINAL: x',
      'START: 5',
      'END: 5'
    ].join('\n');
    expect(parsePiiScanCompletion(completion, 'hello').spans).toEqual([]);
  });

  it('dedupes per (kind, start, end)', () => {
    const text = 'PAN ABCDX0000Z';
    const block = [
      'KIND: pan',
      'ORIGINAL: ABCDX0000Z',
      'START: 4',
      'END: 14',
      'CONFIDENCE: 0.9'
    ].join('\n');
    const out = parsePiiScanCompletion(`${block}\n\n${block}`, text);
    expect(out.spans).toHaveLength(1);
  });

  it('caps spans at PII_MAX_SPANS', () => {
    const text = 'A'.repeat(200);
    const blocks: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      blocks.push(
        [
          'KIND: pin',
          `ORIGINAL: ${text.slice(i, i + 6)}`,
          `START: ${i}`,
          `END: ${i + 6}`,
          'CONFIDENCE: 0.5'
        ].join('\n')
      );
    }
    const out = parsePiiScanCompletion(blocks.join('\n\n'), text);
    expect(out.spans.length).toBeLessThanOrEqual(PII_MAX_SPANS);
  });
});

describe('SAMPLE_FIXTURES — PII hygiene', () => {
  // No real-shaped PAN that isn't demo-pattern (ends 0000Z / 0000F /
  // 0000 + letter). No real Aadhaar (must use 9999 family or
  // 12345 obvious sequence).
  const REAL_PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
  const REAL_AADHAAR_RE = /\b[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\b/;
  // Phase 13.2 adversarial fix D6 — fixture PIN codes must use the
  // 199999/299999/399999 demo family, not real Indian postal codes.
  const PIN_RE = /\bPIN\s+([0-9]{6})\b/g;

  for (const key of Object.keys(SAMPLE_FIXTURES) as PiiFixtureKey[]) {
    const fixture = SAMPLE_FIXTURES[key];

    it(`fixture ${key} PANs all end in 0000Z-family`, () => {
      const pans = fixture.match(REAL_PAN_RE) ?? [];
      for (const pan of pans) {
        expect(pan).toMatch(/0000[A-Z]$/);
      }
    });

    it(`fixture ${key} Aadhaar-like strings use the 9999 or 12345 demo family`, () => {
      const aadhaars = fixture.match(REAL_AADHAAR_RE) ?? [];
      for (const a of aadhaars) {
        const digits = a.replace(/\s/g, '');
        const isDemoFamily =
          /^9{12}$/.test(digits) ||
          /^12345678901[0-9]$/.test(digits) ||
          /^1234567890123[0-9]$/.test(digits); // 14-digit ABHA demo
        expect(isDemoFamily).toBe(true);
      }
    });

    it(`fixture ${key} PIN codes use the demo-family (N99999)`, () => {
      const pins = [...fixture.matchAll(PIN_RE)].map((m) => m[1]);
      for (const pin of pins) {
        expect(pin).toMatch(/^[1-3]99999$/);
      }
    });

    it(`fixture ${key} builds a non-empty SLM prompt`, () => {
      const p = buildPiiScanPrompt(fixture);
      expect(p.length).toBeGreaterThan(0);
      expect(p).toMatch(/YOUR ANSWER:/);
    });
  }
});

describe('PII_KINDS reachable from prompt', () => {
  it('every PiiKind appears in the format spec line', () => {
    const p = buildPiiScanPrompt('x');
    for (const k of PII_KINDS) {
      expect(p).toContain(k);
    }
  });
});
