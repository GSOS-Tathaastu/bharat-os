// Structured JSON logger — Phase 4.1.
//
// One log line per event, JSON-formatted, written to stdout for
// container log scrapers (Loki / Cloudwatch / GCP Logging). The
// format intentionally OMITS user PII — log lines may travel to
// third-party log aggregators, and §15 forbids that route from
// carrying user data.
//
// Severity levels follow syslog convention:
//   ERROR   — request failed, action did not complete
//   WARN    — recoverable failure (e.g. rate-limited)
//   INFO    — significant lifecycle event (server start, shutdown)
//   ACCESS  — one line per HTTP request, with timing
//   DEBUG   — verbose; off by default; set BHARAT_OS_LOG_LEVEL=debug
//
// PII-safe fields:
//   identityId  ALLOWED as identifier-only (not name, not phone)
//   path        ALLOWED but query strings are stripped
//   method      ALLOWED
//   status      ALLOWED
//   userAgent   ALLOWED (necessary for cohort debugging)
//   requestId   ALLOWED (random per-request UUID)
//
// PII-forbidden — these MUST NEVER appear in log lines:
//   displayName, email, phone, address, intent text, gradient hashes
//   from accepted federated rounds, attestation claim values,
//   anything from request bodies.

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, ACCESS: 2, DEBUG: 3 };

const DEFAULT_LEVEL =
  (typeof process !== 'undefined' && process.env?.BHARAT_OS_LOG_LEVEL?.toLowerCase()) ||
  'info';

const LEVEL_NUMERIC = LEVELS[DEFAULT_LEVEL.toUpperCase()] ?? LEVELS.INFO;

// Fields we will silently scrub if a caller accidentally passes
// them (defence-in-depth).
const PII_FORBIDDEN_KEYS = new Set([
  'displayName',
  'email',
  'phone',
  'phoneNumber',
  'address',
  'aadhaar',
  'aadhaarNumber',
  'pan',
  'panNumber',
  'intentText',
  'recoveryPhrase',
  'privateKeyPem',
  'vaultKeyBase64',
  'gradientBytesBase64'
]);

function scrub(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FORBIDDEN_KEYS.has(key)) {
      out[key] = '<scrubbed>';
    } else if (value && typeof value === 'object') {
      out[key] = scrub(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level, message, context = {}) {
  if (LEVELS[level] > LEVEL_NUMERIC) return; // below configured level
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...scrub(context)
  });
  // Write to stderr for ERROR / WARN, stdout for everything else
  // (matches Docker / k8s convention).
  if (level === 'ERROR' || level === 'WARN') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  error: (message, context) => emit('ERROR', message, context),
  warn: (message, context) => emit('WARN', message, context),
  info: (message, context) => emit('INFO', message, context),
  access: (message, context) => emit('ACCESS', message, context),
  debug: (message, context) => emit('DEBUG', message, context)
};

// Generate a request ID. Crypto-strong if SubtleCrypto is around
// (Node 18+); falls back to a Math.random hex for older runtimes.
export function generateRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback — concatenated random hex.
  const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `req-${hex()}-${hex()}`;
}

// Strip query strings + percent-decode safely so log paths are
// readable but don't carry user input that could be PII.
export function safePath(url) {
  if (!url) return '';
  const [pathOnly] = String(url).split('?');
  // Replace any non-ASCII-printable so a malicious User-Agent /
  // path injection doesn't poison the log line.
  return pathOnly.replace(/[^\x20-\x7e]/g, '?');
}
