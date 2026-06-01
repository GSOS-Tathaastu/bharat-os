// Phase 12.2.1 — PickupAreaHint.
//
// Reads a lat/lng (or a "lat,lng" 1dp bubble string) and renders
// the human-readable "Near Shivajinagar, Pune" label using the
// reverse-geocode API. Renders nothing while loading / on error
// so the existing fallback text stays visible.

import { formatPlaceLabel, useReverseGeocode } from '@/lib/use-reverse-geocode';

interface Props {
  lat?: number | null;
  lng?: number | null;
  bubble1dp?: string | null;
  className?: string;
}

function parseBubble(b: string | null | undefined): { lat: number; lng: number } | null {
  if (!b) return null;
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(b.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function PickupAreaHint({ lat, lng, bubble1dp, className }: Props) {
  const fromBubble = parseBubble(bubble1dp);
  const useLat = lat != null ? lat : fromBubble?.lat ?? null;
  const useLng = lng != null ? lng : fromBubble?.lng ?? null;
  const query = useReverseGeocode({ lat: useLat, lng: useLng });
  if (query.isPending || query.isError || !query.data) return null;
  const label = formatPlaceLabel(query.data.place);
  if (!label) return null;
  return (
    <p className={className ?? 'mt-1 text-caption text-text-muted'}>
      Near {label}
    </p>
  );
}
