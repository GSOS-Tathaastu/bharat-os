#!/usr/bin/env node
// Online SQLite + file-store snapshot — Phase 5.5.
//
// Usage:
//   node scripts/snapshot-store.mjs --root .bharat-os --kind sqlite [--keep 7]
//
// Writes a timestamped snapshot to `<root>/backups/bos-store-<ts>.sqlite`
// (or `.dir` for the file backend) and removes the oldest snapshots
// beyond the retention limit (default 7).
//
// Designed to be run on a cron / systemd-timer schedule. Exits 0 on
// success, 1 on failure — wire to a healthcheck for ops alerting.
//
// For continuous WAL-level replication to object storage, run a
// Litestream sidecar in addition to this script. The script is
// the universal lowest-common-denominator backup.

import path from 'node:path';
import process from 'node:process';
import { BosStore } from '../src/phase0/store.mjs';
import { SqliteStore } from '../src/phase0/sqlite-store.mjs';
import {
  applyRetention,
  ensureBackupDir,
  listSnapshots,
  snapshotPath
} from '../src/phase0/backup.mjs';

function parseArgs() {
  const args = {
    root: process.env.BHARAT_OS_DATA_ROOT ?? '.bharat-os',
    kind: process.env.BHARAT_OS_STORE_KIND ?? 'sqlite',
    keep: Number.parseInt(process.env.BHARAT_OS_BACKUP_RETENTION ?? '7', 10)
  };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--root' || arg === '-r') {
      args.root = process.argv[i + 1];
      i += 1;
    } else if (arg === '--kind' || arg === '-k') {
      args.kind = process.argv[i + 1];
      i += 1;
    } else if (arg === '--keep') {
      args.keep = Number.parseInt(process.argv[i + 1], 10);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/snapshot-store.mjs --root <data-dir> --kind sqlite|file [--keep <n>]'
      );
      process.exit(0);
    }
  }
  if (!['sqlite', 'file'].includes(args.kind)) {
    console.error(`unknown --kind: ${args.kind}. Use 'sqlite' or 'file'.`);
    process.exit(1);
  }
  if (!Number.isFinite(args.keep) || args.keep < 1) {
    console.error(`invalid --keep: ${args.keep}. Must be a positive integer.`);
    process.exit(1);
  }
  return args;
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function main() {
  const { root, kind, keep } = parseArgs();
  const absRoot = path.resolve(root);
  log(`Source root  : ${absRoot}`);
  log(`Store kind   : ${kind}`);
  log(`Retention    : keep last ${keep}`);

  const store = kind === 'sqlite' ? new SqliteStore(absRoot) : new BosStore(absRoot);
  await store.init();

  const { backupDir, fullPath: target } = snapshotPath({ rootPath: absRoot, kind });
  await ensureBackupDir(backupDir);
  log(`Backup dir   : ${backupDir}`);
  log(`Snapshot to  : ${target}`);

  const started = Date.now();
  const report = await store.snapshotTo(target);
  const durationMs = Date.now() - started;
  log(`✓ Snapshot complete: ${report.bytes} bytes in ${durationMs}ms`);

  // Phase 5.6 — integrity check on the snapshot before counting
  // it as successful. Catches a corrupt write at the source
  // BEFORE retention deletes the previously-good snapshot.
  const integrity = await store.verifyIntegrity(target);
  if (!integrity.ok) {
    log(`✗ Integrity check failed for ${target}:`);
    for (const msg of integrity.messages) {
      log(`    - ${msg}`);
    }
    log('  Removing corrupt snapshot. Retention will NOT delete prior snapshots.');
    try {
      const fsModule = await import('node:fs/promises');
      await fsModule.rm(target, { recursive: true, force: true });
    } catch (_error) {
      // best-effort
    }
    if (typeof store.close === 'function') store.close();
    process.exit(1);
  }
  log('✓ Integrity check passed.');

  const removed = await applyRetention(backupDir, { keep });
  for (const r of removed) {
    log(`  trimmed: ${r.name} (${r.bytes} bytes, ${r.createdAt})`);
  }

  const remaining = await listSnapshots(backupDir);
  log(`Snapshots retained: ${remaining.length}`);
  for (const snap of remaining) {
    log(`  - ${snap.name}  (${snap.bytes} B  ${snap.createdAt})`);
  }

  if (typeof store.close === 'function') {
    store.close();
  }
}

main().catch((error) => {
  console.error(`snapshot failed: ${error?.message ?? error}`);
  if (error?.stack) console.error(error.stack);
  process.exit(1);
});
