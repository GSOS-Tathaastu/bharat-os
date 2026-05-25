// Phase 7.2 — §9A worker-notification real VAPID delivery tests.

import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { b64uEncode, generateVapidKeypair } from '../../src/phase0/web-push.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'worker-notification-push-tests');

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

function fakeRecipient() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: b64uEncode(ecdh.getPublicKey()),
    auth: b64uEncode(randomBytes(16))
  };
}

function pushMockFetch(captureRef) {
  const original = global.fetch;
  global.fetch = async (url, init) => {
    if (typeof url === 'string' && url.startsWith('https://push.mock/')) {
      captureRef.calls.push({ url, headers: init?.headers, body: init?.body });
      return new Response('', { status: 201 });
    }
    return original(url, init);
  };
  return () => {
    global.fetch = original;
  };
}

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

async function registerPushSubscription(baseUrl, identityId) {
  const r = fakeRecipient();
  const resp = await fetch(`${baseUrl}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identityId,
      endpoint: 'https://push.mock/abc',
      keys: { p256dh: r.p256dh, auth: r.auth },
      storeDeliveryKeys: true
    })
  });
  return await resp.json();
}

// ─── POST /api/worker-notifications — Phase 7.2 wire ────────────────

test('worker-notification with delivery-keyed subscription delivers real Web Push', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const worker = createIdentity({ displayName: 'Rajesh' });
          await store.saveIdentity(worker);
          await registerPushSubscription(baseUrl, worker.id);

          // Create a worker-notification — the §9A scaffold's
          // primary entry point. With Phase 7.2, this now sends
          // a real push.
          const resp = await fetch(`${baseUrl}/api/worker-notifications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workerId: worker.id,
              jobReference: 'job:bos:order-12345',
              title: 'New delivery available',
              body: '₹40 + ₹15 tip; 1.8 km from your current location',
              locale: 'hi-IN',
              urgency: 'high'
            })
          });
          assert.equal(resp.status, 201);
          const body = await resp.json();
          assert.equal(body.ok, true);
          // §9A scaffold's vapidIntegrated flips to true now that
          // we deliver for real.
          assert.equal(body.notification.delivery.vapidIntegrated, true);
          assert.equal(body.notification.delivery.sent, true);
          assert.equal(body.notification.delivery.status, 'delivered_web_push');
          assert.equal(body.notification.delivery.sentToEndpoints, 1);

          // Real push.mock URL was hit.
          assert.equal(capture.calls.length, 1);
          assert.match(capture.calls[0].headers.authorization, /^vapid t=/);

          // Audit ledger has the push event.
          const ledger = await store.listLedger({ type: 'worker_notification.pushed' });
          assert.ok(ledger.length >= 1);
          assert.equal(ledger[0].payloadType, 'worker_job_alert');
        });
      } finally {
        restore();
      }
    }
  );
});

test('worker-notification with NO subscription still records the request (blocked_no_subscription)', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      await withApiServer(async ({ baseUrl, store }) => {
        const worker = createIdentity({ displayName: 'NoSubs' });
        await store.saveIdentity(worker);
        // No subscription registered.
        const resp = await fetch(`${baseUrl}/api/worker-notifications`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workerId: worker.id,
            jobReference: 'job:x',
            title: 't',
            body: 'b'
          })
        });
        // 202 — request accepted but not deliverable.
        assert.equal(resp.status, 202);
        const body = await resp.json();
        assert.equal(body.notification.delivery.status, 'blocked_no_subscription');
        assert.equal(body.notification.delivery.vapidIntegrated, false);
        assert.equal(body.notification.delivery.sent, false);
      });
    }
  );
});

test('worker-notification with scaffold-only subscription (no delivery keys) falls back to scaffold state', async () => {
  // Phase 2a.4 backward-compat path: caller didn't pass
  // storeDeliveryKeys: true, so the subscription record has no
  // raw endpoint. The notification request succeeds but doesn't
  // push.
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const worker = createIdentity({ displayName: 'Scaffold' });
          await store.saveIdentity(worker);
          // Register WITHOUT storeDeliveryKeys (Phase 2a.4 mode).
          const r = fakeRecipient();
          await fetch(`${baseUrl}/api/push/subscriptions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              identityId: worker.id,
              endpoint: 'https://push.mock/scaffold',
              keys: { p256dh: r.p256dh, auth: r.auth }
              // storeDeliveryKeys NOT set
            })
          });
          const resp = await fetch(`${baseUrl}/api/worker-notifications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workerId: worker.id,
              jobReference: 'job:y',
              title: 't',
              body: 'b'
            })
          });
          // The notification was created (Phase 2a.4 still has the
          // local_notification fallback path) but the push.mock
          // was NOT hit because the subscription lacks delivery keys.
          assert.equal(capture.calls.length, 0);
          const body = await resp.json();
          // Phase 2a.4's scaffold path kicks in: queued_local_notification.
          assert.equal(body.notification.delivery.vapidIntegrated, false);
        });
      } finally {
        restore();
      }
    }
  );
});

test('worker-notification gracefully falls back when VAPID is unconfigured', async () => {
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: null,
      BHARAT_OS_VAPID_PRIVATE_KEY: null,
      BHARAT_OS_VAPID_SUBJECT: null
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const worker = createIdentity({ displayName: 'NoVapid' });
          await store.saveIdentity(worker);
          // Note: register without storeDeliveryKeys (would fail
          // anyway since VAPID is unset — Phase 7.0 refuses with 503).
          const r = fakeRecipient();
          await fetch(`${baseUrl}/api/push/subscriptions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              identityId: worker.id,
              endpoint: 'https://push.mock/x',
              keys: { p256dh: r.p256dh, auth: r.auth }
              // No storeDeliveryKeys.
            })
          });
          const resp = await fetch(`${baseUrl}/api/worker-notifications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workerId: worker.id,
              jobReference: 'job:z',
              title: 't',
              body: 'b'
            })
          });
          // No push attempted (VAPID unset).
          assert.equal(capture.calls.length, 0);
          // The notification was still recorded.
          const body = await resp.json();
          assert.ok(body.notification);
          // vapidIntegrated stays false (Phase 2a.4 fallback).
          assert.equal(body.notification.delivery.vapidIntegrated, false);
        });
      } finally {
        restore();
      }
    }
  );
});

test('worker-notification push uses high urgency when notification urgency is "high"', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const worker = createIdentity({ displayName: 'Urgent' });
          await store.saveIdentity(worker);
          await registerPushSubscription(baseUrl, worker.id);
          await fetch(`${baseUrl}/api/worker-notifications`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workerId: worker.id,
              jobReference: 'job:emergency',
              title: 'urgent',
              body: 'b',
              urgency: 'high'
            })
          });
          assert.equal(capture.calls.length, 1);
          // The Urgency header on the push HTTP request should be 'high'.
          const urgency = capture.calls[0].headers.urgency;
          assert.equal(urgency, 'high');
        });
      } finally {
        restore();
      }
    }
  );
});
