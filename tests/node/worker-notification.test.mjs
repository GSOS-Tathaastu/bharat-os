import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  createPushSubscriptionRecord,
  createWorkerNotification
} from '../../src/phase1/worker-notification.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

test('push subscription records hash endpoint metadata without storing raw push secrets', () => {
  const identity = createIdentity({ displayName: 'Push worker' });
  const subscription = createPushSubscriptionRecord({
    identityId: identity.id,
    endpoint: 'https://updates.push.services.example/send/secret-endpoint',
    keys: { p256dh: 'raw-p256dh-secret', auth: 'raw-auth-secret' },
    userAgent: 'Chrome Android',
    subscribedAt: '2026-05-23T11:00:00.000Z'
  });

  assert.match(subscription.subscriptionId, /^bos:push-subscription:/);
  assert.equal(subscription.mode, 'web_push');
  assert.equal(subscription.endpointHost, 'updates.push.services.example');
  assert.match(subscription.endpointHash, /^[a-f0-9]{64}$/);
  assert.equal(subscription.rawEndpointStored, false);
  assert.equal(subscription.rawKeysStored, false);
  assert.equal(subscription.keysPresent.p256dh, true);
  assert.equal(JSON.stringify(subscription).includes('secret-endpoint'), false);
  assert.equal(JSON.stringify(subscription).includes('raw-p256dh-secret'), false);
});

test('worker notification queues against subscription metadata without exact location', () => {
  const identity = createIdentity({ displayName: 'Notification worker' });
  const subscription = createPushSubscriptionRecord({
    identityId: identity.id,
    endpoint: 'https://push.example.test/send/abc',
    keys: { p256dh: 'p', auth: 'a' }
  });
  const notification = createWorkerNotification({
    workerId: identity.id,
    jobReference: 'job:brick-kiln-varanasi',
    title: 'Nearby job',
    body: 'Three-day work is available. Escrow is required.',
    subscription
  });

  assert.match(notification.notificationId, /^bos:worker-notification:/);
  assert.equal(notification.delivery.status, 'queued_web_push');
  assert.equal(notification.delivery.vapidIntegrated, false);
  assert.equal(notification.privacy.rawPushEndpointStored, false);
  assert.equal(notification.privacy.exactLocationIncluded, false);
  assert.equal(notification.subscriptionRef.endpointHash, subscription.endpointHash);
  assert.equal(JSON.stringify(notification).includes('https://push.example.test'), false);
});

test('worker notification blocks when the worker has not enabled notifications', () => {
  const identity = createIdentity({ displayName: 'No push worker' });
  const notification = createWorkerNotification({
    workerId: identity.id,
    jobReference: 'job:no-subscription',
    body: 'Work is available.'
  });

  assert.equal(notification.delivery.status, 'blocked_no_subscription');
  assert.equal(notification.delivery.reason, 'worker has not enabled notifications');
  assert.equal(notification.subscriptionRef, null);
});

test('store persists push subscriptions and worker notification ledger evidence', async () => {
  const { store } = await freshStore('worker-notification-store');
  const identity = createIdentity({ displayName: 'Stored push worker' });
  const subscription = createPushSubscriptionRecord({ identityId: identity.id });
  const notification = createWorkerNotification({
    workerId: identity.id,
    jobReference: 'job:stored',
    body: 'Stored work alert.',
    subscription
  });

  await store.savePushSubscription(subscription);
  await store.saveWorkerNotification(notification);

  assert.equal((await store.readPushSubscription(subscription.subscriptionId)).identityId, identity.id);
  assert.equal((await store.listPushSubscriptions()).length, 1);
  assert.equal((await store.readWorkerNotification(notification.notificationId)).workerId, identity.id);
  assert.equal((await store.listWorkerNotifications()).length, 1);
  assert.equal((await store.listLedger({ type: 'push_subscription.saved' })).length, 1);
  const notificationEvents = await store.listLedger({ type: 'worker_notification.queued' });
  assert.equal(notificationEvents.length, 1);
  assert.equal(notificationEvents[0].deliveryStatus, 'queued_local_notification');
});
