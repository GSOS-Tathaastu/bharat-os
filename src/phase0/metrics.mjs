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
const smsCircuitStates = new Map(); // `${provider}` → 0|1|2 — Phase 5.4
const smsInflight = new Map(); // `${provider}` → integer count — Phase 5.8
const pushCounters = new Map(); // `${vendor}|${outcome}` → count — Phase 7.3
// Phase 5.6 — backup age. `recordBackupAge({ ageSeconds, … })` is
// called by the /api/admin/backup-status handler so the freshness
// data feeds both the JSON endpoint AND /metrics from a single
// readdir+stat. The latest snapshot's `createdAt` is also recorded
// so we can render it as a *Unix-timestamp* gauge (the Prometheus
// idiom for "when did X last happen").
let latestBackupAt = null; // ms-since-epoch, or null when no snapshots
let latestBackupBytes = null;
let latestBackupKind = null;

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

// Phase 5.4 — SMS provider circuit-breaker state. Numeric so it
// renders as a Prometheus gauge: 0 = closed (healthy), 1 =
// half_open (probing), 2 = open (skipping calls). Ops can alert on
// `bos_sms_circuit_state >= 2` for any provider in the chain.
const CIRCUIT_STATE_VALUES = Object.freeze({ closed: 0, half_open: 1, open: 2 });
export function recordCircuitState(provider, state) {
  if (!provider || typeof provider !== 'string') return;
  const numeric = CIRCUIT_STATE_VALUES[state];
  if (typeof numeric !== 'number') return;
  smsCircuitStates.set(provider, numeric);
}

export function circuitStateSnapshot() {
  const out = {};
  for (const [provider, value] of smsCircuitStates) {
    out[provider] = value;
  }
  return out;
}

// Phase 5.8 — SMS bulkhead in-flight gauge. Updated by the
// bulkhead wrapper on every enter / exit. Operators alert on
// `bos_sms_inflight{provider="..."} >= maxConcurrent for 30s` to
// catch a hung vendor before its calls finally time out.
export function recordSmsInflight(provider, value) {
  if (!provider || typeof provider !== 'string') return;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return;
  smsInflight.set(provider, Math.floor(n));
}

export function smsInflightSnapshot() {
  const out = {};
  for (const [provider, value] of smsInflight) {
    out[provider] = value;
  }
  return out;
}

// Phase 7.3 — Web Push delivery telemetry. Vendor is the push
// service host family ('fcm' / 'autopush' / 'wns' / 'other') —
// extracted by web-push.mjs `pushVendor()`. Outcome enum mirrors
// SMS: 'success' / 'gone' (HTTP 410, subscription invalidated) /
// 'rate_limited' (HTTP 429) / 'rejected' (4xx/5xx) /
// 'network_error' / 'retried_success' (succeeded on retry).
const PUSH_OUTCOMES = new Set([
  'success',
  'gone',
  'rate_limited',
  'rejected',
  'network_error',
  'retried_success'
]);
export function recordPushAttempt({ vendor, outcome }) {
  if (!vendor || typeof vendor !== 'string') return;
  if (!PUSH_OUTCOMES.has(outcome)) return;
  const key = `${vendor}|${outcome}`;
  pushCounters.set(key, (pushCounters.get(key) ?? 0) + 1);
}

export function pushCounterSnapshot() {
  const out = {};
  for (const [key, value] of pushCounters) out[key] = value;
  return out;
}

// Phase 5.6 — backup freshness. Records the most recent snapshot's
// timestamp so /metrics can expose:
//   • bos_backup_latest_timestamp_seconds (gauge, unix epoch)
//   • bos_backup_latest_age_seconds (gauge, derived at render time)
//   • bos_backup_latest_bytes (gauge)
// Pass `null`/missing values to clear (e.g. after a backup-dir
// purge in a test). The values persist between scrapes — the
// admin endpoint refreshes them on every call.
export function recordBackupFreshness({ createdAt, bytes, kind } = {}) {
  if (createdAt === null || createdAt === undefined) {
    latestBackupAt = null;
    latestBackupBytes = null;
    latestBackupKind = null;
    return;
  }
  const ms = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt);
  if (!Number.isFinite(ms)) return;
  latestBackupAt = ms;
  latestBackupBytes = Number.isFinite(bytes) ? bytes : null;
  latestBackupKind = typeof kind === 'string' ? kind : null;
}

export function backupFreshnessSnapshot() {
  return {
    latestBackupAt,
    latestBackupBytes,
    latestBackupKind
  };
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

  // Phase 5.4 — SMS provider circuit-breaker state. Gauge so ops
  // can alert on `bos_sms_circuit_state{provider="..."} >= 2`.
  lines.push(
    '# HELP bos_sms_circuit_state SMS provider circuit-breaker state. 0 = closed, 1 = half-open, 2 = open.'
  );
  lines.push('# TYPE bos_sms_circuit_state gauge');
  const circuitKeys = [...smsCircuitStates.keys()].sort();
  for (const provider of circuitKeys) {
    const value = smsCircuitStates.get(provider);
    lines.push(`bos_sms_circuit_state{provider="${escapeLabel(provider)}"} ${value}`);
  }

  // Phase 5.8 — SMS bulkhead in-flight count per provider. Alert
  // rule: `bos_sms_inflight{provider="..."} >= max_concurrent for
  // 30s` catches a hung vendor before its calls finally time out.
  lines.push('# HELP bos_sms_inflight SMS sends currently in flight per provider.');
  lines.push('# TYPE bos_sms_inflight gauge');
  const inflightKeys = [...smsInflight.keys()].sort();
  for (const provider of inflightKeys) {
    const value = smsInflight.get(provider);
    lines.push(`bos_sms_inflight{provider="${escapeLabel(provider)}"} ${value}`);
  }

  // Phase 7.3 — Web Push delivery telemetry per vendor + outcome.
  // PromQL ratio example:
  //   rate(bos_push_send_total{vendor="fcm",outcome="success"}[5m])
  //     / rate(bos_push_send_total{vendor="fcm"}[5m])
  lines.push(
    '# HELP bos_push_send_total Web Push send attempts grouped by vendor (push-service family) and outcome.'
  );
  lines.push('# TYPE bos_push_send_total counter');
  const pushKeys = [...pushCounters.keys()].sort();
  for (const key of pushKeys) {
    const [vendor, outcome] = key.split('|');
    const count = pushCounters.get(key);
    lines.push(
      `bos_push_send_total{vendor="${escapeLabel(vendor)}",outcome="${escapeLabel(outcome)}"} ${count}`
    );
  }

  // Phase 5.6 — backup freshness gauges. Emitted unconditionally:
  // when no snapshot exists yet, age is rendered as NaN (Prometheus
  // accepts NaN; Grafana renders it as a gap) so ops alerts trigger.
  lines.push('# HELP bos_backup_latest_timestamp_seconds Unix epoch (seconds) of the most recent successful snapshot. 0 when no snapshot has been observed.');
  lines.push('# TYPE bos_backup_latest_timestamp_seconds gauge');
  const tsSec = latestBackupAt === null ? 0 : Math.floor(latestBackupAt / 1000);
  lines.push(`bos_backup_latest_timestamp_seconds ${tsSec}`);

  lines.push('# HELP bos_backup_latest_age_seconds Seconds since the most recent snapshot was created. NaN when no snapshot has been observed.');
  lines.push('# TYPE bos_backup_latest_age_seconds gauge');
  const ageSec = latestBackupAt === null
    ? 'NaN'
    : Math.max(0, Math.floor((Date.now() - latestBackupAt) / 1000));
  lines.push(`bos_backup_latest_age_seconds ${ageSec}`);

  lines.push('# HELP bos_backup_latest_bytes Size in bytes of the most recent snapshot. 0 when no snapshot has been observed.');
  lines.push('# TYPE bos_backup_latest_bytes gauge');
  lines.push(`bos_backup_latest_bytes ${latestBackupBytes ?? 0}`);

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
  smsCircuitStates.clear();
  smsInflight.clear();
  pushCounters.clear();
  latestBackupAt = null;
  latestBackupBytes = null;
  latestBackupKind = null;
}
