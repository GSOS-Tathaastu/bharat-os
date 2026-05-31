// Phase 0 — Shared geo primitives tests.
//
// The math + coarsening helpers in src/phase0/geo.mjs are reused
// across marketplace discovery, future booking-escrow pickup-point
// matching, mesh node locality, and regulator-audit bucketing.
// This test pins their contract independently of any caller so a
// later module change can't subtly shift behaviour.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EARTH_RADIUS_M,
  INDIA_BBOX,
  round1,
  round2,
  round4,
  isFiniteLat,
  isFiniteLng,
  isInsideIndiaBbox,
  haversineMeters,
  distanceBand,
  bubblesOverlap
} from '../../src/phase0/geo.mjs';

test('round1 ~ 11km bucket', () => {
  assert.equal(round1(18.5204), 18.5);
  assert.equal(round1(18.5499), 18.5);
  assert.equal(round1(18.5501), 18.6);
  assert.equal(round1(-0.04), -0);
  assert.equal(round1('not-a-number'), null);
});

test('round2 ~ 1.1km bucket', () => {
  assert.equal(round2(18.5204), 18.52);
  assert.equal(round2(73.8567), 73.86);
  assert.equal(round2(NaN), null);
});

test('round4 ~ 11m bucket', () => {
  assert.equal(round4(18.520491234), 18.5205);
  assert.equal(round4(73.856712399), 73.8567);
});

test('isFiniteLat / isFiniteLng global bounds', () => {
  assert.equal(isFiniteLat(0), true);
  assert.equal(isFiniteLat(90), true);
  assert.equal(isFiniteLat(-90), true);
  assert.equal(isFiniteLat(90.0001), false);
  assert.equal(isFiniteLat(Number.NaN), false);
  assert.equal(isFiniteLng(0), true);
  assert.equal(isFiniteLng(-180), true);
  assert.equal(isFiniteLng(180.5), false);
});

test('isInsideIndiaBbox', () => {
  assert.equal(isInsideIndiaBbox({ lat: 18.5, lng: 73.85 }), true);    // Pune
  assert.equal(isInsideIndiaBbox({ lat: 28.6, lng: 77.2 }), true);     // Delhi
  assert.equal(isInsideIndiaBbox({ lat: 0, lng: 0 }), false);          // Gulf of Guinea
  assert.equal(isInsideIndiaBbox({ lat: 40, lng: 74 }), false);        // NYC-ish
  assert.equal(isInsideIndiaBbox(null), false);
});

test('INDIA_BBOX covers tip-to-tip', () => {
  // Kanyakumari ~8.07 N
  assert.ok(8.07 >= INDIA_BBOX.minLat);
  // Leh ~34.15 N
  assert.ok(34.15 <= INDIA_BBOX.maxLat);
  // Kutch ~68 E
  assert.ok(68 >= INDIA_BBOX.minLng);
  // Arunachal ~97 E
  assert.ok(97 <= INDIA_BBOX.maxLng);
});

test('haversineMeters Pune ↔ Mumbai ≈ 120 km (great-circle)', () => {
  const pune = { lat: 18.5204, lng: 73.8567 };
  const mumbai = { lat: 19.0760, lng: 72.8777 };
  const d = haversineMeters(pune, mumbai);
  // Great-circle Pune → Mumbai ≈ 120 km. Road distance is ~150 km
  // because the Western Ghats. Test the geographic truth.
  assert.ok(d > 118_000 && d < 122_000, `expected ≈120km, got ${d}`);
});

test('haversineMeters zero-distance is exactly zero', () => {
  const p = { lat: 28.6139, lng: 77.2090 };
  assert.equal(haversineMeters(p, p), 0);
});

test('haversineMeters returns Infinity for invalid input', () => {
  assert.equal(haversineMeters(null, { lat: 0, lng: 0 }), Infinity);
  assert.equal(haversineMeters({ lat: 'x' }, { lat: 0, lng: 0 }), Infinity);
});

test('distanceBand boundaries', () => {
  assert.equal(distanceBand(0), '<1km');
  assert.equal(distanceBand(999), '<1km');
  assert.equal(distanceBand(1000), '1-3km');
  assert.equal(distanceBand(5000), '5-10km');
  assert.equal(distanceBand(10000), '10-25km');
  assert.equal(distanceBand(25000), '25km+');
  assert.equal(distanceBand(NaN), '25km+');
});

test('bubblesOverlap respects both radii', () => {
  const a = { lat: 18.5, lng: 73.85 };
  const b = { lat: 18.55, lng: 73.85 };   // ~5.5 km north
  // citizen radius 0 + provider radius 5km → just barely no overlap
  assert.equal(bubblesOverlap({ origin: a, target: b, queryRadiusMeters: 0, targetRadiusMeters: 5000 }), false);
  // citizen radius 1km + provider radius 5km → overlap (1 + 5 > 5.5)
  assert.equal(bubblesOverlap({ origin: a, target: b, queryRadiusMeters: 1000, targetRadiusMeters: 5000 }), true);
});

test('EARTH_RADIUS_M is the WGS84-ish mean', () => {
  assert.ok(EARTH_RADIUS_M > 6_370_000 && EARTH_RADIUS_M < 6_372_000);
});
