// Phase 12.2.1 — useReverseGeocode hook.
//
// Wraps GET /api/geocode/reverse with TanStack Query. Coerces
// the lat/lng to the 1dp bubble BEFORE the request so two pickups
// within ~11 km share one cache entry (matches the substrate's
// pointer-not-payload posture). The query is disabled until lat
// and lng are finite numbers.
//
// Stays honest about source:
//   • mode === 'stub'  → "Near point 18.5, 73.9" placeholder.
//   • source === 'cache' → server-side LRU hit (no upstream call).
//   • source === 'live'  → real OSM Nominatim reverse lookup.
//
// The booking surfaces render `place.suburb / place.city`
// when available and fall back to the raw label otherwise.

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { round1 } from './geo';

export interface ReverseGeocodePlace {
  label: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  osmId: string | null;
}

export interface ReverseGeocodeResult {
  ok: true;
  mode: 'stub' | 'live';
  source: 'stub' | 'cache' | 'live';
  place: ReverseGeocodePlace;
  latencyMs: number;
  at: string;
}

interface Options {
  lat: number | null | undefined;
  lng: number | null | undefined;
  enabled?: boolean;
}

export function useReverseGeocode({ lat, lng, enabled = true }: Options) {
  const bubLat = round1(lat ?? null);
  const bubLng = round1(lng ?? null);
  const hasInput = bubLat != null && bubLng != null;
  return useQuery<ReverseGeocodeResult>({
    queryKey: ['reverse-geocode', bubLat, bubLng],
    queryFn: () => api<ReverseGeocodeResult>(`/api/geocode/reverse?lat=${bubLat}&lng=${bubLng}`),
    enabled: enabled && hasInput,
    staleTime: 24 * 60 * 60 * 1000, // 24h — matches adapter cache TTL.
    retry: false
  });
}

// Compact label used by booking cards. Prefers "Suburb, City" when
// both are available; otherwise the first 2 comma-separated tokens
// of the upstream display_name; otherwise null (caller renders the
// raw lat/lng).
export function formatPlaceLabel(place: ReverseGeocodePlace | null | undefined): string | null {
  if (!place) return null;
  if (place.suburb && place.city) return `${place.suburb}, ${place.city}`;
  if (place.city && place.state) return `${place.city}, ${place.state}`;
  if (place.label) {
    return place.label
      .split(',')
      .slice(0, 2)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
  }
  return null;
}
