// Phase 12.1a.1 — Marketplace discovery.
//
// Filtering + ranking over Phase 12.0 providerIdentity records.
// Given a citizen's coarse origin (lat/lng rounded to 1 decimal
// at the API boundary — see /api/marketplace/providers) and an
// optional role filter, return active providers whose service-
// area circle overlaps the citizen's search bubble, ranked by
// KYC level then distance.
//
// The geo math itself lives in src/phase0/geo.mjs (shared with
// any other module that needs it — booking-escrow pickup-point
// matching, mesh node locality, regulator audits coarsened by
// bucket). This module is the marketplace-specific layer over
// those primitives.
//
// §15 bindings the module enforces:
//
//   • NO commission. There is no take-rate, fee, or commission
//     anywhere in this file or in the API response. Native
//     marketplace = pointer between citizen and provider. Bharat
//     OS earns from the §13B compute/data side, not from booking
//     flow (memory/citizen-data-as-product-revenue).
//
//   • ONDC SUPPRESSED. This module NEVER imports tools.mjs (which
//     hosts the ondc-beckn bridge stub). The discovery endpoint
//     is native-only by construction. A binding-test in
//     marketplace-discovery.test.mjs greps the source.
//
//   • CITIZEN LOCATION NOT ECHOED. The ranking helpers operate on
//     numbers; nothing about the citizen's identity is part of the
//     ranking key. The API layer is responsible for emitting the
//     marketplace.searched ledger event with only coarse buckets
//     (1-decimal ~11 km) and NO userId. See api.mjs.
//
//   • PROVIDER CENTROID COARSENED. Distance is computed against
//     the provider's full 4-decimal centroid for accuracy; the
//     API layer is responsible for emitting publicProviderRecord
//     which coarsens the centroid to 2 decimals (~1.1 km) before
//     the response leaves the server.

import {
  haversineMeters,
  distanceBand,
  bubblesOverlap
} from '../phase0/geo.mjs';

// Re-export shared geo primitives so marketplace consumers (tests,
// FE contract tooling) can import a single coherent surface for
// "marketplace + the geo math it relies on".
export { haversineMeters, distanceBand, bubblesOverlap };

// KYC rank for the (kycLevel desc, distance asc) sort. Higher
// KYC providers rank above lower at equal distance. We do NOT
// rank-boost by activatedAt, ratings, or earnings — both because
// those signals don't exist yet (ratings ship 12.1a.2+, Trust
// Passport feedback loop is 12.2) and because we don't want a
// rich-get-richer dynamic on cold-start providers.
export function kycRank(level) {
  if (level === 'verified') return 3;
  if (level === 'basic') return 2;
  return 1;
}

// Hard caps for citizen query — lower than the provider-side
// schema cap (50 km) to prevent accidental statewide enumeration
// scraping. Default 5 km matches the typical "near-me" intent
// without an explicit radius.
export const DEFAULT_QUERY_RADIUS_M = 5_000;
export const MAX_QUERY_RADIUS_M = 25_000;

// Filter + rank active providers around an origin.
//
// Filter:
//   - status === 'active'
//   - role === query.role (if provided)
//   - serviceArea.kind === 'point-radius' with finite center
//   - bubble-overlap: haversine(origin, provider.center) <=
//     (queryRadius + provider.radiusMeters). Generous overlap:
//     citizen may be inside provider's circle even if provider is
//     just outside citizen's; either match counts.
//
// Rank: (kycRank desc, distanceMeters asc). Tiebreak by
// providerIdentityId for stable sort.
export function rankProviders({
  origin,
  candidates,
  radiusMeters = DEFAULT_QUERY_RADIUS_M,
  role = null,
  limit = 30
} = {}) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return [];
  }
  if (!Array.isArray(candidates)) return [];
  // EC-3 (adversarial review) — explicit 0 or NaN falls through to
  // the default rather than producing an empty bubble that silently
  // returns no results to the caller.
  const requested = Number(radiusMeters);
  const queryRadius = Math.min(
    Math.max(
      Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_QUERY_RADIUS_M,
      100
    ),
    MAX_QUERY_RADIUS_M
  );

  const matches = [];
  for (const p of candidates) {
    if (!p || p.status !== 'active') continue;
    if (role && p.roleKind !== role) continue;
    const area = p.serviceArea;
    if (!area || area.kind !== 'point-radius' || !area.center) continue;
    if (!Number.isFinite(area.center.lat) || !Number.isFinite(area.center.lng)) continue;
    const distanceMeters = haversineMeters(origin, area.center);
    if (!Number.isFinite(distanceMeters)) continue;
    const providerRadius = Number(area.radiusMeters) || 0;
    if (!bubblesOverlap({ origin, target: area.center, queryRadiusMeters: queryRadius, targetRadiusMeters: providerRadius })) continue;
    matches.push({
      provider: p,
      distanceMeters,
      withinServiceRadius: distanceMeters <= providerRadius
    });
  }

  matches.sort((a, b) => {
    const ka = kycRank(a.provider.kycLevel);
    const kb = kycRank(b.provider.kycLevel);
    if (ka !== kb) return kb - ka;
    if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
    return String(a.provider.providerIdentityId).localeCompare(String(b.provider.providerIdentityId));
  });

  const cap = Math.min(Math.max(Number(limit) || 0, 1), 100);
  return matches.slice(0, cap);
}
