// Phase 12.2.2 — India Post PIN-code lookup adapter.
//
// Second adapter composed on top of `createAdapter` (Phase
// 12.2.1). Purpose: turn a 6-digit Indian PIN code into a
// `{city, district, state, branches[]}` envelope so the KYC L1
// address form can auto-fill city + state from the PIN.
//
// Upstream: `https://api.postalpincode.in/pincode/<PIN>` — a
// free, no-key, community-maintained mirror of India Post data.
// Documented at https://api.postalpincode.in/. No formal rate
// limit; we cap conservatively at 5 req/sec to be polite.
//
// §15 bindings:
//   - cacheKey is a sha256(PIN) digest, NOT the raw PIN. Phase
//     12.2.2 adversarial review found that the raw PIN on the
//     external_adapter.call audit event could be join-keyed with
//     a near-simultaneous provider_identity.kyc_l1_submitted
//     event from the same citizen, recovering their residential
//     PIN from the ledger. The digest preserves cache identity
//     (two calls for the same PIN still share an entry) without
//     putting the PIN on the audit trail.
//   - Audit ledger event still carries meta only — no upstream
//     branch list / address body.
//   - The /api/geocode/pincode/:pin HTTP access log line is
//     redacted at the api.mjs layer (the route handler emits the
//     raw PIN to the response but a path-rewrite in safePath
//     drops the trailing segment before structured logging).
//   - Polite UA includes contact, same as Nominatim.
//   - Stub mode returns a deterministic Maharashtra fixture so
//     demo deployments without `BHARAT_OS_PINCODE_MODE=live`
//     still render something sensible.

import { sha256Hex } from '../phase0/core.mjs';
import { createAdapter } from '../phase0/external-adapter.mjs';

export const PINCODE_PROTOCOL_VERSION = 'bos.phase12.india-post-pincode.v0';

const ADAPTER_NAME = 'india-post-pincode';
const BASE_URL = 'https://api.postalpincode.in';
const USER_AGENT = 'BharatOS/0.1 (+https://github.com/bharat-os)';

const PIN_RE = /^[1-9][0-9]{5}$/;

export function isValidPincode(pin) {
  return typeof pin === 'string' && PIN_RE.test(pin);
}

// Lift the postalpincode.in payload into a stable envelope.
// Upstream returns: `[{ Status, Message, PostOffice: [{Name, BranchType,
// DeliveryStatus, Circle, District, State, Country, Pincode, ...}, ...]}]`.
// We keep only what the FE renders (city + state + a small branch list
// for ambiguous PIN cases like multi-village PINs).
function liftPlace(pincode, raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const row = raw[0];
  if (!row || typeof row !== 'object') return null;
  if (row.Status === 'Error' || !Array.isArray(row.PostOffice) || row.PostOffice.length === 0) {
    return {
      pincode,
      city: null,
      district: null,
      state: null,
      countryCode: 'in',
      branches: []
    };
  }
  const first = row.PostOffice[0];
  return {
    pincode,
    // postalpincode.in uses `District` for the urban / metro name
    // citizens recognise as "city" most of the time. We surface
    // both so the FE can choose; default render is District as the
    // "city" line.
    city: first.District || null,
    district: first.District || null,
    state: first.State || null,
    countryCode: 'in',
    branches: row.PostOffice.slice(0, 12).map((b) => ({
      name: b.Name || null,
      branchType: b.BranchType || null,
      deliveryStatus: b.DeliveryStatus || null,
      district: b.District || null,
      state: b.State || null
    }))
  };
}

export function createPincodeAdapter({ mode, store, liveFetch } = {}) {
  return createAdapter({
    name: ADAPTER_NAME,
    userAgent: USER_AGENT,
    modeEnvVar: 'BHARAT_OS_PINCODE_MODE',
    mode,
    defaultMode: 'stub',
    rateLimit: { ratePerSecond: 5 },
    cache: { ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 20_000 },
    timeoutMs: 4_000,
    store,
    liveFetch,
    request: ({ pincode } = {}) => {
      const pin = typeof pincode === 'string' ? pincode.trim() : '';
      if (!isValidPincode(pin)) {
        throw new Error('pincode must be a 6-digit Indian PIN (no leading zero).');
      }
      // §15 — digest the PIN before handing it to the substrate.
      // The audit ledger emits this string; the raw PIN never
      // leaves the request handler.
      const cacheKey = `pin:${sha256Hex(pin).slice(0, 32)}`;
      return {
        cacheKey,
        // Deterministic offline stub matches a real Pune PIN so
        // demo flows render plausibly. Branches list is small
        // and synthetic; FE renders only city + state on the
        // common path.
        stub: {
          pincode: pin,
          city: 'Pune',
          district: 'Pune',
          state: 'Maharashtra',
          countryCode: 'in',
          branches: [
            {
              name: 'Shivajinagar S.O',
              branchType: 'Sub Post Office',
              deliveryStatus: 'Delivery',
              district: 'Pune',
              state: 'Maharashtra'
            }
          ]
        },
        build: () => ({
          url: `${BASE_URL}/pincode/${encodeURIComponent(pin)}`,
          init: { method: 'GET' },
          parse: (json) => liftPlace(pin, json)
        })
      };
    }
  });
}
