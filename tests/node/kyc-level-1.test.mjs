// Phase 12.2.2 — KYC Level 1 (citizen-driven submission) +
// India Post PIN-code adapter + operator review queue tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createProviderIdentity,
  submitKycLevel1,
  validateKycLevel1Submission,
  publicProviderRecord,
  KycLevel1ValidationError,
  KYC_L1_AADHAAR_LAST4_RE,
  KYC_L1_PAN_LAST4_RE,
  KYC_L1_PINCODE_RE
} from '../../src/phase1/provider-identity.mjs';
import {
  createPincodeAdapter,
  isValidPincode,
  PINCODE_PROTOCOL_VERSION
} from '../../src/phase1/india-post-pincode.mjs';
import { safePath } from '../../src/phase0/logger.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'kyc-l1-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

const VALID_FIELDS = {
  fullLegalName: 'Aarav Kumar',
  aadhaarLast4: '4321',
  panLast4: 'X9Z2',
  addressPinCode: '411005',
  addressLine: '14, Modibaug, Ganeshkhind Road',
  cityFromPincode: 'Pune',
  stateFromPincode: 'Maharashtra'
};

// ─── PIN-code adapter ─────────────────────────────────────────────

test('isValidPincode + protocol version', () => {
  assert.equal(PINCODE_PROTOCOL_VERSION, 'bos.phase12.india-post-pincode.v0');
  assert.equal(isValidPincode('411005'), true);
  assert.equal(isValidPincode('011005'), false, 'leading zero rejected');
  assert.equal(isValidPincode('41100'), false, 'too short rejected');
  assert.equal(isValidPincode('4110055'), false, 'too long rejected');
  assert.equal(isValidPincode('abcdef'), false);
  assert.equal(isValidPincode(null), false);
  assert.equal(isValidPincode(411005), false, 'must be string');
});

test('PIN-code stub returns Pune fixture + caches by PIN', async () => {
  const { store } = await freshSqlite('pin-stub');
  try {
    const adapter = createPincodeAdapter({ mode: 'stub', store });
    const a = await adapter.call({ pincode: '411005' });
    assert.equal(a.source, 'stub');
    assert.equal(a.body.city, 'Pune');
    assert.equal(a.body.state, 'Maharashtra');
    const b = await adapter.call({ pincode: '411005' });
    assert.equal(b.source, 'cache');
    const c = await adapter.call({ pincode: '400001' });
    assert.equal(c.source, 'stub', 'different PIN → fresh stub (cache MISSES)');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('PIN-code cache key on audit is a sha256 digest — NEVER the raw PIN (§15)', async () => {
  const { store } = await freshSqlite('pin-key');
  try {
    const adapter = createPincodeAdapter({ mode: 'stub', store });
    await adapter.call({ pincode: '411005' });
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 1);
    assert.ok(/^pin:[0-9a-f]{32}$/.test(ledger[0].cacheKey), 'cacheKey is the pin: digest envelope');
    assert.ok(!/411005/.test(ledger[0].cacheKey), 'raw PIN NOT in cacheKey');
    assert.equal(ledger[0].adapter, 'india-post-pincode');
    const json = JSON.stringify(ledger[0]);
    assert.ok(!('body' in ledger[0]), 'audit must NEVER carry response body');
    assert.ok(!/411005/.test(json), 'raw PIN NOT anywhere in audit event');
    assert.ok(!/[0-9]+\.[0-9]{4,}/.test(json), 'no 4dp coord in audit JSON');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('PIN-code adapter still caches by PIN identity (two calls share entry)', async () => {
  const { store } = await freshSqlite('pin-cache-ident');
  try {
    const adapter = createPincodeAdapter({ mode: 'stub', store });
    const a = await adapter.call({ pincode: '411005' });
    const b = await adapter.call({ pincode: '411005' });
    assert.equal(a.source, 'stub');
    assert.equal(b.source, 'cache', 'second call hits cache despite digest key');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('PIN-code rejects malformed PIN at the request layer', async () => {
  const adapter = createPincodeAdapter({ mode: 'stub' });
  await assert.rejects(adapter.call({ pincode: '012345' }), (e) => e.code === 'adapter_invalid_request');
  await assert.rejects(adapter.call({ pincode: '' }), (e) => e.code === 'adapter_invalid_request');
});

test('PIN-code live mode builds correct URL + lifts the postalpincode.in envelope', async () => {
  const seen = [];
  const adapter = createPincodeAdapter({
    mode: 'live',
    liveFetch: async (url, init) => {
      seen.push({ url, ua: init.headers['User-Agent'] });
      return {
        ok: true,
        status: 200,
        json: async () => [{
          Status: 'Success',
          Message: 'Number of pincode(s) found: 5',
          PostOffice: [
            { Name: 'Andheri East S.O', BranchType: 'Sub Post Office', DeliveryStatus: 'Non-Delivery', District: 'Mumbai', State: 'Maharashtra', Country: 'India', Pincode: '400069' },
            { Name: 'Marol Naka B.O', BranchType: 'Branch Office', DeliveryStatus: 'Delivery', District: 'Mumbai', State: 'Maharashtra', Country: 'India', Pincode: '400069' }
          ]
        }]
      };
    }
  });
  const r = await adapter.call({ pincode: '400069' });
  assert.equal(r.source, 'live');
  assert.equal(r.body.pincode, '400069');
  assert.equal(r.body.city, 'Mumbai');
  assert.equal(r.body.state, 'Maharashtra');
  assert.equal(r.body.branches.length, 2);
  assert.equal(r.body.branches[0].name, 'Andheri East S.O');
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /api\.postalpincode\.in\/pincode\/400069/);
  assert.match(seen[0].ua, /^BharatOS\//);
});

test('PIN-code live mode handles upstream "Error" status gracefully', async () => {
  const adapter = createPincodeAdapter({
    mode: 'live',
    liveFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => [{ Status: 'Error', Message: 'No records found', PostOffice: null }]
    })
  });
  const r = await adapter.call({ pincode: '999999' });
  assert.equal(r.source, 'live');
  assert.equal(r.body.city, null);
  assert.equal(r.body.state, null);
  assert.equal(r.body.branches.length, 0);
});

// ─── KYC L1 substrate ─────────────────────────────────────────────

test('validateKycLevel1Submission accepts a clean record', () => {
  const r = validateKycLevel1Submission(VALID_FIELDS);
  assert.equal(r.fullLegalName, 'Aarav Kumar');
  assert.equal(r.aadhaarLast4, '4321');
  assert.equal(r.panLast4, 'X9Z2');
  assert.equal(r.addressPinCode, '411005');
});

test('validateKycLevel1Submission rejects a FULL 12-digit Aadhaar (§15)', () => {
  assert.throws(
    () => validateKycLevel1Submission({ ...VALID_FIELDS, aadhaarLast4: '123456789012' }),
    (e) => e instanceof KycLevel1ValidationError && e.code === 'aadhaar_last4_full_aadhaar_rejected'
  );
});

test('validateKycLevel1Submission rejects a FULL 10-char PAN (§15)', () => {
  assert.throws(
    () => validateKycLevel1Submission({ ...VALID_FIELDS, panLast4: 'ABCDE1234F' }),
    (e) => e instanceof KycLevel1ValidationError && e.code === 'pan_last4_full_pan_rejected'
  );
});

test('validateKycLevel1Submission per-field error codes are stable', () => {
  const cases = [
    [{ fullLegalName: '' }, 'full_legal_name_required'],
    [{ fullLegalName: 'x'.repeat(121) }, 'full_legal_name_too_long'],
    [{ aadhaarLast4: '123' }, 'aadhaar_last4_invalid'],
    [{ aadhaarLast4: '12a4' }, 'aadhaar_last4_invalid'],
    [{ panLast4: 'AB' }, 'pan_last4_invalid'],
    [{ panLast4: '!@#$' }, 'pan_last4_invalid'],
    [{ addressPinCode: '012345' }, 'pincode_invalid'],
    [{ addressPinCode: '12345' }, 'pincode_invalid'],
    [{ addressLine: '' }, 'address_line_required'],
    [{ addressLine: 'x'.repeat(241) }, 'address_line_too_long'],
    [{ cityFromPincode: '' }, 'city_required'],
    [{ stateFromPincode: '' }, 'state_required']
  ];
  for (const [override, expected] of cases) {
    assert.throws(
      () => validateKycLevel1Submission({ ...VALID_FIELDS, ...override }),
      (e) => e instanceof KycLevel1ValidationError && e.code === expected,
      `expected ${expected} for ${JSON.stringify(override)}`
    );
  }
});

test('validateKycLevel1Submission normalises PAN to uppercase', () => {
  const r = validateKycLevel1Submission({ ...VALID_FIELDS, panLast4: 'x9z2' });
  assert.equal(r.panLast4, 'X9Z2');
});

test('submitKycLevel1 only works on draft providers', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  const submitted = submitKycLevel1(p, VALID_FIELDS, { at: '2026-06-01T00:00:00.000Z' });
  assert.equal(submitted.kycLevel1Submission.fullLegalName, 'Aarav Kumar');
  assert.equal(submitted.kycLevel1Submission.submittedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(submitted.status, 'draft', 'L1 submission MUST NOT change status — operator review does that');
  assert.equal(submitted.kycLevel, 'none', 'L1 submission MUST NOT elevate kycLevel');

  const submittedTwice = submitKycLevel1(submitted, VALID_FIELDS, { at: '2026-06-02T00:00:00.000Z' });
  assert.equal(submittedTwice.kycLevel1Submission.submittedAt, '2026-06-02T00:00:00.000Z', 'idempotent re-submit ok');

  const wrongStatus = { ...submitted, status: 'submitted' };
  assert.throws(
    () => submitKycLevel1(wrongStatus, VALID_FIELDS),
    (e) => e.code === 'invalid_status_for_kyc_l1'
  );
});

test('publicProviderRecord MUST NOT echo kycLevel1Submission (§15)', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  const submitted = submitKycLevel1(p, VALID_FIELDS);
  const pub = publicProviderRecord(submitted);
  assert.ok(!('kycLevel1Submission' in pub));
  const json = JSON.stringify(pub);
  assert.ok(!/Aarav Kumar/.test(json), 'legal name not in public record');
  assert.ok(!/4321/.test(json), 'aadhaarLast4 not in public record');
  assert.ok(!/X9Z2/.test(json), 'panLast4 not in public record');
  assert.ok(!/Modibaug/.test(json), 'addressLine not in public record');
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

test('GET /api/geocode/pincode/411005 returns 200 + Pune stub', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/geocode/pincode/411005`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'stub');
    assert.equal(body.place.city, 'Pune');
    assert.equal(body.place.state, 'Maharashtra');
  });
});

test('GET /api/geocode/pincode/01abcd → 400 pincode_invalid', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/geocode/pincode/012345`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'pincode_invalid');
  });
});

async function seedDraftProvider(store, { rootIdentityId, providerIdentityId } = {}) {
  const p = createProviderIdentity({
    rootIdentityId: rootIdentityId || 'bos:person:test-1',
    roleKind: 'cab-driver',
    displayName: 'Test Driver'
  });
  if (providerIdentityId) p.providerIdentityId = providerIdentityId;
  await store.saveProviderIdentity(p);
  return p;
}

test('POST /api/provider-identities/:id/submit-kyc-l1 happy path + ledger event', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: p.rootIdentityId, ...VALID_FIELDS })
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.providerIdentity.kycLevel1Submission.fullLegalName, 'Aarav Kumar');
    assert.equal(body.providerIdentity.status, 'draft');

    const events = await store.listLedger({ type: 'provider_identity.kyc_l1_submitted' });
    assert.equal(events.length, 1);
    const evt = events[0];
    assert.equal(evt.providerIdentityId, p.providerIdentityId);
    // §15 binding: the ledger event MUST NOT carry the legal name,
    // last-4 IDs, address line, or PIN.
    const evtJson = JSON.stringify(evt);
    assert.ok(!/Aarav Kumar/.test(evtJson), 'legal name NOT on ledger');
    assert.ok(!/4321/.test(evtJson), 'aadhaarLast4 NOT on ledger');
    assert.ok(!/X9Z2/.test(evtJson), 'panLast4 NOT on ledger');
    assert.ok(!/Modibaug/.test(evtJson), 'addressLine NOT on ledger');
    assert.ok(!/411005/.test(evtJson), 'PIN code NOT on ledger');
    // City + state are public geo — they ARE on the ledger so the
    // operator queue + analytics can group by region without
    // joining back to the record.
    assert.equal(evt.cityFromPincode, 'Pune');
    assert.equal(evt.stateFromPincode, 'Maharashtra');
    assert.deepEqual(evt.submittedFields, [
      'fullLegalName', 'aadhaarLast4', 'panLast4',
      'addressPinCode', 'addressLine',
      'cityFromPincode', 'stateFromPincode'
    ]);
  });
});

test('POST submit-kyc-l1 forwards full-Aadhaar attempt as 400', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: p.rootIdentityId, ...VALID_FIELDS, aadhaarLast4: '123456789012' })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'aadhaar_last4_full_aadhaar_rejected');
    assert.equal(body.error.field, 'aadhaarLast4');
  });
});

test('POST submit-kyc-l1 forwards full-PAN attempt as 400', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: p.rootIdentityId, ...VALID_FIELDS, panLast4: 'ABCDE1234F' })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'pan_last4_full_pan_rejected');
  });
});

test('POST submit-kyc-l1 rejects wrong acting identity (auth) → 403', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: 'bos:person:not-the-owner', ...VALID_FIELDS })
    });
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.equal(body.error.code, 'not_provider_owner');
  });
});

test('POST submit-kyc-l1 missing acting identity → 401', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_FIELDS)
    });
    assert.equal(r.status, 401);
    const body = await r.json();
    assert.equal(body.error.code, 'missing_acting_identity');
  });
});

test('POST submit-kyc-l1 accepts X-Bharat-OS-Acting-Identity header without body field', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bharat-os-acting-identity': p.rootIdentityId
      },
      body: JSON.stringify(VALID_FIELDS)
    });
    assert.equal(r.status, 200);
  });
});

test('POST submit-kyc-l1 unknown provider → 404', async () => {
  await withApiServer({}, async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/provider-identities/bos:provider-identity:does-not-exist/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: 'bos:person:any', ...VALID_FIELDS })
    });
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error.code, 'unknown_provider');
  });
});

test('POST submit-kyc-l1 returns 400 when provider already transitioned out of draft', async () => {
  await withApiServer({}, async ({ baseUrl, store }) => {
    const p = await seedDraftProvider(store);
    // First submission lands.
    const r1 = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: p.rootIdentityId, ...VALID_FIELDS })
    });
    assert.equal(r1.status, 200);
    // Operator transitions the provider out of draft (simulated by
    // a direct store write).
    const cur = await store.readProviderIdentity(p.providerIdentityId);
    await store.saveProviderIdentity({ ...cur, status: 'submitted', updatedAt: new Date(Date.now() + 1000).toISOString() });
    // Citizen retries — the substrate guard refuses.
    const r2 = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(p.providerIdentityId)}/submit-kyc-l1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actingRootIdentityId: p.rootIdentityId, ...VALID_FIELDS })
    });
    assert.equal(r2.status, 400);
    const body = await r2.json();
    assert.equal(body.error.code, 'invalid_status_for_kyc_l1');
  });
});

test('GET /api/admin/provider-identities requires admin auth → 401 without bearer', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer({}, async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/admin/provider-identities?status=draft`);
      assert.equal(r.status, 401);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('GET /api/admin/provider-identities lists drafts with auth', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer({}, async ({ baseUrl, store }) => {
      const a = await seedDraftProvider(store, { rootIdentityId: 'bos:person:a' });
      const b = await seedDraftProvider(store, { rootIdentityId: 'bos:person:b' });
      const r = await fetch(`${baseUrl}/api/admin/provider-identities?status=draft&limit=10`, {
        headers: {
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'x-bharat-os-operator': 'test-op'
        }
      });
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.ok(Array.isArray(body.providerIdentities));
      assert.ok(body.providerIdentities.length >= 2);
      const ids = body.providerIdentities.map((p) => p.providerIdentityId);
      assert.ok(ids.includes(a.providerIdentityId));
      assert.ok(ids.includes(b.providerIdentityId));
      // Admin queue MUST return the full record (the operator
      // needs to see the kycLevel1Submission) — not the public
      // stripped record.
      const matched = body.providerIdentities.find((p) => p.providerIdentityId === a.providerIdentityId);
      assert.ok(matched);
      assert.ok('kycLevel1Submission' in matched);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('GET /api/admin/provider-identities rejects invalid status / roleKind → 400', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer({}, async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/admin/provider-identities?status=bogus`, {
        headers: { 'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
      });
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error.code, 'invalid_status');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

// ─── Regex sanity ─────────────────────────────────────────────────

test('safePath redacts the PIN code from access-log paths (§15)', () => {
  assert.equal(safePath('/api/geocode/pincode/411005'), '/api/geocode/pincode/:pin');
  assert.equal(safePath('/api/geocode/pincode/411005?foo=bar'), '/api/geocode/pincode/:pin');
  // Non-PII routes unchanged.
  assert.equal(safePath('/api/health'), '/api/health');
  assert.equal(safePath('/api/marketplace/providers'), '/api/marketplace/providers');
});

test('KYC L1 regexes are conservative + stable', () => {
  assert.ok(KYC_L1_AADHAAR_LAST4_RE.test('0000'));
  assert.ok(!KYC_L1_AADHAAR_LAST4_RE.test('a000'));
  assert.ok(KYC_L1_PAN_LAST4_RE.test('A0Z9'));
  assert.ok(!KYC_L1_PAN_LAST4_RE.test('a0z9'), 'lowercase rejected (caller must upper)');
  assert.ok(KYC_L1_PINCODE_RE.test('110001'));
  assert.ok(!KYC_L1_PINCODE_RE.test('010001'), 'leading zero rejected');
});
