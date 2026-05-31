// Phase 12.1a.2 — Distance formatting.
//
// Zero-dep helpers for rendering distance fields on booking
// surfaces. Pairs with distanceBand (geo.ts) — distanceBand is
// for marketplace browse (intentionally coarse), formatDistance
// is for booking + active-trip displays where the citizen has
// already consented to share their pickup.

export function formatDistanceMeters(meters: number | null | undefined): string {
  if (meters == null) return '—';
  const n = Number(meters);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 950) return `${Math.round(n / 10) * 10} m`;
  const km = n / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
