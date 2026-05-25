// Phase 5.3 — SMS vendor fallback chain + per-vendor telemetry.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFallbackProvider,
  getSmsProvider,
  sendSms
} from '../../src/phase0/sms-provider.mjs';
import {
  recordSmsAttempt,
  renderMetrics,
  resetMetrics,
  smsCounterSnapshot
} from '../../src/phase0/metrics.mjs';

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function fakeProvider(name, behavior) {
  return {
    name,
    async send(args) {
      return behavior(args);
    }
  };
}

function notConfiguredError(provider, missing) {
  const e = new Error(`${provider} not configured`);
  e.code = 'SMS_PROVIDER_NOT_CONFIGURED';
  e.provider = provider;
  e.missing = missing;
  return e;
}

function rejectedError(provider, response = 'vendor said no') {
  const e = new Error(`${provider} rejected: ${response}`);
  e.code = 'SMS_PROVIDER_REJECTED';
  e.provider = provider;
  e.providerResponse = response;
  return e;
}

// ─── Fallback chain ────────────────────────────────────────────────────

test('createFallbackProvider rejects empty / invalid input', () => {
  assert.throws(() => createFallbackProvider([]), /non-empty array/);
  assert.throws(() => createFallbackProvider(null), /non-empty array/);
  assert.throws(
    () => createFallbackProvider([{ name: 'broken' }]),
    /name.*send/i
  );
});

test('fallback returns first success and reports the chain it walked', async () => {
  const a = fakeProvider('alpha', () => ({ ok: true, providerMessageId: 'a-1' }));
  const b = fakeProvider('beta', () => ({ ok: true, providerMessageId: 'b-1' }));
  const chain = createFallbackProvider([a, b]);
  const result = await chain.send({ phone: '+919876543210', body: 'hi' });
  assert.equal(result.ok, true);
  assert.equal(result.providerMessageId, 'a-1');
  assert.deepEqual(result.fallbackChain, ['alpha']);
  assert.deepEqual(result.fallbackAttempts, []);
});

test('fallback skips not_configured providers and uses the next one', async () => {
  const a = fakeProvider('alpha', () => {
    throw notConfiguredError('alpha', ['ALPHA_KEY']);
  });
  const b = fakeProvider('beta', () => ({ ok: true, providerMessageId: 'b-1' }));
  const chain = createFallbackProvider([a, b]);
  const result = await chain.send({ phone: '+919876543210', body: 'hi' });
  assert.equal(result.providerMessageId, 'b-1');
  assert.deepEqual(result.fallbackChain, ['alpha', 'beta']);
  assert.equal(result.fallbackAttempts.length, 1);
  assert.equal(result.fallbackAttempts[0].provider, 'alpha');
  assert.equal(result.fallbackAttempts[0].code, 'SMS_PROVIDER_NOT_CONFIGURED');
});

test('fallback skips rejected providers and uses the next one', async () => {
  const a = fakeProvider('alpha', () => {
    throw rejectedError('alpha', 'vendor outage');
  });
  const b = fakeProvider('beta', () => {
    throw rejectedError('beta', 'also outage');
  });
  const c = fakeProvider('gamma', () => ({ ok: true, providerMessageId: 'c-1' }));
  const chain = createFallbackProvider([a, b, c]);
  const result = await chain.send({ phone: '+919876543210', body: 'hi' });
  assert.equal(result.providerMessageId, 'c-1');
  assert.deepEqual(result.fallbackChain, ['alpha', 'beta', 'gamma']);
  assert.equal(result.fallbackAttempts.length, 2);
  assert.equal(result.fallbackAttempts[0].code, 'SMS_PROVIDER_REJECTED');
  assert.equal(result.fallbackAttempts[1].code, 'SMS_PROVIDER_REJECTED');
});

test('fallback throws SMS_PROVIDER_FALLBACK_EXHAUSTED when every provider fails', async () => {
  const a = fakeProvider('alpha', () => {
    throw notConfiguredError('alpha', ['A']);
  });
  const b = fakeProvider('beta', () => {
    throw rejectedError('beta');
  });
  const chain = createFallbackProvider([a, b]);
  try {
    await chain.send({ phone: '+919876543210', body: 'hi' });
    assert.fail('expected throw');
  } catch (error) {
    assert.equal(error.code, 'SMS_PROVIDER_FALLBACK_EXHAUSTED');
    assert.equal(error.attempts.length, 2);
    assert.equal(error.attempts[0].provider, 'alpha');
    assert.equal(error.attempts[0].code, 'SMS_PROVIDER_NOT_CONFIGURED');
    assert.equal(error.attempts[1].provider, 'beta');
    assert.equal(error.attempts[1].code, 'SMS_PROVIDER_REJECTED');
    assert.match(error.message, /alpha → beta/);
  }
});

test('fallback re-throws unexpected errors WITHOUT continuing', async () => {
  // A programmer bug or network blowup must surface immediately —
  // silently falling through to the next provider would mask the
  // real problem.
  const a = fakeProvider('alpha', () => {
    throw new TypeError('boom — programmer bug');
  });
  const b = fakeProvider('beta', () => ({ ok: true, providerMessageId: 'b-1' }));
  const chain = createFallbackProvider([a, b]);
  try {
    await chain.send({ phone: '+919876543210', body: 'hi' });
    assert.fail('expected throw');
  } catch (error) {
    assert.equal(error.constructor.name, 'TypeError');
    assert.match(error.message, /boom/);
  }
});

// ─── getSmsProvider with fallback env ──────────────────────────────────

test('getSmsProvider with BHARAT_OS_SMS_FALLBACK_CHAIN returns a fallback wrapper', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_FALLBACK_CHAIN: 'log,gupshup,twilio',
      BHARAT_OS_SMS_PROVIDER: null
    },
    () => {
      const provider = getSmsProvider();
      assert.equal(provider.isFallback, true);
      assert.equal(provider.providers.length, 3);
      assert.deepEqual(
        provider.providers.map((p) => p.name),
        ['log', 'gupshup', 'twilio']
      );
      assert.equal(provider.name, 'fallback:log>gupshup>twilio');
    }
  );
});

test('getSmsProvider rejects unknown providers in the fallback chain', async () => {
  await withEnv(
    { BHARAT_OS_SMS_FALLBACK_CHAIN: 'gupshup,nonexistent,twilio' },
    () => {
      assert.throws(
        () => getSmsProvider(),
        /unknown SMS provider in fallback chain: 'nonexistent'/
      );
    }
  );
});

test('getSmsProvider ignores fallback chain when name is explicitly passed', async () => {
  await withEnv(
    { BHARAT_OS_SMS_FALLBACK_CHAIN: 'gupshup,msg91' },
    () => {
      const provider = getSmsProvider('log');
      assert.equal(provider.name, 'log');
      assert.equal(provider.isFallback, undefined);
    }
  );
});

test('sendSms via the fallback env honours phone normalisation', async () => {
  await withEnv(
    { BHARAT_OS_SMS_FALLBACK_CHAIN: 'log', BHARAT_OS_LOG_OTP_BODIES: '0' },
    async () => {
      const result = await sendSms({
        phone: '9876543210',
        body: 'Bharat OS test'
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.fallbackChain, ['log']);
    }
  );
});

// ─── Per-vendor telemetry ──────────────────────────────────────────────

test('recordSmsAttempt increments per (provider, outcome)', () => {
  resetMetrics();
  recordSmsAttempt({ provider: 'gupshup', outcome: 'success' });
  recordSmsAttempt({ provider: 'gupshup', outcome: 'success' });
  recordSmsAttempt({ provider: 'gupshup', outcome: 'rejected' });
  recordSmsAttempt({ provider: 'msg91', outcome: 'success' });
  const snap = smsCounterSnapshot();
  assert.equal(snap['gupshup|success'], 2);
  assert.equal(snap['gupshup|rejected'], 1);
  assert.equal(snap['msg91|success'], 1);
});

test('recordSmsAttempt silently drops unknown outcomes', () => {
  resetMetrics();
  recordSmsAttempt({ provider: 'gupshup', outcome: 'maybe' });
  recordSmsAttempt({ provider: '', outcome: 'success' });
  const snap = smsCounterSnapshot();
  assert.equal(Object.keys(snap).length, 0);
});

test('renderMetrics exposes bos_sms_send_total samples', () => {
  resetMetrics();
  recordSmsAttempt({ provider: 'gupshup', outcome: 'success' });
  recordSmsAttempt({ provider: 'twilio', outcome: 'rejected' });
  recordSmsAttempt({ provider: 'msg91', outcome: 'not_configured' });
  const text = renderMetrics();
  assert.match(text, /# HELP bos_sms_send_total/);
  assert.match(text, /# TYPE bos_sms_send_total counter/);
  assert.match(
    text,
    /bos_sms_send_total\{provider="gupshup",outcome="success"\} 1/
  );
  assert.match(
    text,
    /bos_sms_send_total\{provider="twilio",outcome="rejected"\} 1/
  );
  assert.match(
    text,
    /bos_sms_send_total\{provider="msg91",outcome="not_configured"\} 1/
  );
});

test('log provider records a success counter on each send', async () => {
  resetMetrics();
  await withEnv({ BHARAT_OS_LOG_OTP_BODIES: '0' }, async () => {
    const provider = getSmsProvider('log');
    await provider.send({ phone: '+919876543210', body: 'test message' });
    await provider.send({ phone: '+919876543210', body: 'test message' });
  });
  const snap = smsCounterSnapshot();
  assert.equal(snap['log|success'], 2);
});

test('not_configured providers record a not_configured outcome', async () => {
  resetMetrics();
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: null,
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: null,
      BHARAT_OS_SMS_GUPSHUP_SOURCE: null
    },
    async () => {
      const provider = getSmsProvider('gupshup');
      try {
        await provider.send({ phone: '+919876543210', body: 'test' });
      } catch (_error) {
        // expected
      }
    }
  );
  const snap = smsCounterSnapshot();
  assert.equal(snap['gupshup|not_configured'], 1);
});

test('fallback records telemetry for every inner attempt, not just the winner', async () => {
  // The chain falls through alpha (rejected) → beta (not_configured)
  // → log (success). Operators MUST see the alpha + beta failures
  // in /metrics — otherwise a flapping primary vendor is invisible.
  resetMetrics();
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: null,
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: null,
      BHARAT_OS_SMS_GUPSHUP_SOURCE: null,
      BHARAT_OS_LOG_OTP_BODIES: '0'
    },
    async () => {
      // Real gupshup (will be not_configured) → log (success).
      const provider = getSmsProvider();
      const chain = createFallbackProvider([
        getSmsProvider('gupshup'),
        provider // 'log' default
      ]);
      const result = await chain.send({
        phone: '+919876543210',
        body: 'fallback test'
      });
      assert.deepEqual(result.fallbackChain, ['gupshup', 'log']);
    }
  );
  const snap = smsCounterSnapshot();
  assert.equal(snap['gupshup|not_configured'], 1);
  assert.equal(snap['log|success'], 1);
});
