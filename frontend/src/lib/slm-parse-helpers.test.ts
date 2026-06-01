import { describe, expect, it } from 'vitest';
import { clipLine, clampConfidence, djb2Hash } from './slm-parse-helpers';

describe('clipLine', () => {
  it('returns null for empty / whitespace / undefined input', () => {
    expect(clipLine(undefined, 10)).toBeNull();
    expect(clipLine('', 10)).toBeNull();
    expect(clipLine('   ', 10)).toBeNull();
  });

  it('strips surrounding quotes / backticks / whitespace', () => {
    expect(clipLine('  "hello"  ', 100)).toBe('hello');
    expect(clipLine('`code`', 100)).toBe('code');
  });

  it('takes first line only', () => {
    expect(clipLine('first\nsecond\nthird', 100)).toBe('first');
  });

  it('clips to max', () => {
    expect(clipLine('A'.repeat(50), 10)).toBe('AAAAAAAAAA');
  });
});

describe('clampConfidence', () => {
  it('returns 0.5 for missing / NaN', () => {
    expect(clampConfidence(undefined)).toBe(0.5);
    expect(clampConfidence('not-a-number')).toBe(0.5);
  });

  it('clamps negatives to 0', () => {
    expect(clampConfidence('-0.3')).toBe(0);
  });

  it('divides percentages by 100 when > 1', () => {
    expect(clampConfidence('85')).toBeCloseTo(0.85, 2);
    expect(clampConfidence('150')).toBe(1);
  });

  it('passes through values in [0, 1]', () => {
    expect(clampConfidence('0.42')).toBeCloseTo(0.42, 2);
    expect(clampConfidence('1')).toBe(1);
    expect(clampConfidence('0')).toBe(0);
  });
});

describe('djb2Hash', () => {
  it('is deterministic', () => {
    expect(djb2Hash('hello')).toBe(djb2Hash('hello'));
  });

  it('differs for different inputs', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
  });

  it('returns a hex string', () => {
    expect(djb2Hash('hello')).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the empty string each time', () => {
    expect(djb2Hash('')).toBe(djb2Hash(''));
  });
});
