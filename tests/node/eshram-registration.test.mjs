// Phase 6.3 — e-Shram registration + welfare scheme entitlement tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createEShramRegistration,
  createSchemeEntitlement,
  ESHRAM_REGISTRATION_PROTOCOL_VERSION,
  filterBlessedEShramRegistrations,
  filterBlessedSchemeEntitlements,
  INCOME_BRACKETS,
  isValidUan,
  maskUan,
  OCCUPATION_CATEGORIES,
  revokeEShramRegistration,
  revokeSchemeEntitlement,
  verifyEShramRegistration,
  verifySchemeEntitlement,
  WELFARE_SCHEME_CODES
} from '../../src/phase1/eshram-registration.mjs';
import { createBlessedCollectiveRecord } from '../../src/phase1/collective-membership.mjs';
import {
  buildIncomeVerificationBundle,
  createIncomeVerificationConsent
} from '../../src/phase1/income-verification.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'eshram-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [k, v] of Object.entries(orig)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

// ─── UAN helpers ─────────────────────────────────────────────────────

test('isValidUan accepts 12-digit strings; rejects everything else', () => {
  assert.equal(isValidUan('123456789012'), true);
  assert.equal(isValidUan('12345678901'), false);
  assert.equal(isValidUan('1234567890123'), false);
  assert.equal(isValidUan('12345678901A'), false);
  assert.equal(isValidUan(null), false);
});

test('maskUan exposes only last 4 digits', () => {
  assert.equal(maskUan('123456789012'), 'xxxx-xxxx-9012');
  assert.equal(maskUan('not-a-uan'), null);
});

// ─── createEShramRegistration ────────────────────────────────────────

test('createEShramRegistration produces a versioned signed envelope', () => {
  const issuer = createIdentity({ displayName: 'TN Labour Dept' });
  const worker = createIdentity({ displayName: 'Lakshmi' });
  const r = createEShramRegistration({
    issuer,
    memberId: worker.id,
    issuerName: 'Tamil Nadu Labour Department',
    uan: '123456789012',
    occupationCategory: 'domestic',
    occupationDetail: 'live-in caregiver',
    state: 'TN',
    district: 'Chennai',
    educationLevel: 'secondary',
    monthlyIncomeBracket: '10k_to_25k',
    registeredAt: '2022-08-15'
  });
  assert.equal(r.protocolVersion, ESHRAM_REGISTRATION_PROTOCOL_VERSION);
  assert.equal(r.objectType, 'eshram-registration');
  assert.equal(r.uan, '123456789012');
  assert.equal(r.uanMasked, 'xxxx-xxxx-9012');
  assert.equal(r.state, 'TN');
  assert.equal(r.district, 'Chennai');
  assert.equal(r.occupationCategory, 'domestic');
  assert.equal(r.status, 'active');
  assert.match(r.registrationId, /^bos:eshram-registration:[0-9a-f]{32}$/);
  assert.ok(r.signature);
});

test('createEShramRegistration rejects bad inputs', () => {
  const issuer = createIdentity({ displayName: 'I' });
  const base = {
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'I',
    uan: '123456789012',
    state: 'TN'
  };
  assert.throws(
    () => createEShramRegistration({ ...base, uan: '12345' }),
    /uan must be a 12-digit string/
  );
  assert.throws(
    () => createEShramRegistration({ ...base, state: 'invalid' }),
    /state must be a 2-3 letter/
  );
  assert.throws(
    () => createEShramRegistration({ ...base, occupationCategory: 'astronaut' }),
    /occupationCategory must be one of/
  );
  assert.throws(
    () => createEShramRegistration({ ...base, ttlDays: 10 }),
    /ttlDays must be between/
  );
  assert.throws(
    () => createEShramRegistration({ ...base, memberId: issuer.id }),
    /cannot self-issue/
  );
  assert.throws(
    () => createEShramRegistration({ ...base, ncoCode: 'abcd' }),
    /ncoCode must be a 2-4 digit string/
  );
});

test('verifyEShramRegistration round-trips + flags tamper', () => {
  const issuer = createIdentity({ displayName: 'TN' });
  const r = createEShramRegistration({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'TN',
    uan: '123456789012',
    state: 'TN'
  });
  assert.equal(verifyEShramRegistration(r, issuer).ok, true);
  // Tamper with state.
  const tampered = { ...r, state: 'MH' };
  const v = verifyEShramRegistration(tampered, issuer);
  assert.equal(v.ok, false);
  assert.equal(v.status, 'signature_invalid');
});

test('verifyEShramRegistration flags expired + revoked', () => {
  const issuer = createIdentity({ displayName: 'TN' });
  const r = createEShramRegistration({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'TN',
    uan: '123456789012',
    state: 'TN',
    ttlDays: 30,
    at: '2025-01-01T00:00:00.000Z'
  });
  const expired = verifyEShramRegistration(r, issuer, {
    at: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(expired.status, 'expired');
  const revoked = revokeEShramRegistration(r, { reason: 'UAN refreshed' });
  const v = verifyEShramRegistration(revoked, issuer);
  assert.equal(v.status, 'revoked');
});

// ─── createSchemeEntitlement ─────────────────────────────────────────

test('createSchemeEntitlement signs envelope; verifySchemeEntitlement round-trips', () => {
  const issuer = createIdentity({ displayName: 'PMJAY Authority' });
  const worker = createIdentity({ displayName: 'W' });
  const e = createSchemeEntitlement({
    issuer,
    memberId: worker.id,
    issuerName: 'National Health Authority',
    schemeCode: 'PMJAY',
    schemeName: 'Ayushman Bharat',
    enrolledAt: '2023-10-01',
    benefitPaise: 5_00_000_00, // ₹5L health cover
    benefitDescription: 'Family-floater health cover up to ₹5 lakh / year',
    validThrough: '2027-09-30'
  });
  assert.equal(e.objectType, 'scheme-entitlement');
  assert.equal(e.schemeCode, 'PMJAY');
  assert.equal(e.benefitPaise, 5_00_000_00);
  assert.match(e.entitlementId, /^bos:scheme-entitlement:[0-9a-f]{32}$/);
  const v = verifySchemeEntitlement(e, issuer);
  assert.equal(v.ok, true);
});

test('createSchemeEntitlement rejects bad scheme code + bad benefit amount', () => {
  const issuer = createIdentity({ displayName: 'I' });
  assert.throws(
    () =>
      createSchemeEntitlement({
        issuer,
        memberId: 'x',
        issuerName: 'I',
        schemeCode: 'made-up'
      }),
    /schemeCode must be one of/
  );
  assert.throws(
    () =>
      createSchemeEntitlement({
        issuer,
        memberId: 'x',
        issuerName: 'I',
        schemeCode: 'PMJJBY',
        benefitPaise: -1
      }),
    /non-negative integer/
  );
  assert.throws(
    () =>
      createSchemeEntitlement({
        issuer,
        memberId: 'x',
        issuerName: 'I',
        schemeCode: 'PMJJBY',
        benefitPaise: 1.5
      }),
    /non-negative integer/
  );
});

test('verifySchemeEntitlement flags scheme-validity expiry separately from issuance expiry', () => {
  const issuer = createIdentity({ displayName: 'I' });
  const e = createSchemeEntitlement({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'I',
    schemeCode: 'PMSBY',
    validThrough: '2024-12-31'
  });
  const v = verifySchemeEntitlement(e, issuer, {
    at: '2025-06-01T00:00:00.000Z'
  });
  assert.equal(v.ok, false);
  assert.equal(v.status, 'scheme_validity_expired');
});

test('revokeSchemeEntitlement requires reason >= 4 chars', () => {
  const issuer = createIdentity({ displayName: 'I' });
  const e = createSchemeEntitlement({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'I',
    schemeCode: 'PMSBY'
  });
  assert.throws(
    () => revokeSchemeEntitlement(e, { reason: 'no' }),
    /reason is required/
  );
  const out = revokeSchemeEntitlement(e, { reason: 'enrollment lapsed' });
  assert.equal(out.status, 'revoked');
  assert.match(out.revokedReason, /enrollment lapsed/);
});

// ─── Blessed-issuer filters ──────────────────────────────────────────

test('filterBlessedEShramRegistrations returns only blessed + currently-valid', () => {
  const issuerA = createIdentity({ displayName: 'A' });
  const issuerB = createIdentity({ displayName: 'B' });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: issuerA.id,
    collectiveName: 'A',
    blessedBy: 'admin'
  });
  const fromA = createEShramRegistration({
    issuer: issuerA,
    memberId: 'bos:person:m',
    issuerName: 'A',
    uan: '111111111111',
    state: 'TN'
  });
  const fromB = createEShramRegistration({
    issuer: issuerB,
    memberId: 'bos:person:m',
    issuerName: 'B',
    uan: '222222222222',
    state: 'KA'
  });
  const filtered = filterBlessedEShramRegistrations([fromA, fromB], [blessed]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].registrationId, fromA.registrationId);
});

test('filterBlessedSchemeEntitlements respects scheme validThrough', () => {
  const issuer = createIdentity({ displayName: 'A' });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: issuer.id,
    collectiveName: 'A',
    blessedBy: 'admin'
  });
  const e1 = createSchemeEntitlement({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'A',
    schemeCode: 'PMJJBY'
  });
  const e2 = createSchemeEntitlement({
    issuer,
    memberId: 'bos:person:m',
    issuerName: 'A',
    schemeCode: 'PMSBY',
    validThrough: '2024-12-31'
  });
  const filtered = filterBlessedSchemeEntitlements([e1, e2], [blessed], {
    at: '2025-06-01T00:00:00.000Z'
  });
  // e1 valid; e2 past validThrough.
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].entitlementId, e1.entitlementId);
});

// ─── MFI bundle integration ──────────────────────────────────────────

test('buildIncomeVerificationBundle exposes only masked UAN, never the full one', () => {
  const worker = createIdentity({ displayName: 'W' });
  const issuer = createIdentity({ displayName: 'TN' });
  const consent = createIncomeVerificationConsent({
    identity: worker,
    mfiName: 'Bajaj',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: issuer.id,
    collectiveName: 'TN',
    blessedBy: 'admin'
  });
  const reg = createEShramRegistration({
    issuer,
    memberId: worker.id,
    issuerName: 'TN',
    uan: '123456789012',
    state: 'TN',
    occupationCategory: 'domestic'
  });
  const bundle = buildIncomeVerificationBundle({
    identity: worker,
    consent,
    earningsEntries: [],
    meshContributionEvents: [],
    portableAttestations: [],
    eshramRegistrations: [reg],
    blessedCollectives: [blessed]
  });
  const entry = bundle.credibility.verifiedEShramRegistrations[0];
  assert.equal(entry.uanMasked, 'xxxx-xxxx-9012');
  // Critical: the bundle must NOT contain the raw UAN anywhere.
  assert.equal(JSON.stringify(bundle).includes('123456789012'), false);
});

test('buildIncomeVerificationBundle surfaces verified scheme entitlements', () => {
  const worker = createIdentity({ displayName: 'W' });
  const issuer = createIdentity({ displayName: 'NHA' });
  const consent = createIncomeVerificationConsent({
    identity: worker,
    mfiName: 'Bajaj',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: issuer.id,
    collectiveName: 'NHA',
    blessedBy: 'admin'
  });
  const e = createSchemeEntitlement({
    issuer,
    memberId: worker.id,
    issuerName: 'NHA',
    schemeCode: 'PMJAY',
    schemeName: 'Ayushman Bharat',
    benefitPaise: 5_00_000_00
  });
  const bundle = buildIncomeVerificationBundle({
    identity: worker,
    consent,
    earningsEntries: [],
    meshContributionEvents: [],
    portableAttestations: [],
    schemeEntitlements: [e],
    blessedCollectives: [blessed]
  });
  assert.equal(bundle.credibility.verifiedSchemeEntitlements.length, 1);
  assert.equal(
    bundle.credibility.verifiedSchemeEntitlements[0].schemeCode,
    'PMJAY'
  );
  assert.equal(
    bundle.credibility.verifiedSchemeEntitlements[0].benefitPaise,
    5_00_000_00
  );
});

// ─── SqliteStore + DPDP ──────────────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips eshram registrations + scheme entitlements', async () => {
  const { store } = await freshSqlite('roundtrip');
  const issuer = createIdentity({ displayName: 'I' });
  const worker = createIdentity({ displayName: 'W' });
  await store.saveIdentity(issuer);
  await store.saveIdentity(worker);
  const reg = createEShramRegistration({
    issuer,
    memberId: worker.id,
    issuerName: 'I',
    uan: '123456789012',
    state: 'TN'
  });
  await store.saveEShramRegistration(reg);
  const back = await store.readEShramRegistration(reg.registrationId);
  assert.equal(back.uan, '123456789012');
  const e = createSchemeEntitlement({
    issuer,
    memberId: worker.id,
    issuerName: 'I',
    schemeCode: 'PMSBY'
  });
  await store.saveSchemeEntitlement(e);
  const backE = await store.readSchemeEntitlement(e.entitlementId);
  assert.equal(backE.schemeCode, 'PMSBY');
  store.close();
});

test('SqliteStore lists filter by issuer/member/status/schemeCode', async () => {
  const { store } = await freshSqlite('lists');
  const i1 = createIdentity({ displayName: 'I1' });
  const i2 = createIdentity({ displayName: 'I2' });
  const w = createIdentity({ displayName: 'W' });
  await store.saveIdentity(i1);
  await store.saveIdentity(i2);
  await store.saveIdentity(w);
  await store.saveSchemeEntitlement(
    createSchemeEntitlement({
      issuer: i1,
      memberId: w.id,
      issuerName: 'I1',
      schemeCode: 'PMJJBY'
    })
  );
  await store.saveSchemeEntitlement(
    createSchemeEntitlement({
      issuer: i1,
      memberId: w.id,
      issuerName: 'I1',
      schemeCode: 'PMSBY'
    })
  );
  await store.saveSchemeEntitlement(
    createSchemeEntitlement({
      issuer: i2,
      memberId: w.id,
      issuerName: 'I2',
      schemeCode: 'PMJAY'
    })
  );
  const all = await store.listSchemeEntitlements({ memberId: w.id });
  assert.equal(all.length, 3);
  const i1Only = await store.listSchemeEntitlements({ issuerId: i1.id });
  assert.equal(i1Only.length, 2);
  const pmjay = await store.listSchemeEntitlements({
    memberId: w.id,
    schemeCode: 'PMJAY'
  });
  assert.equal(pmjay.length, 1);
  store.close();
});

test('DPDP cascade clears eshram + scheme records for the erased identity', async () => {
  const { store } = await freshSqlite('dpdp');
  const issuer = createIdentity({ displayName: 'I' });
  const worker = createIdentity({ displayName: 'W' });
  await store.saveIdentity(issuer);
  await store.saveIdentity(worker);
  await store.saveEShramRegistration(
    createEShramRegistration({
      issuer,
      memberId: worker.id,
      issuerName: 'I',
      uan: '123456789012',
      state: 'TN'
    })
  );
  await store.saveSchemeEntitlement(
    createSchemeEntitlement({
      issuer,
      memberId: worker.id,
      issuerName: 'I',
      schemeCode: 'PMSBY'
    })
  );
  const data = await collectUserData(store, worker.id);
  assert.equal(data.sections.eshramRegistrations.count, 1);
  assert.equal(data.sections.schemeEntitlements.count, 1);
  await store.eraseUserData(worker.id, { redactLedgerEntry: (e) => e });
  const remainR = await store.listEShramRegistrations({ memberId: worker.id });
  const remainS = await store.listSchemeEntitlements({ memberId: worker.id });
  assert.equal(remainR.length, 0);
  assert.equal(remainS.length, 0);
  store.close();
});

// ─── End-to-end API ──────────────────────────────────────────────────

async function withApiServer(callback) {
  const root = path.join(tmpRoot, `srv-${Date.now()}-${process.pid}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
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

test('POST eshram-registrations signs, persists, audits', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const issuer = createIdentity({ displayName: 'TN' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(issuer);
    await store.saveIdentity(worker);
    const resp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(issuer.id)}/eshram-registrations`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: worker.id,
          issuerName: 'Tamil Nadu Labour Department',
          uan: '987654321098',
          occupationCategory: 'domestic',
          state: 'TN',
          district: 'Chennai'
        })
      }
    );
    assert.equal(resp.status, 201);
    const body = await resp.json();
    assert.equal(body.registration.uanMasked, 'xxxx-xxxx-1098');
    const ledger = await store.listLedger({ type: 'eshram_registration.issued' });
    assert.ok(ledger.length >= 1);
    // §15 critical: ledger entry uses masked UAN, NOT raw.
    assert.equal(ledger[0].uanMasked, 'xxxx-xxxx-1098');
    assert.equal(JSON.stringify(ledger[0]).includes('987654321098'), false);
  });
});

test('POST eshram-registrations rejects unknown member', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const issuer = createIdentity({ displayName: 'I' });
    await store.saveIdentity(issuer);
    const resp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(issuer.id)}/eshram-registrations`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: 'bos:person:nope',
          issuerName: 'I',
          uan: '123456789012',
          state: 'TN'
        })
      }
    );
    assert.equal(resp.status, 400);
    const body = await resp.json();
    assert.equal(body.error.code, 'unknown_member');
  });
});

test('POST scheme-entitlements + GET list + POST revoke round-trip', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const issuer = createIdentity({ displayName: 'NHA' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(issuer);
    await store.saveIdentity(worker);
    const issueResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(issuer.id)}/scheme-entitlements`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: worker.id,
          issuerName: 'NHA',
          schemeCode: 'PMJAY',
          benefitPaise: 5_00_000_00
        })
      }
    );
    assert.equal(issueResp.status, 201);
    const { entitlement } = await issueResp.json();
    // GET list.
    const listResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/scheme-entitlements`
    );
    const listBody = await listResp.json();
    assert.equal(listBody.entitlements.length, 1);
    // Revoke.
    const revokeResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(issuer.id)}/scheme-entitlements/${encodeURIComponent(entitlement.entitlementId)}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'lapsed enrollment' })
      }
    );
    assert.equal(revokeResp.status, 200);
    const body = await revokeResp.json();
    assert.equal(body.entitlement.status, 'revoked');
  });
});

test('POST revoke cross-issuer returns 404 (no ownership leak)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const i1 = createIdentity({ displayName: 'I1' });
    const i2 = createIdentity({ displayName: 'I2' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(i1);
    await store.saveIdentity(i2);
    await store.saveIdentity(worker);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(i1.id)}/eshram-registrations`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: worker.id,
          issuerName: 'I1',
          uan: '111111111111',
          state: 'TN'
        })
      }
    );
    const { registration } = await r.json();
    // i2 tries to revoke i1's registration.
    const cross = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(i2.id)}/eshram-registrations/${encodeURIComponent(registration.registrationId)}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'attempting cross-issuer revoke' })
      }
    );
    assert.equal(cross.status, 404);
  });
});

test('MFI bundle end-to-end: bless issuer → issue registration + scheme → MFI fetch sees both', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const labourDept = createIdentity({ displayName: 'TN Labour Dept' });
      const nha = createIdentity({ displayName: 'NHA' });
      const worker = createIdentity({ displayName: 'Lakshmi' });
      await store.saveIdentity(labourDept);
      await store.saveIdentity(nha);
      await store.saveIdentity(worker);
      // Bless both issuers.
      for (const id of [labourDept.id, nha.id]) {
        await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32)
          },
          body: JSON.stringify({ collectiveId: id, collectiveName: 'test' })
        });
      }
      // Labour Dept issues e-Shram registration.
      await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(labourDept.id)}/eshram-registrations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memberId: worker.id,
            issuerName: 'TN Labour Dept',
            uan: '987654321098',
            occupationCategory: 'domestic',
            state: 'TN',
            district: 'Chennai'
          })
        }
      );
      // NHA issues PMJAY entitlement.
      await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(nha.id)}/scheme-entitlements`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memberId: worker.id,
            issuerName: 'NHA',
            schemeCode: 'PMJAY',
            schemeName: 'Ayushman Bharat',
            benefitPaise: 5_00_000_00
          })
        }
      );
      // Worker issues MFI consent.
      const consentResp = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/income-verification/consents`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mfiName: 'Bajaj Finserv',
            purpose: 'Loan',
            financialYear: '2025-26'
          })
        }
      );
      const { consent } = await consentResp.json();
      // MFI fetches.
      const mfiResp = await fetch(
        `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
      );
      const body = await mfiResp.json();
      assert.equal(
        body.bundle.credibility.verifiedEShramRegistrations.length,
        1
      );
      assert.equal(
        body.bundle.credibility.verifiedEShramRegistrations[0].uanMasked,
        'xxxx-xxxx-1098'
      );
      assert.equal(
        body.bundle.credibility.verifiedSchemeEntitlements.length,
        1
      );
      assert.equal(
        body.bundle.credibility.verifiedSchemeEntitlements[0].schemeCode,
        'PMJAY'
      );
      // §15: raw UAN MUST NOT appear in the MFI bundle.
      assert.equal(JSON.stringify(body.bundle).includes('987654321098'), false);
    });
  });
});

test('Constants are frozen + complete', () => {
  assert.ok(Object.isFrozen(OCCUPATION_CATEGORIES));
  assert.ok(Object.isFrozen(WELFARE_SCHEME_CODES));
  assert.ok(Object.isFrozen(INCOME_BRACKETS));
  assert.ok(OCCUPATION_CATEGORIES.includes('domestic'));
  assert.ok(WELFARE_SCHEME_CODES.includes('PMJAY'));
});
