// Phase 12.2.5 — Parivahan / Sarathi / Vahan verification adapter
// tests + verify-role-extras endpoint + audit ledger binding.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createProviderIdentity,
  recordRoleExtrasSubmission,
  recordRoleExtrasVerifications
} from '../../src/phase1/provider-identity.mjs';
import {
  createParivahanAdapter,
  isValidDlShape,
  isValidRcShape,
  verifyRoleExtrasFields,
  PARIVAHAN_PROTOCOL_VERSION,
  PARIVAHAN_PROVIDERS
} from '../../src/phase1/parivahan-adapter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'parivahan-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Substrate ────────────────────────────────────────────────────

test('protocol version + provider allowlist frozen', () => {
  assert.equal(PARIVAHAN_PROTOCOL_VERSION, 'bos.phase12.parivahan-adapter.v0');
  assert.deepEqual([...PARIVAHAN_PROVIDERS].sort(), ['digilocker', 'idfy', 'karza', 'stub', 'surepass']);
  assert.throws(() => { PARIVAHAN_PROVIDERS.push('x'); }, TypeError);
});

test('isValidDlShape accepts canonical + spaced + dashed formats', () => {
  assert.ok(isValidDlShape('MH1420130012345'));
  assert.ok(isValidDlShape('MH-14-2013-0012345'));
  assert.ok(isValidDlShape('mh 14 2013 0012345'));
  assert.ok(!isValidDlShape('ABCDEFG'));
  assert.ok(!isValidDlShape(''));
  assert.ok(!isValidDlShape(null));
});

test('isValidRcShape accepts MH12AB1234 + spaced + dashed', () => {
  assert.ok(isValidRcShape('MH12AB1234'));
  assert.ok(isValidRcShape('MH-12-AB-1234'));
  assert.ok(isValidRcShape('mh 12 ab 1234'));
  assert.ok(!isValidRcShape('XX'));
});

test('createParivahanAdapter refuses unknown provider', () => {
  assert.throws(
    () => createParivahanAdapter({ provider: 'bogus' }),
    /not in allowlist/
  );
});

test('stub DL returns deterministic valid response', async () => {
  const { store } = await freshSqlite('stub-dl');
  try {
    const adapter = createParivahanAdapter({ mode: 'stub', store });
    const r = await adapter.call({ kind: 'dl', dlNumber: 'MH1420130012345' });
    assert.equal(r.source, 'stub');
    assert.equal(r.body.status, 'valid');
    assert.equal(r.body.provider, 'stub');
    assert.ok(r.body.holderName);
    assert.ok(r.body.validUntil);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('stub DL rejects malformed input at the substrate (not at the stub)', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  await assert.rejects(
    adapter.call({ kind: 'dl', dlNumber: 'NOPE' }),
    (e) => e.code === 'adapter_invalid_request'
  );
});

test('stub RC returns deterministic valid response', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const r = await adapter.call({ kind: 'rc', registrationNumber: 'MH12AB1234' });
  assert.equal(r.body.status, 'valid');
  assert.equal(r.body.provider, 'stub');
  assert.ok(r.body.ownerName);
  assert.ok(r.body.vehicleClass);
});

test('cacheKey on audit is sha256 digest, NEVER the raw DL/RC (§15)', async () => {
  const { store } = await freshSqlite('parivahan-pii');
  try {
    const adapter = createParivahanAdapter({ mode: 'stub', store });
    await adapter.call({ kind: 'dl', dlNumber: 'MH1420130012345' });
    await adapter.call({ kind: 'rc', registrationNumber: 'MH12AB1234' });
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 2);
    for (const evt of ledger) {
      assert.ok(/^parivahan:(dl|rc):[0-9a-f]{32}$/.test(evt.cacheKey));
      const json = JSON.stringify(evt);
      assert.ok(!/MH1420130012345/.test(json), 'raw DL not in audit JSON');
      assert.ok(!/MH12AB1234/.test(json), 'raw RC not in audit JSON');
      assert.ok(!('body' in evt), 'response body never on audit');
    }
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('cache hits on second identical call', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const a = await adapter.call({ kind: 'dl', dlNumber: 'MH1420130012345' });
  const b = await adapter.call({ kind: 'dl', dlNumber: 'MH1420130012345' });
  assert.equal(a.source, 'stub');
  assert.equal(b.source, 'cache');
});

test('verifyRoleExtrasFields covers cab-driver DL + RC', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const out = await verifyRoleExtrasFields(adapter, {
    role: 'cab-driver',
    answers: {
      drivingLicenceNumber: 'MH1420130012345',
      vehicleRegistrationNumber: 'MH12AB1234',
      commercialPermitNumber: 'CP-2025-7890'
    }
  });
  assert.equal(out.drivingLicenceNumber.status, 'valid');
  assert.equal(out.vehicleRegistrationNumber.status, 'valid');
  // commercialPermitNumber is NOT a Parivahan-verifiable field.
  assert.ok(!('commercialPermitNumber' in out));
});

test('verifyRoleExtrasFields covers personal-driver DL only (no RC)', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const out = await verifyRoleExtrasFields(adapter, {
    role: 'personal-driver',
    answers: {
      drivingLicenceNumber: 'MH1420130012345',
      vehicleRegistrationNumber: 'MH12AB1234' // even if present, ignored
    }
  });
  assert.ok(out.drivingLicenceNumber);
  assert.ok(!('vehicleRegistrationNumber' in out));
});

test('verifyRoleExtrasFields no-ops on labourers / household-help', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const a = await verifyRoleExtrasFields(adapter, {
    role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' }
  });
  assert.deepEqual(a, {});
  const b = await verifyRoleExtrasFields(adapter, {
    role: 'household-help',
    answers: { policeVerificationNumber: 'X' }
  });
  assert.deepEqual(b, {});
});

test('verifyRoleExtrasFields skips malformed DL gracefully', async () => {
  const adapter = createParivahanAdapter({ mode: 'stub' });
  const out = await verifyRoleExtrasFields(adapter, {
    role: 'cab-driver',
    answers: { drivingLicenceNumber: 'not-a-dl', vehicleRegistrationNumber: 'MH12AB1234' }
  });
  // Malformed DL is silently skipped — no entry in the map.
  assert.ok(!('drivingLicenceNumber' in out));
  assert.ok(out.vehicleRegistrationNumber);
});

// ─── provider-identity integration ────────────────────────────────

test('recordRoleExtrasVerifications refuses without submission', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  assert.throws(
    () => recordRoleExtrasVerifications(p, { results: {}, operatorId: 'op' }),
    (e) => e.code === 'no_role_extras_submission'
  );
});

test('recordRoleExtrasVerifications stamps results + operator + timestamp', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'MH1420130012345' },
    attachments: {}
  });
  const r = recordRoleExtrasVerifications(p, {
    results: { drivingLicenceNumber: { status: 'valid' } },
    operatorId: 'bos:operator:reviewer-1',
    at: '2026-06-01T12:00:00.000Z'
  });
  assert.equal(r.roleExtrasVerifications.runByOperatorId, 'bos:operator:reviewer-1');
  assert.equal(r.roleExtrasVerifications.runAt, '2026-06-01T12:00:00.000Z');
  assert.equal(r.roleExtrasVerifications.results.drivingLicenceNumber.status, 'valid');
});

// ─── HTTP integration ─────────────────────────────────────────────

async function withApiServer(callback) {
  const { store } = await freshSqlite('srv');
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

async function seedDraftWithRoleExtras(store, role = 'cab-driver') {
  const id = createIdentity({ displayName: `Test ${Math.floor(Math.random() * 1e9)}` });
  await store.saveIdentity(id);
  let p = createProviderIdentity({
    rootIdentityId: id.id,
    roleKind: role,
    displayName: 'Test Provider',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role,
    answers: role === 'cab-driver'
      ? { drivingLicenceNumber: 'MH1420130012345', vehicleRegistrationNumber: 'MH12AB1234', commercialPermitNumber: 'CP-1' }
      : { drivingLicenceNumber: 'MH1420130012345', policeVerificationNumber: 'PCC-1', priorEmployerName: 'X' },
    attachments: {}
  });
  await store.saveProviderIdentity(p);
  return { identity: id, provider: p };
}

test('POST verify-role-extras requires admin bearer', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedDraftWithRoleExtras(store);
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      });
      assert.equal(r.status, 401);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('POST verify-role-extras happy path runs adapter + persists + emits ledger event', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedDraftWithRoleExtras(store, 'cab-driver');
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'x-bharat-os-operator': 'bos:operator:reviewer-1'
        }
      });
      assert.equal(r.status, 200);
      const body = await r.json();
      const v = body.providerIdentity.roleExtrasVerifications;
      assert.equal(v.runByOperatorId, 'bos:operator:reviewer-1');
      assert.equal(v.results.drivingLicenceNumber.status, 'valid');
      assert.equal(v.results.vehicleRegistrationNumber.status, 'valid');

      const events = await store.listLedger({ type: 'provider_identity.role_extras_verified' });
      assert.equal(events.length, 1);
      const evt = events[0];
      // §15 binding — audit event field-id + status only, never
      // holder name / validity dates / raw DL or RC.
      const json = JSON.stringify(evt);
      assert.ok(!/MH1420130012345/.test(json), 'raw DL not on ledger');
      assert.ok(!/MH12AB1234/.test(json), 'raw RC not on ledger');
      assert.ok(!/Aarav Kumar/.test(json), 'holder name not on ledger');
      assert.deepEqual(evt.verifiedFields.sort(), ['drivingLicenceNumber', 'vehicleRegistrationNumber']);
      assert.deepEqual(evt.statuses, ['valid', 'valid']);
      assert.equal(evt.operatorId, 'bos:operator:reviewer-1');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('POST verify-role-extras refuses provider without submission → 400', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const id = createIdentity({ displayName: 'X' });
      await store.saveIdentity(id);
      const p = createProviderIdentity({
        rootIdentityId: id.id,
        roleKind: 'cab-driver',
        displayName: 'No Submission'
      });
      await store.saveProviderIdentity(p);
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(p.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error.code, 'no_role_extras_submission');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('selfProviderRecord strips roleExtrasVerifications (PII-3 fix)', async () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'MH123' },
    attachments: {}
  });
  p = recordRoleExtrasVerifications(p, {
    results: { drivingLicenceNumber: { status: 'valid', holderName: 'Aarav Kumar (stub)' } },
    operatorId: 'op:test'
  });
  const { selfProviderRecord } = await import('../../src/phase1/provider-identity.mjs');
  const self = selfProviderRecord(p);
  assert.ok(!('roleExtrasVerifications' in self), 'verifications NOT echoed on owner-list');
  // Substrate keeps the row on the record itself.
  assert.ok(p.roleExtrasVerifications);
});

test('recordRoleExtrasSubmission clears roleExtrasVerifications on resubmit (UX-Q4 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'OLD-DL', vehicleRegistrationNumber: 'MH12AB1111', commercialPermitNumber: 'CP-1' },
    attachments: {}
  });
  p = recordRoleExtrasVerifications(p, {
    results: { drivingLicenceNumber: { status: 'valid' } },
    operatorId: 'op:test'
  });
  assert.ok(p.roleExtrasVerifications);
  // Citizen edits the DL number — verification block must clear.
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'NEW-DL', vehicleRegistrationNumber: 'MH12AB2222', commercialPermitNumber: 'CP-1' },
    attachments: {}
  });
  assert.equal(p.roleExtrasVerifications, null, 'old verifications cleared on resubmit');
});

test('POST verify-role-extras refuses non-draft / non-submitted status (L2-B fix)', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedDraftWithRoleExtras(store, 'cab-driver');
      // Force the record into 'active' status to simulate the guard.
      const cur = await store.readProviderIdentity(provider.providerIdentityId);
      await store.saveProviderIdentity({ ...cur, status: 'active' });
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      assert.equal(r.status, 409);
      const body = await r.json();
      assert.equal(body.error.code, 'invalid_status_for_verify');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('verifier_error envelope carries only code (PII-6 fix)', async () => {
  // Adapter throws because provider is set to live + an unconfigured backend.
  process.env.BHARAT_OS_PARIVAHAN_MODE = 'live';
  process.env.BHARAT_OS_PARIVAHAN_PROVIDER = 'surepass';
  try {
    const adapter = createParivahanAdapter({ store: null });
    const out = await verifyRoleExtrasFields(adapter, {
      role: 'cab-driver',
      answers: { drivingLicenceNumber: 'MH1420130012345', vehicleRegistrationNumber: 'MH12AB1234' }
    });
    assert.equal(out.drivingLicenceNumber.status, 'verifier_error');
    assert.equal(out.drivingLicenceNumber.error.code, 'verifier_unavailable');
    // No upstream message / provider name persisted.
    assert.ok(!('message' in out.drivingLicenceNumber.error));
    const json = JSON.stringify(out);
    assert.ok(!/surepass/.test(json), 'provider name NOT persisted');
    assert.ok(!/API_INTEGRATIONS/.test(json), 'docs link NOT persisted');
  } finally {
    delete process.env.BHARAT_OS_PARIVAHAN_MODE;
    delete process.env.BHARAT_OS_PARIVAHAN_PROVIDER;
  }
});

test('POST verify-role-extras returns 502 + skips ledger when all results are verifier_error (L2-A fix)', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  process.env.BHARAT_OS_PARIVAHAN_MODE = 'live';
  process.env.BHARAT_OS_PARIVAHAN_PROVIDER = 'karza';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedDraftWithRoleExtras(store, 'cab-driver');
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      assert.equal(r.status, 502);
      const body = await r.json();
      assert.equal(body.error.code, 'verifier_unavailable');
      // No ledger event emitted for the misconfig outcome.
      const events = await store.listLedger({ type: 'provider_identity.role_extras_verified' });
      assert.equal(events.length, 0, 'misconfig should NOT pollute the audit trail');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
    delete process.env.BHARAT_OS_PARIVAHAN_MODE;
    delete process.env.BHARAT_OS_PARIVAHAN_PROVIDER;
  }
});

test('POST verify-role-extras unknown provider → 404', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/bos:provider-identity:nope/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      assert.equal(r.status, 404);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});
