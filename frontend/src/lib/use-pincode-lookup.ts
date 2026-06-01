// Phase 12.2.2 — usePincodeLookup hook.
//
// Wraps GET /api/geocode/pincode/:pin with TanStack Query.
// The query is disabled until the input is a valid 6-digit
// PIN code so we don't burn a fetch on every keystroke.
//
// The KYC L1 wizard uses this to auto-fill the city + state
// from the PIN code field; the citizen confirms before
// submission.

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface PincodePlace {
  pincode: string;
  city: string | null;
  district: string | null;
  state: string | null;
  countryCode: string | null;
  branches: Array<{
    name: string | null;
    branchType: string | null;
    deliveryStatus: string | null;
    district: string | null;
    state: string | null;
  }>;
}

export interface PincodeLookupResult {
  ok: true;
  mode: 'stub' | 'live';
  source: 'stub' | 'cache' | 'live';
  place: PincodePlace;
  latencyMs: number;
  at: string;
}

export function isValidPincode(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[1-9][0-9]{5}$/.test(pin);
}

export function usePincodeLookup(pin: string | null | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  const valid = isValidPincode(pin);
  return useQuery<PincodeLookupResult>({
    queryKey: ['pincode', pin],
    queryFn: () => api<PincodeLookupResult>(`/api/geocode/pincode/${encodeURIComponent(pin as string)}`),
    enabled: enabled && valid,
    // PIN → city/state is essentially immutable, mirror the 24h
    // adapter cache.
    staleTime: 24 * 60 * 60 * 1000,
    retry: false
  });
}
