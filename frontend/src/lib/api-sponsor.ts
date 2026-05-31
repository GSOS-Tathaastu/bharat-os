import { api, type ApiError } from './api';
import { useSponsorAuthStore } from './sponsor-auth-store';

// Phase 12.0.5 — Authorization: Bearer header injector for
// sponsor-bearer-gated endpoints. Token is read from the Zustand
// store at call time (NOT closed over), so a sign-out + sign-in
// with a fresh token works without re-creating hook factories.

export interface SponsorApiOptions extends RequestInit {
  /** Override the stored token (used by the entry-page probe). */
  bearerOverride?: string;
}

function getToken(override?: string): string {
  if (override) return override;
  const t = useSponsorAuthStore.getState().bearerToken;
  if (!t) {
    const err = new Error('sponsor token missing') as ApiError;
    err.status = 401;
    err.code = 'missing_authorization';
    throw err;
  }
  return t;
}

/**
 * JSON-typed wrapper for sponsor-bearer endpoints. Injects the
 * Authorization header on top of the existing `api()` shape.
 */
export async function apiWithBearer<T = unknown>(
  path: string,
  { bearerOverride, ...init }: SponsorApiOptions = {}
): Promise<T> {
  const token = getToken(bearerOverride);
  return api<T>(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`
    }
  });
}

/**
 * Raw fetch for the NDJSON export endpoints. Returns the Response
 * so callers can `.text()`/`.blob()` and parse newline-delimited
 * JSON without going through the JSON wrapper.
 *
 * Throws on 401/403 so the SponsorSurface auth guard can react
 * (the export mutation rethrows; the guard subscribes to query
 * cache errors with .status set).
 */
export async function fetchWithBearer(
  path: string,
  { bearerOverride, ...init }: SponsorApiOptions = {}
): Promise<Response> {
  const token = getToken(bearerOverride);
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`
    }
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error(
      `sponsor request failed: HTTP ${res.status}`
    ) as ApiError;
    err.status = res.status;
    err.code = res.status === 401 ? 'invalid_token' : 'forbidden';
    throw err;
  }
  return res;
}
