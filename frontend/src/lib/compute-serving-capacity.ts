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

// Phase 13.7.1 — dispatch entity (BE-defined). FE↔BE convergence
// test asserts the status set matches src/phase1/compute-serving-dispatch.mjs.

export const COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION = 'bos.phase13.compute-serving-dispatch.v1';

export const COMPUTE_SERVING_DISPATCH_STATUSES = Object.freeze([
  'pending',
  'served',
  'expired',
  'failed'
] as const);
export type ComputeServingDispatchStatus = (typeof COMPUTE_SERVING_DISPATCH_STATUSES)[number];

export const COMPUTE_SERVING_DISPATCH_STATUS_LABEL: Record<ComputeServingDispatchStatus, string> = {
  pending: 'Pending',
  served: 'Served',
  expired: 'Expired',
  failed: 'Failed'
};

export interface ComputeServingDispatch {
  dispatchId: string;
  requesterId: string;
  workerId: string;
  capacityId: string;
  promptHash: string;
  estimatedTokens: number;
  actualTokens: number | null;
  responseHash: string | null;
  payoutPaise: number | null;
  protocolVersion: typeof COMPUTE_SERVING_DISPATCH_PROTOCOL_VERSION;
  status: ComputeServingDispatchStatus;
  requestedAt: string;
  servedAt: string | null;
  expiresAt: string;
  meshContributionEventId: string | null;
  failureReason: string | null;
}

export interface ComputeServingDispatchesResponse {
  dispatches: ComputeServingDispatch[];
  protocolVersion: string;
  supportedStatuses: readonly string[];
}

/**
 * Compute the sha256:<hex64> pointer for an arbitrary text payload
 * via the Web Crypto API. Used by the citizen-side test-dispatch
 * card to derive `promptHash` from a typed prompt + by the
 * worker-side serve UI to derive `responseHash` from a typed
 * response. v1 demo only — encryption substrate from 13.7.3 will
 * replace this with a proper key-exchange flow.
 */
export async function sha256Pointer(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
