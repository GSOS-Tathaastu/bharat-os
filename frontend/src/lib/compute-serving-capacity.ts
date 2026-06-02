// Phase 13.7 — FE types + helpers for compute-serving-capacity.
// Mirrors src/phase1/compute-serving-capacity.mjs. Convergence
// tests in vitest + Node assert the enums match.

export const COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION = 'bos.phase13.compute-serving-capacity.v1';

export const COMPUTE_SERVING_CAPACITY_STATUSES = Object.freeze([
  'active',
  'paused',
  'revoked',
  'expired'
] as const);
export type ComputeServingCapacityStatus = (typeof COMPUTE_SERVING_CAPACITY_STATUSES)[number];

export const COMPUTE_SERVING_STATUS_LABEL: Record<ComputeServingCapacityStatus, string> = {
  active: 'Serving',
  paused: 'Paused',
  revoked: 'Revoked',
  expired: 'Expired'
};

export interface ComputeServingConstraints {
  batteryMinPercent: number;
  requireWifi: boolean;
  requireCharging: boolean;
}

export interface ComputeServingCapacity {
  capacityId: string;
  workerId: string;
  pricePerKTokensPaise: number;
  maxConcurrent: number;
  maxDailyTokens: number;
  constraints: ComputeServingConstraints;
  protocolVersion: typeof COMPUTE_SERVING_CAPACITY_PROTOCOL_VERSION;
  status: ComputeServingCapacityStatus;
  publishedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  pausedAt: string | null;
}

export interface ComputeServingCapacitiesResponse {
  capacities: ComputeServingCapacity[];
  protocolVersion: string;
  supportedStatuses: readonly string[];
}

// Default form values per spec — ₹2/1000 tokens, 2 concurrent,
// 100k tokens/day, 30% battery + WiFi + charging.
export const DEFAULT_PRICE_PER_K_PAISE = 200;
export const DEFAULT_MAX_CONCURRENT = 2;
export const DEFAULT_MAX_DAILY_TOKENS = 100_000;
export const DEFAULT_BATTERY_MIN_PERCENT = 30;
export const DEFAULT_TTL_DAYS = 30;

export function defaultExpiresAt(days = DEFAULT_TTL_DAYS): string {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function formatPricePerKTokens(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} / 1000 tokens`;
}
