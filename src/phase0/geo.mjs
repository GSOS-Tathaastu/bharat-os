// Phase 0 — Shared geo primitives.
//
// Pure math + bounds + coarsening helpers reused across modules:
//
//   • Phase 12.1a.1 marketplace discovery (provider <-> citizen
//     distance + bubble overlap).
//   • Phase 12.1a.2 citizen-booking-escrow (pickup-point distance
//     to provider centroid).
//   • Future Phase 12.2+ provider on-route tracking, mesh node
//     locality, location-bound consent scopes, regulator audits
//     coarsened by bucket.
//
// Everything in this module is pure, allocation-free where
// possible, and uses ONLY Node + Web Crypto stdlib. No external
// dep. Distance is great-circle (Haversine) — fine for India-
// scale up to a few hundred km; if we ever need >1000 km a
// Vincenty inverse can be added without changing this surface.
//
// §15 binding note: the coarsening helpers (round1, round2) are
// THE chokepoint enforcing pointer-not-payload for location.
// Any callsite that emits a location to the ledger, to a
// provider, or to an audit consumer MUST go through round1 (or
// coarser) before serialisation. The 4-decimal centroid persisted
// on a providerIdentity stays internal-only.

export const GEO_PROTOCOL_VERSION = 'bos.phase0.geo.v0';

// WGS84-ish mean earth radius (the value Haversine cares about).
export const EARTH_RADIUS_M = 6_371_008.8;

const DEG_TO_RAD = Math.PI / 180;

// India-leaning bounding box used as a soft sanity check on
// citizen / provider coordinates. Anything outside is technically
// valid lat/lng but suspicious for a Bharat OS payload; callers
// can choose to warn or hard-reject.
export const INDIA_BBOX = {
  minLat: 6.5,
  maxLat: 37.5,
  minLng: 67.5,
  maxLng: 97.5
};

// Round lat or lng to 1 decimal place (~11 km). Used for ledger
// emit buckets so a search trail cannot triangulate the searcher
// across two queries.
export function round1(n) {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}

// Round lat or lng to 2 decimal places (~1.1 km). Used for the
// publicProviderRecord centroid so a sorted nearby list cannot
// reverse-dox a household-help worker's home address.
export function round2(n) {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

// Round lat or lng to 4 decimal places (~11 m). Used at substrate
// persistence so we don't accidentally store sub-metre precision.
export function round4(n) {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10000) / 10000;
}

// Latitude / longitude validators. Return true if finite and
// within global bounds. Pair with INDIA_BBOX if soft India check
// is desired.
export function isFiniteLat(n) {
  const x = Number(n);
  return Number.isFinite(x) && x >= -90 && x <= 90;
}

export function isFiniteLng(n) {
  const x = Number(n);
  return Number.isFinite(x) && x >= -180 && x <= 180;
}

export function isInsideIndiaBbox(point) {
  if (!point || typeof point !== 'object') return false;
  const { lat, lng } = point;
  if (!isFiniteLat(lat) || !isFiniteLng(lng)) return false;
  return (
    lat >= INDIA_BBOX.minLat &&
    lat <= INDIA_BBOX.maxLat &&
    lng >= INDIA_BBOX.minLng &&
    lng <= INDIA_BBOX.maxLng
  );
}

// Great-circle distance in metres between two {lat, lng} points
// (decimal degrees, WGS84-ish). Returns Infinity for invalid
// inputs so callers can filter without try/catch.
export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dphi = (lat2 - lat1) * DEG_TO_RAD;
  const dlambda = (lng2 - lng1) * DEG_TO_RAD;
  const sinDphi = Math.sin(dphi / 2);
  const sinDlambda = Math.sin(dlambda / 2);
  const h = sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlambda * sinDlambda;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

// Coarse band used for citizen-facing display ("about 2 km
// away"). Hides exact metres so a sorted nearby list cannot be
// diffed across two searches to triangulate provider home.
export function distanceBand(meters) {
  if (!Number.isFinite(meters)) return '25km+';
  const km = meters / 1000;
  if (km < 1) return '<1km';
  if (km < 3) return '1-3km';
  if (km < 5) return '3-5km';
  if (km < 10) return '5-10km';
  if (km < 25) return '10-25km';
  return '25km+';
}

// Bubble-overlap predicate: does origin lie inside (citizen radius
// + provider radius) of provider centroid? Used by marketplace
// discovery and by booking-escrow eligibility checks.
export function bubblesOverlap({ origin, target, queryRadiusMeters, targetRadiusMeters = 0 }) {
  const d = haversineMeters(origin, target);
  if (!Number.isFinite(d)) return false;
  const queryR = Math.max(0, Number(queryRadiusMeters) || 0);
  const targetR = Math.max(0, Number(targetRadiusMeters) || 0);
  return d <= queryR + targetR;
}
