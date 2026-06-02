// Phase 13.5 — Citizen data offer tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildCitizenDataOffer,
  revokeCitizenDataOffer,
  pauseCitizenDataOffer,
  buildCitizenDataOfferLedgerEvent,
  CITIZEN_DATA_OFFER_PROTOCOL_VERSION,
  DATA_POINT_KINDS,
  SPONSOR_PURPOSES,
  CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS,
  PERMITTED_CITIZEN_DATA_OFFER_KEYS
} from '../../src/phase1/citizen-data-offer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'citizen-data-offer-tests');

function validInput(overrides = {}) {
  const publishedAt = '2026-06-02T10:00:00Z';
  const expiresAt = '2026-07-02T10:00:00Z';
  return {
    publisherId: 'bos:person:test-citizen',
    dataPointKind: 'intent_text',
    pricePerSalePaise: 5000,
    maxSales: 100,
    sponsorPurposeAllowlist: ['model_training', 'safety_benchmark'],
    publishedAt,
    expiresAt,
    ...overrides
  };
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure module ──────────────────────────────────────────────────

test('CITIZEN_DATA_OFFER_PROTOCOL_VERSION is pinned', () => {
  assert.equal(CITIZEN_DATA_OFFER_PROTOCOL_VERSION, 'bos.phase13.citizen-data-offer.v1');
});

test('buildCitizenDataOffer — happy path', () => {
  const offer = buildCitizenDataOffer(validInput());
  assert.ok(offer.offerId.startsWith('bos:citizen-data-offer:'));
  assert.equal(offer.publisherId, 'bos:person:test-citizen');
  assert.equal(offer.dataPointKind, 'intent_text');
  assert.equal(offer.pricePerSalePaise, 5000);
  assert.equal(offer.maxSales, 100);
  assert.equal(offer.salesCount, 0);
  assert.deepEqual(offer.sponsorPurposeAllowlist, ['model_training', 'safety_benchmark']);
  assert.equal(offer.status, 'active');
  assert.equal(offer.revokedAt, null);
  assert.equal(offer.pausedAt, null);
});

test('content-derived offerId is stable for identical input', () => {
  const a = buildCitizenDataOffer(validInput());
  const b = buildCitizenDataOffer(validInput());
  assert.equal(a.offerId, b.offerId);
});

test('different price produces a different offerId', () => {
  const a = buildCitizenDataOffer(validInput());
  const b = buildCitizenDataOffer(validInput({ pricePerSalePaise: 6000 }));
  assert.notEqual(a.offerId, b.offerId);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS) {
    assert.throws(
      () => buildCitizenDataOffer({ ...validInput(), [forbidden]: 'leak' }),
      new RegExp(`${forbidden} is not a permitted citizen-data-offer field`)
    );
  }
});

test('PERMITTED_CITIZEN_DATA_OFFER_KEYS contains exactly the documented set', () => {
  const expected = [
    'offerId',
    'publisherId',
    'dataPointKind',
    'pricePerSalePaise',
    'maxSales',
    'salesCount',
    'sponsorPurposeAllowlist',
    'protocolVersion',
    'status',
    'publishedAt',
    'expiresAt',
    'revokedAt',
    'revokeReason',
    'pausedAt'
  ];
  assert.deepEqual([...PERMITTED_CITIZEN_DATA_OFFER_KEYS].sort(), [...expected].sort());
});

test('rejects off-allowlist dataPointKind', () => {
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), dataPointKind: 'biometric_template' }),
    /dataPointKind must be one of/
  );
});

test('rejects off-allowlist sponsorPurpose', () => {
  assert.throws(
    () => buildCitizenDataOffer({
      ...validInput(),
      sponsorPurposeAllowlist: ['mass_surveillance']
    }),
    /not in the allowlist/
  );
});

test('rejects duplicate purposes', () => {
  assert.throws(
    () => buildCitizenDataOffer({
      ...validInput(),
      sponsorPurposeAllowlist: ['model_training', 'model_training']
    }),
    /duplicate entry/
  );
});

test('rejects pricePerSalePaise below ₹1 (100 paise) or above ₹100,000', () => {
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), pricePerSalePaise: 50 }),
    /pricePerSalePaise must be an integer in/
  );
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), pricePerSalePaise: 99_999_999 }),
    /pricePerSalePaise must be an integer in/
  );
});

test('rejects maxSales outside [1, 1000]', () => {
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), maxSales: 0 }),
    /maxSales must be an integer in/
  );
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), maxSales: 9_999 }),
    /maxSales must be an integer in/
  );
});

test('rejects expiresAt under 24 hours from publishedAt', () => {
  assert.throws(
    () => buildCitizenDataOffer({
      ...validInput(),
      publishedAt: '2026-06-02T10:00:00Z',
      expiresAt: '2026-06-02T11:00:00Z'  // 1 hour
    }),
    /at least 24 hours/
  );
});

test('rejects expiresAt over 365 days from publishedAt', () => {
  assert.throws(
    () => buildCitizenDataOffer({
      ...validInput(),
      publishedAt: '2026-06-02T10:00:00Z',
      expiresAt: '2027-12-31T10:00:00Z'  // ~575 days
    }),
    /more than 365 days/
  );
});

test('rejects calendar-invalid publishedAt / expiresAt', () => {
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), publishedAt: '2026-13-99T99:99:99Z' }),
    /publishedAt must be/
  );
});

test('rejects offerId that does not match the content-derived hash', () => {
  assert.throws(
    () => buildCitizenDataOffer({ ...validInput(), offerId: 'bos:citizen-data-offer:spoofed' }),
    /offerId does not match content-derived hash/
  );
});

test('strips ms precision from publishedAt + expiresAt on accept', () => {
  const offer = buildCitizenDataOffer({
    ...validInput(),
    publishedAt: '2026-06-02T10:00:00.547Z',
    expiresAt: '2026-07-02T10:00:00.123Z'
  });
  assert.equal(offer.publishedAt, '2026-06-02T10:00:00Z');
  assert.equal(offer.expiresAt, '2026-07-02T10:00:00Z');
});

test('revokeCitizenDataOffer transitions to revoked with publisher attribution', () => {
  const offer = buildCitizenDataOffer(validInput());
  const revoked = revokeCitizenDataOffer(offer, {
    revokedBy: offer.publisherId,
    reason: 'changed my mind'
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokeReason, 'changed my mind');
  assert.ok(revoked.revokedAt);
});

test('revokeCitizenDataOffer rejects revoke by non-publisher', () => {
  const offer = buildCitizenDataOffer(validInput());
  assert.throws(
    () => revokeCitizenDataOffer(offer, { revokedBy: 'bos:person:other' }),
    /only the publisher can revoke/
  );
});

test('revokeCitizenDataOffer rejects double-revoke', () => {
  const offer = buildCitizenDataOffer(validInput());
  const revoked = revokeCitizenDataOffer(offer, { revokedBy: offer.publisherId });
  assert.throws(
    () => revokeCitizenDataOffer(revoked, { revokedBy: offer.publisherId }),
    /already revoked/
  );
});

test('pauseCitizenDataOffer transitions active → paused; rejects pause on non-active', () => {
  const offer = buildCitizenDataOffer(validInput());
  const paused = pauseCitizenDataOffer(offer);
  assert.equal(paused.status, 'paused');
  assert.ok(paused.pausedAt);
  assert.throws(() => pauseCitizenDataOffer(paused), /cannot pause offer in status paused/);
});

test('buildCitizenDataOfferLedgerEvent emits count-only meta (no body bytes)', () => {
  const offer = buildCitizenDataOffer(validInput());
  const event = buildCitizenDataOfferLedgerEvent({
    offer,
    eventType: 'citizen_data_offer.published',
    at: '2026-06-02T10:00:00.547Z'
  });
  assert.equal(event.type, 'citizen_data_offer.published');
  assert.equal(event.offerId, offer.offerId);
  assert.equal(event.publisherId, offer.publisherId);
  assert.equal(event.dataPointKind, offer.dataPointKind);
  assert.equal(event.purposeCount, 2);
  // ms stripped from `at` (mirrors Phase 13.0.2 MF-1)
  assert.equal(/\.\d/.test(event.at), false);
  // §15 — no forbidden substring leaks into the event.
  const json = JSON.stringify(event);
  for (const forbidden of CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS) {
    assert.ok(
      !json.includes(`"${forbidden}"`),
      `ledger event must not surface "${forbidden}" (got ${json})`
    );
  }
});

// Phase 13.5 FE↔BE convergence — read the FE source and assert
// allowlists match.
test('Phase 13.5 — FE DATA_POINT_KINDS matches BE', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'citizen-data-offer.ts');
  const source = await fs.readFile(fePath, 'utf8');
  const re = /export const DATA_POINT_KINDS = Object\.freeze\(\[([\s\S]+?)\] as const\);/;
  const match = re.exec(source);
  assert.ok(match);
  const feMembers = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...DATA_POINT_KINDS].sort(), feMembers);
});

test('Phase 13.5 — FE SPONSOR_PURPOSES matches BE', async () => {
  const fePath = path.join(repoRoot, 'frontend', 'src', 'lib', 'citizen-data-offer.ts');
  const source = await fs.readFile(fePath, 'utf8');
  const re = /export const SPONSOR_PURPOSES = Object\.freeze\(\[([\s\S]+?)\] as const\);/;
  const match = re.exec(source);
  assert.ok(match);
  const feMembers = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]/, '').replace(/['"`]$/, ''))
    .filter((s) => s.length > 0)
    .sort();
  assert.deepEqual([...SPONSOR_PURPOSES].sort(), feMembers);
});

// ─── HTTP integration ────────────────────────────────────────────

async function withApiServer(handler) {
  const { store } = await freshSqlite('http');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

function offerBody(overrides = {}) {
  return {
    dataPointKind: 'intent_text',
    pricePerSalePaise: 5000,
    maxSales: 100,
    sponsorPurposeAllowlist: ['model_training'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

test('POST /api/identities/:id/data-offers — happy path persists + emits published ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(offerBody())
      }
    );
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.offer.publisherId, identity.id);
    assert.equal(body.offer.status, 'active');
    // Ledger event emitted.
    const events = await store.listLedger({ type: 'citizen_data_offer.published' });
    assert.equal(events.length, 1);
    assert.equal(events[0].offerId, body.offer.offerId);
  });
});

test('POST /api/identities/:id/data-offers — duplicate offer 409', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    // Note: fix expiresAt so the content-hash is stable.
    const body = offerBody({ expiresAt: '2026-07-15T10:00:00Z' });
    const first = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(first.status, 201);
    const second = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    );
    assert.equal(second.status, 409);
    const errBody = await second.json();
    assert.equal(errBody.error.code, 'duplicate_offer');
  });
});

test('POST /api/identities/:id/data-offers — malformed envelope 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(offerBody({ dataPointKind: 'something_bad' }))
      }
    );
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_citizen_data_offer');
  });
});

test('GET /api/identities/:id/data-offers returns publisher offers + supported enums', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(offerBody()) }
    );
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`
    );
    const body = await r.json();
    assert.equal(body.offers.length, 1);
    assert.equal(body.protocolVersion, CITIZEN_DATA_OFFER_PROTOCOL_VERSION);
    assert.deepEqual([...body.supportedDataPointKinds], [...DATA_POINT_KINDS]);
  });
});

test('DELETE /api/identities/:id/data-offers/:offerId revokes (citizen-only)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const post = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(offerBody()) }
    );
    const created = (await post.json()).offer;
    const del = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers/${encodeURIComponent(created.offerId)}`,
      { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'changed my mind' }) }
    );
    assert.equal(del.status, 200);
    const body = await del.json();
    assert.equal(body.offer.status, 'revoked');
    // Revoked ledger event emitted.
    const events = await store.listLedger({ type: 'citizen_data_offer.revoked' });
    assert.equal(events.length, 1);
  });
});

test('POST /api/identities/:id/data-offers/:offerId/pause transitions active → paused', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const post = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(offerBody()) }
    );
    const created = (await post.json()).offer;
    const pause = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers/${encodeURIComponent(created.offerId)}/pause`,
      { method: 'POST' }
    );
    assert.equal(pause.status, 200);
    const body = await pause.json();
    assert.equal(body.offer.status, 'paused');
  });
});

test('DELETE 404 on unknown offer / wrong publisher', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const r = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers/bos:citizen-data-offer:nope`,
      { method: 'DELETE' }
    );
    assert.equal(r.status, 404);
  });
});

// DPDP cascade — offers wipe on identity erase.
test('eraseUserData cascades citizen data offers by publisherId', async () => {
  const { store } = await freshSqlite('cascade');
  try {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const offer = buildCitizenDataOffer({
      ...validInput(),
      publisherId: identity.id,
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    await store.saveCitizenDataOffer(offer);
    const before = await store.listCitizenDataOffers({ publisherId: identity.id });
    assert.equal(before.length, 1);
    await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
    const after = await store.listCitizenDataOffers({ publisherId: identity.id });
    assert.equal(after.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});
