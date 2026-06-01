import { describe, expect, it } from 'vitest';
import { formatPlaceLabel, type ReverseGeocodePlace } from './use-reverse-geocode';

const blank: ReverseGeocodePlace = {
  label: null,
  suburb: null,
  city: null,
  state: null,
  countryCode: null,
  osmId: null
};

describe('formatPlaceLabel', () => {
  it('returns "Suburb, City" when both are present', () => {
    expect(formatPlaceLabel({ ...blank, suburb: 'Shivajinagar', city: 'Pune' })).toBe('Shivajinagar, Pune');
  });
  it('falls back to "City, State" when no suburb', () => {
    expect(formatPlaceLabel({ ...blank, city: 'Mumbai', state: 'Maharashtra' })).toBe('Mumbai, Maharashtra');
  });
  it('falls back to first two tokens of label otherwise', () => {
    expect(formatPlaceLabel({ ...blank, label: 'Some Street, Andheri East, Mumbai' })).toBe('Some Street, Andheri East');
  });
  it('returns null when nothing usable is available', () => {
    expect(formatPlaceLabel(null)).toBeNull();
    expect(formatPlaceLabel(blank)).toBeNull();
  });
});
