// Phase 4.4 — network helper tests.
//
// The module is browser-side but its core functions (fetchWithRetry,
// categoriseError) are testable in Node by stubbing global.fetch +
// global.navigator.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoriseError,
  fetchJsonWithRetry,
  fetchWithRetry,
  NETWORK_PROTOCOL_VERSION
} from '../../public/shell/network.mjs';

function withMockFetch(impl, callback) {
  const orig = global.fetch;
  global.fetch = impl;
  return callback().finally(() => {
    global.fetch = orig;
  });
}

function withMockNavigator(navigator, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: navigator,
    configurable: true,
    writable: true
  });
  return callback().finally(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      delete globalThis.navigator;
    }
  });
}

test('fetchWithRetry returns the response on first success', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => '', json: async () => ({}) };
    },
    async () => {
      const r = await fetchWithRetry('https://example.test/');
      assert.equal(r.ok, true);
      assert.equal(calls, 1);
    }
  );
});

test('fetchWithRetry retries on 5xx with exponential backoff and eventually succeeds', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: false, status: 502, headers: { get: () => null }, text: async () => '' };
      }
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'ok', json: async () => ({ ok: true }) };
    },
    async () => {
      const r = await fetchWithRetry('https://example.test/', {}, { delaysMs: [1, 1, 1] });
      assert.equal(r.ok, true);
      assert.equal(calls, 3);
    }
  );
});

test('fetchWithRetry does NOT retry 4xx', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: false, status: 400, headers: { get: () => null }, text: async () => 'bad' };
    },
    async () => {
      const r = await fetchWithRetry('https://example.test/', {}, { delaysMs: [1, 1, 1] });
      assert.equal(r.ok, false);
      assert.equal(r.status, 400);
      assert.equal(calls, 1, '400 should not be retried');
    }
  );
});

test('fetchWithRetry retries 429 (rate-limited)', async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls < 2) {
        return { ok: false, status: 429, headers: { get: () => null }, text: async () => '' };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) };
    },
    async () => {
      const r = await fetchWithRetry('https://example.test/', {}, { delaysMs: [1, 1, 1] });
      assert.equal(r.ok, true);
      assert.equal(calls, 2);
    }
  );
});

test('fetchWithRetry retries on network errors then re-throws when exhausted', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withMockFetch(
        async () => {
          calls += 1;
          throw new Error(`network glitch ${calls}`);
        },
        () => fetchWithRetry('https://example.test/', {}, { delaysMs: [1, 1, 1] })
      ),
    /network glitch/
  );
  assert.equal(calls, 4); // initial + 3 retries
});

test('fetchJsonWithRetry parses JSON on success', async () => {
  await withMockFetch(
    async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ hello: 'world' }),
      text: async () => '{"hello":"world"}'
    }),
    async () => {
      const data = await fetchJsonWithRetry('https://example.test/');
      assert.equal(data.hello, 'world');
    }
  );
});

test('fetchJsonWithRetry throws structured error for non-ok responses', async () => {
  await withMockFetch(
    async () => ({
      ok: false,
      status: 422,
      headers: { get: () => null },
      text: async () => 'validation failed'
    }),
    async () => {
      try {
        await fetchJsonWithRetry('https://example.test/');
        assert.fail('expected throw');
      } catch (error) {
        assert.equal(error.statusCode, 422);
        assert.match(error.message, /HTTP 422/);
        assert.match(error.responseText, /validation failed/);
      }
    }
  );
});

test('categoriseError returns offline when navigator.onLine is false', async () => {
  await withMockNavigator({ onLine: false }, async () => {
    const result = categoriseError(new Error('network'), null);
    assert.equal(result.category, 'offline');
    assert.equal(result.action, 'wait');
  });
});

test('categoriseError classifies 401 / 403 as sign_in', async () => {
  await withMockNavigator({ onLine: true }, async () => {
    const result = categoriseError(new Error('auth'), {
      status: 401,
      headers: { get: () => null }
    });
    assert.equal(result.category, 'auth');
    assert.equal(result.action, 'sign_in');
  });
});

test('categoriseError classifies 429 as rate_limited with retryAfter', async () => {
  await withMockNavigator({ onLine: true }, async () => {
    const result = categoriseError(new Error('rl'), {
      status: 429,
      headers: { get: (h) => (h === 'retry-after' ? '12' : null) }
    });
    assert.equal(result.category, 'rate_limited');
    assert.equal(result.retryAfterSeconds, 12);
  });
});

test('categoriseError classifies 5xx as server_error → retry', async () => {
  await withMockNavigator({ onLine: true }, async () => {
    const result = categoriseError(new Error('500'), {
      status: 500,
      headers: { get: () => null }
    });
    assert.equal(result.category, 'server_error');
    assert.equal(result.action, 'retry');
  });
});

test('categoriseError classifies pure network errors as retry', async () => {
  await withMockNavigator({ onLine: true }, async () => {
    const result = categoriseError(new Error('DNS error'), null);
    assert.equal(result.category, 'network_error');
    assert.equal(result.action, 'retry');
  });
});

test('module exports the protocol version', () => {
  assert.equal(NETWORK_PROTOCOL_VERSION, 'bos.phase0.network.v0');
});
