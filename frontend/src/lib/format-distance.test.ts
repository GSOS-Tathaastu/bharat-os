import { describe, expect, it } from 'vitest';
import { formatDistanceMeters } from './format-distance';

describe('formatDistanceMeters', () => {
  it('sub-1km → "<round-to-10> m"', () => {
    expect(formatDistanceMeters(15)).toBe('20 m');
    expect(formatDistanceMeters(940)).toBe('940 m');
  });
  it('1–10km → "n.n km"', () => {
    expect(formatDistanceMeters(2500)).toBe('2.5 km');
    expect(formatDistanceMeters(9800)).toBe('9.8 km');
  });
  it('≥10km → integer km', () => {
    expect(formatDistanceMeters(15000)).toBe('15 km');
    expect(formatDistanceMeters(120000)).toBe('120 km');
  });
  it('bad input → "—"', () => {
    expect(formatDistanceMeters(null)).toBe('—');
    expect(formatDistanceMeters(undefined)).toBe('—');
    expect(formatDistanceMeters(-1)).toBe('—');
  });
});
