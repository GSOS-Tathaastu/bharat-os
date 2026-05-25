// Phase 4.1 — token-bucket rate limiter.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientKey,
  createLimiter,
  createTokenBucket,
  DEFAULT_RATE_POLICIES,
  policyFor,
  tryConsume
} from '../../src/phase0/rate-limiter.mjs';

test('createTokenBucket initialises with full capacity', () => {
  const bucket = createTokenBucket({ capacity: 10, refillPerSecond: 1 });
  assert.equal(bucket.tokens, 10);
  assert.equal(bucket.capacity, 10);
  assert.equal(bucket.refillPerSecond, 1);
});

test('createTokenBucket refuses non-positive capacity', () => {
  assert.throws(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 }), /positive/);
  assert.throws(() => createTokenBucket({ capacity: -5, refillPerSecond: 1 }), /positive/);
});

test('tryConsume drains tokens one at a time', () => {
  const at = 1_000_000;
  const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 0, at });
  const r1 = tryConsume(bucket, 1, { at });
  const r2 = tryConsume(bucket, 1, { at });
  const r3 = tryConsume(bucket, 1, { at });
  const r4 = tryConsume(bucket, 1, { at });
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, true);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
});

test('tokens refill linearly with time', () => {
  const start = 1_000_000;
  const bucket = createTokenBucket({ capacity: 10, refillPerSecond: 5, at: start });
  // Drain to empty.
  for (let i = 0; i < 10; i += 1) tryConsume(bucket, 1, { at: start });
  assert.equal(bucket.tokens, 0);
  // 1 second later — 5 tokens refilled.
  const oneSecondLater = start + 1000;
  const result = tryConsume(bucket, 1, { at: oneSecondLater });
  assert.equal(result.allowed, true);
  // 4 should remain (5 refilled, 1 consumed).
  assert.ok(Math.abs(result.remaining - 4) < 1e-6);
});

test('tryConsume reports retryAfterSeconds when over budget', () => {
  const at = 1_000_000;
  const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1, at });
  tryConsume(bucket, 1, { at });
  tryConsume(bucket, 1, { at });
  const over = tryConsume(bucket, 1, { at });
  assert.equal(over.allowed, false);
  // Need 1 token at 1/sec = 1 second wait.
  assert.equal(Math.round(over.retryAfterSeconds), 1);
});

test('createLimiter isolates buckets per key', () => {
  const limiter = createLimiter();
  const result1 = limiter.consume('alice', 'read');
  const result2 = limiter.consume('bob', 'read');
  assert.equal(result1.allowed, true);
  assert.equal(result2.allowed, true);
  // Each starts at full capacity.
  assert.equal(result1.remaining, DEFAULT_RATE_POLICIES.read.capacity - 1);
  assert.equal(result2.remaining, DEFAULT_RATE_POLICIES.read.capacity - 1);
});

test('createLimiter routes different policies through different buckets', () => {
  const limiter = createLimiter();
  // Exhaust the 'expensive' policy for alice.
  for (let i = 0; i < DEFAULT_RATE_POLICIES.expensive.capacity; i += 1) {
    const r = limiter.consume('alice', 'expensive');
    assert.equal(r.allowed, true);
  }
  const over = limiter.consume('alice', 'expensive');
  assert.equal(over.allowed, false);
  // 'read' policy for the same key still has tokens.
  const readResult = limiter.consume('alice', 'read');
  assert.equal(readResult.allowed, true);
});

test('createLimiter rejects unknown policy names', () => {
  const limiter = createLimiter();
  assert.throws(() => limiter.consume('alice', 'not-a-policy'), /unknown policy/);
});

test('policyFor maps health endpoints to probe policy', () => {
  assert.equal(policyFor('GET', '/health'), 'probe');
  assert.equal(policyFor('GET', '/healthz'), 'probe');
  assert.equal(policyFor('GET', '/readyz'), 'probe');
  assert.equal(policyFor('GET', '/metrics'), 'probe');
});

test('policyFor maps expensive routes correctly', () => {
  assert.equal(policyFor('POST', '/api/identities'), 'expensive');
  assert.equal(policyFor('DELETE', '/api/identities/bos:person:abc'), 'expensive');
  assert.equal(policyFor('GET', '/api/identities/bos:person:abc/export'), 'expensive');
  assert.equal(policyFor('GET', '/api/identities/bos:person:abc/erasure-preview'), 'expensive');
});

test('policyFor defaults writes to write policy and reads to read', () => {
  assert.equal(policyFor('POST', '/api/orchestrations'), 'write');
  assert.equal(policyFor('PATCH', '/api/anything'), 'write');
  assert.equal(policyFor('GET', '/api/orchestrations'), 'read');
});

test('clientKey extracts socket address by default', () => {
  const request = { socket: { remoteAddress: '203.0.113.5' }, headers: {} };
  assert.equal(clientKey(request), '203.0.113.5');
});

test('clientKey honours X-Forwarded-For when trustProxy is enabled', () => {
  const request = {
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.5' }
  };
  // Default — does NOT trust the header.
  assert.equal(clientKey(request), '10.0.0.1');
  // Trust the proxy — first hop is the original client.
  assert.equal(clientKey(request, { trustProxy: true }), '198.51.100.1');
});
