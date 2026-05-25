// Web Push (RFC 8030 + RFC 8291 + RFC 8292 VAPID) — Phase 7.0.
//
// The W3C Push API + IETF Web Push spec, implemented from scratch
// on Node 20+'s built-in `crypto`. No npm dependency. This closes
// the SIM-swap detection loop (Phase 5.0/5.2 future-work) and
// activates the §9A worker-notification path scaffolded since
// Phase 2a.4 / ADR 0053.
//
// The full Web Push handshake:
//
//   1. Customer / paired device subscribes through the browser's
//      Push API + receives a `PushSubscription` object containing:
//        • endpoint URL (https://fcm.googleapis.com/...,
//          https://updates.push.services.mozilla.com/..., etc.)
//        • p256dh — the device's ECDH-P256 public key
//        • auth — 16-byte client secret
//      The shell registers the subscription via POST
//      /api/identities/:id/push-subscriptions.
//
//   2. To send a notification, Bharat OS:
//        a. Builds a JSON payload (≤ ~3KiB after encryption).
//        b. Generates an ephemeral ECDH P-256 keypair.
//        c. Derives a shared secret with the device's p256dh.
//        d. Runs HKDF-SHA-256 to produce a content-encryption key
//           + a content-encryption nonce.
//        e. AES-128-GCM encrypts the padded payload.
//        f. Signs a VAPID JWT (ES256 over { aud, exp, sub }).
//        g. POSTs the encrypted body to the endpoint URL with
//           appropriate Content-Encoding + Crypto-Key + Encryption
//           + Authorization (vapid) headers.
//
//   3. The push service (FCM / Autopush / etc.) delivers to the
//      device, which decrypts using its private p256dh key.
//
// §15 bindings:
//
//   • Subscription endpoints are device-identifying. We DO store
//     them (required for delivery) but mask in logs / metrics /
//     ledger via `maskEndpoint('https://fcm.../abc123') →
//     'fcm.../xxxxxx23'`.
//
//   • Payload bodies are encrypted end-to-end (push service can't
//     read them) — the encryption key is never on the server in
//     persistent storage; it's derived per-send from ephemeral
//     ECDH.
//
//   • VAPID claims include only an `aud` (push origin) + `exp`
//     (≤ 24h) + `sub` (contact email per RFC 8292) — never any
//     identifier of the user being pushed.

import {
  createECDH,
  createHmac,
  createSign,
  randomBytes,
  createPrivateKey,
  createCipheriv
} from 'node:crypto';
import { recordPushAttempt } from './metrics.mjs';

export const WEB_PUSH_PROTOCOL_VERSION = 'bos.phase0.web-push.v0';

// Phase 7.3 — single-retry policy for transient failures. Push
// services (FCM, Autopush) respond 429 + Retry-After under load
// and 5xx during outages. We retry exactly once after honouring
// Retry-After (capped) or a fixed 1s baseline for 5xx.
const RETRY_MAX_BACKOFF_MS = 60_000; // hard cap on Retry-After honouring
const RETRY_5XX_DELAY_MS = 1_000;

// Phase 7.3 — vendor extraction. The push service host determines
// the vendor family for telemetry purposes. Bharat OS doesn't
// route between vendors (subscription owns that choice) but the
// per-vendor success rate is what ops needs to know about.
const VENDOR_HOST_MAP = [
  { match: /(^|\.)googleapis\.com$/, vendor: 'fcm' },
  { match: /(^|\.)mozilla\.com$/, vendor: 'autopush' },
  { match: /(^|\.)windows\.com$/, vendor: 'wns' },
  { match: /(^|\.)mock$/, vendor: 'mock' } // test fixture
];

export function pushVendor(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return 'other';
  let host;
  try {
    host = new URL(endpoint).host.toLowerCase();
  } catch {
    return 'other';
  }
  for (const { match, vendor } of VENDOR_HOST_MAP) {
    if (match.test(host)) return vendor;
  }
  return 'other';
}

// Parse the push-service `Retry-After` header. Per RFC 7231 §7.1.3
// it's either a positive delta-seconds integer or an HTTP-date.
// We accept both. Returns milliseconds capped at
// RETRY_MAX_BACKOFF_MS (60s) — never block the request loop on a
// rogue header that says "retry in 24 hours."
export function parseRetryAfterMs(headerValue, { now = Date.now() } = {}) {
  if (!headerValue) return 0;
  const trimmed = String(headerValue).trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asInt) && String(asInt) === trimmed) {
    return Math.max(0, Math.min(asInt * 1000, RETRY_MAX_BACKOFF_MS));
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.min(asDate - now, RETRY_MAX_BACKOFF_MS));
  }
  return 0;
}

const VAPID_JWT_TTL_SECONDS = 12 * 60 * 60; // 12h — well under the 24h spec cap

// ─── Base64url helpers ──────────────────────────────────────────────

export function b64uEncode(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function b64uDecode(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ─── VAPID keypair handling ─────────────────────────────────────────

// Build a JWK from raw 65-byte uncompressed P-256 public key
// (`0x04 || X || Y`) + optional 32-byte private scalar. JWK is the
// most portable representation Node's `crypto.createPrivateKey`
// accepts — much simpler than hand-rolling PKCS#8 DER.
function p256PrivateRawToJwk(privRaw, pubRaw) {
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error('public key must be 65-byte uncompressed P-256 (0x04 || X || Y).');
  }
  if (privRaw.length !== 32) {
    throw new Error('private key must be a 32-byte P-256 scalar.');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pubRaw.slice(1, 33)),
    y: b64uEncode(pubRaw.slice(33, 65)),
    d: b64uEncode(privRaw)
  };
}

// Generate a fresh VAPID keypair. Returns { publicKey, privateKey }
// as base64url-encoded uncompressed P-256 strings, ready for env vars.
export function generateVapidKeypair() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKey = b64uEncode(ecdh.getPublicKey()); // 65 bytes: 0x04 || X || Y
  const privateKey = b64uEncode(ecdh.getPrivateKey()); // 32 bytes
  return { publicKey, privateKey };
}

// ─── VAPID JWT signing (ES256 over JOSE) ────────────────────────────

function jwtSegmentsToInput(header, claims) {
  const h = b64uEncode(JSON.stringify(header));
  const c = b64uEncode(JSON.stringify(claims));
  return `${h}.${c}`;
}

// Node's ES256 signature is ASN.1 DER-encoded; JOSE requires the
// raw concatenated (r || s) 64-byte form. Convert.
function derToJose(der) {
  // DER: 30 LEN 02 RLEN R 02 SLEN S
  let offset = 2; // skip 30 LEN
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);
  // Strip leading zeros + left-pad to 32 bytes each.
  if (r[0] === 0 && r.length > 32) r = r.slice(r.length - 32);
  if (s[0] === 0 && s.length > 32) s = s.slice(s.length - 32);
  const rPadded = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
  const sPadded = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
  return Buffer.concat([rPadded, sPadded]);
}

export function signVapidJwt({
  endpoint,
  subject,
  privateKey,
  publicKey,
  ttlSeconds = VAPID_JWT_TTL_SECONDS,
  at = Date.now()
}) {
  if (!endpoint) throw new Error('endpoint is required.');
  if (!subject) throw new Error('subject is required (mailto: or https://).');
  if (
    !subject.startsWith('mailto:') &&
    !subject.startsWith('https://')
  ) {
    throw new Error('subject must be a mailto: or https:// URI.');
  }
  if (!privateKey || !publicKey) {
    throw new Error('privateKey + publicKey are required.');
  }
  if (ttlSeconds > 24 * 60 * 60) {
    throw new Error('ttlSeconds must be <= 86400 (RFC 8292 §2 cap).');
  }
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(at / 1000) + ttlSeconds,
    sub: subject
  };
  const signingInput = jwtSegmentsToInput(header, claims);
  const jwk = p256PrivateRawToJwk(
    b64uDecode(privateKey),
    b64uDecode(publicKey)
  );
  const keyObject = createPrivateKey({ key: jwk, format: 'jwk' });
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const der = signer.sign(keyObject);
  const jose = derToJose(der);
  return `${signingInput}.${b64uEncode(jose)}`;
}

// ─── Payload encryption — RFC 8188 `aes128gcm` encoding ─────────────

const SALT_LEN = 16;
const RECORD_SIZE = 4096;
const TAG_LEN = 16;

function hkdf(salt, ikm, info, length) {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let counter = 1;
  while (okm.length < length) {
    t = createHmac('sha256', prk)
      .update(Buffer.concat([t, info, Buffer.from([counter])]))
      .digest();
    okm = Buffer.concat([okm, t]);
    counter += 1;
  }
  return okm.slice(0, length);
}

export function encryptPushPayload({
  payload,
  recipientPublicKey,
  recipientAuthSecret,
  ephemeral
} = {}) {
  if (!payload) throw new Error('payload is required.');
  if (!recipientPublicKey) throw new Error('recipientPublicKey is required.');
  if (!recipientAuthSecret) throw new Error('recipientAuthSecret is required.');

  const plaintext = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  if (plaintext.length > RECORD_SIZE - TAG_LEN - 1) {
    throw new Error('payload too large for a single record (max ~4078 bytes).');
  }

  // Ephemeral ECDH keypair — the sender's per-message key.
  const ecdh = ephemeral ?? createECDH('prime256v1');
  if (!ephemeral) ecdh.generateKeys();
  const senderPublic = ecdh.getPublicKey(); // 65 bytes uncompressed
  const recipientPubBuf = b64uDecode(recipientPublicKey); // 65 bytes
  const authSecretBuf = b64uDecode(recipientAuthSecret); // 16 bytes

  // ECDH shared secret.
  const sharedSecret = ecdh.computeSecret(recipientPubBuf);

  // RFC 8291 — derive PRK_key + key + nonce.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    recipientPubBuf,
    senderPublic
  ]);
  const ikm = hkdf(authSecretBuf, sharedSecret, keyInfo, 32);

  const salt = randomBytes(SALT_LEN);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // Padding delimiter `0x02` for the last (and only) record.
  const padded = Buffer.concat([plaintext, Buffer.from([0x02])]);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
  const tag = cipher.getAuthTag();

  // RFC 8188 header: salt(16) || rs(4 BE) || idlen(1) || keyid.
  // For Web Push (RFC 8291), keyid is the sender's public key (65 bytes).
  const idLen = Buffer.from([senderPublic.length]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE, 0);
  const header = Buffer.concat([salt, rs, idLen, senderPublic]);
  const body = Buffer.concat([header, ciphertext, tag]);

  return {
    body,
    contentEncoding: 'aes128gcm',
    contentType: 'application/octet-stream'
  };
}

// ─── HTTP send ──────────────────────────────────────────────────────

// Mask the endpoint URL for audit/log/metric surfaces.
// 'https://fcm.googleapis.com/fcm/send/long-token-abc123' →
// 'fcm.googleapis.com/...xxxxxx23'.
export function maskEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return null;
  try {
    const u = new URL(endpoint);
    const tail = u.pathname.slice(-6);
    return `${u.host}/...${tail.replace(/[^/]/g, (c, i, s) =>
      i < s.length - 2 ? 'x' : c
    )}`;
  } catch {
    return null;
  }
}

// Send one push. Returns { ok, status, ... } on success / failure.
// Caller decides what to do with `expired` (HTTP 410 = unsubscribe).
//
// Phase 7.3: single retry on 429 (Retry-After honoured + capped at
// 60s) and on 5xx (fixed 1s delay). Per-vendor telemetry recorded
// via `bos_push_send_total{vendor, outcome}` so ops can detect
// FCM degradation, Autopush outages, etc. Set `retry: false` to
// disable retries (used for recursive calls + tests).
export async function sendWebPush({
  subscription,
  payload,
  vapid,
  ttlSeconds = 60 * 60, // push-service TTL for queued messages
  urgency = 'normal', // 'very-low' | 'low' | 'normal' | 'high'
  retry = true,
  // Test seam: injected sleep so retry tests don't actually sleep.
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
}) {
  if (!subscription?.endpoint) throw new Error('subscription.endpoint is required.');
  if (!subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('subscription.keys.p256dh + auth are required.');
  }
  if (!vapid?.publicKey || !vapid?.privateKey || !vapid?.subject) {
    throw new Error('vapid.publicKey + privateKey + subject are required.');
  }

  const vendor = pushVendor(subscription.endpoint);

  const encrypted = encryptPushPayload({
    payload,
    recipientPublicKey: subscription.keys.p256dh,
    recipientAuthSecret: subscription.keys.auth
  });
  const jwt = signVapidJwt({
    endpoint: subscription.endpoint,
    subject: vapid.subject,
    privateKey: vapid.privateKey,
    publicKey: vapid.publicKey
  });

  const headers = {
    'content-type': encrypted.contentType,
    'content-encoding': encrypted.contentEncoding,
    'content-length': String(encrypted.body.length),
    ttl: String(ttlSeconds),
    urgency,
    authorization: `vapid t=${jwt}, k=${vapid.publicKey}`
  };

  let response;
  try {
    response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: encrypted.body
    });
  } catch (error) {
    // Network-level error (DNS, TCP reset, etc.). Telemetry +
    // single retry if eligible.
    recordPushAttempt({ vendor, outcome: 'network_error' });
    if (retry) {
      await sleep(RETRY_5XX_DELAY_MS);
      const result = await sendWebPush({
        subscription,
        payload,
        vapid,
        ttlSeconds,
        urgency,
        retry: false,
        sleep
      });
      if (result.ok) {
        recordPushAttempt({ vendor, outcome: 'retried_success' });
      }
      return { ...result, retried: true };
    }
    return {
      ok: false,
      status: 0,
      reason: 'network_error',
      endpointMasked: maskEndpoint(subscription.endpoint),
      providerResponse: error?.message ?? String(error)
    };
  }

  if (response.status === 201 || response.status === 200) {
    recordPushAttempt({ vendor, outcome: 'success' });
    return {
      ok: true,
      status: response.status,
      endpointMasked: maskEndpoint(subscription.endpoint)
    };
  }
  if (response.status === 404 || response.status === 410) {
    recordPushAttempt({ vendor, outcome: 'gone' });
    return {
      ok: false,
      status: response.status,
      reason: 'subscription_gone',
      endpointMasked: maskEndpoint(subscription.endpoint),
      shouldUnsubscribe: true
    };
  }
  if (response.status === 429 && retry) {
    // Rate-limited — honour Retry-After (capped at 60s).
    recordPushAttempt({ vendor, outcome: 'rate_limited' });
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfterMs || RETRY_5XX_DELAY_MS);
    const result = await sendWebPush({
      subscription,
      payload,
      vapid,
      ttlSeconds,
      urgency,
      retry: false,
      sleep
    });
    if (result.ok) {
      recordPushAttempt({ vendor, outcome: 'retried_success' });
    }
    return { ...result, retried: true, retryAfterMs };
  }
  if (response.status >= 500 && response.status < 600 && retry) {
    // Transient server error — single retry with fixed baseline.
    recordPushAttempt({ vendor, outcome: 'rejected' });
    await sleep(RETRY_5XX_DELAY_MS);
    const result = await sendWebPush({
      subscription,
      payload,
      vapid,
      ttlSeconds,
      urgency,
      retry: false,
      sleep
    });
    if (result.ok) {
      recordPushAttempt({ vendor, outcome: 'retried_success' });
    }
    return { ...result, retried: true };
  }

  const text = await response.text().catch(() => '');
  recordPushAttempt({ vendor, outcome: 'rejected' });
  return {
    ok: false,
    status: response.status,
    reason: 'push_rejected',
    endpointMasked: maskEndpoint(subscription.endpoint),
    providerResponse: text.slice(0, 240)
  };
}

// ─── VAPID config from env ──────────────────────────────────────────

// Reads BHARAT_OS_VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT. Returns
// null when any are missing — caller decides how to handle (Phase
// 5.7 admin-auth style: refuse push endpoints with 503 push_disabled).
export function readVapidConfig() {
  const publicKey = process.env.BHARAT_OS_VAPID_PUBLIC_KEY;
  const privateKey = process.env.BHARAT_OS_VAPID_PRIVATE_KEY;
  const subject = process.env.BHARAT_OS_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// ─── Phase 7.1 — sendPushToIdentity helper ──────────────────────────
//
// Encapsulates the recovery-flow push pattern so adding a new
// audit-significant push event is a one-liner from any handler:
//
//   await sendPushToIdentity(store, identity.id, {
//     type: 'mesh_withdrawal.paid',
//     title: '₹500 sent to your UPI',
//     body: 'Mesh-contribution payout completed.'
//   }, { urgency: 'normal', ledgerType: 'mesh_withdrawal.pushed' });
//
// Behaviour:
//
//   • If VAPID isn't configured → silently returns `{ skipped: true }`.
//     The caller's primary action (recovery, withdrawal, etc.)
//     proceeds normally; push is a detection signal, not a
//     defensive control.
//
//   • Loads `store.listPushSubscriptions()` once + filters to
//     subscriptions for the target identity that have
//     `rawEndpointStored: true` (Phase 7.0 storage gate).
//
//   • For each: calls `sendWebPush`, emits a `<ledgerType>` (or
//     `<ledgerType>.failed`) ledger event with the masked endpoint
//     + push status, and on 410 Gone deletes the subscription
//     automatically.
//
//   • Returns `{ sent, failed, unsubscribed }` for caller-side
//     logging.
//
// §15: the push payload travels E2E-encrypted; the LEDGER event
// records only masked endpoint + status + reason. The push body
// itself MUST NOT contain identity refs (recovery_alert.body
// pattern: behavioural cue + cooldown timestamp; no displayName,
// no phone).
export async function sendPushToIdentity(
  store,
  identityId,
  payload,
  {
    urgency = 'normal',
    ledgerType,
    requestId = null,
    logger = null,
    at = new Date().toISOString()
  } = {}
) {
  if (!identityId || typeof identityId !== 'string') {
    throw new Error('identityId is required.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload is required.');
  }
  if (!ledgerType || typeof ledgerType !== 'string') {
    throw new Error('ledgerType is required for audit attribution.');
  }
  const vapid = readVapidConfig();
  if (!vapid) {
    return { skipped: true, reason: 'vapid_unconfigured', sent: 0, failed: 0, unsubscribed: 0 };
  }
  if (typeof store?.listPushSubscriptions !== 'function') {
    return { skipped: true, reason: 'store_unsupported', sent: 0, failed: 0, unsubscribed: 0 };
  }
  const allSubs = await store.listPushSubscriptions().catch(() => []);
  const targetSubs = allSubs.filter(
    (s) =>
      s.identityId === identityId &&
      s.rawEndpointStored === true &&
      s.endpoint &&
      s.keys?.p256dh &&
      s.keys?.auth
  );
  let sent = 0;
  let failed = 0;
  let unsubscribed = 0;
  for (const sub of targetSubs) {
    try {
      const result = await sendWebPush({
        subscription: { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        vapid,
        urgency
      });
      // Audit every attempt.
      if (typeof store.appendLedger === 'function') {
        await store.appendLedger({
          type: result.ok ? ledgerType : `${ledgerType}.failed`,
          identityId,
          subscriptionId: sub.subscriptionId,
          endpointMasked: maskEndpoint(sub.endpoint),
          pushStatus: result.status,
          payloadType: payload?.type ?? null,
          reason: result.reason ?? null,
          at
        });
      }
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (result.shouldUnsubscribe && typeof store.deletePushSubscription === 'function') {
          await store.deletePushSubscription(sub.subscriptionId).catch(() => {});
          unsubscribed += 1;
        }
      }
    } catch (error) {
      // Single push failure must never break the caller's primary
      // action. Log + record + continue.
      failed += 1;
      if (logger?.warn) {
        logger.warn('push_send_error', {
          requestId,
          identityId,
          endpointMasked: maskEndpoint(sub.endpoint),
          reason: error?.message ?? String(error)
        });
      }
    }
  }
  return { skipped: false, sent, failed, unsubscribed, attempted: targetSubs.length };
}
