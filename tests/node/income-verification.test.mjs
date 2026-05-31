// Phase 6.1 — MFI income-verification tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  buildIncomeVerificationBundle,
  createIncomeVerificationConsent,
  INCOME_VERIFICATION_PROTOCOL_VERSION,
  recordConsentRead,
  revokeIncomeVerificationConsent,
  verifyIncomeVerificationBundle,
  verifyIncomeVerificationConsent
} from '../../src/phase1/income-verification.mjs';
import { createEarningsEntry } from '../../src/phase1/earnings-log.mjs';
import {
  createMeshContributionEvent
} from '../../src/phase1/mesh-contribution.mjs';
import {
  createPortableAttestationToken,
  signTier0,
  signTier1
} from '../../src/phase1/portable-attestation.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'income-verification-tests');

// ─── createIncomeVerificationConsent ─────────────────────────────────

test('createIncomeVerificationConsent returns a signed envelope', () => {
  const identity = createIdentity({ displayName: 'Worker' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Bajaj Finserv',
    purpose: 'Personal loan application',
    financialYear: '2025-26'
  });
  assert.equal(consent.protocolVersion, INCOME_VERIFICATION_PROTOCOL_VERSION);
  assert.equal(consent.objectType, 'income-verification-consent');
  assert.equal(consent.workerId, identity.id);
  assert.equal(consent.mfiName, 'Bajaj Finserv');
  assert.equal(consent.financialYear, '2025-26');
  assert.equal(consent.maxReads, 1);
  assert.equal(consent.readCount, 0);
  assert.equal(consent.revokedAt, null);
  assert.match(consent.consentId, /^bos:income-verification-consent:[0-9a-f]{32}$/);
  assert.ok(consent.signature);
});

test('createIncomeVerificationConsent rejects bad inputs', () => {
  const identity = createIdentity({ displayName: 'W' });
  assert.throws(() => createIncomeVerificationConsent({}), /identity is required/);
  assert.throws(
    () =>
      createIncomeVerificationConsent({
        identity,
        mfiName: 'M',
        purpose: 'P',
        financialYear: '2025-27' // wrong end year
      }),
    /YYYY-YY/
  );
  assert.throws(
    () =>
      createIncomeVerificationConsent({
        identity,
        mfiName: 'M',
        purpose: 'P',
        financialYear: '2025-26',
        ttlSeconds: 1 // below MIN_CONSENT_TTL_SECONDS
      }),
    /ttlSeconds must be between/
  );
  assert.throws(
    () =>
      createIncomeVerificationConsent({
        identity,
        mfiName: 'M',
        purpose: 'P',
        financialYear: '2025-26',
        maxReads: 99
      }),
    /maxReads must be an integer between 1 and 10/
  );
});

test('createIncomeVerificationConsent rejects oversized mfiName + truncates long purpose', () => {
  const identity = createIdentity({ displayName: 'W' });
  // mfiName is rejected outright when too long — silent truncation
  // could produce a misleading MFI name on the consent the worker
  // signed, so we make the caller fix it.
  assert.throws(
    () =>
      createIncomeVerificationConsent({
        identity,
        mfiName: 'X'.repeat(200),
        purpose: 'P',
        financialYear: '2025-26'
      }),
    /<= 80 chars/
  );
  // Purpose can be truncated since it's a free-text description
  // (long descriptions are inherently fuzzy).
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'OK',
    purpose: 'Y'.repeat(500),
    financialYear: '2025-26'
  });
  assert.equal(consent.purpose.length, 240);
});

test('verifyIncomeVerificationConsent succeeds on a fresh consent', () => {
  const identity = createIdentity({ displayName: 'W' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Lender',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const result = verifyIncomeVerificationConsent(consent, identity);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'valid');
});

test('verifyIncomeVerificationConsent flags expired consents', () => {
  const identity = createIdentity({ displayName: 'W' });
  const at = '2026-05-25T10:00:00.000Z';
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Lender',
    purpose: 'Loan',
    financialYear: '2025-26',
    ttlSeconds: 60,
    at
  });
  // 5 minutes later → expired.
  const result = verifyIncomeVerificationConsent(consent, identity, {
    at: '2026-05-25T10:05:00.000Z'
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'expired');
});

test('verifyIncomeVerificationConsent flags revoked consents', () => {
  const identity = createIdentity({ displayName: 'W' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  const revoked = revokeIncomeVerificationConsent(consent);
  assert.ok(revoked.revokedAt);
  const result = verifyIncomeVerificationConsent(revoked, identity);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'revoked');
});

test('verifyIncomeVerificationConsent flags exhausted consents', () => {
  const identity = createIdentity({ displayName: 'W' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26',
    maxReads: 1
  });
  const consumed = recordConsentRead(consent);
  assert.equal(consumed.readCount, 1);
  const result = verifyIncomeVerificationConsent(consumed, identity);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'exhausted');
});

test('verifyIncomeVerificationConsent flags wrong-worker public record', () => {
  const alice = createIdentity({ displayName: 'A' });
  const bob = createIdentity({ displayName: 'B' });
  const consent = createIncomeVerificationConsent({
    identity: alice,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  const result = verifyIncomeVerificationConsent(consent, bob);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unknown_worker');
});

test('verifyIncomeVerificationConsent flags tampered signature', () => {
  const identity = createIdentity({ displayName: 'W' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  // Tamper with the purpose (signature would no longer match).
  const tampered = { ...consent, purpose: 'something else' };
  const result = verifyIncomeVerificationConsent(tampered, identity);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'signature_invalid');
});

// ─── buildIncomeVerificationBundle ───────────────────────────────────

function fyEarnings(identityId) {
  return [
    // FY 2025-26
    createEarningsEntry({
      identityId,
      date: '2025-04-05',
      category: 'delivery',
      amountPaise: 50_000_00, // ₹50K
      hoursWorked: 8
    }),
    createEarningsEntry({
      identityId,
      date: '2025-12-15',
      category: 'ride',
      amountPaise: 60_000_00, // ₹60K
      hoursWorked: 6
    }),
    // Out-of-FY (FY 2024-25)
    createEarningsEntry({
      identityId,
      date: '2025-03-31',
      category: 'cash',
      amountPaise: 99_99_99_99
    })
  ];
}

function fyMeshEvents(identityId) {
  return [
    createMeshContributionEvent({
      operatorId: identityId,
      nodeId: 'n1',
      workloadType: 'inference',
      tokens: 1_000_000,
      at: '2025-06-01T10:00:00Z'
    }),
    createMeshContributionEvent({
      operatorId: identityId,
      workloadType: 'federated_round',
      payoutPaise: 250,
      roundId: 'r1',
      at: '2025-08-01T10:00:00Z'
    }),
    // Out of FY (2026-04+ falls outside FY 2025-26).
    createMeshContributionEvent({
      operatorId: identityId,
      nodeId: 'n1',
      workloadType: 'inference',
      tokens: 5_000_000,
      at: '2026-05-01T10:00:00Z'
    })
  ];
}

function signedAttestation(identityId, tier) {
  const token = createPortableAttestationToken({
    workerId: identityId,
    category: 'delivery'
  });
  if (tier === 0) return signTier0(token, { clientIp: '1.1.1.1' });
  if (tier === 1) return signTier1(token, { customerPhone: '+919876543210' });
  return token;
}

test('buildIncomeVerificationBundle aggregates earnings + mesh + attestations within FY', () => {
  const identity = createIdentity({ displayName: 'Worker' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Bajaj Finserv',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const bundle = buildIncomeVerificationBundle({
    identity,
    consent,
    earningsEntries: fyEarnings(identity.id),
    meshContributionEvents: fyMeshEvents(identity.id),
    portableAttestations: [
      signedAttestation(identity.id, 0),
      signedAttestation(identity.id, 0),
      signedAttestation(identity.id, 1)
    ]
  });
  assert.equal(bundle.objectType, 'income-verification-bundle');
  assert.equal(bundle.workerId, identity.id);
  assert.equal(bundle.consentId, consent.consentId);
  assert.equal(bundle.financialYear, '2025-26');
  // Only the in-FY earnings counted (₹50K + ₹60K = ₹1.1L).
  assert.equal(bundle.income.totalEarningsPaise, 1_10_000_00);
  assert.equal(bundle.income.byCategory.delivery, 50_000_00);
  assert.equal(bundle.income.byCategory.ride, 60_000_00);
  assert.equal(bundle.income.byCategory.cash, 0); // out-of-FY
  assert.equal(bundle.income.workingDays, 2);
  assert.equal(bundle.income.entryCount, 2);
  // Mesh: 1M tokens = ₹8 = 800 paise + 250 paise federated.
  assert.equal(bundle.income.meshPayoutPaise, 1050);
  assert.equal(bundle.income.grandTotalPaise, 1_10_000_00 + 1050);
  // Credibility tiers.
  assert.equal(bundle.credibility.portableAttestationsByTier[0], 2);
  assert.equal(bundle.credibility.portableAttestationsByTier[1], 1);
  assert.equal(bundle.credibility.totalSignedAttestations, 3);
  assert.match(bundle.disclaimer, /TYPED BY THE WORKER/);
  assert.match(bundle.disclaimer, /three quality/);
  assert.match(bundle.bundleId, /^bos:income-verification-bundle:[0-9a-f]{32}$/);
  assert.ok(bundle.signature);
});

test('verifyIncomeVerificationBundle round-trips with the worker\'s public record', () => {
  const identity = createIdentity({ displayName: 'Worker' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Lender',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const bundle = buildIncomeVerificationBundle({
    identity,
    consent,
    earningsEntries: [],
    meshContributionEvents: [],
    portableAttestations: []
  });
  const verify = verifyIncomeVerificationBundle(bundle, identity);
  assert.equal(verify.ok, true);
});

test('verifyIncomeVerificationBundle rejects tampered totals', () => {
  const identity = createIdentity({ displayName: 'Worker' });
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'Lender',
    purpose: 'Loan',
    financialYear: '2025-26'
  });
  const bundle = buildIncomeVerificationBundle({
    identity,
    consent,
    earningsEntries: fyEarnings(identity.id),
    meshContributionEvents: [],
    portableAttestations: []
  });
  // Adversary inflates the total.
  const tampered = {
    ...bundle,
    income: { ...bundle.income, totalEarningsPaise: 99_99_99_99_99 }
  };
  const verify = verifyIncomeVerificationBundle(tampered, identity);
  assert.equal(verify.ok, false);
  assert.equal(verify.status, 'signature_invalid');
});

test('buildIncomeVerificationBundle refuses cross-identity consent', () => {
  const alice = createIdentity({ displayName: 'A' });
  const bob = createIdentity({ displayName: 'B' });
  const consent = createIncomeVerificationConsent({
    identity: alice,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  assert.throws(
    () =>
      buildIncomeVerificationBundle({
        identity: bob,
        consent,
        earningsEntries: [],
        meshContributionEvents: [],
        portableAttestations: []
      }),
    /consent must match identity/
  );
});

// ─── SqliteStore + DPDP ──────────────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips income-verification consents', async () => {
  const { store } = await freshSqlite('roundtrip');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  await store.saveIncomeVerificationConsent(consent);
  const read = await store.readIncomeVerificationConsent(consent.consentId);
  assert.equal(read.consentId, consent.consentId);
  assert.equal(read.workerId, identity.id);
  store.close();
});

test('SqliteStore.listIncomeVerificationConsents filters by worker', async () => {
  const { store } = await freshSqlite('list');
  const alice = createIdentity({ displayName: 'A' });
  const bob = createIdentity({ displayName: 'B' });
  await store.saveIdentity(alice);
  await store.saveIdentity(bob);
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity: alice,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity: bob,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  const aliceOnly = await store.listIncomeVerificationConsents({ workerId: alice.id });
  assert.equal(aliceOnly.length, 1);
  assert.equal(aliceOnly[0].workerId, alice.id);
  store.close();
});

test('collectUserData includes income-verification consents', async () => {
  const { store } = await freshSqlite('dpdp-export');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  const data = await collectUserData(store, identity.id);
  assert.equal(data.sections.incomeVerificationConsents.count, 1);
  store.close();
});

test('eraseUserData removes income-verification consents in the cascade', async () => {
  const { store } = await freshSqlite('dpdp-erase');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
  const remaining = await store.listIncomeVerificationConsents({ workerId: identity.id });
  assert.equal(remaining.length, 0);
  store.close();
});

// ─── BosStore parity (Phase 11.4 surfaced the gap) ────────────────────

async function freshFileStore(name) {
  const root = path.join(tmpRoot, `file-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('BosStore round-trips income-verification consents', async () => {
  const { store } = await freshFileStore('roundtrip');
  const identity = createIdentity({ displayName: 'W' });
  await store.saveIdentity(identity);
  const consent = createIncomeVerificationConsent({
    identity,
    mfiName: 'L',
    purpose: 'P',
    financialYear: '2025-26'
  });
  await store.saveIncomeVerificationConsent(consent);
  const read = await store.readIncomeVerificationConsent(consent.consentId);
  assert.equal(read.consentId, consent.consentId);
  assert.equal(read.workerId, identity.id);
});

test('BosStore.listIncomeVerificationConsents filters by worker', async () => {
  const { store } = await freshFileStore('list');
  const alice = createIdentity({ displayName: 'A' });
  const bob = createIdentity({ displayName: 'B' });
  await store.saveIdentity(alice);
  await store.saveIdentity(bob);
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity: alice,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  await store.saveIncomeVerificationConsent(
    createIncomeVerificationConsent({
      identity: bob,
      mfiName: 'L',
      purpose: 'P',
      financialYear: '2025-26'
    })
  );
  const aliceOnly = await store.listIncomeVerificationConsents({ workerId: alice.id });
  assert.equal(aliceOnly.length, 1);
  assert.equal(aliceOnly[0].workerId, alice.id);
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

test('POST consents creates a signed consent + returns mfiFetchUrl', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mfiName: 'Bajaj Finserv',
          purpose: 'Personal loan',
          financialYear: '2025-26'
        })
      }
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.consent.workerId, identity.id);
    assert.match(body.consent.consentId, /^bos:income-verification-consent:/);
    assert.equal(
      body.mfiFetchUrl,
      `/api/income-verification/${encodeURIComponent(body.consent.consentId)}`
    );
    // Persisted.
    const reread = await store.readIncomeVerificationConsent(body.consent.consentId);
    assert.ok(reread);
    // Ledger event recorded.
    const ledger = await store.listLedger({ type: 'income_verification_consent.issued' });
    assert.ok(ledger.length >= 1);
  });
});

test('POST consents rejects invalid input', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mfiName: 'L', purpose: 'P', financialYear: 'invalid' })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_consent');
  });
});

test('GET income-verification/:consentId returns the signed bundle', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Worker' });
    await store.saveIdentity(identity);
    // Seed an earnings entry in the FY.
    await store.saveEarningsEntry(
      createEarningsEntry({
        identityId: identity.id,
        date: '2025-05-15',
        category: 'delivery',
        amountPaise: 30_000_00
      })
    );
    // Worker issues consent.
    const consentResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mfiName: 'Lender',
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
    assert.equal(body.bundle.workerId, identity.id);
    assert.equal(body.bundle.income.totalEarningsPaise, 30_000_00);
    assert.match(body.bundle.disclaimer, /Bharat OS does NOT verify/);
  });
});

test('GET income-verification/:consentId burns the consent after maxReads', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    const consentResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mfiName: 'Lender',
          purpose: 'Loan',
          financialYear: '2025-26',
          maxReads: 1
        })
      }
    );
    const { consent } = await consentResp.json();
    // First read: succeeds.
    const r1 = await fetch(
      `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
    );
    assert.equal(r1.status, 200);
    // Second read: gone (410 with consent_exhausted).
    const r2 = await fetch(
      `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
    );
    assert.equal(r2.status, 410);
    const body = await r2.json();
    assert.equal(body.error.code, 'consent_exhausted');
    // Ledger has one read event.
    const ledger = await store.listLedger({ type: 'income_verification_bundle.read' });
    assert.equal(ledger.length, 1);
  });
});

test('POST consents/:consentId/revoke burns the consent', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    const consentResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mfiName: 'L',
          purpose: 'P',
          financialYear: '2025-26',
          maxReads: 5
        })
      }
    );
    const { consent } = await consentResp.json();
    // Revoke.
    const revokeResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents/${encodeURIComponent(consent.consentId)}/revoke`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(revokeResp.status, 200);
    // MFI fetch after revoke fails.
    const mfiResp = await fetch(
      `${baseUrl}/api/income-verification/${encodeURIComponent(consent.consentId)}`
    );
    assert.equal(mfiResp.status, 410);
    const body = await mfiResp.json();
    assert.equal(body.error.code, 'consent_revoked');
  });
});

test('POST revoke is 404 when issuer mismatch (no ownership leak)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const alice = createIdentity({ displayName: 'A' });
    const bob = createIdentity({ displayName: 'B' });
    await store.saveIdentity(alice);
    await store.saveIdentity(bob);
    const consentResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(alice.id)}/income-verification/consents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mfiName: 'L',
          purpose: 'P',
          financialYear: '2025-26'
        })
      }
    );
    const { consent } = await consentResp.json();
    // Bob tries to revoke alice's consent.
    const resp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(bob.id)}/income-verification/consents/${encodeURIComponent(consent.consentId)}/revoke`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
    );
    assert.equal(resp.status, 404);
  });
});

test('GET consents lists the worker\'s issued consents', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'W' });
    await store.saveIdentity(identity);
    for (let i = 0; i < 3; i += 1) {
      await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mfiName: `MFI-${i}`,
            purpose: 'Loan',
            financialYear: '2025-26'
          })
        }
      );
    }
    const listResp = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/income-verification/consents`
    );
    assert.equal(listResp.status, 200);
    const body = await listResp.json();
    assert.equal(body.consents.length, 3);
  });
});

test('GET income-verification/:consentId 404s for unknown consentId', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const resp = await fetch(`${baseUrl}/api/income-verification/bos:nonexistent`);
    assert.equal(resp.status, 404);
  });
});
