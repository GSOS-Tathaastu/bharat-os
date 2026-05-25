// Phase 5.2 — post-recovery cooldown tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRecoveryCooldown,
  assertNoCooldown,
  clearRecoveryCooldown,
  COOLDOWN_SCOPES,
  cooldownState,
  DEFAULT_RECOVERY_COOLDOWN_MS,
  RECOVERY_COOLDOWN_PROTOCOL_VERSION
} from '../../src/phase1/recovery-cooldown.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createLimiter,
  DEFAULT_RATE_POLICIES
} from '../../src/phase0/rate-limiter.mjs';

function freshIdentity() {
  return createIdentity({ displayName: 'Test User' });
}

test('applyRecoveryCooldown stamps a 24h until on the identity', () => {
  const at = Date.parse('2026-05-25T12:00:00.000Z');
  const identity = freshIdentity();
  const cooled = applyRecoveryCooldown(identity, { at });
  assert.equal(
    cooled.recoveryCooldown.protocolVersion,
    RECOVERY_COOLDOWN_PROTOCOL_VERSION
  );
  assert.equal(cooled.recoveryCooldown.reason, 'account_recovery');
  assert.equal(cooled.recoveryCooldown.ttlMs, DEFAULT_RECOVERY_COOLDOWN_MS);
  assert.equal(cooled.recoveryCooldown.activatedAt, '2026-05-25T12:00:00.000Z');
  assert.equal(cooled.recoveryCooldown.until, '2026-05-26T12:00:00.000Z');
  // Pure function — original identity untouched.
  assert.equal(identity.recoveryCooldown, undefined);
});

test('applyRecoveryCooldown rejects bad inputs', () => {
  assert.throws(() => applyRecoveryCooldown(null), /identity is required/);
  assert.throws(() => applyRecoveryCooldown({}), /identity is required/);
  assert.throws(
    () => applyRecoveryCooldown(freshIdentity(), { ttlMs: 0 }),
    /ttlMs must be a positive number/
  );
  assert.throws(
    () => applyRecoveryCooldown(freshIdentity(), { ttlMs: -1 }),
    /ttlMs must be a positive number/
  );
});

test('applyRecoveryCooldown honours custom reason + ttl', () => {
  const at = Date.parse('2026-05-25T12:00:00.000Z');
  const identity = freshIdentity();
  const cooled = applyRecoveryCooldown(identity, {
    at,
    reason: 'sim_swap_alert',
    ttlMs: 60 * 60 * 1000
  });
  assert.equal(cooled.recoveryCooldown.reason, 'sim_swap_alert');
  assert.equal(cooled.recoveryCooldown.ttlMs, 60 * 60 * 1000);
  assert.equal(cooled.recoveryCooldown.until, '2026-05-25T13:00:00.000Z');
});

test('cooldownState returns inactive for fresh identities', () => {
  const state = cooldownState(freshIdentity());
  assert.deepEqual(state, {
    active: false,
    until: null,
    secondsRemaining: 0,
    reason: null
  });
});

test('cooldownState reports active during the window + inactive after', () => {
  const start = Date.parse('2026-05-25T12:00:00.000Z');
  const cooled = applyRecoveryCooldown(freshIdentity(), { at: start });

  const duringWindow = cooldownState(cooled, { at: start + 60 * 60 * 1000 });
  assert.equal(duringWindow.active, true);
  assert.equal(duringWindow.reason, 'account_recovery');
  assert.equal(duringWindow.until, '2026-05-26T12:00:00.000Z');
  // 23h remaining = 82800s
  assert.equal(duringWindow.secondsRemaining, 23 * 3600);

  const expired = cooldownState(cooled, { at: start + 25 * 60 * 60 * 1000 });
  assert.equal(expired.active, false);
  assert.equal(expired.secondsRemaining, 0);
  // until stays populated even after expiry for audit reasons.
  assert.equal(expired.until, '2026-05-26T12:00:00.000Z');
});

test('cooldownState tolerates corrupt until field', () => {
  const broken = {
    ...freshIdentity(),
    recoveryCooldown: { until: 'not-a-date' }
  };
  const state = cooldownState(broken);
  assert.equal(state.active, false);
});

test('assertNoCooldown passes when identity is fresh', () => {
  assert.doesNotThrow(() => assertNoCooldown(freshIdentity()));
});

test('assertNoCooldown throws RECOVERY_COOLDOWN_ACTIVE during the window', () => {
  const start = Date.parse('2026-05-25T12:00:00.000Z');
  const cooled = applyRecoveryCooldown(freshIdentity(), { at: start });
  let caught = null;
  try {
    assertNoCooldown(cooled, {
      at: start + 3600 * 1000,
      scope: COOLDOWN_SCOPES.IDENTITY_DELETION
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'expected assertNoCooldown to throw');
  assert.equal(caught.code, 'RECOVERY_COOLDOWN_ACTIVE');
  assert.equal(caught.scope, COOLDOWN_SCOPES.IDENTITY_DELETION);
  assert.equal(caught.until, '2026-05-26T12:00:00.000Z');
  assert.ok(caught.secondsRemaining > 0);
  assert.equal(caught.reason, 'account_recovery');
});

test('assertNoCooldown passes after the window expires', () => {
  const start = Date.parse('2026-05-25T12:00:00.000Z');
  const cooled = applyRecoveryCooldown(freshIdentity(), { at: start });
  assert.doesNotThrow(() =>
    assertNoCooldown(cooled, { at: start + 25 * 3600 * 1000 })
  );
});

test('clearRecoveryCooldown drops the cooldown block', () => {
  const cooled = applyRecoveryCooldown(freshIdentity());
  assert.ok(cooled.recoveryCooldown);
  const cleared = clearRecoveryCooldown(cooled);
  assert.equal(cleared.recoveryCooldown, undefined);
  // Other fields preserved.
  assert.equal(cleared.id, cooled.id);
  assert.equal(cleared.displayName, cooled.displayName);
});

// ─── Per-phone rate-limit policy (Phase 5.2 part 2) ──────────────────

test('DEFAULT_RATE_POLICIES exposes recovery_per_phone with 3-per-hour burst', () => {
  const policy = DEFAULT_RATE_POLICIES.recovery_per_phone;
  assert.ok(policy, 'recovery_per_phone policy must exist');
  assert.equal(policy.capacity, 3);
  assert.equal(policy.burst, 3);
  // 3 / 3600 sec — refill exactly one token per 20 minutes.
  assert.ok(Math.abs(policy.refillPerSecond - 3 / 3600) < 1e-9);
});

// `gcIntervalMs: Number.MAX_SAFE_INTEGER` disables the periodic
// stale-bucket GC inside the limiter, which would otherwise
// resurrect the test bucket whenever the synthetic `at` we pass
// in skews far from the real Date.now() at limiter-creation time.
function isolatedLimiter() {
  return createLimiter({ gcIntervalMs: Number.MAX_SAFE_INTEGER });
}

test('recovery_per_phone bucket blocks the 4th send within the same hour', () => {
  const limiter = isolatedLimiter();
  const key = 'phone:+919876543210';
  const at = Date.parse('2026-05-25T12:00:00.000Z');
  // First 3 sends pass (capacity = 3, burst = 3).
  for (let i = 0; i < 3; i += 1) {
    const r = limiter.consume(key, 'recovery_per_phone', 1, { at: at + i * 1000 });
    assert.equal(r.allowed, true, `send ${i + 1} should pass`);
  }
  // 4th immediately after — blocked.
  const blocked = limiter.consume(key, 'recovery_per_phone', 1, { at: at + 4000 });
  assert.equal(blocked.allowed, false);
  // retryAfter should be roughly 20 minutes (1200s) — the time to
  // refill a single token.
  assert.ok(blocked.retryAfterSeconds > 1100);
  assert.ok(blocked.retryAfterSeconds < 1300);
});

test('recovery_per_phone bucket lets a 4th send through after refill', () => {
  const limiter = isolatedLimiter();
  const key = 'phone:+919876543210';
  const at = Date.parse('2026-05-25T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    limiter.consume(key, 'recovery_per_phone', 1, { at });
  }
  // After 25 minutes, one token has refilled.
  const later = limiter.consume(key, 'recovery_per_phone', 1, {
    at: at + 25 * 60 * 1000
  });
  assert.equal(later.allowed, true);
});

test('recovery_per_phone buckets are isolated per phone key', () => {
  const limiter = isolatedLimiter();
  const at = Date.parse('2026-05-25T12:00:00.000Z');
  // Exhaust alice's bucket.
  for (let i = 0; i < 3; i += 1) {
    limiter.consume('phone:+919876543210', 'recovery_per_phone', 1, { at });
  }
  // Bob's bucket is untouched.
  const bob = limiter.consume('phone:+918765432109', 'recovery_per_phone', 1, {
    at
  });
  assert.equal(bob.allowed, true);
});
