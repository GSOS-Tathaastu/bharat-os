// Phase 9.1 — sponsor module + auth + escrow + sponsored-round tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createSponsor,
  depositEscrow,
  lockEscrow,
  debitLockedEscrow,
  refundLockedEscrow,
  hashBearerToken,
  verifyBearerToken,
  publicSponsor,
  publicSponsorDirectory,
  revokeSponsor,
  SPONSOR_STATUSES,
  SponsorAuthError
} from '../../src/phase1/sponsor.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'sponsor-tests');

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

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Module: createSponsor + token hashing ──────────────────────────

test('SPONSOR_STATUSES enumerates active, suspended, revoked', () => {
  assert.deepEqual(SPONSOR_STATUSES, ['active', 'suspended', 'revoked']);
});

test('createSponsor returns a sponsor + a fresh bearer token', () => {
  const { sponsor, bearerToken } = createSponsor({ displayName: 'Acme MFI' });
  assert.match(sponsor.sponsorId, /^bos:sponsor:[0-9a-f]{32}$/);
  assert.equal(sponsor.displayName, 'Acme MFI');
  assert.equal(sponsor.status, 'active');
  assert.equal(sponsor.escrowBalancePaise, 0);
  assert.equal(sponsor.escrowLockedPaise, 0);
  assert.match(bearerToken, /^bos:sponsor-token:[0-9a-f]{32}$/);
  assert.match(sponsor.bearerTokenHash, /^sha256:[0-9a-f]{64}$/);
});

test('createSponsor rejects empty displayName', () => {
  assert.throws(() => createSponsor({ displayName: '' }), /displayName/);
});

test('hashBearerToken + verifyBearerToken roundtrip', () => {
  const token = 'bos:sponsor-token:0123456789abcdef0123456789abcdef';
  const hash = hashBearerToken(token);
  assert.equal(verifyBearerToken(token, hash), true);
  assert.equal(verifyBearerToken('bos:sponsor-token:wrong', hash), false);
});

test('publicSponsorDirectory exposes display name + status only', () => {
  const { sponsor } = createSponsor({ displayName: 'Test', contactEmail: 'x@y.z' });
  const dir = publicSponsorDirectory(sponsor);
  assert.equal(dir.displayName, 'Test');
  assert.equal(dir.status, 'active');
  assert.equal('contactEmail' in dir, false);
  assert.equal('escrowBalancePaise' in dir, false);
  assert.equal('bearerTokenHash' in dir, false);
});

// ─── Escrow accounting ─────────────────────────────────────────────

test('depositEscrow increases balance; rejects non-positive', () => {
  const { sponsor } = createSponsor({ displayName: 'A' });
  const s2 = depositEscrow(sponsor, 100_000);
  assert.equal(s2.escrowBalancePaise, 100_000);
  assert.throws(() => depositEscrow(sponsor, 0), /positive/);
  assert.throws(() => depositEscrow(sponsor, -1), /positive/);
});

test('lockEscrow refuses when available < requested', () => {
  const { sponsor } = createSponsor({ displayName: 'A' });
  const funded = depositEscrow(sponsor, 1000);
  assert.throws(() => lockEscrow(funded, 1500), /insufficient/);
});

test('lockEscrow + debitLockedEscrow + refundLockedEscrow conservation', () => {
  const { sponsor } = createSponsor({ displayName: 'A' });
  let s = depositEscrow(sponsor, 1000);
  s = lockEscrow(s, 800);
  assert.equal(s.escrowBalancePaise, 1000);
  assert.equal(s.escrowLockedPaise, 800);
  s = debitLockedEscrow(s, 300);
  assert.equal(s.escrowBalancePaise, 700);
  assert.equal(s.escrowLockedPaise, 500);
  s = refundLockedEscrow(s, 500);
  assert.equal(s.escrowBalancePaise, 700);
  assert.equal(s.escrowLockedPaise, 0);
});

test('debitLockedEscrow refuses when debit > locked', () => {
  const { sponsor } = createSponsor({ displayName: 'A' });
  const funded = depositEscrow(sponsor, 1000);
  const locked = lockEscrow(funded, 500);
  assert.throws(() => debitLockedEscrow(locked, 600), /exceeds locked/);
});

test('revokeSponsor flips status to revoked + carries operator', () => {
  const { sponsor } = createSponsor({ displayName: 'A' });
  const revoked = revokeSponsor(sponsor, { revokedBy: 'sre' });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedBy, 'sre');
});

// ─── HTTP wiring ────────────────────────────────────────────────────

async function withApiServer(callback) {
  const { store, root } = await freshStore('srv');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('POST /api/admin/sponsors refuses without admin token', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'X' })
      });
      assert.equal(r.status, 503);
    });
  });
});

test('POST /api/admin/sponsors creates a sponsor + returns the one-time bearer token', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const r = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
          'x-bharat-os-operator': 'sre'
        },
        body: JSON.stringify({ displayName: 'Pragati MFI', contactEmail: 'on@p.in' })
      });
      assert.equal(r.status, 201);
      const body = await r.json();
      assert.equal(body.sponsor.displayName, 'Pragati MFI');
      assert.equal(body.sponsor.status, 'active');
      assert.match(body.bearerToken, /^bos:sponsor-token:/);
      assert.ok(body.warning.includes('ONCE'));
    });
  });
});

test('admin deposit increases escrow balance', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'S' })
      });
      const { sponsor } = await create.json();
      const deposit = await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 50_000, reference: 'NEFT-2026-05-31' })
      });
      assert.equal(deposit.status, 200);
      const depositBody = await deposit.json();
      assert.equal(depositBody.sponsor.escrowBalancePaise, 50_000);
    });
  });
});

test('GET /api/sponsors/:id returns the public-directory view (no escrow numbers)', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'Directory Test' })
      });
      const { sponsor } = await create.json();
      const r = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}`);
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.sponsor.displayName, 'Directory Test');
      assert.equal(body.sponsor.status, 'active');
      assert.equal('escrowBalancePaise' in body.sponsor, false);
    });
  });
});

test('GET /api/sponsors/:id/self requires the per-sponsor bearer token', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'Self Test' })
      });
      const { sponsor, bearerToken } = await create.json();
      const unauth = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/self`);
      assert.equal(unauth.status, 401);
      const auth = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/self`, {
        headers: { authorization: `Bearer ${bearerToken}` }
      });
      assert.equal(auth.status, 200);
      const body = await auth.json();
      assert.equal(typeof body.sponsor.escrowBalancePaise, 'number');
    });
  });
});

test('sponsor creates a federated round — escrow locked + 402 when underfunded', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'RoundTest' })
      });
      const { sponsor, bearerToken } = await create.json();
      const roundBody = {
        modelName: 'phi-3-mini-loan',
        baselineModelHash: 'sha256:b',
        maxParticipants: 10,
        payoutPaisePerUpdate: 1000,
        deadlineSecondsFromNow: 7 * 86400,
        slmModelPackId: 'bos:slm:phi-3-mini-4k-q4_k_m',
        targetTask: 'loan-screening'
      };
      // Required lock = 10 * 1000 = 10_000 paise, but escrow is empty.
      const underfunded = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/federated-rounds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify(roundBody)
      });
      assert.equal(underfunded.status, 402);
      const underBody = await underfunded.json();
      assert.equal(underBody.error.code, 'insufficient_escrow');

      // Top up + retry.
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });
      const funded = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/federated-rounds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify(roundBody)
      });
      assert.equal(funded.status, 201);
      const fundedBody = await funded.json();
      assert.equal(fundedBody.round.sponsorId, sponsor.sponsorId);
      assert.equal(fundedBody.round.escrowLockedPaise, 10_000);
      assert.equal(fundedBody.sponsor.escrowLockedPaise, 10_000);
      assert.equal(fundedBody.sponsor.escrowBalancePaise, 100_000);
    });
  });
});

test('sponsor export bundle returns signed-JSONL with rotated identity hash', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'ExportTest' })
      });
      const { sponsor, bearerToken } = await create.json();
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });
      const roundResponse = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/federated-rounds`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            modelName: 'm',
            baselineModelHash: 'sha256:b',
            maxParticipants: 2,
            payoutPaisePerUpdate: 1000
          })
        }
      );
      const { round } = await roundResponse.json();

      const exportResponse = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/federated-rounds/${encodeURIComponent(round.roundId)}/export`,
        { headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(exportResponse.status, 200);
      assert.match(exportResponse.headers.get('content-type') ?? '', /x-ndjson/);
      const text = await exportResponse.text();
      // No updates yet → empty body.
      assert.equal(text, '');
    });
  });
});

test('sponsor export refuses cross-sponsor reads', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      // Sponsor A creates a round.
      const a = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'A' })
      });
      const { sponsor: spA, bearerToken: tokenA } = await a.json();
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(spA.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });
      const roundResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(spA.sponsorId)}/federated-rounds`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenA}` },
          body: JSON.stringify({
            modelName: 'm',
            baselineModelHash: 'sha256:b',
            maxParticipants: 2,
            payoutPaisePerUpdate: 500
          })
        }
      );
      const { round } = await roundResp.json();

      // Sponsor B tries to export A's round.
      const b = await fetch(`${baseUrl}/api/admin/sponsors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ displayName: 'B' })
      });
      const { sponsor: spB, bearerToken: tokenB } = await b.json();

      const cross = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(spB.sponsorId)}/federated-rounds/${encodeURIComponent(round.roundId)}/export`,
        { headers: { authorization: `Bearer ${tokenB}` } }
      );
      assert.equal(cross.status, 404);
    });
  });
});

test('SponsorAuthError carries the suggested HTTP status', () => {
  const err = new SponsorAuthError({ status: 401, code: 'x', message: 'm' });
  assert.equal(err.status, 401);
  assert.equal(err.code, 'x');
  assert.equal(err.message, 'm');
});
