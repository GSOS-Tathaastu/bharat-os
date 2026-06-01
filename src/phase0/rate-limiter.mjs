// In-memory token-bucket rate limiter — Phase 4.1.
//
// Each client (keyed by IP, or by identity ID for authenticated
// routes once we get there) gets a bucket of N tokens that refills
// at a fixed rate. Each request consumes one token. Empty bucket =
// HTTP 429.
//
// In-memory is fine for a single-instance launch. Multi-instance
// production will swap this for a Redis-backed token bucket; the
// public surface (`consume`, `inspect`) stays the same.

export const DEFAULT_RATE_LIMIT_PROTOCOL_VERSION = 'bos.phase0.rate-limiter.v0';

// Per-route policy. Defaults are conservative: 60 r/min general
// reads, 20 r/min mutations, 5 r/min for write-once endpoints
// (identity creation, account deletion). The createLimiter call-
// site picks the policy.
export const DEFAULT_RATE_POLICIES = {
  // General — covers most GETs.
  read: { capacity: 60, refillPerSecond: 1, burst: 60 },
  // Mutating routes — orchestration, mesh contribution, federated.
  write: { capacity: 30, refillPerSecond: 0.5, burst: 30 },
  // Write-once / expensive — identity creation, deletion, export.
  expensive: { capacity: 10, refillPerSecond: 1 / 30, burst: 10 },
  // Health probes — generous; ops needs these.
  probe: { capacity: 600, refillPerSecond: 10, burst: 600 },
  // Per-phone recovery sends — Phase 5.2 SIM-swap defense. 3 sends
  // per hour per normalised phone, INDEPENDENT of client IP. Applied
  // identically to registered and unregistered phones so the 429-vs-
  // 200 distinction doesn't leak whether a phone is a Bharat OS
  // account. Compose with the per-IP `expensive` policy already on
  // /api/recovery/start — both must pass.
  recovery_per_phone: { capacity: 3, refillPerSecond: 3 / 3600, burst: 3 }
};

export function createTokenBucket({ capacity, refillPerSecond, burst, at = Date.now() }) {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error('capacity must be a positive number.');
  }
  if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) {
    throw new Error('refillPerSecond must be a non-negative number.');
  }
  return {
    protocolVersion: DEFAULT_RATE_LIMIT_PROTOCOL_VERSION,
    capacity,
    burst: Math.min(burst ?? capacity, capacity),
    refillPerSecond,
    tokens: capacity,
    lastRefillAt: at
  };
}

function refill(bucket, at) {
  const elapsedSeconds = Math.max(0, (at - bucket.lastRefillAt) / 1000);
  if (elapsedSeconds === 0) return bucket;
  const refilled = bucket.tokens + elapsedSeconds * bucket.refillPerSecond;
  bucket.tokens = Math.min(bucket.capacity, refilled);
  bucket.lastRefillAt = at;
  return bucket;
}

// Try to consume `cost` tokens. Returns
// `{ allowed, remaining, retryAfterSeconds }`.
export function tryConsume(bucket, cost = 1, { at = Date.now() } = {}) {
  refill(bucket, at);
  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return {
      allowed: true,
      remaining: bucket.tokens,
      retryAfterSeconds: 0
    };
  }
  const deficit = cost - bucket.tokens;
  const retryAfterSeconds =
    bucket.refillPerSecond > 0 ? deficit / bucket.refillPerSecond : Infinity;
  return {
    allowed: false,
    remaining: bucket.tokens,
    retryAfterSeconds
  };
}

// Multi-key limiter — one bucket per client key. Encapsulates the
// per-IP / per-identity map so call-sites only deal with
// `consume(key, policyName)`.
export function createLimiter({ policies = DEFAULT_RATE_POLICIES, gcIntervalMs = 60_000 } = {}) {
  const buckets = new Map(); // key → { policyName → bucket }
  let lastGc = Date.now();

  function consume(key, policyName = 'read', cost = 1, { at = Date.now() } = {}) {
    if (!key) throw new Error('key is required.');
    const policy = policies[policyName];
    if (!policy) throw new Error(`unknown policy: ${policyName}`);
    let perKey = buckets.get(key);
    if (!perKey) {
      perKey = new Map();
      buckets.set(key, perKey);
    }
    let bucket = perKey.get(policyName);
    if (!bucket) {
      bucket = createTokenBucket({ ...policy, at });
      perKey.set(policyName, bucket);
    }
    // Garbage-collect stale entries periodically. A key whose every
    // bucket is full hasn't been used recently — drop it.
    if (at - lastGc > gcIntervalMs) {
      for (const [k, perK] of buckets) {
        let allFull = true;
        for (const b of perK.values()) {
          refill(b, at);
          if (b.tokens < b.capacity) {
            allFull = false;
            break;
          }
        }
        if (allFull) buckets.delete(k);
      }
      lastGc = at;
    }
    return tryConsume(bucket, cost, { at });
  }

  function inspect(key, policyName = 'read') {
    const perKey = buckets.get(key);
    if (!perKey) return null;
    const bucket = perKey.get(policyName);
    if (!bucket) return null;
    return {
      capacity: bucket.capacity,
      tokens: bucket.tokens,
      refillPerSecond: bucket.refillPerSecond
    };
  }

  function reset() {
    buckets.clear();
  }

  function stats() {
    return {
      protocolVersion: DEFAULT_RATE_LIMIT_PROTOCOL_VERSION,
      keyCount: buckets.size,
      policies: Object.keys(policies)
    };
  }

  return { consume, inspect, reset, stats };
}

// Classify a path into a policy name. Centralised so the policy
// table is easy to audit. Falls back to 'read' for unknown paths.
export function policyFor(method, pathname) {
  // Health probes — always cheap.
  if (pathname === '/health' || pathname === '/healthz' || pathname === '/readyz' || pathname === '/metrics') {
    return 'probe';
  }
  // Expensive write-once routes.
  if (method === 'POST' && pathname === '/api/identities') return 'expensive';
  if (method === 'DELETE' && pathname.startsWith('/api/identities/')) return 'expensive';
  if (method === 'GET' && pathname.endsWith('/export')) return 'expensive';
  if (method === 'GET' && pathname.endsWith('/erasure-preview')) return 'expensive';
  // Phone OTP — expensive to send (costs real SMS in prod). Verify
  // stays in the cheap 'write' policy because legitimate users may
  // retry.
  if (method === 'POST' && pathname === '/api/phone-otp/send') return 'expensive';
  // Account recovery start — sends SMS AND scans the identity list.
  // Definitely expensive. Verify stays write (retry-friendly).
  if (method === 'POST' && pathname === '/api/recovery/start') return 'expensive';
  // Phase 12.2.3 — attachment upload buffers up to 8 MiB of
  // base64 BEFORE the substrate validates quota / mime. In the
  // 'write' policy (30/min) a single IP could push ~240 MiB/min
  // of decoded base64. 'expensive' lands it in the 10/min
  // bucket so a misbehaving client can't blow through the
  // node's memory allocator.
  if (method === 'POST' && pathname === '/api/attachments') return 'expensive';
  // Mutating routes — anything that POSTs / PUTs / DELETEs.
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    return 'write';
  }
  return 'read';
}

// Extract the client key (IP) from a request. Trusts X-Forwarded-
// For when behind a reverse proxy AND the env var
// BHARAT_OS_TRUST_PROXY=1 is set; otherwise uses the socket address.
export function clientKey(request, { trustProxy = false } = {}) {
  if (trustProxy) {
    const xff = request.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim().length > 0) {
      // First entry is the original client.
      return xff.split(',')[0].trim();
    }
  }
  return (
    request.socket?.remoteAddress ??
    request.connection?.remoteAddress ??
    'unknown'
  );
}
