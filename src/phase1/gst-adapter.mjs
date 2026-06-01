// Phase 12.3 — GSTN (Goods and Services Tax Network) verification
// adapter.
//
// Fourth concrete adapter on the Phase 12.2.1 external-adapter
// substrate (after Nominatim, India Post PIN, Parivahan). Used by
// the kirana role-extras flow: when the citizen provides a GSTIN
// during onboarding, the operator can pre-verify it instead of
// manually cross-checking the GST certificate image.
//
// GSTIN format: 15 chars
//   [2-digit state code][10-char PAN][1-char entity number][Z][1-char checksum]
//   e.g. 27ABCDE1234F1Z5
//
// Provider story.
//
//   gst.gov.in's GSTN public API is GSP-gated (GST Suvidha
//   Provider partnership via CDAC). Commercial wrappers
//   (Surepass, Karza, Sandbox.co.in) provide aggregated access
//   at ~₹2-3 per check. Three real paths to live mode:
//
//   - 'sandbox' (Sandbox.co.in) — easiest, ~₹2/check, sandbox
//     keys without partner registration.
//   - 'surepass' / 'karza' — same vendors as Parivahan adapter.
//   - 'gsp-direct' — direct GSTN access via a GSP partnership.
//     Free per-check but partnership has 8-12 week onboarding.
//
//   v1 ships stub only.
//
// §15 bindings:
//
//   - cacheKey is sha256(GSTIN), same posture as Parivahan
//     (raw GSTIN is mildly identifying; the digest goes on
//     the audit ledger).
//   - Audit event meta only (URL + status + latency), NEVER
//     the response body.
//   - Polite UA includes contact.
//   - Stub mode never hits services.gst.gov.in.

import { sha256Hex } from '../phase0/core.mjs';
import { createAdapter } from '../phase0/external-adapter.mjs';

export const GST_PROTOCOL_VERSION = 'bos.phase12.gst-adapter.v0';

const ADAPTER_NAME = 'gst';
const USER_AGENT = 'BharatOS/0.1 (+https://github.com/bharat-os)';

// Allowed providers — v1 ships stub only; live providers can
// land additively via env var.
export const GST_PROVIDERS = Object.freeze([
  'stub',
  'sandbox',
  'surepass',
  'karza',
  'gsp-direct'
]);

// GSTIN regex. 15 chars: state code (2 digits 01-37), PAN
// (5 letters + 4 digits + 1 letter), entity number (1 digit
// or letter), Z, checksum (1 digit or letter).
//
// The full state-code allowlist is omitted in v1; substrate
// rejects only obviously-malformed inputs.
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export function isValidGstinShape(raw) {
  if (typeof raw !== 'string') return false;
  return GSTIN_RE.test(raw.toUpperCase().trim());
}

function normalize(raw) {
  return String(raw || '').toUpperCase().trim();
}

// Deterministic stub. Pattern: any well-formed GSTIN returns
// 'active'. A GSTIN containing the substring 'CANCEL' (after
// normalisation, only the 5-letter PAN slot can hold letters,
// so this is a contrived test escape) returns 'cancelled'.
function stubLookup(gstin) {
  const norm = normalize(gstin);
  if (norm.includes('CANCEL')) {
    return {
      status: 'cancelled',
      gstin: norm,
      legalName: null,
      registrationDate: null,
      taxpayerType: null,
      provider: 'stub',
      fetchedAt: new Date().toISOString()
    };
  }
  return {
    status: 'active',
    gstin: norm,
    legalName: 'Shivajinagar Kirana Store (stub)',
    registrationDate: '2020-04-01',
    taxpayerType: 'Regular',
    provider: 'stub',
    fetchedAt: new Date().toISOString()
  };
}

// Reserved for live providers. v1 throws cleanly with a
// 'provider_not_configured' code so the verify endpoint
// surfaces verifier_error instead of bubbling the message
// (per Phase 12.2.5 PII-6 lessons).
function buildLiveDescriptor(provider /*, gstin*/) {
  const err = new Error(`GST provider "${provider}" not yet configured. See docs/API_INTEGRATIONS.md §3.3 for the integration path.`);
  err.code = 'provider_not_configured';
  throw err;
}

export function createGstAdapter({ mode, provider, store, liveFetch } = {}) {
  const resolvedProvider = (provider
    || process.env.BHARAT_OS_GST_PROVIDER
    || 'stub'
  ).toLowerCase().trim();
  if (!GST_PROVIDERS.includes(resolvedProvider)) {
    throw new Error(`GST provider "${resolvedProvider}" not in allowlist: ${GST_PROVIDERS.join(', ')}.`);
  }

  return createAdapter({
    name: ADAPTER_NAME,
    userAgent: USER_AGENT,
    modeEnvVar: 'BHARAT_OS_GST_MODE',
    mode,
    defaultMode: 'stub',
    rateLimit: { ratePerSecond: 2 },
    cache: { ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 10_000 },
    timeoutMs: 6_000,
    store,
    liveFetch,
    request: ({ gstin } = {}) => {
      if (!isValidGstinShape(gstin)) {
        throw new Error('GSTIN must be 15 chars: 2-digit state + 10-char PAN + entity + Z + checksum.');
      }
      const norm = normalize(gstin);
      // §15 — sha256 digest, never the raw GSTIN on audit.
      const cacheKey = `gst:${sha256Hex(norm).slice(0, 32)}`;
      return {
        cacheKey,
        stub: stubLookup(norm),
        build: () => buildLiveDescriptor(resolvedProvider, norm)
      };
    }
  });
}

// Pure helper: take a kirana role-extras submission and run the
// GST verification IF the citizen provided a GSTIN. Mirrors the
// Parivahan verifyRoleExtrasFields shape — returns a map of
// field-id → result the API handler persists.
export async function verifyGstFields(adapter, { role, answers } = {}) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  if (role !== 'kirana') return out;
  const gstin = answers.gstinNumber;
  if (!gstin || !isValidGstinShape(gstin)) return out;
  try {
    const r = await adapter.call({ gstin });
    out.gstinNumber = r.body;
  } catch (err) {
    out.gstinNumber = {
      status: 'verifier_error',
      error: { code: 'verifier_unavailable' }
    };
  }
  return out;
}
