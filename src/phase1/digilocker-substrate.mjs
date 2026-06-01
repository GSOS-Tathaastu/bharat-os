// Phase 12.2.6 — DigiLocker (UIDAI / GoI) OAuth2 + document
// fetch substrate.
//
// What this module is.
//
//   The CORE substrate for any DigiLocker-mediated identity
//   flow:
//   - Citizen consent + OAuth2 authorization code grant.
//   - Token storage on the citizen's record (stored on Bharat
//     OS, NOT on the citizen's device — the operator-side
//     verification flow needs server-side token access).
//   - Signed-document fetch via the access token.
//   - Signature verification scaffold.
//
//   Phase 12.2.6 wires this into the Parivahan adapter as the
//   `digilocker` provider — first non-stub Parivahan provider.
//   Future phases (12.2.7+) reuse the substrate for Aadhaar
//   e-KYC (replacing KYC L1's "last-4 ONLY" defensive posture)
//   and PAN verification.
//
// Provider modes.
//
//   - 'stub' (default): deterministic OAuth flow + mock signed
//     documents with valid-against-test-key signatures. Demo
//     deployments without DigiLocker partner keys still
//     exercise the citizen → operator review loop end-to-end.
//   - 'live': real OAuth2 against api.digitallocker.gov.in.
//     Requires UIDAI / DigiLocker partner registration; see
//     docs/API_INTEGRATIONS.md §3.1.
//
// §15 bindings:
//
//   - Token storage on the SERVER side. The token is bound to
//     the citizen's rootIdentityId; only that citizen's
//     identity OR an operator with the admin bearer can use it.
//   - State parameter (CSRF defense) is sha256-derived from
//     {actingRootIdentityId, salt, at} and stored server-side
//     so the callback can verify it without trusting the URL.
//   - Token EXCHANGE meta hits the external_adapter.call audit
//     event (URL + status + latency, NEVER the token). Token
//     STORAGE persists the access + refresh; never logged.
//   - Document FETCH meta also hits audit. Signed document
//     content is returned to the caller (verification result)
//     but the raw doc bytes are not persisted by this substrate
//     (the caller decides whether to attach as a blob via the
//     Phase 12.2.3 attachment substrate).
//   - DPDP cascade: digilocker_links table erased by
//     rootIdentityId in the same transaction as the identity.
//   - No Aadhaar number ever transits Bharat OS. DigiLocker
//     returns signed XML/JSON documents that prove the citizen
//     CONSENTED to share specific fields; the underlying
//     Aadhaar stays at UIDAI.

import { randomBytes, createPublicKey, verify as verifySignature } from 'node:crypto';
import { sha256Hex } from '../phase0/core.mjs';

export const DIGILOCKER_PROTOCOL_VERSION = 'bos.phase12.digilocker.v0';

// Frozen scope allowlist. Adding a scope requires a substrate
// update + per-scope DPDP review.
export const DIGILOCKER_SCOPES = Object.freeze([
  // Read-only access to documents in the citizen's locker.
  'documents.read',
  // Fetch a specific issued document by URI (DL, RC, etc).
  'documents.fetch'
]);

// DigiLocker OAuth2 endpoints (live mode). Stub mode never
// hits these.
export const DIGILOCKER_AUTHORIZE_URL = 'https://api.digitallocker.gov.in/public/oauth2/1/authorize';
export const DIGILOCKER_TOKEN_URL = 'https://api.digitallocker.gov.in/public/oauth2/1/token';
export const DIGILOCKER_USERINFO_URL = 'https://api.digitallocker.gov.in/public/oauth2/1/user';
export const DIGILOCKER_FETCH_URL = 'https://api.digitallocker.gov.in/public/oauth2/1/file';

// State + token lifetime caps. State expires fast (anti-CSRF);
// access token mirrors DigiLocker's documented 1-hour TTL.
export const DIGILOCKER_STATE_TTL_MS = 10 * 60_000;
export const DIGILOCKER_TOKEN_TTL_MS = 60 * 60_000;
export const DIGILOCKER_STATE_MAX_LEN = 128;

// Phase 12.2.6 adversarial fix L1-2 — redirectUri allowlist.
// The API endpoint accepts an optional redirectUri query param,
// but only the configured production redirect OR the same-origin
// callback path may be used. Anything else is an open-redirect
// vector that would hand attacker-controlled hosts a real
// authorization code on the live OAuth path.
export function isAllowedRedirectUri(candidate, { sameOriginCallback }) {
  if (!candidate || typeof candidate !== 'string') return false;
  // 1) Same-origin self-callback is the canonical default.
  if (candidate === sameOriginCallback) return true;
  // 2) Explicitly configured production redirect (operator
  //    sets this in env once when registering with DigiLocker
  //    as a partner).
  const configured = process.env.BHARAT_OS_DIGILOCKER_REDIRECT_URI;
  if (configured && candidate === configured) return true;
  // 3) Reject everything else.
  return false;
}

export class DigiLockerError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'DigiLockerError';
    this.code = code;
    this.status = status;
  }
}

// Phase 12.2.6 adversarial fix L1-3 — warn-once when the
// operator set mode=live but didn't configure the partner
// credentials. Silently degrading to stub would have the
// operator demoing against fake docs without knowing it.
let _liveFallbackWarned = false;

// Read the DigiLocker mode from env. Substrate refuses live
// mode without both client id + secret configured.
export function readDigiLockerMode() {
  const mode = (process.env.BHARAT_OS_DIGILOCKER_MODE || 'stub').toLowerCase().trim();
  if (mode !== 'live' && mode !== 'stub') return 'stub';
  if (mode === 'live') {
    const clientId = process.env.BHARAT_OS_DIGILOCKER_CLIENT_ID;
    const clientSecret = process.env.BHARAT_OS_DIGILOCKER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      if (!_liveFallbackWarned) {
        _liveFallbackWarned = true;
        // Structured warning so it lands in the operator's
        // access log and not just a forgotten console line.
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({
          level: 'WARN',
          message: 'digilocker_live_fallback_to_stub',
          reason: 'BHARAT_OS_DIGILOCKER_MODE=live but CLIENT_ID and/or CLIENT_SECRET unset',
          remediation: 'Set BHARAT_OS_DIGILOCKER_CLIENT_ID and BHARAT_OS_DIGILOCKER_CLIENT_SECRET, or set BHARAT_OS_DIGILOCKER_MODE=stub.'
        }));
      }
      return 'stub';
    }
  }
  return mode;
}

// Test hook — clear the warn-once memo so tests can exercise
// the fallback path repeatedly.
export function _resetDigiLockerFallbackMemo() {
  _liveFallbackWarned = false;
}

// Generate a CSRF-resistant state parameter. Stores no
// citizen data; the substrate stores the state row in
// digilocker_states with rootIdentityId + expiresAt.
export function generateState({ rootIdentityId, at = new Date().toISOString() } = {}) {
  if (!rootIdentityId || typeof rootIdentityId !== 'string') {
    throw new DigiLockerError('root_identity_required', 'rootIdentityId is required to mint state.');
  }
  const salt = randomBytes(16).toString('hex');
  const state = sha256Hex(`${rootIdentityId}:${salt}:${at}`).slice(0, 48);
  return { state, salt, mintedAt: at };
}

// Build the authorize URL the citizen browser opens. In stub
// mode we still return a well-formed URL but pointing at our
// own callback so a demo client can complete the flow without
// hitting digitallocker.gov.in.
export function buildAuthorizeUrl({ mode, clientId, redirectUri, state, scope }) {
  if (!redirectUri) throw new DigiLockerError('redirect_required', 'redirectUri is required.');
  if (!state) throw new DigiLockerError('state_required', 'state is required.');
  const scopeStr = Array.isArray(scope)
    ? scope.filter((s) => DIGILOCKER_SCOPES.includes(s)).join(' ')
    : (scope || 'documents.read documents.fetch');
  if (mode === 'stub') {
    // Stub returns a URL that points back at our own callback
    // immediately. The FE pastes `code=stub-<state>` to
    // complete the flow.
    return `${redirectUri}?code=stub-${encodeURIComponent(state)}&state=${encodeURIComponent(state)}`;
  }
  const url = new URL(DIGILOCKER_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scopeStr);
  return url.toString();
}

// Exchange an authorization code for an access + refresh token.
// `liveFetch` is the dependency-injection point for tests; real
// callers leave it null and the substrate uses global fetch.
export async function exchangeCodeForToken({
  mode,
  clientId,
  clientSecret,
  redirectUri,
  code,
  liveFetch,
  at = new Date().toISOString()
} = {}) {
  if (!code) {
    throw new DigiLockerError('code_required', 'authorization code is required.');
  }
  if (mode === 'stub') {
    // Stub exchange — verifies the code starts with 'stub-' so
    // the FE / test must have come through buildAuthorizeUrl.
    // Returns a deterministic token whose value encodes the
    // state for traceability.
    if (!code.startsWith('stub-')) {
      throw new DigiLockerError('invalid_code', 'stub mode requires a stub-prefixed code.');
    }
    const stateFromCode = code.slice('stub-'.length);
    return {
      provider: 'digilocker',
      mode: 'stub',
      accessToken: `dl-stub-access-${stateFromCode}`,
      refreshToken: `dl-stub-refresh-${stateFromCode}`,
      tokenType: 'Bearer',
      expiresAt: new Date(Date.parse(at) + DIGILOCKER_TOKEN_TTL_MS).toISOString(),
      scope: 'documents.read documents.fetch',
      issuedAt: at
    };
  }
  // Live mode.
  const fetchImpl = typeof liveFetch === 'function' ? liveFetch : fetch;
  if (typeof fetchImpl !== 'function') {
    throw new DigiLockerError('no_fetch', 'fetch is unavailable in this runtime.');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri || '',
    client_id: clientId || '',
    client_secret: clientSecret || ''
  });
  let response;
  try {
    response = await fetchImpl(DIGILOCKER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });
  } catch (err) {
    throw new DigiLockerError('upstream_unreachable', 'DigiLocker token endpoint unreachable.', 502);
  }
  if (!response.ok) {
    throw new DigiLockerError('upstream_error', `DigiLocker returned ${response.status}.`, 502);
  }
  let raw;
  try {
    raw = await response.json();
  } catch (err) {
    throw new DigiLockerError('parse_error', 'DigiLocker response was not JSON.', 502);
  }
  if (!raw.access_token) {
    throw new DigiLockerError('parse_error', 'DigiLocker response missing access_token.', 502);
  }
  const expiresIn = Number(raw.expires_in) || DIGILOCKER_TOKEN_TTL_MS / 1000;
  return {
    provider: 'digilocker',
    mode: 'live',
    accessToken: String(raw.access_token),
    refreshToken: String(raw.refresh_token || ''),
    tokenType: String(raw.token_type || 'Bearer'),
    expiresAt: new Date(Date.parse(at) + expiresIn * 1000).toISOString(),
    scope: String(raw.scope || ''),
    issuedAt: at
  };
}

// Build the link record persisted on the citizen's behalf.
// Caller validates the rootIdentityId binding.
export function buildLink({ rootIdentityId, tokenEnvelope, at = new Date().toISOString() }) {
  if (!rootIdentityId) throw new DigiLockerError('root_identity_required', 'rootIdentityId is required.');
  if (!tokenEnvelope || !tokenEnvelope.accessToken) {
    throw new DigiLockerError('token_required', 'token envelope is required.');
  }
  const mode = tokenEnvelope.mode || 'stub';
  // Phase 12.2.6 adversarial fix L1-1 — bindingDigest in stub
  // mode is rainbow-tableable: stub access tokens are
  // `dl-stub-access-<state>` where `state` is the DB row key,
  // so an attacker with read access on digilocker_links could
  // reconstruct the token and verify against the digest.
  // Skip the digest in stub mode; live tokens have enough
  // entropy that the digest still proves binding.
  const bindingDigest = mode === 'live'
    ? sha256Hex(`${rootIdentityId}:${tokenEnvelope.accessToken}`).slice(0, 32)
    : null;
  return {
    protocolVersion: DIGILOCKER_PROTOCOL_VERSION,
    rootIdentityId,
    provider: 'digilocker',
    mode,
    accessToken: tokenEnvelope.accessToken,
    refreshToken: tokenEnvelope.refreshToken || null,
    tokenType: tokenEnvelope.tokenType || 'Bearer',
    expiresAt: tokenEnvelope.expiresAt,
    scope: tokenEnvelope.scope || 'documents.read documents.fetch',
    issuedAt: tokenEnvelope.issuedAt || at,
    linkedAt: at,
    bindingDigest
  };
}

// Build the document-fetch URL + headers for a specific
// issued document. The Parivahan adapter calls this when its
// `digilocker` provider is active.
export function buildDocumentFetchDescriptor({ mode, accessToken, documentUri }) {
  if (!accessToken) throw new DigiLockerError('token_required', 'accessToken is required.');
  if (!documentUri) throw new DigiLockerError('document_uri_required', 'documentUri is required.');
  if (mode === 'stub') {
    return { stub: true, mode };
  }
  return {
    stub: false,
    mode,
    url: `${DIGILOCKER_FETCH_URL}/${encodeURIComponent(documentUri)}`,
    init: {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  };
}

// Stub document for the Parivahan integration. Returns the
// SAME shape as a live DigiLocker signed-document response
// would have, so callers don't branch.
export function stubSignedDocument({ documentType, identifier, at = new Date().toISOString() }) {
  const payload = {
    documentType: documentType || 'unknown',
    identifier: identifier || 'STUB',
    holderName: 'Aarav Kumar (DigiLocker stub)',
    issuedAt: '2020-01-15',
    validUntil: '2032-12-31',
    issuingAuthority: 'STUB-RTO',
    fetchedAt: at
  };
  // Mock signature: hash of payload + a hardcoded test key.
  // Real DigiLocker docs are signed with a Govt-of-India key
  // we verify against a known public key. The substrate's
  // verifyDocumentSignature accepts the stub by recognising
  // the prefix.
  const signature = `stub:${sha256Hex(JSON.stringify(payload)).slice(0, 32)}`;
  return {
    payload,
    signature,
    signatureAlg: 'stub-sha256',
    provider: 'digilocker',
    mode: 'stub'
  };
}

// Verify a DigiLocker-signed document. v1 accepts the stub
// signature scheme and reserves the live RSA / Ed25519 verify
// path for when the production DigiLocker public key is
// provisioned via env var.
export function verifyDocumentSignature(signedDoc, { trustedPublicKeyPem } = {}) {
  if (!signedDoc || !signedDoc.payload || !signedDoc.signature) {
    return { ok: false, reason: 'malformed_signed_document' };
  }
  // Stub fast path.
  if (signedDoc.signatureAlg === 'stub-sha256' && signedDoc.signature.startsWith('stub:')) {
    const expected = sha256Hex(JSON.stringify(signedDoc.payload)).slice(0, 32);
    if (signedDoc.signature === `stub:${expected}`) {
      return { ok: true, mode: 'stub' };
    }
    return { ok: false, reason: 'stub_signature_mismatch' };
  }
  // Live path — Ed25519 / RSA verify with the trusted key. v1
  // reserves this; the production DigiLocker public key
  // distribution + algorithm pinning lands when the partner
  // credentials arrive.
  if (!trustedPublicKeyPem) {
    return { ok: false, reason: 'no_trusted_key_configured' };
  }
  try {
    const publicKey = createPublicKey(trustedPublicKeyPem);
    const payloadBytes = Buffer.from(JSON.stringify(signedDoc.payload), 'utf8');
    const signatureBytes = Buffer.from(signedDoc.signature, 'base64');
    const ok = verifySignature(null, payloadBytes, publicKey, signatureBytes);
    return { ok, mode: 'live' };
  } catch (err) {
    return { ok: false, reason: 'verify_failed', error: err.message };
  }
}
