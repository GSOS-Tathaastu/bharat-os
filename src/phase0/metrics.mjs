// In-memory Prometheus-format metrics — Phase 4.1.
//
// Tracks per-route request counts and latency histograms (without
// PII). The `/metrics` endpoint serves the snapshot in standard
// Prometheus text-exposition format so a scraper (Prometheus,
// Grafana Agent, OpenTelemetry Collector) can pull it without any
// extra integration.
//
// §15: metrics are aggregates over routes + status codes, NEVER
// per-user. Route paths are normalised through `metricPath()` to
// strip identifier segments (e.g. /api/identities/bos:person:abc →
// /api/identities/:id), so the cardinality stays bounded and no
// identityId leaks into log lines / metrics scrapes.

const counters = new Map(); // `${method}|${routePattern}|${status}` → count
const latencyBuckets = new Map(); // `${method}|${routePattern}` → { buckets, sum, count }
const smsCounters = new Map(); // `${provider}|${outcome}` → count — Phase 5.3

// Histogram buckets in seconds, biased toward request latencies we
// actually expect (mostly sub-second).
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Normalise a request pathname into a low-cardinality route pattern
// suitable for metrics. Replaces ID-shaped segments with their
// placeholder. Anything that looks like an opaque ID gets folded.
const ID_SEGMENT_PATTERNS = [
  /^bos:[a-z-]+:[0-9a-f]+$/i, // bos:person:<hex>, bos:consent:<hex>, …
  /^[0-9a-f]{16,}$/i, // long hex IDs
  /^\d{6}$/, // pairing 6-digit code
  /^sha256:[0-9a-f]{64}$/i
];

export function metricPath(pathname) {
  if (!pathname) return '/';
  const segments = pathname.split('/').filter(Boolean);
  const normalised = segments.map((segment) => {
    const decoded = decodeURIComponent(segment);
    for (const pattern of ID_SEGMENT_PATTERNS) {
      if (pattern.test(decoded)) return ':id';
    }
    return decoded;
  });
  return '/' + normalised.join('/');
}

// Phase 5.3 — SMS delivery telemetry. Records one attempt per
// outcome bucket; the fallback-chain provider records ONE entry
// per inner attempt so ops can see which vendor in the chain
// succeeded (or which all failed). Outcomes: 'success' |
// 'rejected' | 'not_configured' | 'error'.
const SMS_OUTCOMES = new Set(['success', 'rejected', 'not_configured', 'error']);
export function recordSmsAttempt({ provider, outcome }) {
  if (!provider || typeof provider !== 'string') return;
  if (!SMS_OUTCOMES.has(outcome)) return;
  const key = `${provider}|${outcome}`;
  smsCounters.set(key, (smsCounters.get(key) ?? 0) + 1);
}

export function smsCounterSnapshot() {
  const out = {};
  for (const [key, value] of smsCounters) {
    out[key] = value;
  }
  return out;
}

export function recordRequest({ method, pathname, status, durationSeconds }) {
  const route = metricPath(pathname);
  const counterKey = `${method}|${route}|${status}`;
  counters.set(counterKey, (counters.get(counterKey) ?? 0) + 1);

  const histogramKey = `${method}|${route}`;
  let entry = latencyBuckets.get(histogramKey);
  if (!entry) {
    entry = {
      buckets: LATENCY_BUCKETS.map(() => 0),
      sum: 0,
      count: 0
    };
    latencyBuckets.set(histogramKey, entry);
  }
  entry.sum += durationSeconds;
  entry.count += 1;
  for (let i = 0; i < LATENCY_BUCKETS.length; i += 1) {
    if (durationSeconds <= LATENCY_BUCKETS[i]) entry.buckets[i] += 1;
  }
}

// Emit Prometheus text-exposition format. One #HELP + #TYPE block
// per metric, then sample lines. Stable ordering so diffs are
// readable.
export function renderMetrics() {
  const lines = [];

  // Counter — bos_api_requests_total
  lines.push('# HELP bos_api_requests_total Total HTTP requests received by the Phase 0 API.');
  lines.push('# TYPE bos_api_requests_total counter');
  const counterKeys = [...counters.keys()].sort();
  for (const key of counterKeys) {
    const [method, route, status] = key.split('|');
    const count = counters.get(key);
    lines.push(
      `bos_api_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${count}`
    );
  }

  // Histogram — bos_api_request_duration_seconds
  lines.push('# HELP bos_api_request_duration_seconds HTTP request latency seen by the Phase 0 API.');
  lines.push('# TYPE bos_api_request_duration_seconds histogram');
  const histogramKeys = [...latencyBuckets.keys()].sort();
  for (const key of histogramKeys) {
    const [method, route] = key.split('|');
    const entry = latencyBuckets.get(key);
    const labelPair = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
    let cumulative = 0;
    for (let i = 0; i < LATENCY_BUCKETS.length; i += 1) {
      cumulative = entry.buckets[i]; // already cumulative because we incremented every bucket <= bound
      lines.push(
        `bos_api_request_duration_seconds_bucket{${labelPair},le="${LATENCY_BUCKETS[i]}"} ${cumulative}`
      );
    }
    lines.push(`bos_api_request_duration_seconds_bucket{${labelPair},le="+Inf"} ${entry.count}`);
    lines.push(`bos_api_request_duration_seconds_sum{${labelPair}} ${entry.sum.toFixed(6)}`);
    lines.push(`bos_api_request_duration_seconds_count{${labelPair}} ${entry.count}`);
  }

  // Phase 5.3 — SMS delivery telemetry per provider + outcome.
  // Operators correlate fallback-chain decisions against vendor-side
  // outages via this counter without parsing log lines.
  lines.push('# HELP bos_sms_send_total SMS send attempts grouped by provider and outcome.');
  lines.push('# TYPE bos_sms_send_total counter');
  const smsKeys = [...smsCounters.keys()].sort();
  for (const key of smsKeys) {
    const [provider, outcome] = key.split('|');
    const count = smsCounters.get(key);
    lines.push(
      `bos_sms_send_total{provider="${escapeLabel(provider)}",outcome="${escapeLabel(outcome)}"} ${count}`
    );
  }

  // Process info — minimal, no PII.
  lines.push('# HELP bos_api_process_uptime_seconds Process uptime in seconds.');
  lines.push('# TYPE bos_api_process_uptime_seconds gauge');
  lines.push(`bos_api_process_uptime_seconds ${process.uptime().toFixed(3)}`);

  return lines.join('\n') + '\n';
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function resetMetrics() {
  counters.clear();
  latencyBuckets.clear();
  smsCounters.clear();
}
