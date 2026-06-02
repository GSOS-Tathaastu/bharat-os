// Phase 13.5.2 — Signed citizen-data-offer-purchase audit export tests.

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
  buildCitizenDataOfferExportLines,
  bundleNdjson,
  verifyCitizenDataOfferExportLines,
  identityHashFor,
  CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION
} from '../../src/phase1/citizen-data-offer-export.mjs';
import { buildCitizenDataOfferPurchase } from '../../src/phase1/citizen-data-offer-purchase.mjs';
import { sha256Hex } from '../../src/phase0/core.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'citizen-data-offer-export-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

function samplePurchases(sponsorId) {
  return [
    buildCitizenDataOfferPurchase({
      offerId: 'bos:citizen-data-offer:o1',
      sponsorId,
      publisherId: 'bos:person:citizen-a',
      pricePerSalePaise: 5000,
      sponsorPurpose: 'model_training',
      dataPointKind: 'intent_text'
    }),
    buildCitizenDataOfferPurchase({
      offerId: 'bos:citizen-data-offer:o2',
      sponsorId,
      publisherId: 'bos:person:citizen-b',
      pricePerSalePaise: 7500,
      sponsorPurpose: 'safety_benchmark',
      dataPointKind: 'doc_summary'
    })
  ];
}

// ─── Pure module ──────────────────────────────────────────────────

test('CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION pinned', () => {
  assert.equal(
    CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION,
    'bos.phase13.citizen-data-offer-export.v0'
  );
});

test('identityHashFor rotates per (sponsor, publisher)', () => {
  const a = identityHashFor('bos:sponsor:S1', 'bos:person:P1');
  const b = identityHashFor('bos:sponsor:S2', 'bos:person:P1');
  const c = identityHashFor('bos:sponsor:S1', 'bos:person:P1');
  assert.notEqual(a, b, 'same citizen across sponsors must hash differently');
  assert.equal(a, c, 'same (sponsor, publisher) must hash deterministically');
  assert.ok(a.startsWith('sha256:'));
});

test('buildCitizenDataOfferExportLines — happy path produces header + N + trailer', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const purchases = samplePurchases(sponsorId);
  const lines = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases,
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  // header + 2 purchases + trailer = 4 lines
  assert.equal(lines.length, 4);
  const header = JSON.parse(lines[0]);
  assert.equal(header.type, 'header');
  assert.equal(header.protocolVersion, CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION);
  assert.equal(header.sponsorId, sponsorId);
  assert.equal(header.purchaseCount, 2);
  assert.equal(header.signerId, signer.id);
  // Both purchases should be in lines[1..2] (order depends on
  // content-derived purchaseId when purchasedAt is the same
  // second). Assert by SET membership rather than sort position.
  const purchaseObjects = [JSON.parse(lines[1]), JSON.parse(lines[2])];
  for (const p of purchaseObjects) {
    assert.equal(p.type, 'purchase');
    assert.equal(p.sponsorId, sponsorId);
  }
  const dataPointKinds = purchaseObjects.map((p) => p.dataPointKind).sort();
  assert.deepEqual(dataPointKinds, ['doc_summary', 'intent_text']);
  // identityHash is rotated; raw publisherId MUST NOT appear in
  // ANY purchase line (sha256 hex output can't contain 'i', 't',
  // 'z', 'n' so this is a strong guarantee).
  for (const line of [lines[1], lines[2]]) {
    assert.ok(!line.includes('citizen-a'), 'raw publisherId leaked');
    assert.ok(!line.includes('citizen-b'), 'raw publisherId leaked');
  }
  const trailer = JSON.parse(lines[3]);
  assert.equal(trailer.type, 'trailer');
  assert.ok(typeof trailer.contentSha256 === 'string' && trailer.contentSha256.length === 64);
  assert.ok(trailer.signature?.signatureBase64);
});

test('sorted by purchasedAt then purchaseId for stable bundle', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const baseA = buildCitizenDataOfferPurchase({
    offerId: 'bos:citizen-data-offer:o1',
    sponsorId,
    publisherId: 'bos:person:a',
    pricePerSalePaise: 5000,
    sponsorPurpose: 'model_training',
    dataPointKind: 'intent_text'
  });
  const baseB = buildCitizenDataOfferPurchase({
    offerId: 'bos:citizen-data-offer:o2',
    sponsorId,
    publisherId: 'bos:person:b',
    pricePerSalePaise: 5000,
    sponsorPurpose: 'model_training',
    dataPointKind: 'doc_summary'
  });
  const lines1 = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: [baseA, baseB],
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  const lines2 = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: [baseB, baseA], // reversed input
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  // Bundles SHOULD be identical when only the input order differs.
  assert.deepEqual(lines1, lines2);
});

test('bundleNdjson includes trailing newline (NDJSON convention)', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const lines = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: samplePurchases(sponsorId),
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  const body = bundleNdjson(lines);
  assert.ok(body.endsWith('\n'));
  assert.equal(body.split('\n').filter(Boolean).length, lines.length);
});

test('verifyCitizenDataOfferExportLines — happy path', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const lines = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: samplePurchases(sponsorId),
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  const verdict = verifyCitizenDataOfferExportLines(lines, signer);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.purchaseCount, 2);
  assert.equal(verdict.contentSha256.length, 64);
});

test('verifyCitizenDataOfferExportLines — content tampering detected', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const lines = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: samplePurchases(sponsorId),
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  // Tamper the header purchaseCount field (sort-order independent).
  const mutated = [...lines];
  mutated[0] = mutated[0].replace('"purchaseCount":2', '"purchaseCount":99');
  const verdict = verifyCitizenDataOfferExportLines(mutated, signer);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'content_hash_mismatch');
});

test('verifyCitizenDataOfferExportLines — trailer signer mismatch', () => {
  const sponsorId = 'bos:sponsor:demo';
  const signer = createIdentity({ displayName: 'audit-signer' });
  const otherSigner = createIdentity({ displayName: 'different-signer' });
  const lines = buildCitizenDataOfferExportLines({
    sponsorId,
    purchases: samplePurchases(sponsorId),
    signerIdentity: signer,
    exportedAt: '2026-06-02T10:00:00Z'
  });
  const verdict = verifyCitizenDataOfferExportLines(lines, otherSigner);
  // header.signerId == signer.id != otherSigner.id; falls in
  // header_signer_mismatch OR signature_invalid depending on which
  // check fires first. Both are non-ok.
  assert.equal(verdict.ok, false);
  assert.ok(['header_signer_mismatch', 'signature_invalid'].includes(verdict.reason));
});

test('rejects too few lines', () => {
  const signer = createIdentity({ displayName: 'audit-signer' });
  const verdict = verifyCitizenDataOfferExportLines(['{"type":"header"}'], signer);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'too_few_lines');
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
  const funded = depositEscrow(sponsor, balancePaise);
  await store.saveSponsor(funded);
  return { sponsor: funded, bearerToken };
}

async function publishAndPurchase(baseUrl, store, identity, sponsor, bearerToken) {
  const pub = await fetch(
    `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/data-offers`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dataPointKind: 'intent_text',
        pricePerSalePaise: 5000,
        maxSales: 5,
        sponsorPurposeAllowlist: ['model_training'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
    }
  );
  const offer = (await pub.json()).offer;
  await fetch(
    `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offers/${encodeURIComponent(offer.offerId)}/purchase`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sponsorPurpose: 'model_training' })
    }
  );
  return offer;
}

test('GET /api/sponsors/:id/data-offer-purchases/export.ndjson returns signed bundle + ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    await publishAndPurchase(baseUrl, store, identity, sponsor, bearerToken);

    const exportRes = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offer-purchases/export.ndjson`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    assert.equal(exportRes.status, 200);
    assert.match(exportRes.headers.get('content-type') ?? '', /application\/x-ndjson/);
    const ndjson = await exportRes.text();
    const lines = ndjson.trimEnd().split('\n');
    // header + 1 purchase + trailer = 3 lines
    assert.equal(lines.length, 3);
    // Pull the audit signer public record for verify.
    const signerRecordRes = await fetch(`${baseUrl}/api/audit-signer/public-key`);
    const signerRecord = await signerRecordRes.json();
    const verdict = verifyCitizenDataOfferExportLines(lines, signerRecord);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.purchaseCount, 1);
    // Ledger event emitted.
    const events = await store.listLedger({ type: 'citizen_data_offer_export.signed' });
    assert.equal(events.length, 1);
    assert.equal(events[0].sponsorId, sponsor.sponsorId);
    assert.equal(events[0].contentSha256, verdict.contentSha256);
  });
});

test('export endpoint requires bearer auth', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { sponsor } = await seedSponsorWithEscrow(store);
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offer-purchases/export.ndjson`
    );
    assert.ok(r.status === 401 || r.status === 403);
  });
});

test('export with NO purchases still emits a well-formed header + trailer bundle', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offer-purchases/export.ndjson`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    assert.equal(r.status, 200);
    const ndjson = await r.text();
    const lines = ndjson.trimEnd().split('\n');
    // header + trailer = 2 lines (no purchases)
    assert.equal(lines.length, 2);
    const header = JSON.parse(lines[0]);
    assert.equal(header.purchaseCount, 0);
    const signerRecordRes = await fetch(`${baseUrl}/api/audit-signer/public-key`);
    const signerRecord = await signerRecordRes.json();
    const verdict = verifyCitizenDataOfferExportLines(lines, signerRecord);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.purchaseCount, 0);
  });
});

// §15 — the bundle must NOT leak the raw publisherId.
test('§15 — bundle does NOT leak raw publisherId (only the rotated identityHash)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Citizen Demo' });
    await store.saveIdentity(identity);
    const { sponsor, bearerToken } = await seedSponsorWithEscrow(store);
    await publishAndPurchase(baseUrl, store, identity, sponsor, bearerToken);

    const r = await fetch(
      `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/data-offer-purchases/export.ndjson`,
      { headers: { authorization: `Bearer ${bearerToken}` } }
    );
    const ndjson = await r.text();
    assert.ok(
      !ndjson.includes(identity.id),
      'raw publisherId leaked into the audit export bundle'
    );
    // The rotated hash MUST be present though.
    const expectedHash = identityHashFor(sponsor.sponsorId, identity.id);
    assert.ok(ndjson.includes(expectedHash));
  });
});
