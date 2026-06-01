import { describe, expect, it } from 'vitest';
import { mergeSpans } from './use-slm-pii-redactor';
import type { RegexSpan } from './pii-detectors';
import type { SlmSpan } from './pii-redactor';

function regexSpan(start: number, end: number, raw: string, kind: RegexSpan['kind'] = 'pan'): RegexSpan {
  return { source: 'regex', start, end, raw, kind };
}

function slmSpan(start: number, end: number, raw: string, kind: SlmSpan['kind'] = 'email'): SlmSpan {
  return { source: 'slm', start, end, raw, kind, confidence: 0.8 };
}

describe('mergeSpans', () => {
  it('returns empty for empty inputs', () => {
    expect(mergeSpans([], [])).toEqual([]);
  });

  it('keeps all spans when nothing overlaps', () => {
    const out = mergeSpans(
      [regexSpan(0, 10, 'ABCDE1234F')],
      [slmSpan(20, 35, 'alice@example.com')]
    );
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe('regex');
    expect(out[1].source).toBe('slm');
  });

  it('sorts by start ascending', () => {
    const out = mergeSpans(
      [regexSpan(30, 40, 'xxxxxxxxxx')],
      [slmSpan(0, 5, 'hello')]
    );
    expect(out[0].start).toBe(0);
    expect(out[1].start).toBe(30);
  });

  it('regex wins on overlap (regex registered first)', () => {
    const out = mergeSpans(
      [regexSpan(0, 10, 'ABCDE1234F', 'pan')],
      // SLM claims an overlapping span — should be dropped.
      [slmSpan(5, 15, '1234F00000', 'account')]
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('regex');
  });

  it('non-overlapping SLM span on the right is kept', () => {
    const out = mergeSpans(
      [regexSpan(0, 10, 'ABCDE1234F')],
      [slmSpan(11, 30, 'alice@example.com')]
    );
    expect(out).toHaveLength(2);
  });

  it('contiguous spans (touching boundaries) both kept', () => {
    const out = mergeSpans(
      [regexSpan(0, 10, 'ABCDE1234F')],
      [slmSpan(10, 25, 'alice@example.com')]
    );
    // span.start (10) is NOT < last.end (10) — both kept.
    expect(out).toHaveLength(2);
  });

  it('two regex spans never collide with the SLM-suppression rule', () => {
    const out = mergeSpans(
      [
        regexSpan(0, 10, 'ABCDE1234F'),
        regexSpan(20, 30, 'PQRSY5678Z')
      ],
      []
    );
    expect(out).toHaveLength(2);
  });

  // Phase 13.1 adversarial fix M1 — regex wins on overlap REGARDLESS
  // of start order. Earlier impl sorted by start ascending and let
  // an SLM span starting BEFORE a regex span displace it.
  it('M1: regex span at [10,20] beats SLM span at [0,15] (regex displaces)', () => {
    const out = mergeSpans(
      [regexSpan(10, 20, 'ABCDE1234F', 'pan')],
      [slmSpan(0, 15, 'noise-ABCDE1234', 'account')]
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('regex');
  });

  it('M1: regex span at [0,10] beats SLM span at [5,15]', () => {
    const out = mergeSpans(
      [regexSpan(0, 10, 'ABCDE1234F', 'pan')],
      [slmSpan(5, 15, '1234F12345', 'account')]
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('regex');
  });
});
