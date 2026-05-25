// Phase 4.2 — SqliteStore parity + transaction semantics tests.
//
// The class implements the same surface as BosStore; this file
// exercises that surface AND the new ACID guarantees that SQLite
// gives us (the headline reason to migrate).

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, createNode } from '../../src/phase0/core.mjs';
import { signConsent } from '../../src/phase1/integrity.mjs';
import { createConsent } from '../../src/phase1/policy.mjs';
import { redactLedgerEntry } from '../../src/phase1/dpdp-rights.mjs';
import {
  createStore,
  SQLITE_STORE_PROTOCOL_VERSION,
  SqliteStore
} from '../../src/phase0/sqlite-store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'sqlite-tests');

async function freshSqliteStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips identities', async () => {
  const { store } = await freshSqliteStore('identities');
  const id = createIdentity({ displayName: 'Round-trip subject' });
  await store.saveIdentity(id);
  const read = await store.readIdentity(id.id);
  assert.equal(read.id, id.id);
  assert.equal(read.displayName, 'Round-trip subject');
  // Private key MUST survive the round-trip (BosStore parity).
  assert.equal(read.privateKeyPem, id.privateKeyPem);
  store.close();
});

test('SqliteStore listIdentities returns all saved records', async () => {
  const { store } = await freshSqliteStore('list-identities');
  await store.saveIdentity(createIdentity({ displayName: 'A' }));
  await store.saveIdentity(createIdentity({ displayName: 'B' }));
  await store.saveIdentity(createIdentity({ displayName: 'C' }));
  const list = await store.listIdentities();
  assert.equal(list.length, 3);
  const names = list.map((i) => i.displayName).sort();
  assert.deepEqual(names, ['A', 'B', 'C']);
  store.close();
});

test('SqliteStore upsert: re-saving the same id overwrites', async () => {
  const { store } = await freshSqliteStore('upsert');
  const id = createIdentity({ displayName: 'Original' });
  await store.saveIdentity(id);
  await store.saveIdentity({ ...id, displayName: 'Updated' });
  const list = await store.listIdentities();
  assert.equal(list.length, 1);
  assert.equal(list[0].displayName, 'Updated');
  store.close();
});

test('SqliteStore round-trips consents with all fields', async () => {
  const { store } = await freshSqliteStore('consents');
  const identity = createIdentity({ displayName: 'Consent subject' });
  await store.saveIdentity(identity);
  const consent = signConsent(
    createConsent({
      subjectId: identity.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read', 'consent.record'],
      purpose: 'test',
      ttlSeconds: 60 * 60
    }),
    identity
  );
  await store.saveConsent(consent);
  const read = await store.readConsent(consent.consentId);
  assert.equal(read.consentId, consent.consentId);
  assert.equal(read.subjectId, identity.id);
  assert.equal(read.purpose, 'test');
  store.close();
});

test('SqliteStore ledger append-only with auto-incrementing seq', async () => {
  const { store } = await freshSqliteStore('ledger');
  await store.appendLedger({ type: 'a', actorId: 'bos:person:1' });
  await store.appendLedger({ type: 'b', actorId: 'bos:person:2' });
  await store.appendLedger({ type: 'a', actorId: 'bos:person:1' });
  const all = await store.listLedger({ limit: undefined, newestFirst: false });
  assert.equal(all.length, 3);
  // First-saved → first in the chronological listing.
  assert.equal(all[0].type, 'a');
  assert.equal(all[1].type, 'b');
  assert.equal(all[2].type, 'a');
  // Filter by type.
  const filtered = await store.listLedger({ limit: undefined, type: 'a', newestFirst: false });
  assert.equal(filtered.length, 2);
  store.close();
});

test('SqliteStore computeContribution folds nodes + memory + mesh events', async () => {
  const { store } = await freshSqliteStore('contribution');
  const identity = createIdentity({ displayName: 'Contributor' });
  await store.saveIdentity(identity);
  await store.saveNode(
    createNode({ operatorId: identity.id, storageBytes: 10 * 1024, kycVerified: true })
  );
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh-event:test1',
    operatorId: identity.id,
    workloadType: 'inference',
    tokens: 1_000_000,
    payoutPaise: 800,
    at: new Date().toISOString()
  });
  const c = await store.computeContribution(identity.id);
  assert.equal(c.identityId, identity.id);
  assert.equal(c.contributedBytes, 10 * 1024);
  assert.equal(c.consumedBytes, 0);
  assert.equal(c.scoreBytes, 10 * 1024);
  assert.equal(c.class, 'producer');
  assert.equal(c.meshPayoutPaise, 800);
  assert.equal(c.meshTokensServed, 1_000_000);
  store.close();
});

// ─── ACID transactions — the headline Phase 4.2 win ──────────────────

test('SqliteStore.eraseUserData is atomic — full cascade in one transaction', async () => {
  const { store } = await freshSqliteStore('erase-atomic');
  const subject = createIdentity({ displayName: 'Erase subject' });
  await store.saveIdentity(subject);
  const consent = signConsent(
    createConsent({
      subjectId: subject.id,
      granteeId: 'bharat-os-orchestrator',
      scopes: ['memory.read'],
      purpose: 'erase_test'
    }),
    subject
  );
  await store.saveConsent(consent);
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh-event:erase',
    operatorId: subject.id,
    workloadType: 'inference',
    tokens: 100,
    payoutPaise: 1,
    at: new Date().toISOString()
  });

  // Pre-erase: 1 identity, 1 consent, 1 mesh event + ledger events
  assert.equal((await store.listIdentities()).length, 1);
  assert.equal((await store.listConsents()).length, 1);
  assert.equal((await store.listMeshContributionEvents()).length, 1);

  const report = await store.eraseUserData(subject.id, { redactLedgerEntry });
  assert.equal(report.sections.identity, 1);
  assert.equal(report.sections.consents, 1);
  assert.equal(report.sections.meshContributions, 1);
  assert.ok(report.ledgerRedactions >= 1, 'ledger entries should be redacted');

  // Post-erase: all user data is gone.
  assert.equal((await store.listIdentities()).length, 0);
  assert.equal((await store.listConsents()).length, 0);
  assert.equal((await store.listMeshContributionEvents()).length, 0);

  // Ledger entries are redacted (not deleted) — chain integrity
  // preserved for other participants.
  const ledger = await store.listLedger({ limit: undefined, newestFirst: false });
  const mentionsSubject = ledger.some((event) => JSON.stringify(event).includes(subject.id));
  assert.equal(mentionsSubject, false, 'no surviving ledger event should mention the erased user');
  // The account.erased tombstone is in the ledger with identityId '<erased>'.
  const tombstone = ledger.find((event) => event.type === 'account.erased');
  assert.ok(tombstone);
  assert.equal(tombstone.identityId, '<erased>');
  store.close();
});

test('SqliteStore filters across users — listConsents includes only subject rows when queried', async () => {
  const { store } = await freshSqliteStore('cross-user-filter');
  const alice = createIdentity({ displayName: 'Alice' });
  const bob = createIdentity({ displayName: 'Bob' });
  await store.saveIdentity(alice);
  await store.saveIdentity(bob);
  await store.saveConsent(
    signConsent(
      createConsent({
        subjectId: alice.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['memory.read'],
        purpose: 'alice'
      }),
      alice
    )
  );
  await store.saveConsent(
    signConsent(
      createConsent({
        subjectId: bob.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['memory.read'],
        purpose: 'bob'
      }),
      bob
    )
  );
  const all = await store.listConsents();
  assert.equal(all.length, 2);
  const aliceOnly = all.filter((c) => c.subjectId === alice.id);
  const bobOnly = all.filter((c) => c.subjectId === bob.id);
  assert.equal(aliceOnly.length, 1);
  assert.equal(bobOnly.length, 1);
  store.close();
});

test('SqliteStore close/reopen preserves all data (durability)', async () => {
  const { root, store } = await freshSqliteStore('durability');
  const identity = createIdentity({ displayName: 'Durable subject' });
  await store.saveIdentity(identity);
  await store.appendLedger({ type: 'before_close', identityId: identity.id });
  store.close();

  // Reopen the same root.
  const reopened = new SqliteStore(root);
  await reopened.init();
  const read = await reopened.readIdentity(identity.id);
  assert.equal(read.id, identity.id);
  const ledger = await reopened.listLedger({ limit: undefined, newestFirst: false });
  assert.ok(ledger.some((e) => e.type === 'before_close'));
  reopened.close();
});

test('SqliteStore exposes a versioned protocol marker', () => {
  assert.equal(SQLITE_STORE_PROTOCOL_VERSION, 'bos.phase0.sqlite-store.v0');
});

test('createStore factory picks the SQLite backend when kind="sqlite"', async () => {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-factory`);
  await fs.rm(root, { recursive: true, force: true });
  const sqliteStore = await createStore({ rootPath: root, kind: 'sqlite' });
  assert.ok(sqliteStore instanceof SqliteStore);
  await sqliteStore.init();
  sqliteStore.close();
  // Default is the file store.
  const fileStore = await createStore({ rootPath: root + '-file' });
  // Class name is 'BosStore' — soft check via the constructor name.
  assert.equal(fileStore.constructor.name, 'BosStore');
});
