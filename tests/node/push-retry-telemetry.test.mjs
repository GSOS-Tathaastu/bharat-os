// Phase 7.3 — Web Push retry + per-vendor telemetry tests.

import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  b64uEncode,
  generateVapidKeypair,
  parseRetryAfterMs,
  pushVendor,
  sendWebPush
} from '../../src/phase0/web-push.mjs';
import {
  pushCounterSnapshot,
  renderMetrics,
  resetMetrics
} from '../../src/phase0/metrics.mjs';

function fakeRecipient() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: b64uEncode(ecdh.getPublicKey()),
    auth: b64uEncode(randomBytes(16))
  };
}

function withMockFetch(impl, callback) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve(callback()).finally(() => {
    global.fetch = orig;
  });
}

// ─── pushVendor ─────────────────────────────────────────────────────

test('pushVendor maps endpoint host to vendor family', () => {
  assert.equal(pushVendor('https://fcm.googleapis.com/fcm/send/abc'), 'fcm');
  assert.equal(
    pushVendor('https://updates.push.services.mozilla.com/wpush/v2/xyz'),
    'autopush'
  );
  assert.equal(
    pushVendor('https://wns2-by3p.notify.windows.com/?token=abc'),
    'wns'
  );
  assert.equal(pushVendor('https://push.mock/abc'), 'mock');
  assert.equal(pushVendor('https://random.example/x'), 'other');
});

test('pushVendor handles malformed input', () => {
  assert.equal(pushVendor(null), 'other');
  assert.equal(pushVendor(''), 'other');
  assert.equal(pushVendor('not-a-url'), 'other');
});

// ─── parseRetryAfterMs ──────────────────────────────────────────────

test('parseRetryAfterMs accepts delta-seconds', () => {
  assert.equal(parseRetryAfterMs('5'), 5000);
  assert.equal(parseRetryAfterMs('0'), 0);
});

test('parseRetryAfterMs accepts HTTP-date', () => {
  const future = new Date(Date.now() + 10_000).toUTCString();
  const ms = parseRetryAfterMs(future);
  // Should be ~10 seconds, give or take parsing rounding.
  assert.ok(ms > 8_000 && ms <= 10_000);
});

test('parseRetryAfterMs caps at 60s (rogue header protection)', () => {
  assert.equal(parseRetryAfterMs('86400'), 60_000); // 24h → 60s cap
});

test('parseRetryAfterMs returns 0 on missing/malformed', () => {
  assert.equal(parseRetryAfterMs(null), 0);
  assert.equal(parseRetryAfterMs(''), 0);
  assert.equal(parseRetryAfterMs('not-a-number-or-date'), 0);
  // Past date — clamped to 0.
  const past = new Date(Date.now() - 60_000).toUTCString();
  assert.equal(parseRetryAfterMs(past), 0);
});

// ─── Per-vendor telemetry recording ─────────────────────────────────

test('sendWebPush records `success` outcome for vendor on 201', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  await withMockFetch(
    async () => new Response('', { status: 201 }),
    async () => {
      await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
    }
  );
  const snap = pushCounterSnapshot();
  assert.equal(snap['fcm|success'], 1);
});

test('sendWebPush records `gone` for 410 + reports shouldUnsubscribe', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let result;
  await withMockFetch(
    async () => new Response('', { status: 410 }),
    async () => {
      result = await sendWebPush({
        subscription: {
          endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
    }
  );
  assert.equal(result.shouldUnsubscribe, true);
  const snap = pushCounterSnapshot();
  assert.equal(snap['autopush|gone'], 1);
});

test('sendWebPush records `rejected` for non-retried 4xx', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  await withMockFetch(
    async () => new Response('Bad Request', { status: 400 }),
    async () => {
      await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
    }
  );
  const snap = pushCounterSnapshot();
  assert.equal(snap['fcm|rejected'], 1);
});

// ─── Retry on 429 (rate-limited) ────────────────────────────────────

test('sendWebPush retries once on 429, honours Retry-After, records retried_success', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let call = 0;
  let sleepCalledMs = null;
  await withMockFetch(
    async () => {
      call += 1;
      if (call === 1) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'retry-after': '3' }
        });
      }
      return new Response('', { status: 201 });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' },
        sleep: async (ms) => {
          sleepCalledMs = ms;
        }
      });
      assert.equal(result.ok, true);
      assert.equal(result.retried, true);
      assert.equal(result.retryAfterMs, 3000);
    }
  );
  assert.equal(call, 2);
  assert.equal(sleepCalledMs, 3000);
  const snap = pushCounterSnapshot();
  // First attempt: rate_limited. Second attempt: success (counted)
  // AND retried_success.
  assert.equal(snap['fcm|rate_limited'], 1);
  assert.equal(snap['fcm|success'], 1);
  assert.equal(snap['fcm|retried_success'], 1);
});

test('sendWebPush gives up on persistent 429 (retry=false branch) after one retry', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let call = 0;
  await withMockFetch(
    async () => {
      call += 1;
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'retry-after': '1' }
      });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' },
        sleep: async () => {}
      });
      assert.equal(result.ok, false);
      assert.equal(result.retried, true);
    }
  );
  // Exactly 2 calls — initial + 1 retry. Retries do NOT cascade.
  assert.equal(call, 2);
});

// ─── Retry on 5xx ───────────────────────────────────────────────────

test('sendWebPush retries once on 503, records retried_success', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let call = 0;
  let sleeps = [];
  await withMockFetch(
    async () => {
      call += 1;
      if (call === 1) return new Response('upstream timeout', { status: 503 });
      return new Response('', { status: 201 });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' },
        sleep: async (ms) => {
          sleeps.push(ms);
        }
      });
      assert.equal(result.ok, true);
      assert.equal(result.retried, true);
    }
  );
  assert.equal(call, 2);
  // Fixed 1s baseline for 5xx, NOT the Retry-After (header was absent).
  assert.deepEqual(sleeps, [1000]);
  const snap = pushCounterSnapshot();
  assert.equal(snap['fcm|rejected'], 1); // first 503
  assert.equal(snap['fcm|success'], 1); // second 201
  assert.equal(snap['fcm|retried_success'], 1);
});

// ─── Retry on network error ─────────────────────────────────────────

test('sendWebPush retries once on network error', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let call = 0;
  await withMockFetch(
    async () => {
      call += 1;
      if (call === 1) throw new TypeError('ECONNRESET');
      return new Response('', { status: 201 });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' },
        sleep: async () => {}
      });
      assert.equal(result.ok, true);
      assert.equal(result.retried, true);
    }
  );
  assert.equal(call, 2);
  const snap = pushCounterSnapshot();
  assert.equal(snap['fcm|network_error'], 1);
  assert.equal(snap['fcm|retried_success'], 1);
});

test('sendWebPush with retry: false skips retry on 429', async () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  let call = 0;
  await withMockFetch(
    async () => {
      call += 1;
      return new Response('rate-limited', {
        status: 429,
        headers: { 'retry-after': '5' }
      });
    },
    async () => {
      const result = await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' },
        retry: false,
        sleep: async () => {}
      });
      assert.equal(result.ok, false);
      assert.equal(result.retried, undefined); // never retried
    }
  );
  // Only one call when retry: false.
  assert.equal(call, 1);
});

// ─── Prometheus output ──────────────────────────────────────────────

test('renderMetrics emits bos_push_send_total samples', () => {
  resetMetrics();
  const { publicKey, privateKey } = generateVapidKeypair();
  const r = fakeRecipient();
  return withMockFetch(
    async () => new Response('', { status: 201 }),
    async () => {
      await sendWebPush({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          keys: { p256dh: r.p256dh, auth: r.auth }
        },
        payload: { type: 't' },
        vapid: { publicKey, privateKey, subject: 'mailto:x@y' }
      });
      const text = renderMetrics();
      assert.match(text, /# HELP bos_push_send_total/);
      assert.match(text, /# TYPE bos_push_send_total counter/);
      assert.match(text, /bos_push_send_total\{vendor="fcm",outcome="success"\} 1/);
    }
  );
});

test('renderMetrics handles empty push counter gracefully', () => {
  resetMetrics();
  const text = renderMetrics();
  // The TYPE/HELP lines are present even with no samples.
  assert.match(text, /# HELP bos_push_send_total/);
  assert.match(text, /# TYPE bos_push_send_total counter/);
});
