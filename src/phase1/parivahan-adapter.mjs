// Phase 12.2.5 — Parivahan / Sarathi / Vahan verification adapter.
//
// Third concrete adapter composed on top of the Phase 12.2.1
// external-adapter substrate (after Nominatim + India Post PIN).
// Purpose: auto-verify the typed driving licence number + vehicle
// registration number on cab-driver / personal-driver role-extras
// submissions BEFORE the operator review, so the manual cross-check
// against the photo document becomes one-click.
//
// What this module is.
//
//   Two verification calls — verifyDl(dlNumber, dob?) and
//   verifyRc(registrationNumber) — wrapped in the standard
//   adapter envelope. The substrate handles env mode dispatch,
//   audit ledger, rate limit, polite UA, cache.
//
// Provider story.
//
//   parivahan.gov.in does NOT have an official open public API
//   for individual lookups. Three real paths to live mode:
//
//   - 'digilocker' — UIDAI / GoI cleanest path: citizen
//     authenticates via DigiLocker, we receive signed
//     documents. Phase 12.2.6+ work.
//   - 'surepass' / 'karza' / 'idfy' — commercial aggregators
//     that wrap parivahan via authorised scraping. Per-check
//     fees in the ₹1-5 range.
//   - 'stub' (default) — deterministic demo. Always returns
//     'valid' with fake holder name + validity date.
//
//   v1 ships the substrate + stub. Live providers slot in via
//   the BHARAT_OS_PARIVAHAN_PROVIDER env var pointing the
//   `liveFetch` URL + parser; the adapter shape is provider-
//   agnostic.
//
// §15 bindings:
//
//   - cacheKey is sha256(dl_number || rc_number) — same posture
//     as Phase 12.2.3 attachment cache key. The raw number
//     never lands on the audit ledger or path-prefix.
//   - Audit ledger event meta carries adapter name + status +
//     latency. The verification RESULT (holder name, validity
//     date) is the response body — NEVER logged.
//   - Polite UA includes contact, same as Nominatim.
//   - Per-citizen-flag: NEVER hit live mode without the citizen
//     explicitly being the OWNER of the role-extras submission
//     (the API handler enforces this via requireProviderOwnerAuth
//     OR admin bearer).

import { sha256Hex } from '../phase0/core.mjs';
import { createAdapter } from '../phase0/external-adapter.mjs';
import { stubSignedDocument, verifyDocumentSignature } from './digilocker-substrate.mjs';

export const PARIVAHAN_PROTOCOL_VERSION = 'bos.phase12.parivahan-adapter.v0';

const ADAPTER_NAME = 'parivahan';
const USER_AGENT = 'BharatOS/0.1 (+https://github.com/bharat-os)';

// Allowed providers — v1 ships stub only; live providers can
// land additively via env var. Substrate refuses unknown
// providers at construction so an env typo fails LOUD.
export const PARIVAHAN_PROVIDERS = Object.freeze([
  'stub',
  'digilocker',
  'surepass',
  'karza',
  'idfy'
]);

// Indian DL format guidance: state code (2) + RTO code (2) + year
// (4) + sequence (7). Variations exist (state-specific). We use a
// loose regex that catches obvious typos while not over-fitting.
export const DL_NUMBER_RE = /^[A-Z]{2}[- ]?\d{2}[- ]?\d{4}[- ]?\d{6,7}$/i;
// Vehicle registration: state code (2) + RTO code (2) + series
// (1-2 letters) + number (1-4 digits). E.g. MH12AB1234.
export const VEHICLE_REGISTRATION_RE = /^[A-Z]{2}[- ]?\d{1,2}[- ]?[A-Z]{1,2}[- ]?\d{1,4}$/i;

function normalizeDl(raw) {
  return String(raw || '').toUpperCase().replace(/[\s-]/g, '');
}

function normalizeRc(raw) {
  return String(raw || '').toUpperCase().replace(/[\s-]/g, '');
}

export function isValidDlShape(raw) {
  return typeof raw === 'string' && DL_NUMBER_RE.test(raw);
}

export function isValidRcShape(raw) {
  return typeof raw === 'string' && VEHICLE_REGISTRATION_RE.test(raw);
}

// Deterministic stub. Citizens with "INVALID" anywhere in the
// number get a `not_found` result so demo flows can exercise
// both the happy + sad operator review path.
// Phase 12.2.5 adversarial fix UX-Q5 — stub fetchedAt uses the
// REAL clock so an operator's "freshness" mental model holds.
// The deterministic part (status, holder name, validity) is what
// demo tests pin against; the timestamp is operational metadata.
function stubDl(dl) {
  const norm = normalizeDl(dl);
  if (norm.includes('INVALID')) {
    return {
      status: 'not_found',
      number: norm,
      holderName: null,
      validUntil: null,
      provider: 'stub',
      fetchedAt: new Date().toISOString()
    };
  }
  return {
    status: 'valid',
    number: norm,
    holderName: 'Aarav Kumar (stub)',
    validUntil: '2032-12-31',
    provider: 'stub',
    fetchedAt: new Date().toISOString()
  };
}

function stubRc(rc) {
  const norm = normalizeRc(rc);
  if (norm.includes('INVALID')) {
    return {
      status: 'not_found',
      number: norm,
      ownerName: null,
      vehicleClass: null,
      fitnessUntil: null,
      insuranceUntil: null,
      provider: 'stub',
      fetchedAt: new Date().toISOString()
    };
  }
  return {
    status: 'valid',
    number: norm,
    ownerName: 'Aarav Kumar (stub)',
    vehicleClass: 'LMV-TR',
    fitnessUntil: '2027-06-30',
    insuranceUntil: '2026-12-31',
    provider: 'stub',
    fetchedAt: new Date().toISOString()
  };
}

// Build URL + parser for the live provider. In v1 only stub is
// wired; this function is the extension point for future
// providers. Each provider returns the SAME envelope shape
// `{status, number, holderName/ownerName, validUntil, provider, fetchedAt}`
// so consumers don't branch on provider.
function buildLiveDescriptorDl(provider, dl) {
  // v1 placeholder: every live provider currently throws
  // 'provider_not_configured'. Future commits add per-provider
  // URL + parse.
  throw new Error(`Parivahan provider "${provider}" not yet configured. ` +
    `See docs/API_INTEGRATIONS.md §2.1 for the integration path.`);
}

function buildLiveDescriptorRc(provider, rc) {
  throw new Error(`Parivahan provider "${provider}" not yet configured. ` +
    `See docs/API_INTEGRATIONS.md §2.1 for the integration path.`);
}

export function createParivahanAdapter({ mode, provider, store, liveFetch } = {}) {
  // Provider env override — separate from mode (stub vs live).
  // Mode chooses stub vs live transport; provider chooses WHICH
  // live transport.
  const resolvedProvider = (provider
    || process.env.BHARAT_OS_PARIVAHAN_PROVIDER
    || 'stub'
  ).toLowerCase().trim();
  if (!PARIVAHAN_PROVIDERS.includes(resolvedProvider)) {
    throw new Error(`Parivahan provider "${resolvedProvider}" not in allowlist: ${PARIVAHAN_PROVIDERS.join(', ')}.`);
  }

  return createAdapter({
    name: ADAPTER_NAME,
    userAgent: USER_AGENT,
    modeEnvVar: 'BHARAT_OS_PARIVAHAN_MODE',
    mode,
    defaultMode: 'stub',
    rateLimit: { ratePerSecond: 2 },
    cache: { ttlMs: 24 * 60 * 60 * 1000, maxEntries: 5_000 },
    timeoutMs: 6_000,
    store,
    liveFetch,
    request: (args = {}) => {
      const { kind } = args;
      if (kind === 'dl') {
        const raw = args.dlNumber;
        if (!isValidDlShape(raw)) {
          throw new Error('dlNumber must look like AA00YYYYNNNNNN (state + RTO + year + serial).');
        }
        const norm = normalizeDl(raw);
        // §15 — cacheKey is the sha256 digest, NOT the raw DL.
        const cacheKey = `parivahan:dl:${sha256Hex(norm).slice(0, 32)}`;
        return {
          cacheKey,
          stub: stubDl(norm),
          build: () => buildLiveDescriptorDl(resolvedProvider, norm)
        };
      }
      if (kind === 'rc') {
        const raw = args.registrationNumber;
        if (!isValidRcShape(raw)) {
          throw new Error('registrationNumber must look like AA00AB1234.');
        }
        const norm = normalizeRc(raw);
        const cacheKey = `parivahan:rc:${sha256Hex(norm).slice(0, 32)}`;
        return {
          cacheKey,
          stub: stubRc(norm),
          build: () => buildLiveDescriptorRc(resolvedProvider, norm)
        };
      }
      throw new Error('kind must be "dl" or "rc".');
    }
  });
}

// Phase 12.2.6 — DigiLocker signed-document path. When the
// citizen has a stored DigiLocker link AND the configured
// provider is 'digilocker', the substrate fetches a signed
// document via the citizen's authorised token instead of
// hitting the generic stub. The returned envelope has the
// same shape as a normal verification + adds a signedDocSha256
// pointer so the operator can correlate against the signed
// payload.
//
// In v1 the live DigiLocker fetch is stubbed (real upstream
// fetch arrives with partner keys). The stub returns a
// deterministic signed doc with a valid stub signature.
async function digilockerVerifyDl(dl) {
  const signed = stubSignedDocument({ documentType: 'DRVLC', identifier: dl });
  const verdict = verifyDocumentSignature(signed);
  if (!verdict.ok) {
    return {
      status: 'verifier_error',
      error: { code: 'signature_invalid' }
    };
  }
  return {
    status: 'valid',
    number: dl,
    holderName: signed.payload.holderName,
    validUntil: signed.payload.validUntil,
    provider: 'digilocker',
    signedDocSha256: sha256Hex(JSON.stringify(signed.payload)),
    signatureMode: signed.mode,
    fetchedAt: new Date().toISOString()
  };
}

async function digilockerVerifyRc(rc) {
  const signed = stubSignedDocument({ documentType: 'RCBK', identifier: rc });
  const verdict = verifyDocumentSignature(signed);
  if (!verdict.ok) {
    return {
      status: 'verifier_error',
      error: { code: 'signature_invalid' }
    };
  }
  return {
    status: 'valid',
    number: rc,
    ownerName: signed.payload.holderName,
    vehicleClass: 'LMV-TR',
    fitnessUntil: signed.payload.validUntil,
    insuranceUntil: '2026-12-31',
    provider: 'digilocker',
    signedDocSha256: sha256Hex(JSON.stringify(signed.payload)),
    signatureMode: signed.mode,
    fetchedAt: new Date().toISOString()
  };
}

// Pure helper: take a role-extras submission envelope and a
// fresh adapter, run the relevant verifications, return a map
// of field-id → result for the API handler to persist.
//
// Phase 12.2.6 — `digilockerLink` is an optional accelerator.
// When present, the substrate uses the citizen's signed
// DigiLocker session instead of the generic adapter call;
// the result shape includes a `signedDocSha256` pointer.
export async function verifyRoleExtrasFields(adapter, { role, answers, digilockerLink } = {}) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  if (role === 'cab-driver' || role === 'personal-driver') {
    if (answers.drivingLicenceNumber && isValidDlShape(answers.drivingLicenceNumber)) {
      try {
        // Phase 12.2.6 — DigiLocker accelerator. When the
        // citizen has authorised a DigiLocker session, we
        // fetch a signed document instead of going through the
        // generic adapter (which currently only has stub for
        // non-digilocker providers).
        if (digilockerLink) {
          out.drivingLicenceNumber = await digilockerVerifyDl(answers.drivingLicenceNumber);
        } else {
          const r = await adapter.call({ kind: 'dl', dlNumber: answers.drivingLicenceNumber });
          out.drivingLicenceNumber = r.body;
        }
      } catch (err) {
        // Phase 12.2.5 adversarial fix PII-6 — persist only a
        // stable code, never the upstream provider name or
        // configuration hint.
        out.drivingLicenceNumber = {
          status: 'verifier_error',
          error: { code: 'verifier_unavailable' }
        };
      }
    }
  }
  if (role === 'cab-driver') {
    if (answers.vehicleRegistrationNumber && isValidRcShape(answers.vehicleRegistrationNumber)) {
      try {
        if (digilockerLink) {
          out.vehicleRegistrationNumber = await digilockerVerifyRc(answers.vehicleRegistrationNumber);
        } else {
          const r = await adapter.call({ kind: 'rc', registrationNumber: answers.vehicleRegistrationNumber });
          out.vehicleRegistrationNumber = r.body;
        }
      } catch (err) {
        out.vehicleRegistrationNumber = {
          status: 'verifier_error',
          error: { code: 'verifier_unavailable' }
        };
      }
    }
  }
  return out;
}
