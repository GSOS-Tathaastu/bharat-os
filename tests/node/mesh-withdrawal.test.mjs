// Phase 6.1b — mesh-earnings UPI cash-out tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  computeAvailableBalance,
  createWithdrawalRequest,
  isValidUpiId,
  markWithdrawalAccepted,
  markWithdrawalFailed,
  markWithdrawalPaid,
  maskUpiId,
  MESH_WITHDRAWAL_LIMITS,
  MESH_WITHDRAWAL_PROTOCOL_VERSION,
  verifyWithdrawalRequest,
  WITHDRAWAL_STATUSES
} from '../../src/phase1/mesh-withdrawal.mjs';
import { createMeshContributionEvent } from '../../src/phase1/mesh-contribution.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'mesh-withdrawal-tests');

function inferenceEvent({ operatorId, at, tokens = 1_000_000 }) {
  return createMeshContributionEvent({
    operatorId,
    nodeId: 'n1',
    workloadType: 'inference',
    tokens,
    at
  });
}

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

// ─── UPI ID helpers ──────────────────────────────────────────────────

test('isValidUpiId accepts canonical formats', () => {
  assert.equal(isValidUpiId('rajesh@hdfcbank'), true);
  assert.equal(isValidUpiId('user.name@oksbi'), true);
  assert.equal(isValidUpiId('a_b-c.d@upi-name'), true);
});

test('isValidUpiId rejects malformed inputs', () => {
  assert.equal(isValidUpiId(null), false);
  assert.equal(isValidUpiId(''), false);
  assert.equal(isValidUpiId('no-at-sign'), false);
  assert.equal(isValidUpiId('multiple@@signs'), false);
  assert.equal(isValidUpiId('x'.repeat(81) + '@upi'), false);
  assert.equal(isValidUpiId('with spaces@upi'), false);
});

test('maskUpiId preserves first + last char of local, full domain', () => {
  assert.equal(maskUpiId('rajesh@hdfcbank'), 'r***h@hdfcbank');
  assert.equal(maskUpiId('ab@bank'), 'a*@bank');
  assert.equal(maskUpiId('a@bank'), '*@bank');
  assert.equal(maskUpiId('no-at'), null);
  assert.equal(maskUpiId(null), null);
});

// ─── Balance computation ─────────────────────────────────────────────

test('computeAvailableBalance sums payouts of unsettled events for the operator', () => {
  const events = [
    inferenceEvent({ operatorId: 'op1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 }), // ₹8 = 800 p
    inferenceEvent({ operatorId: 'op1', at: '2026-05-02T10:00:00Z', tokens: 2_000_000 }), // ₹16 = 1600 p
    inferenceEvent({ operatorId: 'op2', at: '2026-05-03T10:00:00Z', tokens: 1_000_000 }) // wrong op
  ];
  const balance = computeAvailableBalance(events, [], { operatorId: 'op1' });
  assert.equal(balance.objectType, 'mesh-balance');
  assert.equal(balance.protocolVersion, MESH_WITHDRAWAL_PROTOCOL_VERSION);
  assert.equal(balance.availablePaise, 2400);
  assert.equal(balance.availableRupees, 24);
  assert.equal(balance.unsettledEventCount, 2);
});

test('computeAvailableBalance excludes events bundled in a non-failed withdrawal', () => {
  const events = [
    inferenceEvent({ operatorId: 'op1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 }),
    inferenceEvent({ operatorId: 'op1', at: '2026-05-02T10:00:00Z', tokens: 1_000_000 })
  ];
  const withdrawalLocking = {
    workerId: 'op1',
    status: 'provider_accepted',
    settledEventIds: [events[0].contributionEventId]
  };
  const balance = computeAvailableBalance(events, [withdrawalLocking], {
    operatorId: 'op1'
  });
  // Only event[1] is still unsettled.
  assert.equal(balance.availablePaise, 800);
  assert.equal(balance.unsettledEventCount, 1);
});

test('computeAvailableBalance: events return to the pool after a failed withdrawal', () => {
  const events = [
    inferenceEvent({ operatorId: 'op1', at: '2026-05-01T10:00:00Z', tokens: 1_000_000 })
  ];
  const failedWithdrawal = {
    workerId: 'op1',
    status: 'failed',
    settledEventIds: [events[0].contributionEventId]
  };
  const balance = computeAvailableBalance(events, [failedWithdrawal], {
    operatorId: 'op1'
  });
  assert.equal(balance.availablePaise, 800);
  assert.equal(balance.unsettledEventCount, 1);
});

// ─── createWithdrawalRequest ─────────────────────────────────────────

test('createWithdrawalRequest signs a versioned envelope bundling all unsettled events', () => {
  const identity = createIdentity({ displayName: 'Worker' });
  const events = [
    // 15 events × 1M tokens × ₹8 = ₹120 = 12000 paise (above ₹10 floor).
    ...Array.from({ length: 15 }, (_, i) =>
      inferenceEvent({
        operatorId: identity.id,
        at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        tokens: 1_000_000
      })
    )
  ];
  const request = createWithdrawalRequest({
    identity,
    meshEvents: events,
    priorWithdrawals: [],
    upiId: 'rajesh@hdfcbank'
  });
  assert.equal(request.objectType, 'mesh-withdrawal-request');
  assert.equal(request.protocolVersion, MESH_WITHDRAWAL_PROTOCOL_VERSION);
  assert.equal(request.workerId, identity.id);
  assert.equal(request.amountPaise, 12000);
  assert.equal(request.amountRupees, 120);
  assert.equal(request.upiId, 'rajesh@hdfcbank');
  assert.equal(request.upiIdMasked, 'r***h@hdfcbank');
  assert.equal(request.eventCount, 15);
  assert.equal(request.settledEventIds.length, 15);
  assert.equal(request.status, 'pending');
  assert.match(request.requestId, /^bos:mesh-withdrawal:[0-9a-f]{32}$/);
  assert.ok(request.signature);

  // Verifying with the worker's public key round-trips.
  const verify = verifyWithdrawalRequest(request, identity);
  assert.equal(verify.ok, true);
});

test('createWithdrawalRequest refuses below the ₹10 floor', () => {
  const identity = createIdentity({ displayName: 'W' });
  const events = [
    // Only ₹8 — below the floor.
    inferenceEvent({ operatorId: identity.id, at: '2026-05-01T10:00:00Z', tokens: 1_000_000 })
  ];
  assert.throws(
    () =>
      createWithdrawalRequest({
        identity,
        meshEvents: events,
        priorWithdrawals: [],
        upiId: 'rajesh@hdfcbank'
      }),
    /insufficient_balance/
  );
});

test('createWithdrawalRequest refuses invalid UPI IDs', () => {
  const identity = createIdentity({ displayName: 'W' });
  assert.throws(
    () =>
      createWithdrawalRequest({
        identity,
        meshEvents: [],
        priorWithdrawals: [],
        upiId: 'not-a-upi-id'
      }),
    /upiId is required/
  );
});

test('verifyWithdrawalRequest rejects tampered amount', () => {
  const identity = createIdentity({ displayName: 'W' });
  const events = Array.from({ length: 15 }, (_, i) =>
    inferenceEvent({
      operatorId: identity.id,
      at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      tokens: 1_000_000
    })
  );
  const request = createWithdrawalRequest({
    identity,
    meshEvents: events,
    priorWithdrawals: [],
    upiId: 'rajesh@hdfcbank'
  });
  // Adversary inflates the amount.
  const tampered = { ...request, amountPaise: 99_99_99_99 };
  const verify = verifyWithdrawalRequest(tampered, identity);
  assert.equal(verify.ok, false);
});

// ─── State transitions ───────────────────────────────────────────────

test('markWithdrawalAccepted transitions pending → provider_accepted with reference', () => {
  const stub = { status: 'pending' };
  const out = markWithdrawalAccepted(stub, { providerReference: 'razorpay-x-abc' });
  assert.equal(out.status, 'provider_accepted');
  assert.equal(out.providerReference, 'razorpay-x-abc');
  assert.ok(out.acceptedAt);
});

test('markWithdrawalAccepted refuses bad current statuses', () => {
  assert.throws(
    () => markWithdrawalAccepted({ status: 'paid' }, { providerReference: 'r' }),
    /invalid transition/
  );
  assert.throws(
    () => markWithdrawalAccepted({ status: 'failed' }, { providerReference: 'r' }),
    /invalid transition/
  );
});

test('markWithdrawalPaid: pending → paid OR provider_accepted → paid', () => {
  const fromPending = markWithdrawalPaid(
    { status: 'pending' },
    { providerReference: 'r1' }
  );
  assert.equal(fromPending.status, 'paid');
  assert.ok(fromPending.acceptedAt);
  assert.ok(fromPending.paidAt);

  const fromAccepted = markWithdrawalPaid(
    { status: 'provider_accepted', acceptedAt: '2026-05-01T00:00:00Z' },
    { providerReference: 'r2' }
  );
  assert.equal(fromAccepted.status, 'paid');
  assert.equal(fromAccepted.acceptedAt, '2026-05-01T00:00:00Z'); // preserved
});

test('markWithdrawalFailed: requires reason >= 4 chars; cannot fail terminal states', () => {
  const out = markWithdrawalFailed(
    { status: 'pending' },
    { reason: 'partner refused KYC' }
  );
  assert.equal(out.status, 'failed');
  assert.equal(out.failureReason, 'partner refused KYC');
  assert.throws(
    () => markWithdrawalFailed({ status: 'pending' }, { reason: 'no' }),
    /reason is required/
  );
  assert.throws(
    () => markWithdrawalFailed({ status: 'paid' }, { reason: 'too late' }),
    /invalid transition/
  );
});

test('WITHDRAWAL_STATUSES contains the documented 4-state machine', () => {
  assert.deepEqual([...WITHDRAWAL_STATUSES], [
    'pending',
    'provider_accepted',
    'paid',
    'failed'
  ]);
  assert.ok(Object.isFrozen(WITHDRAWAL_STATUSES));
});

// ─── SqliteStore + DPDP ──────────────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips a mesh withdrawal', async () => {
  const { store } = await freshSqlite('roundtrip');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  const events = Array.from({ length: 15 }, (_, i) =>
    inferenceEvent({
      operatorId: identity.id,
      at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      tokens: 1_000_000
    })
  );
  for (const e of events) await store.saveMeshContributionEvent(e);
  const request = createWithdrawalRequest({
    identity,
    meshEvents: events,
    priorWithdrawals: [],
    upiId: 'rajesh@hdfcbank'
  });
  await store.saveMeshWithdrawal(request);
  const read = await store.readMeshWithdrawal(request.requestId);
  assert.equal(read.requestId, request.requestId);
  assert.equal(read.amountPaise, 12000);
  assert.equal(read.upiIdMasked, 'r***h@hdfcbank');
  store.close();
});

test('collectUserData includes meshWithdrawals + eraseUserData removes them', async () => {
  const { store } = await freshSqlite('dpdp');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  const events = Array.from({ length: 15 }, (_, i) =>
    inferenceEvent({
      operatorId: identity.id,
      at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      tokens: 1_000_000
    })
  );
  for (const e of events) await store.saveMeshContributionEvent(e);
  const request = createWithdrawalRequest({
    identity,
    meshEvents: events,
    priorWithdrawals: [],
    upiId: 'rajesh@hdfcbank'
  });
  await store.saveMeshWithdrawal(request);
  const data = await collectUserData(store, identity.id);
  assert.equal(data.sections.meshWithdrawals.count, 1);
  await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
  const remaining = await store.listMeshWithdrawals({ workerId: identity.id });
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

async function seedFifteenMeshEvents(store, identity) {
  for (let i = 0; i < 15; i += 1) {
    await store.saveMeshContributionEvent(
      inferenceEvent({
        operatorId: identity.id,
        at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        tokens: 1_000_000
      })
    );
  }
}

test('GET mesh/balance returns the operator\'s unsettled total', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker' });
    await store.saveIdentity(identity);
    await seedFifteenMeshEvents(store, identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/balance`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.balance.availablePaise, 12000);
    assert.equal(body.balance.unsettledEventCount, 15);
  });
});

test('POST mesh/withdrawals creates a signed request + audits', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker' });
    await store.saveIdentity(identity);
    await seedFifteenMeshEvents(store, identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
      }
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.withdrawal.amountPaise, 12000);
    assert.equal(body.withdrawal.upiIdMasked, 'r***h@hdfcbank');
    assert.equal(body.withdrawal.status, 'pending');
    // Ledger entry exists.
    const ledger = await store.listLedger({ type: 'mesh_withdrawal.requested' });
    assert.ok(ledger.length >= 1);
    assert.equal(ledger[0].upiMasked, 'r***h@hdfcbank');

    // Subsequent GET balance returns 0 — events are now bundled.
    const balanceResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/balance`
    );
    const balanceBody = await balanceResp.json();
    assert.equal(balanceBody.balance.availablePaise, 0);
  });
});

test('POST mesh/withdrawals rejects insufficient balance', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'NoBalance' });
    await store.saveIdentity(identity);
    // No events seeded.
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'insufficient_balance');
  });
});

test('POST mesh/withdrawals rejects invalid UPI ID', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    await seedFifteenMeshEvents(store, identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upiId: 'not-a-upi' })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_upi_id');
  });
});

test('POST admin/mesh/withdrawals/:id/paid transitions + audits', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const identity = createIdentity({ displayName: 'W' });
      await store.saveIdentity(identity);
      await seedFifteenMeshEvents(store, identity);
      // Worker requests.
      const reqResp = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
        }
      );
      const { withdrawal } = await reqResp.json();
      // Ops marks paid.
      const payResp = await fetch(
        `${baseUrl}/api/admin/mesh/withdrawals/${encodeURIComponent(withdrawal.requestId)}/paid`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32),
            'x-bharat-os-operator': 'payout-ops'
          },
          body: JSON.stringify({ providerReference: 'razorpay-payout-12345' })
        }
      );
      assert.equal(payResp.status, 200);
      const payBody = await payResp.json();
      assert.equal(payBody.withdrawal.status, 'paid');
      assert.equal(payBody.withdrawal.providerReference, 'razorpay-payout-12345');
      // Ledger entry.
      const ledger = await store.listLedger({ type: 'mesh_withdrawal.paid' });
      assert.ok(ledger.length >= 1);
      assert.equal(ledger[0].operator, 'payout-ops');
    });
  });
});

test('POST admin/mesh/withdrawals/:id/failed returns events to the pool', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const identity = createIdentity({ displayName: 'W' });
      await store.saveIdentity(identity);
      await seedFifteenMeshEvents(store, identity);
      const reqResp = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
        }
      );
      const { withdrawal } = await reqResp.json();
      // Sanity: balance is now zero.
      const b0 = await (await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/balance`
      )).json();
      assert.equal(b0.balance.availablePaise, 0);

      // Ops marks failed.
      const failResp = await fetch(
        `${baseUrl}/api/admin/mesh/withdrawals/${encodeURIComponent(withdrawal.requestId)}/failed`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32),
            'x-bharat-os-operator': 'ops'
          },
          body: JSON.stringify({ reason: 'partner reported invalid UPI ID' })
        }
      );
      assert.equal(failResp.status, 200);
      // Balance returns to ₹120 — events refunded to the pool.
      const b1 = await (await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/balance`
      )).json();
      assert.equal(b1.balance.availablePaise, 12000);
    });
  });
});

test('POST admin/mesh/withdrawals refuses without admin token (503)', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: null }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const response = await fetch(
        `${baseUrl}/api/admin/mesh/withdrawals/bos:mesh-withdrawal:fake/paid`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        }
      );
      assert.equal(response.status, 503);
    });
  });
});

test('POST admin/mesh/withdrawals rejects unknown transition', async () => {
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: 'a'.repeat(32) }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const resp = await fetch(
        `${baseUrl}/api/admin/mesh/withdrawals/bos:mesh-withdrawal:fake/exploded`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + 'a'.repeat(32)
          },
          body: '{}'
        }
      );
      assert.equal(resp.status, 400);
      const body = await resp.json();
      assert.equal(body.error.code, 'unknown_transition');
    });
  });
});

test('GET mesh/withdrawals lists the worker\'s withdrawal history', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    await seedFifteenMeshEvents(store, identity);
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upiId: 'rajesh@hdfcbank' })
      }
    );
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/mesh/withdrawals`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.withdrawals.length, 1);
    assert.equal(body.withdrawals[0].status, 'pending');
  });
});

test('MESH_WITHDRAWAL_LIMITS exposes the ₹10 / ₹10L bounds', () => {
  assert.equal(MESH_WITHDRAWAL_LIMITS.minPaise, 10_00);
  assert.equal(MESH_WITHDRAWAL_LIMITS.maxPaise, 10_00_000_00);
});
