// Phase 12.1a.1 — Shared frontend geo primitives.
//
// Pure helpers reused across:
//   • Marketplace discovery (citizen browse: round1 before query).
//   • Provider onboarding (ServiceAreaPicker: round4 for centroid).
//   • Future Phase 12.1a.2 booking flow (pickup point + distance).
//   • Future regulator-audit views (display by 1dp bucket).
//
// Mirrors src/phase0/geo.mjs on the backend. We round client-side
// BEFORE building any query string OR React-state object, so the
// privacy guarantee holds even if the surrounding component leaks
// state (memo, devtools, error boundary).

export const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;

// Rounding helpers — mirror src/phase0/geo.mjs exactly so the
// browser → server round-trip never silently drifts. Return null
// for non-finite input so callers can early-return without
// guarding NaN themselves.
export function round1(n: number | null | undefined): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}

export function round2(n: number | null | undefined): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

export function round4(n: number | null | undefined): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10000) / 10000;
}

export function isFiniteLat(n: number | null | undefined): boolean {
  const x = Number(n);
  return Number.isFinite(x) && x >= -90 && x <= 90;
}

export function isFiniteLng(n: number | null | undefined): boolean {
  const x = Number(n);
  return Number.isFinite(x) && x >= -180 && x <= 180;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineMeters(a: LatLng | null, b: LatLng | null): number {
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

export type DistanceBand = '<1km' | '1-3km' | '3-5km' | '5-10km' | '10-25km' | '25km+';

export function distanceBand(meters: number): DistanceBand {
  if (!Number.isFinite(meters)) return '25km+';
  const km = meters / 1000;
  if (km < 1) return '<1km';
  if (km < 3) return '1-3km';
  if (km < 5) return '3-5km';
  if (km < 10) return '5-10km';
  if (km < 25) return '10-25km';
  return '25km+';
}

// Human-readable label for a distanceBand. Used by browse cards.
export function distanceBandLabel(band: DistanceBand): string {
  if (band === '<1km') return 'Under 1 km away';
  if (band === '1-3km') return '1–3 km away';
  if (band === '3-5km') return '3–5 km away';
  if (band === '5-10km') return '5–10 km away';
  if (band === '10-25km') return '10–25 km away';
  return 'Over 25 km';
}

// India tier-1 + tier-2 city centroids — fallback when the citizen
// declines the geolocation prompt. Tier-1 cities get a wider
// default radius (8 km) reflecting the bigger sprawl; tier-2 use
// 5 km. Source: rough metropolitan centroids; precise enough for
// the user to see "providers near MY city, not the wrong city".
export interface CityCentroid {
  id: string;
  label: string;
  state: string;
  lat: number;
  lng: number;
  defaultRadiusMeters: number;
  tier: 1 | 2;
}

export const INDIA_CITIES: CityCentroid[] = [
  { id: 'mumbai', label: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, defaultRadiusMeters: 10000, tier: 1 },
  { id: 'delhi', label: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090, defaultRadiusMeters: 10000, tier: 1 },
  { id: 'bengaluru', label: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, defaultRadiusMeters: 10000, tier: 1 },
  { id: 'hyderabad', label: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867, defaultRadiusMeters: 8000, tier: 1 },
  { id: 'chennai', label: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, defaultRadiusMeters: 8000, tier: 1 },
  { id: 'kolkata', label: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, defaultRadiusMeters: 8000, tier: 1 },
  { id: 'pune', label: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, defaultRadiusMeters: 8000, tier: 1 },
  { id: 'ahmedabad', label: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, defaultRadiusMeters: 8000, tier: 1 },
  { id: 'surat', label: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'jaipur', label: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'lucknow', label: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'kanpur', label: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'nagpur', label: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'indore', label: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'bhopal', label: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'patna', label: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'visakhapatnam', label: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'vadodara', label: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'ludhiana', label: 'Ludhiana', state: 'Punjab', lat: 30.9010, lng: 75.8573, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'agra', label: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'nashik', label: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'thiruvananthapuram', label: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'kochi', label: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'coimbatore', label: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'guwahati', label: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'bhubaneswar', label: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'chandigarh', label: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'dehradun', label: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'amritsar', label: 'Amritsar', state: 'Punjab', lat: 31.6340, lng: 74.8723, defaultRadiusMeters: 5000, tier: 2 },
  { id: 'ranchi', label: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096, defaultRadiusMeters: 5000, tier: 2 }
];

export function findCityCentroid(cityId: string): CityCentroid | undefined {
  return INDIA_CITIES.find((c) => c.id === cityId);
}
