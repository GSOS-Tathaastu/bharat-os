// Phase 12.3 — GSTN verification adapter + verify-role-extras
// integration for the kirana role.

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
  recordRoleExtrasSubmission
} from '../../src/phase1/provider-identity.mjs';
import {
  createGstAdapter,
  verifyGstFields,
  isValidGstinShape,
  GST_PROTOCOL_VERSION,
  GST_PROVIDERS
} from '../../src/phase1/gst-adapter.mjs';
import {
  PROVIDER_ROLE_EXTRAS,
  ROLES_REQUIRING_EXTRAS,
  validateRoleExtras
} from '../../src/phase1/provider-role-extras.mjs';
import { ATTACHMENT_KINDS } from '../../src/phase1/attachment.mjs';
import { sha256Hex } from '../../src/phase0/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'gst-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Substrate ────────────────────────────────────────────────────

test('protocol version + provider allowlist frozen', () => {
  assert.equal(GST_PROTOCOL_VERSION, 'bos.phase12.gst-adapter.v0');
  assert.deepEqual([...GST_PROVIDERS].sort(), ['gsp-direct', 'karza', 'sandbox', 'stub', 'surepass']);
  assert.throws(() => { GST_PROVIDERS.push('x'); }, TypeError);
});

test('isValidGstinShape accepts canonical GSTIN (case-tolerant)', () => {
  assert.ok(isValidGstinShape('27ABCDE1234F1Z5'));
  assert.ok(isValidGstinShape('29AAAAA0000A1Z9'));
  // The substrate uppercases before regex-testing, so citizen
  // input in mixed case is accepted; the cacheKey uses the
  // normalised uppercase form.
  assert.ok(isValidGstinShape('27abcde1234f1z5'));
  assert.ok(!isValidGstinShape('TOOSHORT'));
  // Wrong format — Z missing at position 13.
  assert.ok(!isValidGstinShape('27ABCDE1234F1X5'));
});

test('createGstAdapter refuses unknown provider', () => {
  assert.throws(
    () => createGstAdapter({ provider: 'bogus' }),
    /not in allowlist/
  );
});

test('stub returns active for well-formed GSTIN', async () => {
  const adapter = createGstAdapter({ mode: 'stub' });
  const ok = await adapter.call({ gstin: '27ABCDE1234F1Z5' });
  assert.equal(ok.body.status, 'active');
  assert.equal(ok.body.provider, 'stub');
  assert.ok(ok.body.legalName);
});

test('cacheKey on audit is sha256 digest — NEVER the raw GSTIN (§15)', async () => {
  const { store } = await freshSqlite('gst-pii');
  try {
    const adapter = createGstAdapter({ mode: 'stub', store });
    await adapter.call({ gstin: '27ABCDE1234F1Z5' });
    const ledger = await store.listLedger({ type: 'external_adapter.call' });
    assert.equal(ledger.length, 1);
    assert.ok(/^gst:[0-9a-f]{32}$/.test(ledger[0].cacheKey));
    const json = JSON.stringify(ledger[0]);
    assert.ok(!/ABCDE1234F/.test(json), 'raw GSTIN NOT in audit');
    assert.ok(!('body' in ledger[0]), 'response body NEVER on audit');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('adapter rejects malformed GSTIN at request layer', async () => {
  const adapter = createGstAdapter({ mode: 'stub' });
  await assert.rejects(adapter.call({ gstin: 'NOT-A-GSTIN' }), (e) => e.code === 'adapter_invalid_request');
});

test('live mode throws provider_not_configured (until per-provider URL+parse lands)', async () => {
  process.env.BHARAT_OS_GST_MODE = 'live';
  process.env.BHARAT_OS_GST_PROVIDER = 'sandbox';
  try {
    const adapter = createGstAdapter({});
    await assert.rejects(
      adapter.call({ gstin: '27ABCDE1234F1Z5' }),
      (e) => e.code === 'adapter_invalid_request' || /not yet configured/.test(e.message)
    );
  } finally {
    delete process.env.BHARAT_OS_GST_MODE;
    delete process.env.BHARAT_OS_GST_PROVIDER;
  }
});

// ─── verifyGstFields helper ───────────────────────────────────────

test('verifyGstFields no-ops on non-kirana roles', async () => {
  const adapter = createGstAdapter({ mode: 'stub' });
  for (const role of ['cab-driver', 'personal-driver', 'labourers', 'household-help', 'skilled-trades']) {
    const out = await verifyGstFields(adapter, { role, answers: { gstinNumber: '27ABCDE1234F1Z5' } });
    assert.deepEqual(out, {});
  }
});

test('verifyGstFields no-ops on kirana without GSTIN (it is OPTIONAL)', async () => {
  const adapter = createGstAdapter({ mode: 'stub' });
  const out = await verifyGstFields(adapter, {
    role: 'kirana',
    answers: { shopName: 'X', shopLicenseNumber: 'L1' }
  });
  assert.deepEqual(out, {});
});

test('verifyGstFields verifies kirana with GSTIN', async () => {
  const adapter = createGstAdapter({ mode: 'stub' });
  const out = await verifyGstFields(adapter, {
    role: 'kirana',
    answers: { shopName: 'X', shopLicenseNumber: 'L1', gstinNumber: '27ABCDE1234F1Z5' }
  });
  assert.equal(out.gstinNumber.status, 'active');
  assert.equal(out.gstinNumber.provider, 'stub');
});

// ─── Wave-2 role-extras schemas ───────────────────────────────────

test('PROVIDER_ROLE_EXTRAS now covers wave-2 (kirana + skilled-trades)', () => {
  assert.ok(PROVIDER_ROLE_EXTRAS.kirana, 'kirana schema present');
  assert.ok(PROVIDER_ROLE_EXTRAS['skilled-trades'], 'skilled-trades schema present');
  assert.deepEqual([...ROLES_REQUIRING_EXTRAS].sort(), [
    'cab-driver', 'household-help', 'kirana', 'labourers', 'personal-driver', 'skilled-trades'
  ]);
});

test('kirana schema: shopName + shopLicenseNumber required + shop_license attachment required', async () => {
  // Missing shopLicenseNumber → throws.
  await assert.rejects(
    validateRoleExtras('kirana', {
      answers: { shopName: 'X' },
      attachments: { shop_license: `bos:att:${sha256Hex(Buffer.from([1])).slice(0, 32)}` }
    }),
    (e) => e.code === 'shopLicenseNumber_required'
  );
  // Missing shop_license attachment → throws.
  await assert.rejects(
    validateRoleExtras('kirana', {
      answers: { shopName: 'X', shopLicenseNumber: 'L1' },
      attachments: {}
    }),
    (e) => e.code === 'shop_license_attachment_required'
  );
  // Happy path.
  const env = await validateRoleExtras('kirana', {
    answers: { shopName: 'Shivajinagar Kirana', shopLicenseNumber: 'KAR-PUN-2025-001' },
    attachments: { shop_license: `bos:att:${sha256Hex(Buffer.from([1])).slice(0, 32)}` }
  });
  assert.equal(env.role, 'kirana');
  assert.equal(env.answers.shopName, 'Shivajinagar Kirana');
});

test('skilled-trades schema: itiCertificateNumber + itiInstituteName required + iti_certificate attachment', async () => {
  await assert.rejects(
    validateRoleExtras('skilled-trades', {
      answers: { itiCertificateNumber: 'X' },
      attachments: { iti_certificate: `bos:att:${sha256Hex(Buffer.from([2])).slice(0, 32)}` }
    }),
    (e) => e.code === 'itiInstituteName_required'
  );
  const env = await validateRoleExtras('skilled-trades', {
    answers: { itiCertificateNumber: 'ITI-PUN-2020-7890', itiInstituteName: 'Govt ITI Pune' },
    attachments: { iti_certificate: `bos:att:${sha256Hex(Buffer.from([2])).slice(0, 32)}` }
  });
  assert.equal(env.role, 'skilled-trades');
});

test('attachment kinds extended with the 4 wave-2 kinds', () => {
  assert.ok(ATTACHMENT_KINDS.includes('shop_license'));
  assert.ok(ATTACHMENT_KINDS.includes('gst_certificate'));
  assert.ok(ATTACHMENT_KINDS.includes('iti_certificate'));
  assert.ok(ATTACHMENT_KINDS.includes('trade_portfolio'));
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

async function seedKiranaWithGstin(store, { gstin } = {}) {
  const id = createIdentity({ displayName: `Test ${Math.floor(Math.random() * 1e9)}` });
  await store.saveIdentity(id);
  let p = createProviderIdentity({
    rootIdentityId: id.id,
    roleKind: 'kirana',
    displayName: 'Shivajinagar Kirana',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  const answers = { shopName: 'Shivajinagar Kirana', shopLicenseNumber: 'KAR-PUN-2025-001' };
  if (gstin) answers.gstinNumber = gstin;
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1,
    role: 'kirana',
    answers,
    attachments: {}
  });
  await store.saveProviderIdentity(p);
  return { identity: id, provider: p };
}

test('verify-role-extras endpoint pre-verifies kirana GSTIN via the GST adapter', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedKiranaWithGstin(store, { gstin: '27ABCDE1234F1Z5' });
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      assert.equal(r.status, 200);
      const body = await r.json();
      const v = body.providerIdentity.roleExtrasVerifications;
      assert.equal(v.results.gstinNumber.status, 'active');
      assert.equal(v.results.gstinNumber.provider, 'stub');

      const events = await store.listLedger({ type: 'provider_identity.role_extras_verified' });
      assert.equal(events.length, 1);
      const json = JSON.stringify(events[0]);
      // §15 — GSTIN NOT on the ledger event.
      assert.ok(!/ABCDE1234F/.test(json), 'raw GSTIN NOT on ledger');
      assert.deepEqual(events[0].verifiedFields, ['gstinNumber']);
      assert.deepEqual(events[0].statuses, ['active']);
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('verify-role-extras returns 400 nothing_to_verify for kirana WITHOUT GSTIN (Phase 12.3 adversarial fix)', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedKiranaWithGstin(store); // no GSTIN
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/verify-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      });
      // Phase 12.3 adversarial fix — empty-results case (no
      // automated-verification fields submitted) now returns
      // 400 nothing_to_verify, no persist, no ledger event,
      // instead of silently stamping a misleading "verified at
      // T by operator X" with empty results.
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error.code, 'nothing_to_verify');
      const events = await store.listLedger({ type: 'provider_identity.role_extras_verified' });
      assert.equal(events.length, 0, 'manual-only outcome must NOT pollute the audit trail');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});
