// Phase 6.2 — worker-collective membership tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  COLLECTIVE_MEMBERSHIP_PROTOCOL_VERSION,
  createBlessedCollectiveRecord,
  createMembershipAttestation,
  filterBlessedMemberships,
  MEMBER_ROLES,
  revokeMembershipAttestation,
  verifyMembershipAttestation
} from '../../src/phase1/collective-membership.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';
import {
  buildIncomeVerificationBundle,
  createIncomeVerificationConsent
} from '../../src/phase1/income-verification.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'collective-membership-tests');

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

// ─── createMembershipAttestation ─────────────────────────────────────

test('createMembershipAttestation produces a versioned signed envelope', () => {
  const collective = createIdentity({ displayName: 'SEWA' });
  const worker = createIdentity({ displayName: 'Lakshmi' });
  const m = createMembershipAttestation({
    collective,
    memberId: worker.id,
    collectiveName: 'SEWA - Tamil Nadu',
    memberRole: 'domestic_worker',
    region: 'Chennai',
    joinedAt: '2018-06-01'
  });
  assert.equal(m.protocolVersion, COLLECTIVE_MEMBERSHIP_PROTOCOL_VERSION);
  assert.equal(m.objectType, 'collective-membership-attestation');
  assert.equal(m.collectiveId, collective.id);
  assert.equal(m.memberId, worker.id);
  assert.equal(m.memberRole, 'domestic_worker');
  assert.equal(m.region, 'Chennai');
  assert.equal(m.status, 'active');
  assert.match(m.membershipId, /^bos:collective-membership:[0-9a-f]{32}$/);
  assert.ok(m.signature);
  assert.ok(m.expiresAt);
});

test('createMembershipAttestation rejects bad inputs', () => {
  const collective = createIdentity({ displayName: 'C' });
  assert.throws(
    () => createMembershipAttestation({ memberId: 'x', collectiveName: 'C' }),
    /collective identity is required/
  );
  assert.throws(
    () =>
      createMembershipAttestation({
        collective,
        memberId: 'x',
        collectiveName: 'C',
        memberRole: 'wizard'
      }),
    /memberRole must be one of/
  );
  assert.throws(
    () =>
      createMembershipAttestation({
        collective,
        memberId: 'x',
        collectiveName: 'C',
        joinedAt: 'yesterday'
      }),
    /YYYY-MM-DD/
  );
  assert.throws(
    () =>
      createMembershipAttestation({
        collective,
        memberId: 'x',
        collectiveName: 'C',
        ttlDays: 1
      }),
    /ttlDays must be between/
  );
});

test('createMembershipAttestation refuses self-membership', () => {
  const collective = createIdentity({ displayName: 'C' });
  assert.throws(
    () =>
      createMembershipAttestation({
        collective,
        memberId: collective.id,
        collectiveName: 'C'
      }),
    /cannot issue a membership to itself/
  );
});

// ─── verifyMembershipAttestation ─────────────────────────────────────

test('verifyMembershipAttestation succeeds on fresh attestation', () => {
  const collective = createIdentity({ displayName: 'IFAT' });
  const driver = createIdentity({ displayName: 'D' });
  const m = createMembershipAttestation({
    collective,
    memberId: driver.id,
    collectiveName: 'IFAT'
  });
  const v = verifyMembershipAttestation(m, collective);
  assert.equal(v.ok, true);
  assert.equal(v.status, 'valid');
});

test('verifyMembershipAttestation flags expired', () => {
  const collective = createIdentity({ displayName: 'C' });
  const m = createMembershipAttestation({
    collective,
    memberId: 'x',
    collectiveName: 'C',
    ttlDays: 30,
    at: '2025-01-01T00:00:00.000Z'
  });
  const v = verifyMembershipAttestation(m, collective, {
    at: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(v.ok, false);
  assert.equal(v.status, 'expired');
});

test('verifyMembershipAttestation flags revoked', () => {
  const collective = createIdentity({ displayName: 'C' });
  const m = createMembershipAttestation({
    collective,
    memberId: 'x',
    collectiveName: 'C'
  });
  const revoked = revokeMembershipAttestation(m, { reason: 'worker left union' });
  const v = verifyMembershipAttestation(revoked, collective);
  assert.equal(v.ok, false);
  assert.equal(v.status, 'revoked');
});

test('verifyMembershipAttestation flags wrong-collective public record', () => {
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  const m = createMembershipAttestation({
    collective: a,
    memberId: 'x',
    collectiveName: 'A'
  });
  const v = verifyMembershipAttestation(m, b);
  assert.equal(v.ok, false);
  assert.equal(v.status, 'unknown_collective');
});

test('verifyMembershipAttestation flags tampered fields', () => {
  const collective = createIdentity({ displayName: 'C' });
  const m = createMembershipAttestation({
    collective,
    memberId: 'x',
    collectiveName: 'C',
    region: 'Chennai'
  });
  // Adversary tampers with region.
  const tampered = { ...m, region: 'Mumbai' };
  const v = verifyMembershipAttestation(tampered, collective);
  assert.equal(v.ok, false);
  assert.equal(v.status, 'signature_invalid');
});

test('revokeMembershipAttestation requires reason >= 4 chars', () => {
  const collective = createIdentity({ displayName: 'C' });
  const m = createMembershipAttestation({
    collective,
    memberId: 'x',
    collectiveName: 'C'
  });
  assert.throws(
    () => revokeMembershipAttestation(m, { reason: 'no' }),
    /reason is required/
  );
});

// ─── filterBlessedMemberships ────────────────────────────────────────

test('filterBlessedMemberships returns only currently-valid memberships from blessed collectives', () => {
  const sewa = createIdentity({ displayName: 'SEWA' });
  const rogue = createIdentity({ displayName: 'Rogue' });
  const worker1 = createIdentity({ displayName: 'W1' });
  const worker2 = createIdentity({ displayName: 'W2' });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: sewa.id,
    collectiveName: 'SEWA',
    blessedBy: 'admin'
  });
  const m1 = createMembershipAttestation({
    collective: sewa,
    memberId: worker1.id,
    collectiveName: 'SEWA'
  });
  const m2 = createMembershipAttestation({
    collective: rogue,
    memberId: worker2.id,
    collectiveName: 'Rogue'
  });
  const m3Expired = createMembershipAttestation({
    collective: sewa,
    memberId: worker1.id,
    collectiveName: 'SEWA',
    ttlDays: 30,
    at: '2025-01-01T00:00:00.000Z'
  });
  const filtered = filterBlessedMemberships(
    [m1, m2, m3Expired],
    [blessed],
    { at: '2026-01-01T00:00:00.000Z' }
  );
  // m1 alone: blessed AND valid. m2 not blessed; m3 expired.
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].membershipId, m1.membershipId);
});

test('filterBlessedMemberships handles empty inputs', () => {
  assert.deepEqual(filterBlessedMemberships([], []), []);
  assert.deepEqual(filterBlessedMemberships(null, null), []);
});

// ─── createBlessedCollectiveRecord ───────────────────────────────────

test('createBlessedCollectiveRecord rejects bad inputs', () => {
  assert.throws(() => createBlessedCollectiveRecord({}), /collectiveId is required/);
  assert.throws(
    () => createBlessedCollectiveRecord({ collectiveId: 'x' }),
    /collectiveName is required/
  );
  assert.throws(
    () =>
      createBlessedCollectiveRecord({
        collectiveId: 'x',
        collectiveName: 'X'.repeat(200),
        blessedBy: 'admin'
      }),
    /<= 120 chars/
  );
});

// ─── MFI bundle integration ──────────────────────────────────────────

test('buildIncomeVerificationBundle surfaces verifiedCollectiveMemberships when blessed', () => {
  const worker = createIdentity({ displayName: 'W' });
  const sewa = createIdentity({ displayName: 'SEWA' });
  const consent = createIncomeVerificationConsent({
    identity: worker,
    mfiName: 'Bajaj',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const m = createMembershipAttestation({
    collective: sewa,
    memberId: worker.id,
    collectiveName: 'SEWA - Tamil Nadu',
    memberRole: 'domestic_worker'
  });
  const blessed = createBlessedCollectiveRecord({
    collectiveId: sewa.id,
    collectiveName: 'SEWA',
    blessedBy: 'admin'
  });
  const bundle = buildIncomeVerificationBundle({
    identity: worker,
    consent,
    earningsEntries: [],
    meshContributionEvents: [],
    portableAttestations: [],
    collectiveMemberships: [m],
    blessedCollectives: [blessed]
  });
  assert.equal(bundle.credibility.verifiedCollectiveMemberships.length, 1);
  assert.equal(
    bundle.credibility.verifiedCollectiveMemberships[0].collectiveName,
    'SEWA - Tamil Nadu'
  );
});

test('buildIncomeVerificationBundle excludes memberships from non-blessed collectives', () => {
  const worker = createIdentity({ displayName: 'W' });
  const rogue = createIdentity({ displayName: 'Rogue' });
  const consent = createIncomeVerificationConsent({
    identity: worker,
    mfiName: 'Bajaj',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const m = createMembershipAttestation({
    collective: rogue,
    memberId: worker.id,
    collectiveName: 'Rogue'
  });
  const bundle = buildIncomeVerificationBundle({
    identity: worker,
    consent,
    earningsEntries: [],
    meshContributionEvents: [],
    portableAttestations: [],
    collectiveMemberships: [m],
    blessedCollectives: [] // none blessed
  });
  assert.equal(bundle.credibility.verifiedCollectiveMemberships.length, 0);
});

// ─── SqliteStore + DPDP ──────────────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips memberships + blessed-collectives', async () => {
  const { store } = await freshSqlite('roundtrip');
  const sewa = createIdentity({ displayName: 'SEWA' });
  const worker = createIdentity({ displayName: 'W' });
  await store.saveIdentity(sewa);
  await store.saveIdentity(worker);
  const m = createMembershipAttestation({
    collective: sewa,
    memberId: worker.id,
    collectiveName: 'SEWA'
  });
  await store.saveCollectiveMembership(m);
  const blessed = createBlessedCollectiveRecord({
    collectiveId: sewa.id,
    collectiveName: 'SEWA',
    blessedBy: 'admin'
  });
  await store.saveBlessedCollective(blessed);
  const readM = await store.readCollectiveMembership(m.membershipId);
  assert.equal(readM.collectiveId, sewa.id);
  const readB = await store.readBlessedCollective(sewa.id);
  assert.equal(readB.collectiveName, 'SEWA');
  store.close();
});

test('SqliteStore.listCollectiveMemberships filters by collective + member + status', async () => {
  const { store } = await freshSqlite('list');
  const sewa = createIdentity({ displayName: 'SEWA' });
  const ifat = createIdentity({ displayName: 'IFAT' });
  const w1 = createIdentity({ displayName: 'W1' });
  const w2 = createIdentity({ displayName: 'W2' });
  await store.saveIdentity(sewa);
  await store.saveIdentity(ifat);
  await store.saveIdentity(w1);
  await store.saveIdentity(w2);
  await store.saveCollectiveMembership(
    createMembershipAttestation({
      collective: sewa,
      memberId: w1.id,
      collectiveName: 'SEWA'
    })
  );
  await store.saveCollectiveMembership(
    createMembershipAttestation({
      collective: sewa,
      memberId: w2.id,
      collectiveName: 'SEWA'
    })
  );
  await store.saveCollectiveMembership(
    createMembershipAttestation({
      collective: ifat,
      memberId: w1.id,
      collectiveName: 'IFAT'
    })
  );
  const sewaMembers = await store.listCollectiveMemberships({ collectiveId: sewa.id });
  assert.equal(sewaMembers.length, 2);
  const w1Memberships = await store.listCollectiveMemberships({ memberId: w1.id });
  assert.equal(w1Memberships.length, 2);
  store.close();
});

test('collectUserData includes collective memberships; erasure removes them', async () => {
  const { store } = await freshSqlite('dpdp');
  const sewa = createIdentity({ displayName: 'SEWA' });
  const worker = createIdentity({ displayName: 'W' });
  await store.saveIdentity(sewa);
  await store.saveIdentity(worker);
  const m = createMembershipAttestation({
    collective: sewa,
    memberId: worker.id,
    collectiveName: 'SEWA'
  });
  await store.saveCollectiveMembership(m);
  const data = await collectUserData(store, worker.id);
  assert.equal(data.sections.collectiveMemberships.count, 1);
  await store.eraseUserData(worker.id, { redactLedgerEntry: (e) => e });
  const remaining = await store.listCollectiveMemberships({ memberId: worker.id });
  assert.equal(remaining.length, 0);
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

test('POST issue membership signs + persists + emits ledger', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const sewa = createIdentity({ displayName: 'SEWA' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(sewa);
    await store.saveIdentity(worker);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberId: worker.id,
          collectiveName: 'SEWA - Tamil Nadu',
          memberRole: 'domestic_worker',
          region: 'Chennai'
        })
      }
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.membership.collectiveId, sewa.id);
    assert.equal(body.membership.memberId, worker.id);
    assert.equal(body.membership.region, 'Chennai');
    const ledger = await store.listLedger({ type: 'collective_membership.issued' });
    assert.ok(ledger.length >= 1);
  });
});

test('POST issue membership rejects unknown member with 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const sewa = createIdentity({ displayName: 'SEWA' });
    await store.saveIdentity(sewa);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId: 'bos:person:nope', collectiveName: 'SEWA' })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'unknown_member');
  });
});

test('GET memberships lists active memberships for the worker', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const sewa = createIdentity({ displayName: 'SEWA' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(sewa);
    await store.saveIdentity(worker);
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId: worker.id, collectiveName: 'SEWA' })
      }
    );
    const listResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/collective-memberships`
    );
    assert.equal(listResp.status, 200);
    const body = await listResp.json();
    assert.equal(body.memberships.length, 1);
  });
});

test('POST revoke burns the membership; non-issuer attempt returns 404', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const sewa = createIdentity({ displayName: 'SEWA' });
    const ifat = createIdentity({ displayName: 'IFAT' });
    const worker = createIdentity({ displayName: 'W' });
    await store.saveIdentity(sewa);
    await store.saveIdentity(ifat);
    await store.saveIdentity(worker);
    const issueResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId: worker.id, collectiveName: 'SEWA' })
      }
    );
    const { membership } = await issueResp.json();
    // IFAT tries to revoke SEWA's membership → 404.
    const wrongResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(ifat.id)}/collective-memberships/${encodeURIComponent(membership.membershipId)}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'attempting to revoke another union\'s membership' })
      }
    );
    assert.equal(wrongResp.status, 404);
    // SEWA revokes its own → 200.
    const revokeResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships/${encodeURIComponent(membership.membershipId)}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'worker left the union' })
      }
    );
    assert.equal(revokeResp.status, 200);
    const body = await revokeResp.json();
    assert.equal(body.membership.status, 'revoked');
  });
});

test('POST admin blessed-collectives (admin-gated) + GET public list', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const sewa = createIdentity({ displayName: 'SEWA' });
      await store.saveIdentity(sewa);
      // No token → 503.
      const noToken = await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      assert.equal(noToken.status, 401); // missing Authorization header
      // With token → 201.
      const ok = await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32),
          'x-bharat-os-operator': 'reg-ops'
        },
        body: JSON.stringify({
          collectiveId: sewa.id,
          collectiveName: 'Self-Employed Women\'s Association',
          notes: '~2.5M members, Tier-1 partner'
        })
      });
      assert.equal(ok.status, 201);
      // Public GET sees it.
      const pub = await fetch(`${baseUrl}/api/blessed-collectives`);
      const body = await pub.json();
      assert.equal(body.blessed.length, 1);
      assert.equal(body.blessed[0].blessedBy, 'reg-ops');
    });
  });
});

test('POST admin bless rejects unknown collective identity', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const resp = await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32)
        },
        body: JSON.stringify({
          collectiveId: 'bos:person:doesnt-exist',
          collectiveName: 'Phantom'
        })
      });
      assert.equal(resp.status, 400);
      const body = await resp.json();
      assert.equal(body.error.code, 'unknown_collective');
    });
  });
});

test('DELETE admin blessed-collectives unblesses', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const sewa = createIdentity({ displayName: 'SEWA' });
      await store.saveIdentity(sewa);
      await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32)
        },
        body: JSON.stringify({ collectiveId: sewa.id, collectiveName: 'SEWA' })
      });
      const delResp = await fetch(
        `${baseUrl}/api/admin/blessed-collectives/${encodeURIComponent(sewa.id)}`,
        {
          method: 'DELETE',
          headers: { authorization: 'Bearer ' + 'a'.repeat(32) }
        }
      );
      assert.equal(delResp.status, 200);
      const pub = await fetch(`${baseUrl}/api/blessed-collectives`);
      const body = await pub.json();
      assert.equal(body.blessed.length, 0);
    });
  });
});

test('MFI bundle surfaces verifiedCollectiveMemberships when fetched end-to-end', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const sewa = createIdentity({ displayName: 'SEWA' });
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(sewa);
      await store.saveIdentity(worker);
      // Bless SEWA.
      await fetch(`${baseUrl}/api/admin/blessed-collectives`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + 'a'.repeat(32)
        },
        body: JSON.stringify({
          collectiveId: sewa.id,
          collectiveName: 'SEWA'
        })
      });
      // SEWA issues membership to worker.
      await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(sewa.id)}/collective-memberships`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memberId: worker.id,
            collectiveName: 'SEWA - Tamil Nadu',
            memberRole: 'domestic_worker',
            region: 'Chennai'
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
      assert.equal(mfiResp.status, 200);
      const body = await mfiResp.json();
      assert.equal(body.bundle.credibility.verifiedCollectiveMemberships.length, 1);
      assert.equal(
        body.bundle.credibility.verifiedCollectiveMemberships[0].collectiveName,
        'SEWA - Tamil Nadu'
      );
    });
  });
});

test('MEMBER_ROLES enum is frozen + documented set', () => {
  assert.ok(Object.isFrozen(MEMBER_ROLES));
  assert.deepEqual([...MEMBER_ROLES], [
    'driver',
    'delivery',
    'domestic_worker',
    'construction',
    'service',
    'farm',
    'general'
  ]);
});
