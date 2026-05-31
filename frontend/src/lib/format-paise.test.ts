import { describe, expect, it } from 'vitest';
import { formatRupees, formatRupeesDecimal, formatRateBasis } from './format-paise';

describe('formatRupees', () => {
  it('Indian-numbering grouping', () => {
    expect(formatRupees(100)).toMatch(/₹\s?1/);
    expect(formatRupees(10000)).toMatch(/₹\s?100/);
    expect(formatRupees(10000000)).toMatch(/1,00,000/);
  });
  it('null/undefined → ₹ 0', () => {
    expect(formatRupees(null)).toMatch(/₹\s?0/);
    expect(formatRupees(undefined)).toMatch(/₹\s?0/);
    expect(formatRupees(NaN)).toMatch(/₹\s?0/);
  });
});

describe('formatRupeesDecimal', () => {
  it('decimals to 2dp max', () => {
    expect(formatRupeesDecimal(15050)).toBe('150.5');
    expect(formatRupeesDecimal(100)).toBe('1');
  });
});

describe('formatRateBasis', () => {
  it('per-hour vs per-service', () => {
    expect(formatRateBasis(30000, 'per-hour')).toMatch(/\/\s?hr$/);
    expect(formatRateBasis(50000, 'per-service')).toMatch(/\/\s?service$/);
  });
});
