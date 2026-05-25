#!/usr/bin/env node
// Migrate from the file-based BosStore to SqliteStore — Phase 4.2.
//
// Usage:
//   node scripts/migrate-store.mjs --source .bharat-os --target .bharat-os-sqlite
//
// The migration is idempotent: re-running it against the same
// target overwrites existing rows (upsert semantics). The source
// directory is NOT deleted — confirm the new SQLite store works
// against your traffic before removing the file store.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { BosStore } from '../src/phase0/store.mjs';
import { SqliteStore } from '../src/phase0/sqlite-store.mjs';

function parseArgs() {
  const args = { source: '.bharat-os', target: null };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--source' || arg === '-s') {
      args.source = process.argv[i + 1];
      i += 1;
    } else if (arg === '--target' || arg === '-t') {
      args.target = process.argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/migrate-store.mjs --source <file-store-dir> --target <sqlite-store-dir>'
      );
      process.exit(0);
    }
  }
  if (!args.target) {
    console.error('Missing --target. Use --help for usage.');
    process.exit(1);
  }
  return args;
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

const { source, target } = parseArgs();
const sourcePath = path.resolve(source);
const targetPath = path.resolve(target);

log(`Source (file)   : ${sourcePath}`);
log(`Target (sqlite) : ${targetPath}`);

const sourceStore = new BosStore(sourcePath);
const targetStore = new SqliteStore(targetPath);
await sourceStore.init();
await targetStore.init();

let totalRecords = 0;
let totalLedgerEvents = 0;

// Helper: list → save with progress per section.
async function migrate(section, listFn, saveFn) {
  const records = await listFn().catch(() => []);
  for (const record of records) {
    try {
      await saveFn(record);
      totalRecords += 1;
    } catch (error) {
      log(`  ! ${section} failed for one record: ${error.message}`);
    }
  }
  log(`  • ${section}: ${records.length} records`);
}

log('\nMigrating…');

await migrate('identities', () => sourceStore.listIdentities(), (r) => targetStore.saveIdentity(r));
await migrate('nodes', () => sourceStore.listNodes(), (r) => targetStore.saveNode(r));
await migrate('consents', () => sourceStore.listConsents(), (r) => targetStore.saveConsent(r));
await migrate('decisions', () => sourceStore.listDecisions(), (r) => targetStore.saveDecision(r));
await migrate(
  'tool_executions',
  () => sourceStore.listToolExecutions(),
  (r) => targetStore.saveToolExecution(r)
);
await migrate(
  'orchestrations',
  () => sourceStore.listOrchestrations(),
  (r) => targetStore.saveOrchestration(r)
);
await migrate(
  'skill_preflights',
  () => sourceStore.listSkillPreflights(),
  (r) => targetStore.saveSkillPreflight(r)
);
await migrate(
  'memory_records',
  () => sourceStore.listMemoryRecords(),
  (r) => targetStore.saveMemoryRecord(r)
);
await migrate(
  'worker_authorizations',
  () => sourceStore.listWorkerAuthorizations(),
  (r) => targetStore.saveWorkerAuthorization(r)
);
await migrate(
  'flag_reports',
  () => sourceStore.listFlagReports(),
  (r) => targetStore.saveFlagReport(r)
);
await migrate(
  'mesh_contributions',
  () => sourceStore.listMeshContributionEvents(),
  (r) => targetStore.saveMeshContributionEvent(r)
);
await migrate(
  'pairing_sessions',
  () => sourceStore.listPairingSessions(),
  (r) => targetStore.savePairingSession(r)
);
await migrate(
  'health_documents',
  () => sourceStore.listHealthDocumentCaptures(),
  (r) => targetStore.saveHealthDocumentCapture(r)
);
await migrate(
  'profile_credentials',
  () => sourceStore.listProfileCredentials(),
  (r) => targetStore.saveProfileCredential(r)
);
await migrate(
  'push_subscriptions',
  () => sourceStore.listPushSubscriptions(),
  (r) => targetStore.savePushSubscription(r)
);
await migrate(
  'worker_notifications',
  () => sourceStore.listWorkerNotifications(),
  (r) => targetStore.saveWorkerNotification(r)
);
await migrate(
  'federated_rounds',
  () => sourceStore.listFederatedRounds(),
  (r) => targetStore.saveFederatedRound(r)
);
await migrate(
  'federated_updates',
  () => sourceStore.listFederatedUpdates(),
  (r) => targetStore.saveFederatedUpdate(r)
);
await migrate(
  'attestations',
  () => sourceStore.listAttestations(),
  (r) => targetStore.saveAttestation(r)
);

// Ledger — replay in chronological order so seq IDs stay coherent.
log('\nReplaying ledger (preserves chronological order)…');
const ledger = await sourceStore.listLedger({ limit: undefined, newestFirst: false });
for (const event of ledger) {
  try {
    await targetStore.appendLedger(event);
    totalLedgerEvents += 1;
  } catch (error) {
    log(`  ! ledger event failed: ${error.message}`);
  }
}
log(`  • ledger events: ${totalLedgerEvents}`);

targetStore.close();

log(`\nMigration complete. ${totalRecords} records + ${totalLedgerEvents} ledger events.`);
log(`Start the API with the SQLite backend:`);
log(`  BHARAT_OS_STORE_KIND=sqlite node bin/bos-api.mjs --store ${targetPath}`);
log(`\nThe source directory at ${sourcePath} is unchanged — confirm`);
log(`the SQLite store works against your traffic before removing it.`);
