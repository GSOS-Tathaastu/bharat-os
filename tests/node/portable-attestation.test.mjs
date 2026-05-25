// Phase 5.9 — portable work-history attestation tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, signText } from '../../src/phase0/core.mjs';
import {
  aggregateAttestationsForWorker,
  ATTESTATION_CATEGORIES,
  ATTESTATION_TIERS,
  buildTier2SignaturePayload,
  createPortableAttestationToken,
  PORTABLE_ATTESTATION_PROTOCOL_VERSION,
  signTier0,
  signTier1,
  signTier2,
  verifyTier2
} from '../../src/phase1/portable-attestation.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'portable-attestation-tests');

// ─── Token creation ───────────────────────────────────────────────────

test('createPortableAttestationToken returns a versioned envelope', () => {
  const token = createPortableAttestationToken({
    workerId: 'bos:person:rider',
    category: 'delivery',
    at: '2026-05-25T10:00:00.000Z'
  });
  assert.equal(token.protocolVersion, PORTABLE_ATTESTATION_PROTOCOL_VERSION);
  assert.equal(token.objectType, 'portable-attestation-token');
  assert.equal(token.workerId, 'bos:person:rider');
  assert.equal(token.category, 'delivery');
  assert.equal(token.status, 'pending');
  assert.equal(token.tier, null);
  assert.match(token.tokenId, /^bos:portable-attestation:[0-9a-f]{32}$/);
  assert.equal(token.issuedAt, '2026-05-25T10:00:00.000Z');
  assert.equal(token.expiresAt, '2026-05-25T11:00:00.000Z'); // +1h default
});

test('createPortableAttestationToken rejects missing/bad workerId + category', () => {
  assert.throws(() => createPortableAttestationToken({ category: 'delivery' }), /workerId/);
  assert.throws(
    () => createPortableAttestationToken({ workerId: 'x', category: 'unknown' }),
    /category must be one of/
  );
});

test('createPortableAttestationToken rejects out-of-range ttl', () => {
  const args = { workerId: 'x', category: 'cash' };
  assert.throws(() => createPortableAttestationToken({ ...args, ttlSeconds: 0 }), /positive/);
  assert.throws(() => createPortableAttestationToken({ ...args, ttlSeconds: 90000 }), /<= 86400/);
});

test('createPortableAttestationToken truncates GPS to neighbourhood precision', () => {
  const token = createPortableAttestationToken({
    workerId: 'x',
    category: 'delivery',
    workerGps: { lat: 18.520543, lng: 73.856743 }
  });
  // 2-decimal precision → ~1.1km resolution. NOT meter-level.
  assert.equal(token.workerGps.lat, 18.52);
  assert.equal(token.workerGps.lng, 73.86);
});

// ─── Tier 0 — anonymous tap ───────────────────────────────────────────

test('signTier0 sets status + tier 0 + hashed IP', () => {
  const token = createPortableAttestationToken({
    workerId: 'x',
    category: 'delivery'
  });
  const signed = signTier0(token, { clientIp: '203.0.113.42', at: '2026-05-25T10:30:00.000Z' });
  assert.equal(signed.status, 'signed');
  assert.equal(signed.tier, ATTESTATION_TIERS.ANONYMOUS_TAP);
  assert.equal(signed.signedAt, '2026-05-25T10:30:00.000Z');
  assert.match(signed.signerData.ipHash, /^[0-9a-f]{24}$/);
  // IP hash is stable for the same input.
  const again = signTier0(token, { clientIp: '203.0.113.42' });
  assert.equal(again.signerData.ipHash, signed.signerData.ipHash);
});

test('signTier0 refuses to sign an already-signed token', () => {
  const token = createPortableAttestationToken({
    workerId: 'x',
    category: 'delivery'
  });
  const signed = signTier0(token, { clientIp: '203.0.113.42' });
  assert.throws(() => signTier0(signed, { clientIp: '203.0.113.99' }), /already signed/);
});

test('signTier0 refuses to sign an expired token', () => {
  const token = createPortableAttestationToken({
    workerId: 'x',
    category: 'delivery',
    at: '2026-05-25T10:00:00.000Z',
    ttlSeconds: 60
  });
  assert.throws(
    () => signTier0(token, { clientIp: '203.0.113.42', at: '2026-05-25T11:00:00.000Z' }),
    /expired/
  );
});

// ─── Tier 1 — OTP confirmed ───────────────────────────────────────────

test('signTier1 hashes the customer phone (no raw phone on the record)', () => {
  const token = createPortableAttestationToken({
    workerId: 'x',
    category: 'ride'
  });
  const signed = signTier1(token, { customerPhone: '+919876543210' });
  assert.equal(signed.tier, ATTESTATION_TIERS.OTP_CONFIRMED);
  assert.match(signed.signerData.phoneHash, /^[0-9a-f]{24}$/);
  // Raw phone never appears on the record.
  assert.equal(JSON.stringify(signed).includes('9876543210'), false);
});

test('signTier1 requires customerPhone', () => {
  const token = createPortableAttestationToken({ workerId: 'x', category: 'service' });
  assert.throws(() => signTier1(token, {}), /customerPhone is required/);
});

// ─── Tier 2 — Bharat OS signed ────────────────────────────────────────

test('signTier2 signs with the customer Ed25519 key + verifyTier2 round-trips', () => {
  const worker = createIdentity({ displayName: 'Worker' });
  const customer = createIdentity({ displayName: 'Customer' });
  const token = createPortableAttestationToken({
    workerId: worker.id,
    category: 'delivery'
  });
  const signed = signTier2(token, customer);
  assert.equal(signed.tier, ATTESTATION_TIERS.BHARAT_OS_SIGNED);
  assert.equal(signed.signerData.customerId, customer.id);
  assert.ok(signed.signature);
  const verify = verifyTier2(signed, customer);
  assert.equal(verify.ok, true);
});

test('verifyTier2 rejects when public record mismatches', () => {
  const worker = createIdentity({ displayName: 'W' });
  const customer = createIdentity({ displayName: 'C' });
  const someoneElse = createIdentity({ displayName: 'E' });
  const token = createPortableAttestationToken({
    workerId: worker.id,
    category: 'delivery'
  });
  const signed = signTier2(token, customer);
  const verify = verifyTier2(signed, someoneElse);
  assert.equal(verify.ok, false);
});

test('signTier2 rejects self-signing (worker signing their own work)', () => {
  const worker = createIdentity({ displayName: 'W' });
  const token = createPortableAttestationToken({
    workerId: worker.id,
    category: 'delivery'
  });
  assert.throws(() => signTier2(token, worker), /cannot sign their own work/);
});

// ─── Aggregation ─────────────────────────────────────────────────────

function makeSigned({ workerId, category, tier, ipHash, phoneHash, customerId, signedAt }) {
  return {
    protocolVersion: PORTABLE_ATTESTATION_PROTOCOL_VERSION,
    objectType: 'portable-attestation-token',
    tokenId: `bos:portable-attestation:${Math.random().toString(16).slice(2, 34).padEnd(32, '0')}`,
    workerId,
    category,
    status: 'signed',
    tier,
    signerData: { ipHash, phoneHash, customerId },
    signedAt: signedAt ?? '2026-05-25T10:00:00.000Z'
  };
}

test('aggregateAttestationsForWorker scopes by worker + category', () => {
  const attestations = [
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 0, ipHash: 'a' }),
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 1, phoneHash: 'p1' }),
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 2, customerId: 'c1' }),
    makeSigned({ workerId: 'w1', category: 'ride', tier: 0, ipHash: 'b' }),
    makeSigned({ workerId: 'w2', category: 'delivery', tier: 0, ipHash: 'c' })
  ];
  const summary = aggregateAttestationsForWorker(attestations, {
    workerId: 'w1',
    category: 'delivery'
  });
  assert.equal(summary.totalAttestations, 3);
  assert.deepEqual(summary.byTier, { 0: 1, 1: 1, 2: 1 });
});

test('aggregateAttestationsForWorker computes repeat-share fraud signals', () => {
  const attestations = [
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 1, phoneHash: 'p1' }),
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 1, phoneHash: 'p1' }),
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 1, phoneHash: 'p1' }),
    makeSigned({ workerId: 'w1', category: 'delivery', tier: 1, phoneHash: 'p2' })
  ];
  const summary = aggregateAttestationsForWorker(attestations, {
    workerId: 'w1',
    category: 'delivery'
  });
  // 3 of 4 attestations come from a phone that signed > 1 time.
  assert.equal(summary.fraudSignals.repeatedPhoneShare, 0.75);
});

test('aggregateAttestationsForWorker flags Tier-0 dominance', () => {
  const attestations = Array.from({ length: 100 }, (_, i) =>
    makeSigned({
      workerId: 'w1',
      category: 'delivery',
      tier: i < 98 ? 0 : 1,
      ipHash: `ip-${i}`,
      phoneHash: `p-${i}`
    })
  );
  const summary = aggregateAttestationsForWorker(attestations, {
    workerId: 'w1',
    category: 'delivery'
  });
  assert.equal(summary.fraudSignals.tier0DominanceShare, 0.98);
});

test('aggregateAttestationsForWorker ignores pending tokens', () => {
  const pending = {
    workerId: 'w1',
    category: 'delivery',
    status: 'pending',
    tier: null
  };
  const summary = aggregateAttestationsForWorker([pending], {
    workerId: 'w1',
    category: 'delivery'
  });
  assert.equal(summary.totalAttestations, 0);
});

// ─── SqliteStore + DPDP round-trip ────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips portable attestation tokens', async () => {
  const { store } = await freshSqlite('roundtrip');
  const token = createPortableAttestationToken({
    workerId: 'bos:person:w1',
    category: 'delivery'
  });
  await store.savePortableAttestation(token);
  const read = await store.readPortableAttestation(token.tokenId);
  assert.equal(read.tokenId, token.tokenId);
  assert.equal(read.status, 'pending');
  // Sign + persist.
  const signed = signTier0(token, { clientIp: '203.0.113.42' });
  await store.savePortableAttestation(signed);
  const reread = await store.readPortableAttestation(token.tokenId);
  assert.equal(reread.status, 'signed');
  assert.equal(reread.tier, 0);
  store.close();
});

test('SqliteStore.listPortableAttestations filters by worker + status', async () => {
  const { store } = await freshSqlite('list');
  const token1 = createPortableAttestationToken({ workerId: 'w1', category: 'delivery' });
  const token2 = createPortableAttestationToken({ workerId: 'w1', category: 'ride' });
  const token3 = createPortableAttestationToken({ workerId: 'w2', category: 'delivery' });
  const signed1 = signTier0(token1, { clientIp: '1.1.1.1' });
  await store.savePortableAttestation(signed1);
  await store.savePortableAttestation(token2); // pending
  await store.savePortableAttestation(token3);
  const w1Signed = await store.listPortableAttestations({ workerId: 'w1', status: 'signed' });
  assert.equal(w1Signed.length, 1);
  const w1Delivery = await store.listPortableAttestations({
    workerId: 'w1',
    category: 'delivery'
  });
  assert.equal(w1Delivery.length, 1);
  store.close();
});

test('collectUserData includes portableAttestations in the export', async () => {
  const { store } = await freshSqlite('dpdp-export');
  const identity = createIdentity({ displayName: 'Worker' });
  await store.saveIdentity(identity);
  const token = createPortableAttestationToken({
    workerId: identity.id,
    category: 'delivery'
  });
  const signed = signTier0(token, { clientIp: '203.0.113.42' });
  await store.savePortableAttestation(signed);
  const data = await collectUserData(store, identity.id);
  assert.equal(data.sections.portableAttestations.count, 1);
  store.close();
});

test('eraseUserData removes portable attestations in the cascade', async () => {
  const { store } = await freshSqlite('dpdp-erase');
  const identity = createIdentity({ displayName: 'Worker' });
  await store.saveIdentity(identity);
  const token = createPortableAttestationToken({
    workerId: identity.id,
    category: 'delivery'
  });
  await store.savePortableAttestation(signTier0(token, { clientIp: '1.1.1.1' }));
  await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
  const remaining = await store.listPortableAttestations({ workerId: identity.id });
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

test('POST /api/portable-attestation/init returns token + sign URL', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    await store.saveIdentity(worker);
    const response = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.tokenId, /^bos:portable-attestation:/);
    assert.equal(body.signUrl, `/sign/${encodeURIComponent(body.tokenId)}`);
    assert.match(body.disclaimer, /do NOT verify identity/i);
    // Token persisted, status pending.
    const reread = await store.readPortableAttestation(body.tokenId);
    assert.equal(reread.status, 'pending');
  });
});

test('POST init rejects unknown worker (400)', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: 'bos:person:does-not-exist', category: 'delivery' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'unknown_worker');
  });
});

test('POST sign-tier0 signs the token + records hashed IP', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    await store.saveIdentity(worker);
    const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    const { tokenId } = await initResp.json();
    const signResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier0`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(signResp.status, 200);
    const body = await signResp.json();
    assert.equal(body.attestation.tier, 0);
    assert.equal(body.attestation.status, 'signed');
    // Token cannot be signed twice — should return 409.
    const second = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier0`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(second.status, 409);
    const body2 = await second.json();
    assert.equal(body2.error.code, 'token_already_signed');
  });
});

test('GET sign-tier2/payload returns the canonical payload to sign', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    await store.saveIdentity(worker);
    const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    const { tokenId } = await initResp.json();
    const payloadResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier2/payload`
    );
    assert.equal(payloadResp.status, 200);
    const body = await payloadResp.json();
    assert.ok(body.payload);
    // Sanity-check that the payload is canonical JSON of the
    // expected shape (no whitespace, sorted keys).
    const parsed = JSON.parse(body.payload);
    assert.equal(parsed.tokenId, tokenId);
    assert.equal(parsed.workerId, worker.id);
    assert.equal(parsed.category, 'delivery');
  });
});

test('POST sign-tier2 with valid customer signature succeeds', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    const customer = createIdentity({ displayName: 'Customer' });
    await store.saveIdentity(worker);
    await store.saveIdentity(customer);
    const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    const { tokenId } = await initResp.json();
    const payloadResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier2/payload`
    );
    const { payload } = await payloadResp.json();
    // Customer signs locally with their Ed25519 key.
    const signature = signText(customer, payload);
    const signResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier2`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, signature })
      }
    );
    assert.equal(signResp.status, 200);
    const body = await signResp.json();
    assert.equal(body.attestation.tier, 2);
    assert.equal(body.attestation.signerData.customerId, customer.id);
  });
});

test('POST sign-tier2 rejects a tampered signature', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    const customer = createIdentity({ displayName: 'Customer' });
    await store.saveIdentity(worker);
    await store.saveIdentity(customer);
    const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    const { tokenId } = await initResp.json();
    const signResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier2`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        })
      }
    );
    assert.equal(signResp.status, 400);
    const body = await signResp.json();
    assert.equal(body.error.code, 'signature_invalid');
  });
});

test('POST sign-tier2 rejects self-signing (worker can\'t sign own work)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    await store.saveIdentity(worker);
    const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
    });
    const { tokenId } = await initResp.json();
    const signResp = await fetch(
      `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier2`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: worker.id, signature: 'irrelevant' })
      }
    );
    assert.equal(signResp.status, 400);
    const body = await signResp.json();
    assert.equal(body.error.code, 'self_sign');
  });
});

test('GET /api/identities/:id/portable-attestation/summary returns tier breakdown', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const worker = createIdentity({ displayName: 'Rider' });
    await store.saveIdentity(worker);
    // Seed three signed attestations across tiers.
    for (let i = 0; i < 3; i += 1) {
      const initResp = await fetch(`${baseUrl}/api/portable-attestation/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerId: worker.id, category: 'delivery' })
      });
      const { tokenId } = await initResp.json();
      await fetch(
        `${baseUrl}/api/portable-attestation/${encodeURIComponent(tokenId)}/sign-tier0`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
      );
    }
    const summaryResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/portable-attestation/summary?category=delivery`
    );
    assert.equal(summaryResp.status, 200);
    const body = await summaryResp.json();
    assert.equal(body.summary.totalAttestations, 3);
    assert.equal(body.summary.byTier[0], 3);
    assert.equal(body.summary.fraudSignals.tier0DominanceShare, 1.0);
  });
});

test('GET /sign/:tokenId serves the static signing page', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sign/bos:portable-attestation:any`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Sign a delivery receipt/);
    assert.match(text, /Tier 1|OTP/i);
  });
});

test('GET sign-tier0 endpoint on a non-existent token 404s', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const resp = await fetch(
      `${baseUrl}/api/portable-attestation/bos:portable-attestation:fake/sign-tier0`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(resp.status, 404);
  });
});

test('ATTESTATION_CATEGORIES enum is frozen + has 5 entries', () => {
  assert.equal(ATTESTATION_CATEGORIES.length, 5);
  assert.ok(Object.isFrozen(ATTESTATION_CATEGORIES));
  assert.ok(ATTESTATION_CATEGORIES.includes('delivery'));
});
