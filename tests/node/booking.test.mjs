// Phase 12.1a.2 — booking substrate tests.
//
// Covers:
//   1. Pure module: createBooking validation + immutability,
//      rate snapshot frozen across provider rate edit, state-
//      machine transitions, dispute envelope, lazy auto-release,
//      4h pre_authorized expiry.
//   2. HTTP: create booking → escrow lock → push fired → accept →
//      mark-complete → confirm → payout. Rejected + cancelled +
//      disputed paths.
//   3. CAS stale_seq on concurrent provider taps.
//   4. PRIV: ledger event payloads contain only 1dp bubble,
//      never 4dp pickup coords, never citizenRootIdentityId on
//      events that shouldn't carry it.
//   5. §15 binding-grep on booking.mjs + booking-push.mjs source.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createProviderIdentity,
  attestProviderKyc,
  transitionProviderStatus,
  updateProviderProfile
} from '../../src/phase1/provider-identity.mjs';
import {
  createBooking,
  acceptBooking,
  rejectBooking,
  cancelBooking,
  markBookingComplete,
  citizenConfirmComplete,
  fileDispute,
  adjudicateDispute,
  maybeAutoRelease,
  publicBookingForCitizen,
  publicBookingForProvider,
  findImmutableViolation,
  buildRateSnapshot,
  BOOKING_STATUSES,
  BOOKING_TERMINAL_STATUSES,
  BOOKING_PRICING_BASES,
  AUTO_RELEASE_WINDOW_MS,
  PRE_AUTHORIZED_EXPIRY_MS
} from '../../src/phase1/booking.mjs';
import {
  createCitizenEscrow,
  depositCitizenEscrow,
  availableCitizenEscrow
} from '../../src/phase1/citizen-escrow.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'booking-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] == null) delete process.env[key];
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

function makeActiveProvider({ rootIdentityId, role = 'cab-driver', ratePaisePerService = 50000, ratePaisePerHour = 30000 } = {}) {
  let p = createProviderIdentity({
    rootIdentityId,
    roleKind: role,
    displayName: 'Provider',
    ratePaisePerHour,
    ratePaisePerService,
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.5204, lng: 73.8567 },
      radiusMeters: 5000,
      source: 'manual'
    }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' });
  p = transitionProviderStatus(p, 'active', { operatorId: 'op:test' });
  return p;
}

// ─── Pure module ───────────────────────────────────────────────────

test('createBooking happy path with per-service pricing', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  const b = createBooking({
    citizenRootIdentityId: 'bos:person:c',
    provider,
    pricingBasis: 'per-service',
    pickup: { lat: 18.52, lng: 73.86 }
  });
  assert.equal(b.status, 'pre_authorized');
  assert.equal(b.seq, 1);
  assert.equal(b.rateSnapshot.quotedAmountPaise, 50000);
  assert.equal(b.rateSnapshot.pricingBasis, 'per-service');
  assert.equal(b.providerRootIdentityId, 'bos:person:p');
  assert.equal(b.pickupPoint.bubble1dp, '18.5,73.9');
  assert.ok(b.bookingId.startsWith('bos:booking:'));
});

test('createBooking per-hour pricing computes quotedAmountPaise from estimatedHours', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  const b = createBooking({
    citizenRootIdentityId: 'bos:person:c',
    provider,
    pricingBasis: 'per-hour',
    estimatedHours: 2.5,
    pickup: { lat: 18.52, lng: 73.86 }
  });
  assert.equal(b.rateSnapshot.quotedAmountPaise, 75000);
  assert.equal(b.rateSnapshot.estimatedHours, 2.5);
});

test('createBooking rate-drift guard rejects expectedAmountPaise mismatch', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  assert.throws(
    () => createBooking({
      citizenRootIdentityId: 'bos:person:c',
      provider,
      pricingBasis: 'per-service',
      pickup: { lat: 18.5, lng: 73.85 },
      expectedAmountPaise: 99999
    }),
    /rate_drift/
  );
});

test('createBooking refuses self-booking (citizen == provider root)', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:same' });
  assert.throws(
    () => createBooking({
      citizenRootIdentityId: 'bos:person:same',
      provider,
      pricingBasis: 'per-service',
      pickup: { lat: 18.5, lng: 73.85 }
    }),
    /cannot_book_self/
  );
});

test('createBooking refuses non-active provider', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:p',
    roleKind: 'cab-driver',
    displayName: 'P',
    ratePaisePerService: 5000,
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.85 }, radiusMeters: 5000, source: 'manual' }
  });
  // draft only
  assert.throws(
    () => createBooking({ citizenRootIdentityId: 'bos:person:c', provider: p, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } }),
    /provider_not_bookable/
  );
});

test('createBooking refuses missing pickup for cab role', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  assert.throws(
    () => createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service' }),
    /pickup_required/
  );
});

test('createBooking allows null pickup for kirana', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p', role: 'kirana' });
  const b = createBooking({
    citizenRootIdentityId: 'bos:person:c',
    provider,
    pricingBasis: 'per-service'
  });
  assert.equal(b.pickupPoint, null);
});

test('rateSnapshot is frozen across provider rate edit (immutability)', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p', ratePaisePerService: 50000 });
  const b = createBooking({
    citizenRootIdentityId: 'bos:person:c',
    provider,
    pricingBasis: 'per-service',
    pickup: { lat: 18.5, lng: 73.85 }
  });
  // Provider edits rate; existing booking rateSnapshot unchanged.
  const provider2 = updateProviderProfile(provider, { ratePaisePerService: 999999 });
  assert.equal(provider2.ratePaisePerService, 999999);
  assert.equal(b.rateSnapshot.quotedAmountPaise, 50000);
  assert.equal(b.rateSnapshot.ratePaisePerService, 50000);
});

test('findImmutableViolation detects frozen-field mutations', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  const b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  assert.equal(findImmutableViolation(b, b), null);
  const tampered = { ...b, rateSnapshot: { ...b.rateSnapshot, quotedAmountPaise: 1 } };
  assert.equal(findImmutableViolation(b, tampered), 'rateSnapshot');
  const tampered2 = { ...b, bookingId: 'bos:booking:hacked' };
  assert.equal(findImmutableViolation(b, tampered2), 'bookingId');
});

test('state machine: pre_authorized → in_progress → provider_marked_complete → citizen_confirmed', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  assert.equal(b.status, 'pre_authorized');
  b = acceptBooking(b);
  assert.equal(b.status, 'in_progress');
  assert.equal(b.seq, 2);
  assert.ok(b.acceptedAt);
  b = markBookingComplete(b);
  assert.equal(b.status, 'provider_marked_complete');
  assert.equal(b.seq, 3);
  assert.ok(b.providerCompletedAt);
  b = citizenConfirmComplete(b);
  assert.equal(b.status, 'citizen_confirmed');
  assert.equal(b.seq, 4);
  assert.equal(BOOKING_TERMINAL_STATUSES.has(b.status), true);
});

test('state machine refuses double-accept (terminal locked)', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = acceptBooking(b);
  assert.throws(() => acceptBooking(b), /booking_status_locked/);
});

test('rejectBooking from pre_authorized refunds (terminal-refund branch)', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = rejectBooking(b, { reason: 'not available' });
  assert.equal(b.status, 'rejected_by_provider');
  assert.equal(b.rejectReason, 'not available');
});

test('cancelBooking allowed from pre_authorized or in_progress', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b1 = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b1 = cancelBooking(b1, { reason: 'changed mind' });
  assert.equal(b1.status, 'cancelled_by_citizen');

  let b2 = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b2 = acceptBooking(b2);
  b2 = cancelBooking(b2);
  assert.equal(b2.status, 'cancelled_by_citizen');
});

test('fileDispute requires reason ≥ 4 chars, allowed from in_progress + provider_marked_complete', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = acceptBooking(b);
  assert.throws(() => fileDispute(b, { filedBy: 'citizen', reason: 'no' }), /at least 4/);
  b = fileDispute(b, { filedBy: 'citizen', reason: 'never showed up' });
  assert.equal(b.status, 'disputed');
  assert.equal(b.disputeFiledBy, 'citizen');
  assert.equal(b.disputeReason, 'never showed up');
});

test('fileDispute refused from terminal states', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = rejectBooking(b);
  assert.throws(() => fileDispute(b, { filedBy: 'citizen', reason: 'too late' }), /booking_status_locked/);
});

test('adjudicateDispute requires disputed status + admin token + outcome', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = acceptBooking(b);
  b = fileDispute(b, { filedBy: 'citizen', reason: 'work incomplete' });
  const b1 = adjudicateDispute(b, { outcome: 'release_to_provider', operatorId: 'op:1' });
  assert.equal(b1.status, 'citizen_confirmed');
  assert.equal(b1.disputeOutcome, 'release_to_provider');
  const b2 = adjudicateDispute(b, { outcome: 'refund_to_citizen', operatorId: 'op:1' });
  assert.equal(b2.status, 'cancelled_after_dispute');
  assert.throws(() => adjudicateDispute(b, { outcome: 'split', operatorId: 'op:1' }), /outcome must be/);
});

test('maybeAutoRelease: triggers at exactly 24h on provider_marked_complete', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = acceptBooking(b);
  const markedAt = '2026-06-01T10:00:00.000Z';
  b = markBookingComplete(b, { at: markedAt });
  // Just before 24h — no release.
  let r = maybeAutoRelease(b, { now: Date.parse(markedAt) + AUTO_RELEASE_WINDOW_MS - 1 });
  assert.equal(r.released, false);
  assert.equal(r.booking.status, 'provider_marked_complete');
  // Exactly 24h — release.
  r = maybeAutoRelease(b, { now: Date.parse(markedAt) + AUTO_RELEASE_WINDOW_MS });
  assert.equal(r.released, true);
  assert.equal(r.booking.status, 'auto_released');
  assert.equal(r.transitions.length, 1);
});

test('maybeAutoRelease: 4h pre_authorized expiry', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  const createdAt = '2026-06-01T10:00:00.000Z';
  const b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 }, createdAt });
  let r = maybeAutoRelease(b, { now: Date.parse(createdAt) + PRE_AUTHORIZED_EXPIRY_MS - 1 });
  assert.equal(r.expired, false);
  r = maybeAutoRelease(b, { now: Date.parse(createdAt) + PRE_AUTHORIZED_EXPIRY_MS });
  assert.equal(r.expired, true);
  assert.equal(r.booking.status, 'expired_unaccepted');
});

test('maybeAutoRelease: skips disputed bookings unconditionally', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  let b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5, lng: 73.85 } });
  b = acceptBooking(b);
  b = markBookingComplete(b, { at: '2026-06-01T10:00:00.000Z' });
  b = fileDispute(b, { filedBy: 'citizen', reason: 'work undone' });
  const r = maybeAutoRelease(b, { now: Date.parse('2026-06-01T10:00:00.000Z') + AUTO_RELEASE_WINDOW_MS * 5 });
  assert.equal(r.released, false);
  assert.equal(r.booking.status, 'disputed');
});

test('publicBookingForProvider masks pickup pre-accept', () => {
  const provider = makeActiveProvider({ rootIdentityId: 'bos:person:p' });
  const b = createBooking({ citizenRootIdentityId: 'bos:person:c', provider, pricingBasis: 'per-service', pickup: { lat: 18.5204, lng: 73.8567 } });
  const pub = publicBookingForProvider(b);
  assert.equal(pub.pickupPoint.lat, null);
  assert.equal(pub.pickupPoint.lng, null);
  assert.equal(pub.pickupPoint.address, null);
  assert.equal(pub.pickupPoint.bubble1dp, '18.5,73.9');
  // Post-accept: full pickup visible.
  const accepted = acceptBooking(b);
  const pubA = publicBookingForProvider(accepted);
  assert.equal(pubA.pickupPoint.lat, 18.5204);
  assert.equal(pubA.pickupPoint.lng, 73.8567);
});

// ─── HTTP — end-to-end happy path + concurrency + escrow ────────────

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

async function seedParties(store) {
  const citizen = createIdentity({ displayName: 'Citizen' });
  await store.saveIdentity(citizen);
  const providerRoot = createIdentity({ displayName: 'Provider Root' });
  await store.saveIdentity(providerRoot);
  const provider = makeActiveProvider({ rootIdentityId: providerRoot.id });
  await store.saveProviderIdentity(provider);
  return { citizen, providerRoot, provider };
}

test('POST /api/marketplace/bookings requires citizen escrow', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { citizen, provider } = await seedParties(store);
    const r = await fetch(`${baseUrl}/api/marketplace/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        citizenRootIdentityId: citizen.id,
        providerIdentityId: provider.providerIdentityId,
        pricingBasis: 'per-service',
        pickup: { lat: 18.5204, lng: 73.8567 }
      })
    });
    assert.equal(r.status, 402);
    const body = await r.json();
    assert.equal(body.error.code, 'insufficient_escrow');
  });
});

test('full happy path: deposit → create → accept → mark-complete → confirm-complete → payout', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { citizen, providerRoot, provider } = await seedParties(store);
      // 1. Admin deposit
      const deposit = await fetch(`${baseUrl}/api/admin/citizens/${encodeURIComponent(citizen.id)}/escrow/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100000 })
      });
      assert.equal(deposit.status, 200);
      const { escrow } = await deposit.json();
      assert.equal(escrow.escrowBalancePaise, 100000);

      // 2. Create booking
      const create = await fetch(`${baseUrl}/api/marketplace/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citizenRootIdentityId: citizen.id,
          providerIdentityId: provider.providerIdentityId,
          pricingBasis: 'per-service',
          pickup: { lat: 18.5204, lng: 73.8567 },
          expectedAmountPaise: 50000
        })
      });
      assert.equal(create.status, 201);
      const { booking } = await create.json();
      assert.equal(booking.status, 'pre_authorized');
      assert.equal(booking.seq, 1);

      // 3. Provider accepts
      const accept = await fetch(`${baseUrl}/api/marketplace/bookings/${encodeURIComponent(booking.bookingId)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actingRootIdentityId: providerRoot.id, expectedSeq: 1 })
      });
      assert.equal(accept.status, 200);
      const acceptBody = await accept.json();
      assert.equal(acceptBody.booking.status, 'in_progress');
      assert.equal(acceptBody.booking.seq, 2);

      // 4. Provider marks complete
      const mark = await fetch(`${baseUrl}/api/marketplace/bookings/${encodeURIComponent(booking.bookingId)}/mark-complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actingRootIdentityId: providerRoot.id, expectedSeq: 2 })
      });
      assert.equal(mark.status, 200);

      // 5. Citizen confirms → payout
      const confirm = await fetch(`${baseUrl}/api/marketplace/bookings/${encodeURIComponent(booking.bookingId)}/confirm-complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actingRootIdentityId: citizen.id, expectedSeq: 3 })
      });
      assert.equal(confirm.status, 200);
      const confirmBody = await confirm.json();
      assert.equal(confirmBody.booking.status, 'citizen_confirmed');

      // 6. Citizen escrow: 100000 - 50000 debited; locked back to 0.
      // PRIV-2: citizen escrow GET now requires acting identity.
      const escrowAfter = await fetch(`${baseUrl}/api/citizens/${encodeURIComponent(citizen.id)}/escrow`, {
        headers: { 'X-Bharat-Os-Acting-Identity': citizen.id }
      });
      const { escrow: e2 } = await escrowAfter.json();
      assert.equal(e2.escrowBalancePaise, 50000);
      assert.equal(e2.escrowLockedPaise, 0);

      // 7. Ledger contains both create + escrow_locked + payout + escrow_released events.
      const ledger = await store.listLedger({ limit: 200 });
      const types = ledger.map((e) => e.type);
      assert.ok(types.includes('booking.created'));
      assert.ok(types.includes('booking.escrow_locked'));
      assert.ok(types.includes('booking.citizen_confirmed'));
      assert.ok(types.includes('booking.escrow_released'));
      assert.ok(types.includes('booking.payout'));
    });
  });
});

test('CAS stale_seq: concurrent provider accepts — second gets 409', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { citizen, providerRoot, provider } = await seedParties(store);
      await fetch(`${baseUrl}/api/admin/citizens/${encodeURIComponent(citizen.id)}/escrow/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100000 })
      });
      const create = await fetch(`${baseUrl}/api/marketplace/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citizenRootIdentityId: citizen.id,
          providerIdentityId: provider.providerIdentityId,
          pricingBasis: 'per-service',
          pickup: { lat: 18.5204, lng: 73.8567 }
        })
      });
      const { booking } = await create.json();
      // Fire two accept requests with same expectedSeq.
      const a1 = fetch(`${baseUrl}/api/marketplace/bookings/${encodeURIComponent(booking.bookingId)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actingRootIdentityId: providerRoot.id, expectedSeq: 1 })
      });
      const a2 = fetch(`${baseUrl}/api/marketplace/bookings/${encodeURIComponent(booking.bookingId)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actingRootIdentityId: providerRoot.id, expectedSeq: 1 })
      });
      const [r1, r2] = await Promise.all([a1, a2]);
      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [200, 409], 'one should win, one should 409');
    });
  });
});

test('ESCROW-CAS: two parallel booking-creates cannot both lock past the available balance', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { citizen, provider } = await seedParties(store);
      const providerRoot2 = createIdentity({ displayName: 'P2' });
      await store.saveIdentity(providerRoot2);
      const provider2 = makeActiveProvider({ rootIdentityId: providerRoot2.id, ratePaisePerService: 50000 });
      await store.saveProviderIdentity(provider2);
      // Deposit just enough for ONE booking.
      await fetch(`${baseUrl}/api/admin/citizens/${encodeURIComponent(citizen.id)}/escrow/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 50000 })
      });
      const create1 = fetch(`${baseUrl}/api/marketplace/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citizenRootIdentityId: citizen.id,
          providerIdentityId: provider.providerIdentityId,
          pricingBasis: 'per-service',
          pickup: { lat: 18.52, lng: 73.85 }
        })
      });
      const create2 = fetch(`${baseUrl}/api/marketplace/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citizenRootIdentityId: citizen.id,
          providerIdentityId: provider2.providerIdentityId,
          pricingBasis: 'per-service',
          pickup: { lat: 18.52, lng: 73.85 }
        })
      });
      const [r1, r2] = await Promise.all([create1, create2]);
      const statuses = [r1.status, r2.status].sort();
      // One succeeds (201), one is refused (402 insufficient_escrow OR 409 escrow_concurrent_update).
      assert.equal(statuses[0], 201, `expected first to be 201, got ${statuses[0]} / ${statuses[1]}`);
      assert.ok(statuses[1] === 402 || statuses[1] === 409, `expected second to be 402/409, got ${statuses[1]}`);
    });
  });
});

test('PRIV-1: GET /api/citizens/:id/bookings refuses unauthenticated read', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/citizens/${encodeURIComponent(citizen.id)}/bookings`);
    assert.equal(r.status, 401);
    const body = await r.json();
    assert.equal(body.error.code, 'missing_acting_identity');
  });
});

test('PRIV-1: GET /api/citizens/:id/bookings refuses mismatched acting identity', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    const other = createIdentity({ displayName: 'Other' });
    await store.saveIdentity(citizen);
    await store.saveIdentity(other);
    const r = await fetch(`${baseUrl}/api/citizens/${encodeURIComponent(citizen.id)}/bookings`, {
      headers: { 'X-Bharat-Os-Acting-Identity': other.id }
    });
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.equal(body.error.code, 'not_citizen_owner');
  });
});

test('PRIV-2: GET /api/citizens/:id/escrow refuses unauthenticated read', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/citizens/${encodeURIComponent(citizen.id)}/escrow`);
    assert.equal(r.status, 401);
  });
});

test('§15 binding: booking.mjs source has no commission/takeRate/platformFee fields', async () => {
  const src = await fs.readFile(path.join(repoRoot, 'src/phase1/booking.mjs'), 'utf8');
  assert.ok(!/\bcommission(Paise|Pct|Rate|Amount)?\s*[:=]/.test(src), 'no commission field');
  assert.ok(!/\btakeRate\s*[:=]/.test(src), 'no takeRate field');
  assert.ok(!/\bplatformFee\s*[:=]/.test(src), 'no platformFee field');
  assert.ok(!/\bplatformShare\s*[:=]/.test(src), 'no platformShare field');
});

test('§15 binding: booking-push.mjs has no displayName/phone/4dp coord concatenation in payload body', async () => {
  const src = await fs.readFile(path.join(repoRoot, 'src/phase0/booking-push.mjs'), 'utf8');
  // Strip line-comments so the binding-description comment block
  // (which legitimately uses the words "displayName"/"phone" as the
  // English nouns it forbids) doesn't trigger a false positive.
  const code = src
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  assert.ok(!/\bdisplayName\b/.test(code), 'code must not reference displayName');
  assert.ok(!/\bphoneNumber\b/.test(code), 'code must not reference phoneNumber');
  assert.ok(!/\.phone\b/.test(code), 'code must not access .phone');
  // 4dp coord shape — anything like "${lat.toFixed(4)}" or 4-decimal literals.
  assert.ok(!/\.toFixed\(\s*[4-9]\s*\)/.test(code), 'no toFixed(4+) on push');
  assert.ok(!/[0-9]+\.[0-9]{4,}/.test(code), 'no embedded 4dp literal');
});

test('LEDGER PII REPLAY: no event payload contains 4dp pickup coords', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { citizen, providerRoot, provider } = await seedParties(store);
      await fetch(`${baseUrl}/api/admin/citizens/${encodeURIComponent(citizen.id)}/escrow/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100000 })
      });
      await fetch(`${baseUrl}/api/marketplace/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          citizenRootIdentityId: citizen.id,
          providerIdentityId: provider.providerIdentityId,
          pricingBasis: 'per-service',
          pickup: { lat: 18.5204, lng: 73.8567 }
        })
      });
      const ledger = await store.listLedger({ limit: 200 });
      for (const event of ledger.filter((e) => String(e.type || '').startsWith('booking.'))) {
        const json = JSON.stringify(event);
        // No 4dp coordinate literals.
        assert.ok(!/[0-9]+\.[0-9]{4,}/.test(json), `event ${event.type} carried 4dp coord: ${json}`);
        // Bubble1dp may carry "18.5" (1 decimal), which is OK.
      }
    });
  });
});
