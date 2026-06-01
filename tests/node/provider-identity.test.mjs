// Phase 12.0 — providerIdentity substrate tests.
//
// Covers:
//   1. Pure module — createProviderIdentity validation, KYC
//      attestation, status transitions, public-record stripping,
//      profile updates.
//   2. SqliteStore + BosStore CRUD round-trips.
//   3. DPDP §12(3) cascade by rootIdentityId on both stores.
//   4. HTTP endpoints — create draft, list owned, public read
//      strips sensitive fields, profile edit gates on rootId,
//      admin KYC + transition.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createProviderIdentity,
  attestProviderKyc,
  transitionProviderStatus,
  updateProviderProfile,
  publicProviderRecord,
  PROVIDER_ROLE_KINDS_WAVE_1,
  PROVIDER_ROLE_KINDS_WAVE_2
} from '../../src/phase1/provider-identity.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'provider-identity-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

async function freshBos(name) {
  const root = path.join(tmpRoot, `bos-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ───────────────────────────────────────────────────

test('createProviderIdentity validates required fields', () => {
  assert.throws(() => createProviderIdentity({}), /rootIdentityId/);
  assert.throws(
    () => createProviderIdentity({ rootIdentityId: 'bos:person:x' }),
    /roleKind/
  );
  assert.throws(
    () =>
      createProviderIdentity({
        rootIdentityId: 'bos:person:x',
        roleKind: 'not-a-role'
      }),
    /roleKind must be one of/
  );
  assert.throws(
    () =>
      createProviderIdentity({
        rootIdentityId: 'bos:person:x',
        roleKind: 'cab-driver'
      }),
    /displayName/
  );
});

test('createProviderIdentity defaults: kycLevel none, status draft, wave from roleKind', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:abc',
    roleKind: 'cab-driver',
    displayName: 'Ravi'
  });
  assert.equal(p.kycLevel, 'none');
  assert.equal(p.status, 'draft');
  assert.equal(p.roleWave, 1);
  assert.equal(p.ratePaisePerHour, 0);
  assert.equal(p.ratePaisePerService, 0);
  assert.ok(p.providerIdentityId.startsWith('bos:provider-identity:'));
});

test('createProviderIdentity assigns wave 2 to kirana / skilled-trades', () => {
  for (const role of PROVIDER_ROLE_KINDS_WAVE_2) {
    const p = createProviderIdentity({
      rootIdentityId: 'bos:person:abc',
      roleKind: role,
      displayName: 'Test'
    });
    assert.equal(p.roleWave, 2, `${role} should be wave 2`);
  }
});

test('createProviderIdentity assigns wave 1 to all wave-1 roles', () => {
  for (const role of PROVIDER_ROLE_KINDS_WAVE_1) {
    const p = createProviderIdentity({
      rootIdentityId: 'bos:person:abc',
      roleKind: role,
      displayName: 'Test'
    });
    assert.equal(p.roleWave, 1, `${role} should be wave 1`);
  }
});

test('attestProviderKyc moves draft → submitted and records the envelope', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:abc',
    roleKind: 'cab-driver',
    displayName: 'Ravi',
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.5204, lng: 73.8567 },
      radiusMeters: 5000,
      source: 'manual'
    }
  });
  const attested = attestProviderKyc(p, {
    kycLevel: 'basic',
    operatorId: 'op:test'
  });
  assert.equal(attested.kycLevel, 'basic');
  assert.equal(attested.status, 'submitted');
  assert.ok(attested.submittedAt);
  assert.equal(attested.kycAttestation?.kycLevel, 'basic');
  assert.equal(attested.kycAttestation?.operatorId, 'op:test');
});

test('attestProviderKyc refuses kycLevel none', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:abc',
    roleKind: 'cab-driver',
    displayName: 'Ravi'
  });
  assert.throws(
    () => attestProviderKyc(p, { kycLevel: 'none', operatorId: 'op:test' }),
    /cannot set level back to none/
  );
});

test('transitionProviderStatus enforces valid transitions', async () => {
  // Phase 12.3 — every wave-1 + wave-2 role now requires
  // role-extras attestation before activation. Synthesize a
  // minimal stub envelope so this test can exercise the KYC
  // gate independently.
  const { recordRoleExtrasSubmission: recordRoleExtras, attestRoleExtras: attestExtras } =
    await import('../../src/phase1/provider-identity.mjs');
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:abc',
    roleKind: 'kirana',
    displayName: 'Ravi',
    // Phase 12.1a.1 — submitted state machine guard requires
    // a discoverable point-radius serviceArea.
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.5204, lng: 73.8567 },
      radiusMeters: 5000,
      source: 'manual'
    }
  });
  // draft → active without KYC fails
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op:test' }),
    /cannot transition from draft to active/
  );
  // draft → submitted (manual) works
  p = transitionProviderStatus(p, 'submitted', { operatorId: 'op:test' });
  assert.equal(p.status, 'submitted');
  // submitted → active still blocked without KYC
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op:test' }),
    /cannot activate provider without KYC/
  );
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' });
  // Phase 12.3 — add role-extras submission + attestation so
  // activation gate doesn't fire.
  p = recordRoleExtras(p, {
    schemaVersion: 1, role: 'kirana',
    answers: { shopName: 'X', shopLicenseNumber: 'Y' },
    attachments: {}
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' });
  p = attestExtras(p, { level: 'basic', operatorId: 'op:test' });
  p = transitionProviderStatus(p, 'active', { operatorId: 'op:test' });
  assert.equal(p.status, 'active');
  assert.ok(p.activatedAt);
  // active → revoked allowed
  p = transitionProviderStatus(p, 'revoked', { operatorId: 'op:test', reason: 'test' });
  assert.equal(p.status, 'revoked');
  // revoked is terminal
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op:test' }),
    /cannot transition from revoked/
  );
});

test('publicProviderRecord strips rootIdentityId + kycAttestation + lastTransition', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:secret',
    roleKind: 'cab-driver',
    displayName: 'Ravi',
    description: 'Auto driver in Pune',
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.5204, lng: 73.8567 },
      radiusMeters: 5000,
      source: 'manual'
    }
  });
  p = attestProviderKyc(p, {
    kycLevel: 'verified',
    operatorId: 'op:test',
    evidenceRefs: ['aadhaar-hash:abc', 'dl-hash:def']
  });
  const pub = publicProviderRecord(p);
  assert.equal(pub.providerIdentityId, p.providerIdentityId);
  assert.equal(pub.displayName, 'Ravi');
  assert.equal(pub.description, 'Auto driver in Pune');
  assert.equal(pub.kycLevel, 'verified');
  // MUST NOT expose:
  assert.equal('rootIdentityId' in pub, false);
  assert.equal('kycAttestation' in pub, false);
  assert.equal('lastTransition' in pub, false);
  assert.equal('submittedAt' in pub, false);
});

test('updateProviderProfile rejects display name longer than 120 chars', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:abc',
    roleKind: 'cab-driver',
    displayName: 'Ravi'
  });
  assert.throws(
    () => updateProviderProfile(p, { displayName: 'x'.repeat(200) }),
    /displayName exceeds/
  );
});

// ─── SqliteStore ───────────────────────────────────────────────────

test('SqliteStore round-trip provider identity', async () => {
  const { store } = await freshSqlite('roundtrip');
  try {
    const p = createProviderIdentity({
      rootIdentityId: 'bos:person:abc',
      roleKind: 'cab-driver',
      displayName: 'Ravi'
    });
    await store.saveProviderIdentity(p);
    const read = await store.readProviderIdentity(p.providerIdentityId);
    assert.equal(read?.providerIdentityId, p.providerIdentityId);
    const list = await store.listProviderIdentities({ rootIdentityId: 'bos:person:abc' });
    assert.equal(list.length, 1);
    const byRole = await store.listProviderIdentities({ roleKind: 'cab-driver' });
    assert.equal(byRole.length, 1);
    const byStatus = await store.listProviderIdentities({ status: 'draft' });
    assert.equal(byStatus.length, 1);
    const empty = await store.listProviderIdentities({ status: 'active' });
    assert.equal(empty.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

test('SqliteStore DPDP cascade — provider identities erased by rootIdentityId', async () => {
  const { store } = await freshSqlite('dpdp');
  try {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const p1 = createProviderIdentity({
      rootIdentityId: root.id,
      roleKind: 'cab-driver',
      displayName: 'Cab profile'
    });
    const p2 = createProviderIdentity({
      rootIdentityId: root.id,
      roleKind: 'household-help',
      displayName: 'Cook profile'
    });
    await store.saveProviderIdentity(p1);
    await store.saveProviderIdentity(p2);
    const before = await store.listProviderIdentities({ rootIdentityId: root.id });
    assert.equal(before.length, 2);

    await store.eraseUserData(root.id, { redactLedgerEntry: (e) => e });

    const after = await store.listProviderIdentities({ rootIdentityId: root.id });
    assert.equal(after.length, 0, 'provider identities must cascade-delete with root');
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});

// ─── BosStore ──────────────────────────────────────────────────────

test('BosStore round-trip + DPDP cascade', async () => {
  const { store } = await freshBos('bos-roundtrip');
  const root = createIdentity({ displayName: 'Root' });
  await store.saveIdentity(root);
  const p = createProviderIdentity({
    rootIdentityId: root.id,
    roleKind: 'personal-driver',
    displayName: 'Pune driver'
  });
  await store.saveProviderIdentity(p);
  const list = await store.listProviderIdentities({ rootIdentityId: root.id });
  assert.equal(list.length, 1);

  await store.eraseUserData(root.id, { redactLedgerEntry: (e) => e });

  const after = await store.listProviderIdentities({ rootIdentityId: root.id });
  assert.equal(after.length, 0, 'BosStore must cascade providers on identity erase');
});

// ─── HTTP ──────────────────────────────────────────────────────────

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

test('POST /api/identities/:rootId/provider-identities creates a draft', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roleKind: 'cab-driver',
          displayName: 'Ravi from Pune',
          ratePaisePerHour: 30000,
          description: 'Auto driver — Pune Camp area'
        })
      }
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.providerIdentity.status, 'draft');
    assert.equal(body.providerIdentity.kycLevel, 'none');
    assert.equal(body.providerIdentity.roleKind, 'cab-driver');
    assert.equal(body.providerIdentity.rootIdentityId, root.id);
  });
});

test('POST create rejects unknown root identity', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(
      `${baseUrl}/api/identities/bos%3Aperson%3Anope/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleKind: 'cab-driver', displayName: 'X' })
      }
    );
    assert.equal(r.status, 404);
  });
});

test('GET /api/identities/:rootId/provider-identities lists owned', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleKind: 'cab-driver', displayName: 'X' })
      }
    );
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleKind: 'cook', displayName: 'Y' })
      }
    ).catch(() => null);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`
    );
    const body = await r.json();
    // At least one (cab-driver) created; cook is wave 2 but still allowed.
    assert.ok(body.providerIdentities.length >= 1);
    assert.ok(
      body.providerIdentities.every((p) => p.rootIdentityId === root.id)
    );
  });
});

test('GET /api/provider-identities/:id PUBLIC strips sensitive fields', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const create = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleKind: 'cab-driver', displayName: 'Public Ravi' })
      }
    );
    const { providerIdentity } = await create.json();

    const r = await fetch(
      `${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}`
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.providerIdentity.displayName, 'Public Ravi');
    // Public record MUST NOT carry rootIdentityId.
    assert.equal('rootIdentityId' in body.providerIdentity, false);
    assert.equal('kycAttestation' in body.providerIdentity, false);
  });
});

test('POST .../profile gates on rootIdentityId match', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    const other = createIdentity({ displayName: 'Other' });
    await store.saveIdentity(root);
    await store.saveIdentity(other);
    const create = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleKind: 'cab-driver', displayName: 'Ravi', serviceArea: { kind: 'point-radius', center: { lat: 18.5204, lng: 73.8567 }, radiusMeters: 5000, source: 'manual' } })
      }
    );
    const { providerIdentity } = await create.json();
    // Wrong root — must be forbidden.
    const wrong = await fetch(
      `${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/profile`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rootIdentityId: other.id,
          displayName: 'Hacked'
        })
      }
    );
    assert.equal(wrong.status, 403);
    // Right root — must succeed.
    const right = await fetch(
      `${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/profile`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rootIdentityId: root.id,
          displayName: 'Ravi (updated)',
          ratePaisePerHour: 35000
        })
      }
    );
    assert.equal(right.status, 200);
    const body = await right.json();
    assert.equal(body.providerIdentity.displayName, 'Ravi (updated)');
    assert.equal(body.providerIdentity.ratePaisePerHour, 35000);
  });
});

test('admin KYC attest + transition: draft → submitted → active', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const root = createIdentity({ displayName: 'Root' });
      await store.saveIdentity(root);
      const create = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roleKind: 'kirana', displayName: 'Ravi', serviceArea: { kind: 'point-radius', center: { lat: 18.5204, lng: 73.8567 }, radiusMeters: 5000, source: 'manual' } })
        }
      );
      const { providerIdentity } = await create.json();

      // Without admin token → 401.
      const noAuth = await fetch(
        `${baseUrl}/api/admin/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/kyc-attest`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kycLevel: 'basic' })
        }
      );
      assert.equal(noAuth.status, 401);

      // With admin token → kyc-attest.
      const kyc = await fetch(
        `${baseUrl}/api/admin/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/kyc-attest`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ kycLevel: 'basic' })
        }
      );
      assert.equal(kyc.status, 200);
      const kycBody = await kyc.json();
      assert.equal(kycBody.providerIdentity.status, 'submitted');
      assert.equal(kycBody.providerIdentity.kycLevel, 'basic');

      // Phase 12.3 — submit role-extras + attest before
      // activation (every role requires both now). The kirana
      // schema requires a `shop_license` attachment; upload a
      // tiny JPEG first.
      const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
      const att = await fetch(`${baseUrl}/api/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actingRootIdentityId: root.id,
          mimeType: 'image/jpeg',
          kind: 'shop_license',
          bytesBase64: tinyJpeg.toString('base64')
        })
      });
      const attBody = await att.json();
      const shopLicenseId = attBody.attachment.attachmentId;
      const submit = await fetch(
        `${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/submit-role-extras`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-bharat-os-acting-identity': root.id
          },
          body: JSON.stringify({
            answers: { shopName: 'X', shopLicenseNumber: 'L1' },
            attachments: { shop_license: shopLicenseId }
          })
        }
      );
      assert.equal(submit.status, 200, 'submit-role-extras succeeds');
      const attestExtras = await fetch(
        `${baseUrl}/api/admin/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/attest-role-extras`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ level: 'basic' })
        }
      );
      assert.equal(attestExtras.status, 200, 'attest-role-extras succeeds');

      // Transition to active.
      const activate = await fetch(
        `${baseUrl}/api/admin/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ nextStatus: 'active' })
        }
      );
      assert.equal(activate.status, 200);
      const activeBody = await activate.json();
      assert.equal(activeBody.providerIdentity.status, 'active');
      assert.ok(activeBody.providerIdentity.activatedAt);

      // Ledger should carry both events.
      const ledger = await store.listLedger({ limit: 100 });
      const types = ledger.map((e) => e.type);
      assert.ok(types.includes('provider_identity.kyc_attested'));
      assert.ok(types.includes('provider_identity.transitioned'));
    });
  });
});

test('admin transition refuses skipping KYC', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const root = createIdentity({ displayName: 'Root' });
      await store.saveIdentity(root);
      const create = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ roleKind: 'cab-driver', displayName: 'Ravi', serviceArea: { kind: 'point-radius', center: { lat: 18.5204, lng: 73.8567 }, radiusMeters: 5000, source: 'manual' } })
        }
      );
      const { providerIdentity } = await create.json();
      // Try draft → active without KYC.
      const r = await fetch(
        `${baseUrl}/api/admin/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ nextStatus: 'active' })
        }
      );
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.match(body.error.message, /cannot transition from draft to active|cannot activate provider without KYC/);
    });
  });
});
