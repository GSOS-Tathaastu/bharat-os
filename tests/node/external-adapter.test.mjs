// Phase 12.2.1 — External-adapter substrate + OSM Nominatim
// adapter + GET /api/geocode/reverse endpoint.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  ADAPTER_MODES,
  EXTERNAL_ADAPTER_PROTOCOL_VERSION,
  ExternalAdapterError,
  createAdapter
} from '../../src/phase0/external-adapter.mjs';
import {
  createNominatimAdapter,
  NOMINATIM_PROTOCOL_VERSION
} from '../../src/phase1/nominatim-geocoder.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'external-adapter-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Substrate ────────────────────────────────────────────────────

test('substrate exports a stable protocol version + ADAPTER_MODES list', () => {
  assert.equal(EXTERNAL_ADAPTER_PROTOCOL_VERSION, 'bos.phase0.external-adapter.v0');
  assert.deepEqual(ADAPTER_MODES, ['stub', 'live']);
});

test('createAdapter rejects missing name / request', () => {
  assert.throws(() => createAdapter({ request: () => ({}) }), /name is required/);
  assert.throws(() => createAdapter({ name: 'x' }), /request\(args\)/);
});

test('createAdapter live mode without userAgent throws', () => {
  assert.throws(
    () => createAdapter({ name: 'x', mode: 'live', request: () => ({ cacheKey: 'k' }) }),
    /userAgent is required/
  );
});

test('stub mode returns deterministic body + emits stub_ok audit event', async () => {
  const { store } = await freshSqlite('stub-mode');
  try {
    const adapter = createAdapter({
      name: 'fake-svc',
      mode: 'stub',
      store,
      request: ({ id } = {}) => ({
        cacheKey: `id:${id}`,
        stub: { id, label: `stub-${id}` },
        build: () => ({ url: 'https://nope', parse: (x) => x })
      })
    });
    const r1 = await adapter.call({ id: 7 });
    assert.equal(r1.source, 'stub');
    assert.deepEqual(r1.body, { id: 7, label: 'stub-7' });
    const r2 = await adapter.call({ id: 7 });
    assert.equal(r2.source, 'cache', 'second call hits cache');
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 2);
    const statuses = ledger.map((e) => e.status).sort();
    assert.deepEqual(statuses, ['cache_hit', 'stub_ok']);
    for (const e of ledger) {
      assert.equal(e.adapter, 'fake-svc');
      assert.equal(typeof e.cacheKey, 'string');
      assert.ok(!('body' in e), 'audit event must NEVER carry the response body');
    }
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('live mode calls liveFetch, injects User-Agent, parses response, caches body', async () => {
  const calls = [];
  const adapter = createAdapter({
    name: 'fake-live',
    mode: 'live',
    userAgent: 'BharatOS/test (contact@example.com)',
    request: ({ id }) => ({
      cacheKey: `id:${id}`,
      stub: null,
      build: () => ({
        url: `https://example.test/${id}`,
        init: { method: 'GET' },
        parse: (json) => ({ liftedId: json.id })
      })
    }),
    liveFetch: async (url, init) => {
      calls.push({ url, headers: init.headers });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 42 })
      };
    }
  });
  const r = await adapter.call({ id: 42 });
  assert.equal(r.source, 'live');
  assert.deepEqual(r.body, { liftedId: 42 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['User-Agent'], 'BharatOS/test (contact@example.com)');
  assert.equal(calls[0].headers['Accept'], 'application/json');
});

test('live mode rate-limit throws ExternalAdapterError(rate_limited, 429)', async () => {
  let fetched = 0;
  const adapter = createAdapter({
    name: 'rl',
    mode: 'live',
    userAgent: 'BharatOS/test',
    rateLimit: { ratePerSecond: 1 },
    request: ({ id }) => ({
      cacheKey: `id:${id}`,
      stub: null,
      build: () => ({ url: `https://example.test/${id}`, parse: (x) => x })
    }),
    liveFetch: async () => {
      fetched += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  await adapter.call({ id: 'a' });
  await assert.rejects(
    adapter.call({ id: 'b' }),
    (err) => err instanceof ExternalAdapterError && err.code === 'rate_limited' && err.status === 429
  );
  assert.equal(fetched, 1, 'rate-limited call must NOT hit upstream');
});

test('live mode network_error is translated + audited but body is never persisted', async () => {
  const { store } = await freshSqlite('net-err');
  try {
    const adapter = createAdapter({
      name: 'flaky',
      mode: 'live',
      userAgent: 'BharatOS/test',
      store,
      request: ({ id }) => ({
        cacheKey: `id:${id}`,
        stub: null,
        build: () => ({ url: `https://example.test/${id}`, parse: (x) => x })
      }),
      liveFetch: async () => { throw new Error('connect ECONNRESET'); }
    });
    await assert.rejects(
      adapter.call({ id: 1 }),
      (err) => err instanceof ExternalAdapterError && err.code === 'network_error' && err.status === 502
    );
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].status, 'network_error');
    assert.ok(!('body' in ledger[0]));
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('live mode upstream non-OK → upstream_error 502 + http_<status> ledger event', async () => {
  const { store } = await freshSqlite('http-503');
  try {
    const adapter = createAdapter({
      name: 'errsvc',
      mode: 'live',
      userAgent: 'BharatOS/test',
      store,
      request: ({ id }) => ({
        cacheKey: `id:${id}`,
        stub: null,
        build: () => ({ url: 'https://example.test', parse: (x) => x })
      }),
      liveFetch: async () => ({ ok: false, status: 503, json: async () => ({ err: 'oops' }) })
    });
    await assert.rejects(
      adapter.call({ id: 1 }),
      (err) => err instanceof ExternalAdapterError && err.code === 'upstream_error' && err.status === 502
    );
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger[0].status, 'http_503');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('descriptor without cacheKey throws adapter_invalid_request', async () => {
  const adapter = createAdapter({
    name: 'no-key',
    mode: 'stub',
    request: () => ({ /* no cacheKey */ stub: null })
  });
  await assert.rejects(
    adapter.call({}),
    (err) => err instanceof ExternalAdapterError && err.code === 'adapter_invalid_request'
  );
});

// ─── Nominatim adapter ────────────────────────────────────────────

test('Nominatim adapter exports a stable protocol version', () => {
  assert.equal(NOMINATIM_PROTOCOL_VERSION, 'bos.phase12.nominatim-geocoder.v0');
});

test('Nominatim stub returns deterministic place + caches on 1dp bubble', async () => {
  const { store } = await freshSqlite('nominatim-stub');
  try {
    const adapter = createNominatimAdapter({ mode: 'stub', store });
    const a = await adapter.call({ lat: 18.5204, lng: 73.8567 });
    const b = await adapter.call({ lat: 18.5198, lng: 73.8571 });
    assert.equal(a.source, 'stub');
    assert.equal(b.source, 'cache', 'two pickups in the same 1dp bubble share one lookup');
    assert.match(a.body.label, /^Near point/);
    assert.equal(a.body.countryCode, 'in');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('Nominatim cacheKey is the 1dp bubble — NEVER a 4dp coord (§15 binding)', async () => {
  const { store } = await freshSqlite('nominatim-bubble');
  try {
    const adapter = createNominatimAdapter({ mode: 'stub', store });
    await adapter.call({ lat: 18.5204, lng: 73.8567 });
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].cacheKey, '18.5,73.9');
    // hard binding: nothing on the ledger may look like a 4dp coord.
    const serialised = JSON.stringify(ledger[0]);
    assert.ok(!/[0-9]+\.[0-9]{4,}/.test(serialised), 'no 4dp coord in audit event');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('Nominatim rejects out-of-range / non-finite lat / lng', async () => {
  const adapter = createNominatimAdapter({ mode: 'stub' });
  await assert.rejects(adapter.call({ lat: 91, lng: 0 }), (err) => err.code === 'adapter_invalid_request');
  await assert.rejects(adapter.call({ lat: 0, lng: 181 }), (err) => err.code === 'adapter_invalid_request');
  await assert.rejects(adapter.call({ lat: NaN, lng: 0 }), (err) => err.code === 'adapter_invalid_request');
});

test('Nominatim live mode builds the documented OSM URL + lifts place fields', async () => {
  const seen = [];
  const adapter = createNominatimAdapter({
    mode: 'live',
    liveFetch: async (url, init) => {
      seen.push({ url, ua: init.headers['User-Agent'] });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          display_name: 'Shivajinagar, Pune, Maharashtra, India',
          osm_id: 12345,
          address: {
            suburb: 'Shivajinagar',
            city: 'Pune',
            state: 'Maharashtra',
            country_code: 'in'
          }
        })
      };
    }
  });
  const r = await adapter.call({ lat: 18.52, lng: 73.86 });
  assert.equal(r.source, 'live');
  assert.equal(r.body.suburb, 'Shivajinagar');
  assert.equal(r.body.city, 'Pune');
  assert.equal(r.body.state, 'Maharashtra');
  assert.equal(r.body.countryCode, 'in');
  assert.equal(r.body.osmId, '12345');
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(seen[0].url, /lat=18\.5/);
  assert.match(seen[0].url, /lon=73\.9/);
  assert.match(seen[0].url, /format=jsonv2/);
  assert.match(seen[0].ua, /^BharatOS\//);
  assert.match(seen[0].ua, /\(/, 'UA must include a contact in parens');
});

// ─── HTTP integration ─────────────────────────────────────────────

async function withApiServer(opts, callback) {
  const { store } = await freshSqlite('srv');
  const server = createPhase0ApiServer({ store, ...opts });
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

test('GET /api/geocode/reverse returns 200 + place + source=stub by default', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/geocode/reverse?lat=18.5204&lng=73.8567`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'stub');
    assert.equal(body.source, 'stub');
    assert.ok(body.place);
    assert.equal(typeof body.latencyMs, 'number');
  });
});

test('GET /api/geocode/reverse missing lat/lng → 400 lat_lng_required', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/geocode/reverse?lat=18`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'lat_lng_required');
  });
});

test('GET /api/geocode/reverse invalid lat → 400 adapter_invalid_request', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/geocode/reverse?lat=91&lng=0`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'adapter_invalid_request');
    assert.equal(body.error.adapter, 'osm-nominatim');
  });
});

test('GET /api/geocode/reverse uses injected adapter when provided + records ledger event', async () => {
  const { store } = await freshSqlite('inj');
  const seen = [];
  const nominatim = createNominatimAdapter({
    mode: 'live',
    store,
    liveFetch: async (url) => {
      seen.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          display_name: 'Andheri East, Mumbai, Maharashtra',
          osm_id: 99,
          address: { suburb: 'Andheri East', city: 'Mumbai', state: 'Maharashtra', country_code: 'in' }
        })
      };
    }
  });
  const server = createPhase0ApiServer({ store, nominatim });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/geocode/reverse?lat=19.12&lng=72.85`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.mode, 'live');
    assert.equal(body.place.city, 'Mumbai');
    assert.equal(seen.length, 1);
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].status, 'live_ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
});
