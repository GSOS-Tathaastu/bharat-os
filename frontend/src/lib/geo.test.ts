// Phase 12.1a.1 — FE geo lib contract tests.
//
// Pins the rounding helpers + haversine + distanceBand so a future
// refactor can't silently shift the FE/BE rounding contract.
// Mirrors src/phase0/geo.mjs tests on the backend.

import { describe, expect, it } from 'vitest';
import {
  round1,
  round2,
  round4,
  isFiniteLat,
  isFiniteLng,
  haversineMeters,
  distanceBand,
  distanceBandLabel,
  findCityCentroid,
  INDIA_CITIES
} from './geo';

describe('round1 ~11km bucket', () => {
  it('rounds to 1 decimal', () => {
    expect(round1(18.5204)).toBe(18.5);
    expect(round1(18.5501)).toBe(18.6);
  });
  it('returns null for non-finite', () => {
    expect(round1(NaN)).toBeNull();
    expect(round1(null)).toBeNull();
  });
});

describe('round2 ~1.1km bucket', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(18.5204)).toBe(18.52);
    expect(round2(73.8567)).toBe(73.86);
  });
});

describe('round4 ~11m bucket', () => {
  it('rounds to 4 decimals', () => {
    expect(round4(18.520491234)).toBe(18.5205);
    expect(round4(73.856712399)).toBe(73.8567);
  });
});

describe('isFiniteLat/Lng', () => {
  it('accepts the bounds', () => {
    expect(isFiniteLat(0)).toBe(true);
    expect(isFiniteLat(90)).toBe(true);
    expect(isFiniteLat(-90)).toBe(true);
    expect(isFiniteLat(90.0001)).toBe(false);
    expect(isFiniteLng(-180)).toBe(true);
    expect(isFiniteLng(180.5)).toBe(false);
  });
});

describe('haversineMeters', () => {
  it('Pune ↔ Mumbai ≈ 120 km great-circle', () => {
    const pune = { lat: 18.5204, lng: 73.8567 };
    const mumbai = { lat: 19.0760, lng: 72.8777 };
    const d = haversineMeters(pune, mumbai);
    expect(d).toBeGreaterThan(118_000);
    expect(d).toBeLessThan(122_000);
  });
  it('zero distance', () => {
    const p = { lat: 28.6139, lng: 77.2090 };
    expect(haversineMeters(p, p)).toBe(0);
  });
  it('Infinity for invalid input', () => {
    expect(haversineMeters(null, { lat: 0, lng: 0 })).toBe(Infinity);
  });
});

describe('distanceBand', () => {
  it('hits each bucket', () => {
    expect(distanceBand(0)).toBe('<1km');
    expect(distanceBand(999)).toBe('<1km');
    expect(distanceBand(1000)).toBe('1-3km');
    expect(distanceBand(2999)).toBe('1-3km');
    expect(distanceBand(3000)).toBe('3-5km');
    expect(distanceBand(5000)).toBe('5-10km');
    expect(distanceBand(10000)).toBe('10-25km');
    expect(distanceBand(25000)).toBe('25km+');
    expect(distanceBand(NaN)).toBe('25km+');
  });
});

describe('distanceBandLabel', () => {
  it('returns a non-empty human label for each band', () => {
    for (const m of [0, 1500, 4000, 7000, 15000, 30000]) {
      const label = distanceBandLabel(distanceBand(m));
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('INDIA_CITIES', () => {
  it('all centroids are inside India bbox', () => {
    for (const c of INDIA_CITIES) {
      expect(c.lat).toBeGreaterThan(6.5);
      expect(c.lat).toBeLessThan(37.5);
      expect(c.lng).toBeGreaterThan(67.5);
      expect(c.lng).toBeLessThan(97.5);
      expect(c.defaultRadiusMeters).toBeGreaterThanOrEqual(500);
      expect(c.defaultRadiusMeters).toBeLessThanOrEqual(50000);
      expect([1, 2]).toContain(c.tier);
    }
  });
  it('all ids are unique', () => {
    const ids = INDIA_CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('findCityCentroid resolves known ids', () => {
    expect(findCityCentroid('pune')?.label).toBe('Pune');
    expect(findCityCentroid('unknown')).toBeUndefined();
  });
});
