// Phase 13.5.1 — Citizen data offer purchase tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { createSponsor, depositEscrow } from '../../src/phase1/sponsor.mjs';
import {
  buildCitizenDataOffer
} from '../../src/phase1/citizen-data-offer.mjs';
import {
  buildCitizenDataOfferPurchase,
  applyPurchaseToOffer,
  buildCitizenDataOfferPurchasedLedgerEvent,
  CITIZEN_DATA_OFFER_PURCHASE_PROTOCOL_VERSION,
  PERMITTED_PURCHASE_KEYS
} from '../../src/phase1/citizen-data-offer-purchase.mjs';
import { sha256Hex } from '../../src/phase0/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'citizen-data-offer-purchase-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

function validOffer(overrides = {}) {
  return buildCitizenDataOffer({
    publisherId: 'bos:person:test-citizen',
    dataPointKind: 'intent_text',
    pricePerSalePaise: 5000,
    maxSales: 3,
    sponsorPurposeAllowlist: ['model_training', 'safety_benchmark'],
    publishedAt: '2026-06-02T10:00:00Z',
    expiresAt: '2026-07-02T10:00:00Z',
    ...overrides
  });
}

// ─── Pure module ──────────────────────────────────────────────────

test('CITIZEN_DATA_OFFER_PURCHASE_PROTOCOL_VERSION pinned', () => {
  assert.equal(
    CITIZEN_DATA_OFFER_PURCHASE_PROTOCOL_VERSION,
    'bos.phase13.citizen-data-offer-purchase.v1'
  );
});

test('buildCitizenDataOfferPurchase — happy path', () => {
  const offer = validOffer();
  const purchase = buildCitizenDataOfferPurchase({
    offerId: offer.offerId,
    sponsorId: 'bos:sponsor:demo',
    publisherId: offer.publisherId,
    pricePerSalePaise: offer.pricePerSalePaise,
    sponsorPurpose: 'model_training'
  });
  assert.ok(purchase.purchaseId.startsWith('bos:citizen-data-purchase:'));
  assert.equal(purchase.offerId, offer.offerId);
  assert.equal(purchase.sponsorId, 'bos:sponsor:demo');
  assert.equal(purchase.publisherId, offer.publisherId);
  assert.equal(purchase.pricePerSalePaise, 5000);
  assert.equal(purchase.sponsorPurpose, 'model_training');
  assert.equal(/\.\d/.test(purchase.purchasedAt), false);
});

test('strict allowlist rejects forbidden top-level keys', () => {
  for (const forbidden of ['dataPointBytes', 'content', 'preview']) {
    assert.throws(
      () =>
        buildCitizenDataOfferPurchase({
          offerId: 'bos:citizen-data-offer:test',
          sponsorId: 'bos:sponsor:demo',
          publisherId: 'bos:person:x',
          pricePerSalePaise: 5000,
          sponsorPurpose: 'model_training',
          [forbidden]: 'leak'
        }),
      new RegExp(`${forbidden} is not a permitted citizen-data-offer-purchase field`)
    );
  }
});

test('PERMITTED_PURCHASE_KEYS contains exactly the documented set', () => {
  assert.deepEqual([...PERMITTED_PURCHASE_KEYS].sort(), [
    // Phase 13.5.2 added dataPointKind (denormalised from the offer
    // so the audit-export bundle stays self-contained even after
    // the offer is wiped by DPDP cascade).
    'dataPointKind',
    'meshContributionEventId',
    'offerId',
    'pricePerSalePaise',
    'protocolVersion',
    'publisherId',
    'purchaseId',
    'purchasedAt',
    'sponsorId',
    'sponsorPurpose'
  ]);
});

test('rejects non-positive pricePerSalePaise', () => {
  assert.throws(
    () =>
      buildCitizenDataOfferPurchase({
        offerId: 'bos:citizen-data-offer:test',
        sponsorId: 'bos:sponsor:demo',
        publisherId: 'bos:person:x',
        pricePerSalePaise: 0,
        sponsorPurpose: 'model_training'
      }),
    /pricePerSalePaise must be a positive integer/
  );
});

test('applyPurchaseToOffer bumps salesCount + active → exhausted at cap', () => {
  let offer = validOffer({ maxSales: 2 });
  offer = applyPurchaseToOffer(offer);
  assert.equal(offer.salesCount, 1);
  assert.equal(offer.status, 'active');
  offer = applyPurchaseToOffer(offer);
  assert.equal(offer.salesCount, 2);
  assert.equal(offer.status, 'exhausted');
  assert.throws(() => applyPurchaseToOffer(offer), /cannot apply purchase/);
});

test('applyPurchaseToOffer rejects on non-active offer', () => {
  const offer = { ...validOffer(), status: 'paused' };
  assert.throws(() => applyPurchaseToOffer(offer), /not active/);
});

test('buildCitizenDataOfferPurchasedLedgerEvent emits POINTER + count-only meta', () => {
  const offer = applyPurchaseToOffer(validOffer({ maxSales: 5 }));
  const purchase = buildCitizenDataOfferPurchase({
    offerId: offer.offerId,
    sponsorId: 'bos:sponsor:demo',
    publisherId: offer.publisherId,
    pricePerSalePaise: 5000,
    sponsorPurpose: 'model_training'
  });
  const event = buildCitizenDataOfferPurchasedLedgerEvent({
    offer,
    purchase,
    at: '2026-06-02T10:00:01.547Z'
  });
  assert.equal(event.type, 'citizen_data_offer.purchased');
  assert.equal(event.purchaseId, purchase.purchaseId);
  assert.equal(event.offerId, offer.offerId);
  assert.equal(event.sponsorId, 'bos:sponsor:demo');
  assert.equal(event.publisherId, offer.publisherId);
  assert.equal(event.dataPointKind, 'intent_text');
  assert.equal(event.sponsorPurpose, 'model_training');
  assert.equal(event.pricePerSalePaise, 5000);
  assert.equal(event.salesCount, 1);
  assert.equal(event.maxSales, 5);
  // ms stripped
  assert.equal(/\.\d/.test(event.at), false);
  // §15 — no body bytes / content leak.
  const json = JSON.stringify(event);
  for (const forbidden of ['dataPoint', 'content', 'preview', 'plaintext']) {
    assert.ok(!json.includes(`"${forbidden}"`));
  }
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

async function seedSponsorWithEscrow(store, balancePaise = 100_000) {
  const onboarded = createSponsor({
    displayName: 'Demo Sponsor',
    contactEmail: 'sponsor@example.com',
    onboardedBy: 'sre-on-call'
  });
  const sponsor = onboarded.sponsor;
  const bearerToken = onboarded.bearerToken;
  let funded = depositEscrow(sponsor, balancePaise);
  await store.saveSponsor(funded);
  return { sponsor: funded, bearerToken };
}

async function publishOffer(store, baseUrl, publisherId, overrides = {}) {
  const r = await fetch(
    `${baseUrl}/api/identities/${encodeURIComponent(publisherId)}/data-offers`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dataPointKind: 'intent_text',
        pricePerSalePaise: 5000,
        maxSales: 3,
        sponsorPurposeAllowlist: ['model_training', 'safety_benchmark'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ...overrides
      })
    }
  );
  return (await r.json()).offer;
}

test('GET /api/sponsors/:id/data-offers/browse returns active offers + purpose filter', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id);

    const browse = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/browse`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    assert.equal(browse.status, 200);
    const body = await browse.json();
    assert.equal(body.offers.length, 1);
    assert.equal(body.offers[0].offerId, offer.offerId);

    // Purpose filter that matches
    const filterMatch = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/browse?purpose=model_training`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    const filterMatchBody = await filterMatch.json();
    assert.equal(filterMatchBody.offers.length, 1);

    // Purpose filter that doesn't match
    const filterNoMatch = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/browse?purpose=academic_research`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    const filterNoMatchBody = await filterNoMatch.json();
    assert.equal(filterNoMatchBody.offers.length, 0);
  });
});

test('GET /api/sponsors/:id/data-offers/browse rejects invalid purpose 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/browse?purpose=mass_surveillance`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    assert.equal(r.status, 400);
  });
});

test('GET /api/sponsors/:id/data-offers/browse requires bearer auth', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { sponsor } = await seedSponsorWithEscrow(store);
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/browse`
    );
    assert.ok(r.status === 401 || r.status === 403);
  });
});

test('POST /api/sponsors/:id/data-offers/:offerId/purchase — happy path debits sponsor + credits citizen + emits ledger', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id);

    const purchase = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ sponsorPurpose: 'model_training' })
      }
    );
    assert.equal(purchase.status, 201);
    const body = await purchase.json();
    assert.equal(body.ok, true);
    assert.equal(body.purchase.sponsorId, sponsor.sponsorId);
    assert.equal(body.purchase.publisherId, identity.id);
    assert.equal(body.purchase.pricePerSalePaise, 5000);
    assert.equal(body.offer.salesCount, 1);
    assert.equal(body.offer.status, 'active');
    // Sponsor balance debited.
    assert.equal(body.sponsor.escrowBalancePaise, 100_000 - 5000);
    // Citizen mesh contribution event present.
    assert.ok(body.meshContributionEvent.contributionEventId);
    assert.equal(body.meshContributionEvent.payoutPaise, 5000);

    // Ledger events present.
    const purchased = await store.listLedger({ type: 'citizen_data_offer.purchased' });
    assert.equal(purchased.length, 1);
    assert.equal(purchased[0].sponsorId, sponsor.sponsorId);
    const debited = await store.listLedger({ type: 'sponsor_escrow.debited' });
    assert.equal(debited.length, 1);
    assert.equal(debited[0].amountPaise, 5000);
    // No redundant published event from the auto-emit (skipLedger).
    const publishedEvents = await store.listLedger({ type: 'citizen_data_offer.published' });
    assert.equal(publishedEvents.length, 1, 'only the original publish, no re-emit on bump');
  });
});

test('purchase fills the offer through to exhausted', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id, { maxSales: 2 });
    async function purchaseOnce() {
      const r = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ sponsorPurpose: 'model_training' })
        }
      );
      return { status: r.status, body: await r.json() };
    }
    const first = await purchaseOnce();
    assert.equal(first.status, 201);
    assert.equal(first.body.offer.salesCount, 1);
    const second = await purchaseOnce();
    assert.equal(second.status, 201);
    assert.equal(second.body.offer.salesCount, 2);
    assert.equal(second.body.offer.status, 'exhausted');
    const third = await purchaseOnce();
    assert.equal(third.status, 409);
    assert.equal(third.body.error.code, 'offer_not_active');
  });
});

test('purchase rejects purpose NOT in the offer\'s allowlist (403)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id, {
      sponsorPurposeAllowlist: ['model_training']
    });
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sponsorPurpose: 'academic_research' })
      }
    );
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.equal(body.error.code, 'purpose_not_allowlisted');
  });
});

test('purchase rejects insufficient escrow (409)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store, 100); // ₹1
    const offer = await publishOffer(store, baseUrl, identity.id, { pricePerSalePaise: 50_000 }); // ₹500
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sponsorPurpose: 'model_training' })
      }
    );
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, 'insufficient_escrow');
    assert.equal(body.error.requiredPaise, 50_000);
  });
});

test('purchase rejects paused offer (409)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id);
    // pause it
    await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers/${encodeURIComponent(offer.offerId)}/pause`,
      { method: 'POST' }
    );
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sponsorPurpose: 'model_training' })
      }
    );
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.error.code, 'offer_not_active');
  });
});

test('purchase rejects unknown offer (404)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/bos:citizen-data-offer:nope/purchase`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sponsorPurpose: 'model_training' })
      }
    );
    assert.equal(r.status, 404);
  });
});

test('GET /api/sponsors/:id/data-offer-purchases returns sponsor purchases', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const offer = await publishOffer(store, baseUrl, identity.id);
    await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sponsorPurpose: 'model_training' })
      }
    );
    const list = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offer-purchases`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    assert.equal(list.status, 200);
    const body = await list.json();
    assert.equal(body.purchases.length, 1);
    assert.equal(body.purchases[0].sponsorId, sponsor.sponsorId);
  });
});

// DPDP cascade — purchases cascade by publisherId.
test('eraseUserData cascades citizen data offer purchases by publisherId', async () => {
  const { store } = await freshSqlite('cascade');
  try {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const purchase = buildCitizenDataOfferPurchase({
      offerId: 'bos:citizen-data-offer:o1',
      sponsorId: 'bos:sponsor:demo',
      publisherId: identity.id,
      pricePerSalePaise: 5000,
      sponsorPurpose: 'model_training'
    });
    await store.saveCitizenDataOfferPurchase(purchase);
    const before = await store.listCitizenDataOfferPurchases({ publisherId: identity.id });
    assert.equal(before.length, 1);
    await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
    const after = await store.listCitizenDataOfferPurchases({ publisherId: identity.id });
    assert.equal(after.length, 0);
  } finally {
    if (typeof store.close === 'function') store.close();
  }
});
