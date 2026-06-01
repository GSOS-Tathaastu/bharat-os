// Phase 12.2.1 — Generic external-API adapter substrate.
//
// What this module is.
//
//   The base pattern every future Bharat OS integration with an
//   external API (DigiLocker, Aadhaar e-KYC, GST verification,
//   UPI rails, NPCI, …) composes. It enforces the §15 binding
//   surface — rate limiting, polite User-Agent, audit ledger
//   emission, response cache, stub-vs-live toggle — once, so
//   each adapter is just (URL builder, response normaliser).
//
// §15 bindings:
//
//   • Audit ledger emits the request meta (adapter name, URL
//     path, HTTP status, latency, cache-hit) but NEVER the
//     response body — third-party PII never lands on the
//     ledger. The caller chooses whether the normalised
//     response is persisted on the citizen's own record.
//
//   • Stub-vs-live mode is env-configurable per adapter and
//     defaults to STUB. A demo deployment with no UIDAI/
//     DigiLocker keys still produces deterministic responses
//     so the UI flows can be smoke-tested without burning a
//     real Aadhaar OTP.
//
//   • Pointer-not-payload on cache. The cache key MUST be
//     coarsened (eg `bubble1dp` for geo) by the caller — the
//     substrate stores whatever key it's handed but the
//     binding-grep enforces that adapters never feed a 4dp
//     coord as a cache key.
//
//   • Polite citizenship. Every live call ships
//     `User-Agent: BharatOS/<version> (contact)`. Rate limit
//     defaults are intentionally conservative; adapters can
//     tighten but never loosen.

import { logger as defaultLogger } from './logger.mjs';

export const EXTERNAL_ADAPTER_PROTOCOL_VERSION = 'bos.phase0.external-adapter.v0';

export const ADAPTER_MODES = ['stub', 'live'];

const DEFAULT_RATE_LIMIT_RPS = 1;            // 1 request per second
const DEFAULT_CACHE_TTL_MS = 30 * 60_000;    // 30 minutes
const DEFAULT_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_TIMEOUT_MS = 6_000;

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

// In-memory LRU cache. Tiny — no eviction strategy beyond
// max-size + TTL. Per-adapter so two adapters don't share keys.
function createLruCache({ maxEntries = DEFAULT_CACHE_MAX_ENTRIES, ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const map = new Map();
  function evictExpired() {
    const cutoff = nowMs() - ttlMs;
    for (const [k, v] of map) {
      if (v.at < cutoff) map.delete(k);
    }
  }
  function get(key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.at < nowMs() - ttlMs) {
      map.delete(key);
      return null;
    }
    // Refresh recency.
    map.delete(key);
    map.set(key, entry);
    return entry.value;
  }
  function set(key, value) {
    if (map.has(key)) map.delete(key);
    map.set(key, { value, at: nowMs() });
    if (map.size > maxEntries) {
      // Evict the oldest.
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
  }
  function clear() {
    map.clear();
  }
  return { get, set, clear, evictExpired, size: () => map.size };
}

// Per-adapter rate limiter — token bucket. Conservative default:
// 1 request per second.
function createRateLimiter({ ratePerSecond = DEFAULT_RATE_LIMIT_RPS } = {}) {
  let tokens = 1;
  let lastRefillMs = nowMs();
  const intervalMs = 1000 / Math.max(ratePerSecond, 0.001);
  function refill() {
    const elapsed = nowMs() - lastRefillMs;
    if (elapsed > 0) {
      tokens = Math.min(1, tokens + elapsed / intervalMs);
      lastRefillMs = nowMs();
    }
  }
  function tryConsume() {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return { ok: true, retryAfterMs: 0 };
    }
    const needed = 1 - tokens;
    return { ok: false, retryAfterMs: Math.ceil(needed * intervalMs) };
  }
  return { tryConsume };
}

// readMode reads the adapter's mode from process.env.<envVar> with
// a default. Invalid values fall back to the default + warn.
function readMode({ envVar, defaultMode = 'stub', logger = defaultLogger } = {}) {
  if (!envVar) return defaultMode;
  const raw = (process.env[envVar] || '').trim().toLowerCase();
  if (!raw) return defaultMode;
  if (!ADAPTER_MODES.includes(raw)) {
    logger.warn('adapter_mode_invalid', { envVar, observed: raw, fallback: defaultMode });
    return defaultMode;
  }
  return raw;
}

export class ExternalAdapterError extends Error {
  constructor({ code, message, status }) {
    super(message);
    this.name = 'ExternalAdapterError';
    this.code = code;
    this.status = status;
  }
}

// createAdapter — returns an adapter instance with `call(args)`.
//
// Required:
//   - name: short kebab id (eg 'osm-nominatim'). Used in
//     ledger events.
//   - userAgent: required for live mode (polite citizenship).
//
// Optional:
//   - mode: 'stub' | 'live'. Defaults from `modeEnvVar` env var
//     or 'stub'.
//   - rateLimit: { ratePerSecond }.
//   - cache: { ttlMs, maxEntries }.
//   - timeoutMs: live-call timeout (default 6s).
//   - liveFetch: replaces global fetch for tests.
//   - store: when provided, audit events are appended via
//     store.appendLedger.
//   - logger: structured logger; defaults to phase0 logger.
//
// The caller-provided `request(args)` must return:
//   { cacheKey: string, stub: any, build: () => {url, init, parse} }
// stub: the body the adapter returns in stub mode (deterministic).
// build.url: full URL to call in live mode.
// build.init: optional fetch init (the adapter merges in
//             User-Agent + Accept).
// build.parse: optional response → normalised body transform.
export function createAdapter({
  name,
  userAgent,
  request,
  mode,
  modeEnvVar,
  rateLimit = {},
  cache = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  liveFetch,
  store,
  logger = defaultLogger,
  defaultMode = 'stub'
} = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('createAdapter: name is required.');
  }
  if (typeof request !== 'function') {
    throw new Error('createAdapter: request(args) function is required.');
  }
  const resolvedMode = mode || readMode({ envVar: modeEnvVar, defaultMode, logger });
  if (resolvedMode === 'live' && (!userAgent || typeof userAgent !== 'string')) {
    throw new Error('createAdapter: userAgent is required when mode is "live".');
  }
  const lru = createLruCache(cache);
  const limiter = createRateLimiter(rateLimit);
  const fetchImpl = typeof liveFetch === 'function' ? liveFetch : (typeof fetch === 'function' ? fetch : null);

  async function appendAudit(event) {
    if (!store || typeof store.appendLedger !== 'function') return;
    try { await store.appendLedger(event); } catch (_) { /* best-effort */ }
  }

  async function call(args, options = {}) {
    const at = nowIso();
    const startedMs = nowMs();
    let descriptor;
    try {
      descriptor = request(args);
    } catch (err) {
      throw new ExternalAdapterError({ code: 'adapter_invalid_request', status: 400, message: err.message });
    }
    if (!descriptor || typeof descriptor !== 'object' || !descriptor.cacheKey) {
      throw new ExternalAdapterError({ code: 'adapter_invalid_request', status: 400, message: 'descriptor.cacheKey required.' });
    }
    const cacheKey = String(descriptor.cacheKey);
    // Cache hit.
    if (!options.skipCache) {
      const cached = lru.get(cacheKey);
      if (cached) {
        await appendAudit({
          type: 'external_adapter.call',
          adapter: name,
          mode: resolvedMode,
          cacheKey,
          status: 'cache_hit',
          latencyMs: nowMs() - startedMs,
          at
        });
        return { source: 'cache', mode: resolvedMode, body: cached };
      }
    }
    // Stub mode.
    if (resolvedMode === 'stub') {
      const stubBody = descriptor.stub ?? null;
      if (stubBody != null && !options.skipCache) lru.set(cacheKey, stubBody);
      await appendAudit({
        type: 'external_adapter.call',
        adapter: name,
        mode: 'stub',
        cacheKey,
        status: 'stub_ok',
        latencyMs: nowMs() - startedMs,
        at
      });
      return { source: 'stub', mode: 'stub', body: stubBody };
    }
    // Live mode.
    if (!fetchImpl) {
      throw new ExternalAdapterError({ code: 'no_fetch', status: 500, message: 'fetch is not available in this runtime.' });
    }
    const built = typeof descriptor.build === 'function' ? descriptor.build() : descriptor.build;
    if (!built || !built.url) {
      throw new ExternalAdapterError({ code: 'adapter_invalid_request', status: 400, message: 'descriptor.build().url required.' });
    }
    const rate = limiter.tryConsume();
    if (!rate.ok) {
      throw new ExternalAdapterError({ code: 'rate_limited', status: 429, message: `adapter ${name} is rate-limited; retry in ${rate.retryAfterMs}ms.` });
    }
    const init = { ...(built.init || {}) };
    const headers = { ...(init.headers || {}) };
    if (!headers['User-Agent']) headers['User-Agent'] = userAgent;
    if (!headers['Accept']) headers['Accept'] = 'application/json';
    init.headers = headers;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    init.signal = init.signal || controller.signal;
    let response;
    try {
      response = await fetchImpl(built.url, init);
    } catch (err) {
      clearTimeout(t);
      await appendAudit({
        type: 'external_adapter.call',
        adapter: name,
        mode: 'live',
        cacheKey,
        status: 'network_error',
        latencyMs: nowMs() - startedMs,
        at
      });
      throw new ExternalAdapterError({ code: 'network_error', status: 502, message: err?.message || 'network error' });
    }
    clearTimeout(t);
    if (!response.ok) {
      await appendAudit({
        type: 'external_adapter.call',
        adapter: name,
        mode: 'live',
        cacheKey,
        status: 'http_' + response.status,
        latencyMs: nowMs() - startedMs,
        at
      });
      throw new ExternalAdapterError({ code: 'upstream_error', status: 502, message: `${name} upstream returned ${response.status}` });
    }
    let parsed;
    try {
      const json = await response.json();
      parsed = typeof built.parse === 'function' ? built.parse(json) : json;
    } catch (err) {
      throw new ExternalAdapterError({ code: 'parse_error', status: 502, message: `${name} response parse failed: ${err.message}` });
    }
    if (parsed != null && !options.skipCache) lru.set(cacheKey, parsed);
    await appendAudit({
      type: 'external_adapter.call',
      adapter: name,
      mode: 'live',
      cacheKey,
      status: 'live_ok',
      latencyMs: nowMs() - startedMs,
      at
    });
    return { source: 'live', mode: 'live', body: parsed };
  }

  return {
    name,
    mode: resolvedMode,
    call,
    clearCache: () => lru.clear(),
    inspectCache: () => lru.size()
  };
}
