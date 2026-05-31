// Thin fetch wrapper. TanStack Query handles caching + refetch on top
// of this. The dev server proxies /api → :8787; the production build
// is served from the same origin as the API so this works either way.

export interface ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const err = new Error(
      typeof body === 'object' && body && 'error' in body && body.error
        ? (body.error as { message?: string }).message ?? `HTTP ${response.status}`
        : `HTTP ${response.status}`
    ) as ApiError;
    err.status = response.status;
    if (typeof body === 'object' && body && 'error' in body) {
      const e = (body as { error: { code?: string } }).error;
      err.code = e?.code;
    }
    err.body = body;
    throw err;
  }
  return body as T;
}

// Phase 0 identity shape (from /api/identities).
export interface Identity {
  id: string;
  displayName: string;
  publicKeyPem: string;
  attestations?: Record<string, unknown>;
}
