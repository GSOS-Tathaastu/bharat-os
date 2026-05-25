// Phase 7.0 — Web Push (VAPID) tests.

import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  b64uDecode,
  b64uEncode,
  encryptPushPayload,
  generateVapidKeypair,
  maskEndpoint,
  readVapidConfig,
  signVapidJwt,
  sendWebPush
} from '../../src/phase0/web-push.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPushSubscriptionRecord } from '../../src/phase1/worker-notification.mjs';
import { createPhoneOtp } from '../../src/phase1/phone-otp.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'web-push-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [k, v] of Object.entries(orig)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

// ─── base64url ───────────────────────────────────────────────────────

test('b64uEncode + b64uDecode round-trip', () => {
  const original = randomBytes(64);
  const encoded = b64uEncode(original);
  assert.equal(encoded.includes('+'), false);
  assert.equal(encoded.includes('/'), false);
  assert.equal(encoded.includes('='), false);
  const decoded = b64uDecode(encoded);
  assert.deepEqual(decoded, original);
});

// ─── VAPID keypair generation ───────────────────────────────────────

test('generateVapidKeypair returns base64url P-256 keys of expected length', () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  // Public key is 65 bytes (0x04 || X || Y) base64url-encoded
  // ≈ 87 chars; private key is 32 bytes ≈ 43 chars.
  const pubBytes = b64uDecode(publicKey);
  const privBytes = b64uDecode(privateKey);
  assert.equal(pubBytes.length, 65);
  assert.equal(pubBytes[0], 0x04);
  assert.equal(privBytes.length, 32);
});

// ─── VAPID JWT signing ──────────────────────────────────────────────

test('signVapidJwt produces a valid 3-segment JOSE token with ES256 claims', () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  const jwt = signVapidJwt({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    subject: 'mailto:dpo@example.com',
    publicKey,
    privateKey
  });
  const parts = jwt.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(b64uDecode(parts[0]).toString('utf8'));
  assert.equal(header.alg, 'ES256');
  assert.equal(header.typ, 'JWT');
  const claims = JSON.parse(b64uDecode(parts[1]).toString('utf8'));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:dpo@example.com');
  assert.ok(claims.exp > Math.floor(Date.now() / 1000));
  assert.ok(claims.exp <= Math.floor(Date.now() / 1000) + 24 * 60 * 60);
  // Signature is base64url-encoded 64-byte (r||s) JOSE form.
  const sig = b64uDecode(parts[2]);
  assert.equal(sig.length, 64);
});

test('signVapidJwt rejects bad inputs', () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  const base = {
    endpoint: 'https://push.example/x',
    subject: 'mailto:x@y',
    publicKey,
    privateKey
  };
  assert.throws(() => signVapidJwt({ ...base, endpoint: null }), /endpoint is required/);
  assert.throws(() => signVapidJwt({ ...base, subject: null }), /subject is required/);
  assert.throws(
    () => signVapidJwt({ ...base, subject: 'plain-text' }),
    /mailto: or https:\/\//
  );
  assert.throws(
    () => signVapidJwt({ ...base, ttlSeconds: 25 * 60 * 60 }),
    /<= 86400/
  );
  assert.throws(() => signVapidJwt({ ...base, publicKey: null }), /privateKey \+ publicKey/);
});

// ─── Payload encryption ─────────────────────────────────────────────

function fakeRecipient() {
  // Recipient: ECDH P-256 keypair + 16-byte auth secret. Matches
  // what a browser PushSubscription gives us.
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: b64uEncode(ecdh.getPublicKey()),
    auth: b64uEncode(randomBytes(16)),
    _privateForDecrypt: ecdh.getPrivateKey()
  };
}

test('encryptPushPayload produces an aes128gcm-encoded body with the expected header', () => {
  const r = fakeRecipient();
  const { body, contentEncoding, contentType } = encryptPushPayload({
    payload: { hello: 'world' },
    recipientPublicKey: r.p256dh,
    recipientAuthSecret: r.auth
  });
  assert.equal(contentEncoding, 'aes128gcm');
  assert.equal(contentType, 'application/octet-stream');
  // Body: 16-byte salt + 4-byte rs + 1-byte idlen + 65-byte sender
  // pub + ciphertext + 16-byte GCM tag.
  // Minimum body length = 16 + 4 + 1 + 65 + 1 (padded plaintext) + 16 = 103 bytes.
  assert.ok(body.length >= 103);
  // Header: idlen at offset 20 should equal 65 (sender public key length).
  assert.equal(body[20], 65);
  // Header: salt occupies the first 16 bytes — should not be all zeros.
  const salt = body.slice(0, 16);
  assert.notDeepEqual(salt, Buffer.alloc(16, 0));
});

test('encryptPushPayload rejects malformed inputs', () => {
  assert.throws(
    () => encryptPushPayload({ recipientPublicKey: 'x', recipientAuthSecret: 'y' }),
    /payload is required/
  );
  assert.throws(
    () => encryptPushPayload({ payload: 'x' }),
    /recipientPublicKey is required/
  );
});

test('encryptPushPayload rejects oversized payload (single-record cap)', () => {
  const r = fakeRecipient();
  const huge = Buffer.alloc(5000, 'x');
  assert.throws(
    () =>
      encryptPushPayload({
        payload: huge,
        recipientPublicKey: r.p256dh,
        recipientAuthSecret: r.auth
      }),
    /payload too large/
  );
});

// ─── maskEndpoint ────────────────────────────────────────────────────

test('maskEndpoint preserves host + masks the token tail', () => {
  const masked = maskEndpoint('https://fcm.googleapis.com/fcm/send/long-token-abc123');
  assert.match(masked, /fcm\.googleapis\.com/);
  assert.match(masked, /23$/); // last 2 chars preserved
  assert.match(masked, /xxxx/);
});

test('maskEndpoint returns null for malformed input', () => {
  assert.equal(maskEndpoint(null), null);
  assert.equal(maskEndpoint(''), null);
  assert.equal(maskEndpoint('not-a-url'), null);
});

// ─── readVapidConfig ────────────────────────────────────────────────

test('readVapidConfig returns null when env vars missing; populated when set', () => {
  return withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: null,
      BHARAT_OS_VAPID_PRIVATE_KEY: null,
      BHARAT_OS_VAPID_SUBJECT: null
    },
    () => {
      assert.equal(readVapidConfig(), null);
    }
  ).then(() =>
    withEnv(
      {
        BHARAT_OS_VAPID_PUBLIC_KEY: 'pub',
        BHARAT_OS_VAPID_PRIVATE_KEY: 'priv',
        BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
      },
      () => {
        const cfg = readVapidConfig();
        assert.equal(cfg.publicKey, 'pub');
        assert.equal(cfg.subject, 'mailto:x@y');
      }
    )
  );
});

// ─── sendWebPush — with mocked fetch ────────────────────────────────

function withMockFetch(impl, callback) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve(callback()).finally(() => {
    global.fetch = orig;
  });
}

test('sendWebPush posts encrypted body with VAPID auth + returns ok on 201', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let receivedHeaders = null;
  let receivedBody = null;
  let receivedUrl = null;
  await withMockFetch(
    async (url, init) => {
      receivedUrl = url;
      receivedHeaders = init.headers;
      receivedBody = init.body;
      return new Response('', { status: 201 });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 'test', body: 'hello' },
        vapid: {
          publicKey,
          privateKey,
          subject: 'mailto:dpo@example.com'
        }
      });
      assert.equal(result.ok, true);
      assert.equal(result.status, 201);
    }
  );
  assert.equal(receivedUrl, 'https://updates.push.services.mozilla.com/wpush/v2/abc');
  assert.equal(receivedHeaders['content-encoding'], 'aes128gcm');
  assert.equal(receivedHeaders['content-type'], 'application/octet-stream');
  assert.match(receivedHeaders.authorization, /^vapid t=.+\..+\..+, k=/);
  assert.ok(receivedBody.length >= 103);
});

test('sendWebPush reports 410 as shouldUnsubscribe', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  await withMockFetch(
    async () => new Response('', { status: 410 }),
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/gone',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 'test' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 410);
      assert.equal(result.shouldUnsubscribe, true);
      assert.equal(result.reason, 'subscription_gone');
    }
  );
});

test('sendWebPush reports vendor rejection on non-success status', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  await withMockFetch(
    async () => new Response('Bad Request: payload too large', { status: 400 }),
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://push.example/x',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 'test' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.equal(result.reason, 'push_rejected');
      assert.match(result.providerResponse, /payload too large/);
    }
  );
});

test('sendWebPush rejects missing fields', async () => {
  await assert.rejects(
    () =>
      sendWebPush({ subscription: null, payload: {}, vapid: {} }),
    /subscription\.endpoint is required/
  );
  await assert.rejects(
    () =>
      sendWebPush({
        subscription: { endpoint: 'x', keys: {} },
        payload: {},
        vapid: {}
      }),
    /p256dh \+ auth/
  );
});

// ─── createPushSubscriptionRecord storeDeliveryKeys gating ─────────

test('createPushSubscriptionRecord defaults to NOT storing raw endpoint/keys', () => {
  const sub = createPushSubscriptionRecord({
    identityId: 'bos:person:x',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p', auth: 'a' }
  });
  assert.equal(sub.endpoint, null);
  assert.equal(sub.keys, null);
  assert.equal(sub.rawEndpointStored, false);
});

test('createPushSubscriptionRecord with storeDeliveryKeys:true persists raw endpoint+keys', () => {
  const sub = createPushSubscriptionRecord({
    identityId: 'bos:person:x',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    storeDeliveryKeys: true
  });
  assert.equal(sub.endpoint, 'https://fcm.googleapis.com/fcm/send/abc');
  assert.deepEqual(sub.keys, { p256dh: 'p256dh-key', auth: 'auth-key' });
  assert.equal(sub.rawEndpointStored, true);
});

test('createPushSubscriptionRecord refuses to store raw when keys are incomplete', () => {
  const sub = createPushSubscriptionRecord({
    identityId: 'x',
    endpoint: 'https://push.example/x',
    keys: { p256dh: 'p' }, // missing auth
    storeDeliveryKeys: true
  });
  // Should fall back to no-store mode because keys are incomplete.
  assert.equal(sub.endpoint, null);
  assert.equal(sub.rawEndpointStored, false);
});

// ─── End-to-end API ──────────────────────────────────────────────────

async function withApiServer(callback) {
  const root = path.join(tmpRoot, `srv-${Date.now()}-${process.pid}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('GET /api/push-public-key returns 503 push_disabled when VAPID unset', async () => {
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: null,
      BHARAT_OS_VAPID_PRIVATE_KEY: null,
      BHARAT_OS_VAPID_SUBJECT: null
    },
    async () => {
      await withApiServer(async ({ baseUrl }) => {
        const r = await fetch(`${baseUrl}/api/push-public-key`);
        assert.equal(r.status, 503);
        const body = await r.json();
        assert.equal(body.error.code, 'push_disabled');
      });
    }
  );
});

test('GET /api/push-public-key returns the configured public key', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:dpo@example.com'
    },
    async () => {
      await withApiServer(async ({ baseUrl }) => {
        const r = await fetch(`${baseUrl}/api/push-public-key`);
        assert.equal(r.status, 200);
        const body = await r.json();
        assert.equal(body.publicKey, publicKey);
        assert.equal(body.subject, 'mailto:dpo@example.com');
      });
    }
  );
});

test('POST /api/push/subscriptions with storeDeliveryKeys=true refuses when VAPID unset', async () => {
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: null,
      BHARAT_OS_VAPID_PRIVATE_KEY: null,
      BHARAT_OS_VAPID_SUBJECT: null
    },
    async () => {
      await withApiServer(async ({ baseUrl, store }) => {
        const id = createIdentity({ displayName: 'W' });
        await store.saveIdentity(id);
        const r = await fetch(`${baseUrl}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identityId: id.id,
            endpoint: 'https://push.example/x',
            keys: { p256dh: 'p', auth: 'a' },
            storeDeliveryKeys: true
          })
        });
        assert.equal(r.status, 503);
      });
    }
  );
});

test('POST /api/push/subscriptions persists subscription; response strips raw endpoint+keys', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      await withApiServer(async ({ baseUrl, store }) => {
        const id = createIdentity({ displayName: 'W' });
        await store.saveIdentity(id);
        const recipient = fakeRecipient();
        const r = await fetch(`${baseUrl}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identityId: id.id,
            endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc',
            keys: { p256dh: recipient.p256dh, auth: recipient.auth },
            storeDeliveryKeys: true
          })
        });
        assert.equal(r.status, 201);
        const body = await r.json();
        // Response strips endpoint + keys (client already has them).
        assert.equal(body.subscription.endpoint, undefined);
        assert.equal(body.subscription.keys, undefined);
        // Stored record retains them.
        const stored = await store.readPushSubscription(body.subscription.subscriptionId);
        assert.ok(stored.endpoint);
        assert.ok(stored.keys.p256dh);
        assert.equal(stored.rawEndpointStored, true);
      });
    }
  );
});

test('Recovery flow pushes alert to paired-device subscription on /api/recovery/verify success', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  let pushCalled = false;
  let pushPayloadDecrypted = null;
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      // Capture the original fetch BEFORE installing the mock so
      // localhost calls (the test's own POST to the live API
      // server) pass through. Only intercept the push.mock URL.
      const originalFetch = global.fetch;
      await withMockFetch(
        async (url, init) => {
          if (typeof url === 'string' && url.startsWith('https://push.mock/')) {
            pushCalled = true;
            pushPayloadDecrypted = init?.body ?? null;
            return new Response('', { status: 201 });
          }
          return originalFetch(url, init);
        },
        async () => {
          await withApiServer(async ({ baseUrl, store }) => {
            // Worker identity.
            const id = createIdentity({ displayName: 'Lakshmi' });
            // Phone-OTP attestation so recovery can find the identity.
            id.attestations = {
              phone_verified: {
                status: 'verified',
                issuer: 'phone_otp',
                verifiedAt: new Date().toISOString(),
                phoneMasked: '+919****10'
              }
            };
            await store.saveIdentity(id);

            // Register a push subscription with delivery keys.
            const recipient = fakeRecipient();
            await fetch(`${baseUrl}/api/push/subscriptions`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                identityId: id.id,
                endpoint: 'https://push.mock/abc',
                keys: { p256dh: recipient.p256dh, auth: recipient.auth },
                storeDeliveryKeys: true
              })
            });

            // Seed an account_recovery-purpose OTP that we can verify.
            const otp = createPhoneOtp({
              identityId: id.id,
              phone: '+919876543210',
              purpose: 'account_recovery'
            });
            const { code, ...persisted } = otp;
            await store.savePhoneOtp(persisted);

            // POST verify.
            const r = await fetch(`${baseUrl}/api/recovery/verify`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ otpId: persisted.otpId, code })
            });
            assert.equal(r.status, 200);
            const body = await r.json();
            assert.equal(body.ok, true);
            // The recovery push was attempted via our mock.
            assert.equal(pushCalled, true);
            // Ledger has a recovery_alert.pushed entry.
            const ledger = await store.listLedger({ type: 'recovery_alert.pushed' });
            assert.ok(ledger.length >= 1);
            assert.match(ledger[0].endpointMasked, /push\.mock/);
          });
        }
      );
    }
  );
});
