// Phase 7.1 — push alerts for audit-significant events.

import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import {
  applyRecoveryCooldown
} from '../../src/phase1/recovery-cooldown.mjs';
import {
  b64uEncode,
  generateVapidKeypair,
  sendPushToIdentity
} from '../../src/phase0/web-push.mjs';
import { createMeshContributionEvent } from '../../src/phase1/mesh-contribution.mjs';
import {
  createWithdrawalRequest
} from '../../src/phase1/mesh-withdrawal.mjs';
import {
  createEarningsEntry
} from '../../src/phase1/earnings-log.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'push-alerts-tests');

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

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

// ─── sendPushToIdentity (unit) ──────────────────────────────────────

test('sendPushToIdentity skips silently when VAPID unconfigured', async () => {
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: null,
      BHARAT_OS_VAPID_PRIVATE_KEY: null,
      BHARAT_OS_VAPID_SUBJECT: null
    },
    async () => {
      const { store } = await freshSqlite('vapid-unset');
      const id = createIdentity({ displayName: 'W' });
      await store.saveIdentity(id);
      const result = await sendPushToIdentity(
        store,
        id.id,
        { type: 'test', title: 't', body: 'b' },
        { ledgerType: 'test.pushed' }
      );
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'vapid_unconfigured');
      assert.equal(result.sent, 0);
      // No ledger event when skipped.
      const ledger = await store.listLedger({ type: 'test.pushed' });
      assert.equal(ledger.length, 0);
      store.close();
    }
  );
});

test('sendPushToIdentity rejects missing required params', async () => {
  const { store } = await freshSqlite('missing-params');
  await assert.rejects(
    sendPushToIdentity(store, null, { type: 't' }, { ledgerType: 'x' }),
    /identityId is required/
  );
  await assert.rejects(
    sendPushToIdentity(store, 'bos:person:x', null, { ledgerType: 'x' }),
    /payload is required/
  );
  await assert.rejects(
    sendPushToIdentity(store, 'bos:person:x', { type: 't' }, {}),
    /ledgerType is required/
  );
  store.close();
});

test('sendPushToIdentity returns 0 sent when identity has no delivery-keyed subs', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y'
    },
    async () => {
      const { store } = await freshSqlite('no-subs');
      const id = createIdentity({ displayName: 'W' });
      await store.saveIdentity(id);
      const result = await sendPushToIdentity(
        store,
        id.id,
        { type: 't', title: 't', body: 'b' },
        { ledgerType: 'test.pushed' }
      );
      assert.equal(result.skipped, false);
      assert.equal(result.sent, 0);
      assert.equal(result.attempted, 0);
      store.close();
    }
  );
});

// ─── End-to-end push wires ──────────────────────────────────────────

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
  await fetch(`${baseUrl}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identityId,
      endpoint: 'https://push.mock/abc',
      keys: { p256dh: r.p256dh, auth: r.auth },
      storeDeliveryKeys: true
    })
  });
}

function pushMockFetch(captureRef) {
  const original = global.fetch;
  global.fetch = async (url, init) => {
    if (typeof url === 'string' && url.startsWith('https://push.mock/')) {
      captureRef.calls.push({ url, headers: init?.headers });
      return new Response('', { status: 201 });
    }
    return original(url, init);
  };
  return () => {
    global.fetch = original;
  };
}

test('cooldown-clear pushes "lifted by support" alert to paired devices', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y',
      BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32)
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          // Identity with active cooldown.
          const baseIdentity = createIdentity({ displayName: 'W' });
          const identity = applyRecoveryCooldown(baseIdentity);
          await store.saveIdentity(identity);
          // Register a delivery-keyed subscription.
          await registerPushSubscription(baseUrl, identity.id);
          // Admin clears the cooldown.
          const resp = await fetch(
            `${baseUrl}/api/admin/identities/${encodeURIComponent(identity.id)}/recovery-cooldown/clear`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: 'Bearer ' + 'a'.repeat(32),
                'x-bharat-os-operator': 'sim-swap-incident-ops'
              },
              body: JSON.stringify({
                reason: 'user confirmed identity via secondary channel'
              })
            }
          );
          assert.equal(resp.status, 200);
          // Push.mock was hit.
          assert.equal(capture.calls.length, 1);
          // Ledger has cooldown_override.pushed.
          const ledger = await store.listLedger({ type: 'cooldown_override.pushed' });
          assert.ok(ledger.length >= 1);
          assert.match(ledger[0].endpointMasked, /push\.mock/);
        });
      } finally {
        restore();
      }
    }
  );
});

test('mesh-withdrawal-paid pushes confirmation to the worker', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y',
      BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32)
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const identity = createIdentity({ displayName: 'W' });
          await store.saveIdentity(identity);
          // Seed mesh-contribution events that sum > ₹10 floor.
          for (let i = 0; i < 15; i += 1) {
            await store.saveMeshContributionEvent(
              createMeshContributionEvent({
                operatorId: identity.id,
                nodeId: 'n1',
                workloadType: 'inference',
                tokens: 1_000_000,
                at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`
              })
            );
          }
          await registerPushSubscription(baseUrl, identity.id);
          // Worker requests withdrawal.
          const reqResp = await fetch(
            `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
            }
          );
          const { withdrawal } = await reqResp.json();
          // Ops marks paid.
          await fetch(
            `${baseUrl}/api/admin/mesh/withdrawals/${encodeURIComponent(withdrawal.requestId)}/paid`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: 'Bearer ' + 'a'.repeat(32)
              },
              body: JSON.stringify({ providerReference: 'razorpay-12345' })
            }
          );
          // Push was sent.
          assert.equal(capture.calls.length, 1);
          // Ledger entry exists.
          const ledger = await store.listLedger({ type: 'mesh_withdrawal.pushed' });
          assert.ok(ledger.length >= 1);
          assert.equal(ledger[0].payloadType, 'mesh_withdrawal_paid');
        });
      } finally {
        restore();
      }
    }
  );
});

test('mesh-withdrawal-failed also pushes (alerting the worker their cash-out broke)', async () => {
  const { publicKey, privateKey } = generateVapidKeypair();
  await withEnv(
    {
      BHARAT_OS_VAPID_PUBLIC_KEY: publicKey,
      BHARAT_OS_VAPID_PRIVATE_KEY: privateKey,
      BHARAT_OS_VAPID_SUBJECT: 'mailto:x@y',
      BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32)
    },
    async () => {
      const capture = { calls: [] };
      const restore = pushMockFetch(capture);
      try {
        await withApiServer(async ({ baseUrl, store }) => {
          const identity = createIdentity({ displayName: 'W' });
          await store.saveIdentity(identity);
          for (let i = 0; i < 15; i += 1) {
            await store.saveMeshContributionEvent(
              createMeshContributionEvent({
                operatorId: identity.id,
                nodeId: 'n1',
                workloadType: 'inference',
                tokens: 1_000_000,
                at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`
              })
            );
          }
          await registerPushSubscription(baseUrl, identity.id);
          const reqResp = await fetch(
            `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
            }
          );
          const { withdrawal } = await reqResp.json();
          await fetch(
            `${baseUrl}/api/admin/mesh/withdrawals/${encodeURIComponent(withdrawal.requestId)}/failed`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: 'Bearer ' + 'a'.repeat(32)
              },
              body: JSON.stringify({ reason: 'partner reported invalid UPI' })
            }
          );
          // Push was sent.
          assert.equal(capture.calls.length, 1);
          const ledger = await store.listLedger({ type: 'mesh_withdrawal.pushed' });
          assert.ok(ledger.length >= 1);
          assert.equal(ledger[0].payloadType, 'mesh_withdrawal_failed');
        });
      } finally {
        restore();
      }
    }
  );
});

test('MFI bundle read pushes notification to the worker', async () => {
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
          const identity = createIdentity({ displayName: 'Lakshmi' });
          await store.saveIdentity(identity);
          await registerPushSubscription(baseUrl, identity.id);
          // Worker issues an MFI consent.
          const consentResp = await fetch(
            `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                mfiName: 'Bajaj Finserv',
                purpose: 'Loan',
                financialYear: '2025-26'
              })
            }
          );
          const { consent } = await consentResp.json();
          // MFI fetches the bundle.
          const r = await fetch(
            `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
          );
          assert.equal(r.status, 200);
          // Push was sent.
          assert.equal(capture.calls.length, 1);
          const ledger = await store.listLedger({ type: 'income_verification.pushed' });
          assert.ok(ledger.length >= 1);
          assert.equal(ledger[0].payloadType, 'income_verification_read');
        });
      } finally {
        restore();
      }
    }
  );
});

test('push events do NOT fire when VAPID is unconfigured (graceful degradation)', async () => {
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
          const identity = createIdentity({ displayName: 'W' });
          await store.saveIdentity(identity);
          // Try to issue an MFI consent + have it fetched. The
          // consent issuance succeeds (push is best-effort) but
          // no push goes out because VAPID is unset.
          const consentResp = await fetch(
            `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                mfiName: 'Bajaj',
                purpose: 'Loan',
                financialYear: '2025-26'
              })
            }
          );
          const { consent } = await consentResp.json();
          const r = await fetch(
            `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
          );
          assert.equal(r.status, 200);
          // No push happened.
          assert.equal(capture.calls.length, 0);
          // No `*.pushed` ledger events either.
          const ledger = await store.listLedger({ type: 'income_verification.pushed' });
          assert.equal(ledger.length, 0);
        });
      } finally {
        restore();
      }
    }
  );
});
