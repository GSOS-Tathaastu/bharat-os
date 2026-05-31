// Phase 12.1a.1 — Shared geolocation capture hook.
//
// One-shot use: the citizen taps "Use my current location" inside
// a Sheet that has just told them what we'll do with it. We call
// navigator.geolocation.getCurrentPosition with low accuracy
// (enableHighAccuracy: false) — we throw away precision anyway by
// rounding immediately to 1 decimal (~11 km) for citizen searches
// or 4 decimals (~11 m) for provider centroid capture.
//
// Privacy chokepoint: the raw GeolocationPosition is consumed
// inside the success-callback closure. ONLY the rounded value
// crosses a setState boundary. The raw position is never stored,
// never persisted, never visible in React devtools.
//
// Reusable across:
//   • Marketplace discovery (round1 — 11 km).
//   • Provider onboarding ServiceAreaPicker (round4 — 11 m).
//   • Future booking-flow pickup point (round2 — 1.1 km until
//     consent grant unlocks higher precision per booking).

import { useCallback, useState } from 'react';
import { round1, round2, round4, type LatLng } from './geo';

export type GeolocationPrecision = 'coarse' | 'medium' | 'fine';

const PRECISION_ROUND: Record<GeolocationPrecision, (n: number | null | undefined) => number | null> = {
  coarse: round1,   // ~11 km — marketplace search
  medium: round2,   // ~1.1 km — booking pickup-point (consent-gated)
  fine: round4      // ~11 m — provider centroid (publishing self)
};

export interface GeolocationCaptureResult {
  lat: number;
  lng: number;
  precision: GeolocationPrecision;
  capturedAt: string;
}

export type GeolocationStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'denied'; reason: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'captured'; result: GeolocationCaptureResult };

interface UseGeolocationCaptureOptions {
  precision?: GeolocationPrecision;
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
}

export function useGeolocationCapture(options: UseGeolocationCaptureOptions = {}) {
  const { precision = 'coarse', enableHighAccuracy, timeoutMs = 8000 } = options;
  const [status, setStatus] = useState<GeolocationStatus>({ kind: 'idle' });

  const capture = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus({
        kind: 'unavailable',
        reason: 'Your browser does not support location access.'
      });
      return;
    }
    setStatus({ kind: 'pending' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // PRIVACY CHOKEPOINT — round inside the closure before
        // anything reactive can observe the raw coordinates.
        // The default is 'coarse' (1dp ~11 km) for search use;
        // 'fine' (4dp ~11 m) is for the provider publishing
        // their own centroid.
        const rounder = PRECISION_ROUND[precision];
        const lat = rounder(position.coords.latitude);
        const lng = rounder(position.coords.longitude);
        if (lat == null || lng == null) {
          setStatus({
            kind: 'unavailable',
            reason: 'Could not read a usable latitude/longitude from the device.'
          });
          return;
        }
        setStatus({
          kind: 'captured',
          result: {
            lat,
            lng,
            precision,
            capturedAt: new Date().toISOString()
          }
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus({
            kind: 'denied',
            reason: 'Location permission was declined. You can still pick a city manually.'
          });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus({
            kind: 'unavailable',
            reason: 'Your device could not determine its location right now.'
          });
        } else if (err.code === err.TIMEOUT) {
          setStatus({
            kind: 'unavailable',
            reason: 'Location request timed out. Try again or pick a city.'
          });
        } else {
          setStatus({
            kind: 'unavailable',
            reason: err.message || 'Location request failed.'
          });
        }
      },
      {
        enableHighAccuracy: enableHighAccuracy ?? (precision === 'fine'),
        timeout: timeoutMs,
        maximumAge: 0
      }
    );
  }, [precision, enableHighAccuracy, timeoutMs]);

  const reset = useCallback(() => setStatus({ kind: 'idle' }), []);

  return { status, capture, reset };
}

// Verbatim consent copy used by LocationConsentSheet. Exported so
// any future surface can render the same wording (consistency
// across the platform is a binding).
export const LOCATION_CONSENT_COPY = {
  title: 'Use your location?',
  body: 'Bharat OS will use your phone\'s location ONCE for this search. We round it to ~11 km before sending. Your exact location is NEVER stored on our servers and NEVER shared with providers.',
  useButton: 'Use my location once',
  cityButton: 'Pick a city instead',
  cancelButton: 'Cancel'
};

export const PROVIDER_CONSENT_COPY = {
  title: 'Set your service area',
  body: 'Citizens searching for help will see this pin on a map. Pick a landmark near you — like a station, market, or school — NOT your exact home address. You can change this anytime.',
  useButton: 'Use my current location',
  cityButton: 'Pick a city instead',
  cancelButton: 'Cancel'
};
