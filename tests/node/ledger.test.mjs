import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createConsent, evaluateDecision } from '../../src/phase1/policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');
const cliPath = path.join(repoRoot, 'bin', 'bos.mjs');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('store exposes newest-first ledger events with type filtering', async () => {
  const { store } = await freshStore('ledger-store');
  const identity = createIdentity({ displayName: 'Ledger actor' });
  await store.saveIdentity(identity);
  const consent = createConsent({
    subjectId: identity.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['mesh.store'],
    purpose: 'Ledger consent'
  });
  await store.saveConsent(consent);
  const decision = evaluateDecision(
    {
      actorId: identity.id,
      actionType: 'mesh_storage',
      scopes: ['mesh.store'],
      regulated: false,
      piiHandling: 'none'
    },
    [consent]
  );
  await store.saveDecision(decision);

  const events = await store.listLedger({ limit: 3 });
  assert.deepEqual(events.map((event) => event.type), [
    'decision.saved',
    'consent.saved',
    'identity.saved'
  ]);

  const consentEvents = await store.listLedger({ type: 'consent.saved' });
  assert.equal(consentEvents.length, 1);
  assert.equal(consentEvents[0].consentId, consent.consentId);
});

test('CLI lists audit ledger events', async () => {
  const { root, store } = await freshStore('ledger-cli');
  const identity = createIdentity({ displayName: 'Ledger CLI actor' });
  await store.saveIdentity(identity);

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'ledger',
      'list',
      '--limit',
      '1',
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].type, 'identity.saved');
});
