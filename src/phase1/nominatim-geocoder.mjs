// Phase 12.2.1 — OSM Nominatim reverse geocoder adapter.
//
// First concrete external-API integration on top of the
// `createAdapter` substrate. Returns a human-readable place
// label for a lat/lng — used by the booking surface so a
// citizen pickup point reads as "Near Shivajinagar, Pune"
// instead of "18.52, 73.86".
//
// Usage policy compliance:
//   • Polite User-Agent including a contact email.
//   • 1 req/sec hard cap (Nominatim's documented limit).
//   • Result cache keyed on the 1-decimal bubble so two
//     pickups within ~11 km share the same lookup (also
//     reduces upstream calls + audit-ledger noise).
//   • No bulk usage; this adapter is for interactive page
//     loads only.
//
// §15 binding: cache key is the bubble1dp string — never a
// 4dp coord. The exact 4dp pickup coordinate never leaves the
// device → server (we use the existing rounded value).

import { round1 } from '../phase0/geo.mjs';
import { createAdapter } from '../phase0/external-adapter.mjs';

export const NOMINATIM_PROTOCOL_VERSION = 'bos.phase12.nominatim-geocoder.v0';

const ADAPTER_NAME = 'osm-nominatim';
const BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'BharatOS/0.1 (+https://github.com/bharat-os)';

// Lift the most useful Nominatim address fields up to a stable
// shape the FE renders directly. We don't return the full
// 50-key Nominatim address object so the citizen-side surface
// can't accidentally render raw upstream PII.
function pickPlace(json) {
  if (!json || typeof json !== 'object') return null;
  const a = json.address || {};
  return {
    label: typeof json.display_name === 'string'
      ? json.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', ')
      : null,
    suburb: a.suburb || a.neighbourhood || a.locality || null,
    city: a.city || a.town || a.village || null,
    state: a.state || null,
    countryCode: a.country_code || null,
    osmId: json.osm_id ? String(json.osm_id) : null
  };
}

export function createNominatimAdapter({ mode, store, liveFetch } = {}) {
  return createAdapter({
    name: ADAPTER_NAME,
    userAgent: USER_AGENT,
    modeEnvVar: 'BHARAT_OS_NOMINATIM_MODE',
    mode,
    defaultMode: 'stub',
    rateLimit: { ratePerSecond: 1 },
    cache: { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 5_000 },
    timeoutMs: 4_000,
    store,
    liveFetch,
    request: ({ lat, lng } = {}) => {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
        throw new Error('lat must be a finite number in [-90, 90].');
      }
      if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
        throw new Error('lng must be a finite number in [-180, 180].');
      }
      const cLat = round1(latNum);
      const cLng = round1(lngNum);
      // The cache key MUST be the bubble1dp - this is the §15
      // binding the adapter substrate enforces by audit grep.
      const cacheKey = `${cLat},${cLng}`;
      return {
        cacheKey,
        // Deterministic stub so demo deployments without
        // BHARAT_OS_NOMINATIM_MODE=live still render something
        // sensible.
        stub: {
          label: `Near point ${cLat}, ${cLng}`,
          suburb: null,
          city: null,
          state: null,
          countryCode: 'in',
          osmId: null
        },
        build: () => {
          const url = new URL(BASE_URL + '/reverse');
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('lat', String(cLat));
          url.searchParams.set('lon', String(cLng));
          url.searchParams.set('zoom', '14');
          url.searchParams.set('addressdetails', '1');
          url.searchParams.set('accept-language', 'en');
          return {
            url: url.toString(),
            init: { method: 'GET' },
            parse: pickPlace
          };
        }
      };
    }
  });
}
