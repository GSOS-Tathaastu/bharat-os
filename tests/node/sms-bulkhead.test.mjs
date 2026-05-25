// Phase 5.8 — SMS bulkhead concurrency cap + in-flight gauge tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBulkheadProvider,
  createFallbackProvider
} from '../../src/phase0/sms-provider.mjs';
import {
  renderMetrics,
  resetMetrics,
  smsInflightSnapshot
} from '../../src/phase0/metrics.mjs';

function rejectedError(provider, msg = 'vendor said no') {
  const e = new Error(`${provider} rejected: ${msg}`);
  e.code = 'SMS_PROVIDER_REJECTED';
  e.provider = provider;
  return e;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A fake provider whose send hangs on a manually-controlled
// deferred — lets the test simulate slow vendor responses without
// actual sleeps.
function controllableProvider(name) {
  const pending = [];
  return {
    name,
    pending,
    async send() {
      const d = deferred();
      pending.push(d);
      return d.promise;
    }
  };
}

// ─── Bulkhead capacity ────────────────────────────────────────────────

test('createBulkheadProvider rejects calls beyond maxConcurrent with SMS_PROVIDER_BULKHEAD_FULL', async () => {
  resetMetrics();
  const upstream = controllableProvider('alpha');
  const bulkhead = createBulkheadProvider(upstream, { maxConcurrent: 2 });

  // Fire 3 calls. First two should succeed in occupying a slot;
  // third should reject immediately.
  const a = bulkhead.send({ phone: '+919876543210', body: 'x' });
  const b = bulkhead.send({ phone: '+919876543210', body: 'x' });
  // Both should be in-flight now.
  assert.equal(upstream.pending.length, 2);

  try {
    await bulkhead.send({ phone: '+919876543210', body: 'x' });
    assert.fail('expected SMS_PROVIDER_BULKHEAD_FULL');
  } catch (error) {
    assert.equal(error.code, 'SMS_PROVIDER_BULKHEAD_FULL');
    assert.equal(error.provider, 'alpha');
    assert.equal(error.inflight, 2);
    assert.equal(error.maxConcurrent, 2);
  }

  // Resolve the first two so the test cleans up cleanly.
  upstream.pending[0].resolve({ ok: true, providerMessageId: 'a-1' });
  upstream.pending[1].resolve({ ok: true, providerMessageId: 'a-2' });
  await a;
  await b;
});

test('bulkhead releases a slot when a send completes (success path)', async () => {
  resetMetrics();
  const upstream = controllableProvider('beta');
  const bulkhead = createBulkheadProvider(upstream, { maxConcurrent: 1 });
  const first = bulkhead.send({ phone: '+919876543210', body: 'x' });
  // Slot is occupied.
  assert.equal(bulkhead._bulkhead.inflight, 1);
  upstream.pending[0].resolve({ ok: true, providerMessageId: 'beta-1' });
  await first;
  assert.equal(bulkhead._bulkhead.inflight, 0);
  // Subsequent call now succeeds.
  const second = bulkhead.send({ phone: '+919876543210', body: 'x' });
  upstream.pending[1].resolve({ ok: true, providerMessageId: 'beta-2' });
  await second;
});

test('bulkhead releases a slot when a send rejects (error path)', async () => {
  resetMetrics();
  const upstream = controllableProvider('gamma');
  const bulkhead = createBulkheadProvider(upstream, { maxConcurrent: 1 });
  const call = bulkhead.send({ phone: '+919876543210', body: 'x' });
  upstream.pending[0].reject(rejectedError('gamma'));
  try {
    await call;
  } catch (_error) {
    // expected
  }
  // Slot must be released even on error.
  assert.equal(bulkhead._bulkhead.inflight, 0);
});

// ─── In-flight gauge ──────────────────────────────────────────────────

test('bos_sms_inflight gauge tracks active calls per provider', async () => {
  resetMetrics();
  const upstream = controllableProvider('delta');
  const bulkhead = createBulkheadProvider(upstream, { maxConcurrent: 5 });
  const a = bulkhead.send({ phone: '+919876543210', body: 'x' });
  const b = bulkhead.send({ phone: '+919876543210', body: 'x' });
  // 2 in flight.
  const snap = smsInflightSnapshot();
  assert.equal(snap.delta, 2);

  const text = renderMetrics();
  assert.match(text, /# HELP bos_sms_inflight/);
  assert.match(text, /# TYPE bos_sms_inflight gauge/);
  assert.match(text, /bos_sms_inflight\{provider="delta"\} 2/);

  // Drain.
  upstream.pending[0].resolve({ ok: true, providerMessageId: 'd-1' });
  upstream.pending[1].resolve({ ok: true, providerMessageId: 'd-2' });
  await a;
  await b;
  assert.equal(smsInflightSnapshot().delta, 0);
});

test('bos_sms_inflight gauge is isolated per provider', async () => {
  resetMetrics();
  const upstreamA = controllableProvider('eps');
  const upstreamB = controllableProvider('zeta');
  const ba = createBulkheadProvider(upstreamA, { maxConcurrent: 5 });
  const bb = createBulkheadProvider(upstreamB, { maxConcurrent: 5 });
  const aCall = ba.send({ phone: '+919876543210', body: 'x' });
  bb.send({ phone: '+919876543210', body: 'x' }).catch(() => {});
  bb.send({ phone: '+919876543210', body: 'x' }).catch(() => {});
  const snap = smsInflightSnapshot();
  assert.equal(snap.eps, 1);
  assert.equal(snap.zeta, 2);

  upstreamA.pending[0].resolve({ ok: true, providerMessageId: 'eps-1' });
  upstreamB.pending[0].resolve({ ok: true, providerMessageId: 'zeta-1' });
  upstreamB.pending[1].resolve({ ok: true, providerMessageId: 'zeta-2' });
  await aCall;
});

// ─── Fallback chain × bulkhead ───────────────────────────────────────

test('fallback chain treats SMS_PROVIDER_BULKHEAD_FULL as recoverable', async () => {
  resetMetrics();
  // Fill alpha's bulkhead so the next call fails-fast.
  const upstreamA = controllableProvider('alpha-bk');
  const ba = createBulkheadProvider(upstreamA, { maxConcurrent: 1 });
  // Occupy the slot.
  const hung = ba.send({ phone: '+919876543210', body: 'x' });
  assert.equal(ba._bulkhead.inflight, 1);

  const fastSecond = {
    name: 'beta-bk',
    async send() {
      return { ok: true, providerMessageId: 'b-1' };
    }
  };
  const chain = createFallbackProvider([ba, fastSecond]);
  const result = await chain.send({ phone: '+919876543210', body: 'x' });
  assert.equal(result.providerMessageId, 'b-1');
  assert.deepEqual(result.fallbackChain, ['alpha-bk', 'beta-bk']);
  assert.equal(result.fallbackAttempts[0].code, 'SMS_PROVIDER_BULKHEAD_FULL');

  // Cleanup.
  upstreamA.pending[0].resolve({ ok: true, providerMessageId: 'a-1' });
  await hung;
});

test('fallback chain reports SMS_PROVIDER_FALLBACK_EXHAUSTED when every provider is bulkhead-full', async () => {
  resetMetrics();
  const upA = controllableProvider('a');
  const upB = controllableProvider('b');
  const ba = createBulkheadProvider(upA, { maxConcurrent: 1 });
  const bb = createBulkheadProvider(upB, { maxConcurrent: 1 });
  // Fill both.
  const ah = ba.send({ phone: '+919876543210', body: 'x' });
  const bh = bb.send({ phone: '+919876543210', body: 'x' });
  const chain = createFallbackProvider([ba, bb]);
  try {
    await chain.send({ phone: '+919876543210', body: 'x' });
    assert.fail('expected exhausted');
  } catch (error) {
    assert.equal(error.code, 'SMS_PROVIDER_FALLBACK_EXHAUSTED');
    assert.equal(error.attempts.length, 2);
    assert.equal(error.attempts[0].code, 'SMS_PROVIDER_BULKHEAD_FULL');
    assert.equal(error.attempts[1].code, 'SMS_PROVIDER_BULKHEAD_FULL');
  }
  upA.pending[0].resolve({ ok: true, providerMessageId: 'a-1' });
  upB.pending[0].resolve({ ok: true, providerMessageId: 'b-1' });
  await ah;
  await bh;
});
