import { describe, expect, it } from 'vitest';
import { isValidPincode } from './use-pincode-lookup';

describe('isValidPincode', () => {
  it('accepts well-formed Indian PIN codes', () => {
    expect(isValidPincode('411005')).toBe(true);
    expect(isValidPincode('110001')).toBe(true);
    expect(isValidPincode('400069')).toBe(true);
  });
  it('rejects leading-zero / wrong-length / non-numeric', () => {
    expect(isValidPincode('011005')).toBe(false);
    expect(isValidPincode('41100')).toBe(false);
    expect(isValidPincode('4110055')).toBe(false);
    expect(isValidPincode('abcdef')).toBe(false);
    expect(isValidPincode('')).toBe(false);
    expect(isValidPincode(null)).toBe(false);
    expect(isValidPincode(undefined)).toBe(false);
    expect(isValidPincode(411005 as unknown)).toBe(false);
  });
});
