#!/usr/bin/env node
// Restore the store from a snapshot — Phase 5.6.
//
// Usage:
//   node scripts/restore-store.mjs --root .bharat-os --kind sqlite --from .bharat-os/backups/bos-store-<ts>.sqlite
//
// SAFETY: this overwrites the live database. The caller MUST stop
// the API process first (the SQLite handle holds a write lock; an
// atomic swap is impossible while the API is up).
//
// Procedure:
//   1. Validate the snapshot via `store.verifyIntegrity(snapshot)`.
//   2. Move the live db aside to `<root>/bos.db.pre-restore-<ts>`.
//   3. Copy the snapshot in.
//   4. Open the restored db and re-run `verifyIntegrity()` on the
//      live path — proof the swap landed.
//
// The pre-restore copy is preserved (NOT deleted) so the operator
// has a manual rollback if the restore turns out to be corrupt.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { BosStore } from '../src/phase0/store.mjs';
import { SqliteStore } from '../src/phase0/sqlite-store.mjs';

function parseArgs() {
  const args = {
    root: process.env.BHARAT_OS_DATA_ROOT ?? '.bharat-os',
    kind: process.env.BHARAT_OS_STORE_KIND ?? 'sqlite',
    from: null,
    force: false
  };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--root' || arg === '-r') {
      args.root = process.argv[i + 1];
      i += 1;
    } else if (arg === '--kind' || arg === '-k') {
      args.kind = process.argv[i + 1];
      i += 1;
    } else if (arg === '--from' || arg === '-f') {
      args.from = process.argv[i + 1];
      i += 1;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/restore-store.mjs --root <data-dir> --kind sqlite|file --from <snapshot-path> [--force]'
      );
      console.log('');
      console.log('SAFETY: stop the API process before restoring.');
      process.exit(0);
    }
  }
  if (!args.from) {
    console.error('Missing --from <snapshot-path>. Use --help for usage.');
    process.exit(1);
  }
  if (!['sqlite', 'file'].includes(args.kind)) {
    console.error(`unknown --kind: ${args.kind}. Use 'sqlite' or 'file'.`);
    process.exit(1);
  }
  return args;
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

async function main() {
  const { root, kind, from, force } = parseArgs();
  const absRoot = path.resolve(root);
  const absSnapshot = path.resolve(from);

  log(`Target root  : ${absRoot}`);
  log(`Store kind   : ${kind}`);
  log(`Snapshot src : ${absSnapshot}`);

  if (!existsSync(absSnapshot)) {
    console.error(`Snapshot not found: ${absSnapshot}`);
    process.exit(1);
  }

  // Step 1: integrity-check the snapshot BEFORE touching the live db.
  // Open a temp store that points at the snapshot path so
  // verifyIntegrity can use its native check.
  log('Step 1: verifying snapshot integrity…');
  let tempStore;
  if (kind === 'sqlite') {
    // The SQLite verifyIntegrity accepts a targetPath, so we need
    // a temporary store handle to call it. Any rootPath works as
    // long as the function isn't actually touching it.
    tempStore = new SqliteStore(absRoot);
    await tempStore.init();
  } else {
    // For the file backend, verifyIntegrity needs the snapshot
    // directory as the target — the snapshot IS the root of a
    // store.
    tempStore = new BosStore(absSnapshot);
  }
  const integrity = await tempStore.verifyIntegrity(absSnapshot);
  if (!integrity.ok && !force) {
    console.error(`Snapshot failed integrity check:`);
    for (const msg of integrity.messages) console.error(`  - ${msg}`);
    console.error('Pass --force to restore anyway (NOT recommended).');
    if (tempStore.close) tempStore.close();
    process.exit(1);
  }
  if (integrity.ok) {
    log('  ✓ snapshot integrity ok');
  } else {
    log('  ✗ snapshot integrity failed BUT --force was passed; proceeding.');
  }
  if (tempStore.close) tempStore.close();

  // Step 2: move the live db / data dir aside.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (kind === 'sqlite') {
    const liveDb = path.join(absRoot, 'bos.db');
    const sideline = path.join(absRoot, `bos.db.pre-restore-${stamp}`);
    if (existsSync(liveDb)) {
      log(`Step 2: moving live db to ${sideline}`);
      await fs.rename(liveDb, sideline);
    } else {
      log('Step 2: no live db present; skipping sideline step.');
    }
    log(`Step 3: copying snapshot into ${liveDb}`);
    await fs.cp(absSnapshot, liveDb);
  } else {
    const sideline = path.join(path.dirname(absRoot), `${path.basename(absRoot)}.pre-restore-${stamp}`);
    if (existsSync(absRoot)) {
      log(`Step 2: moving live data dir to ${sideline}`);
      await fs.rename(absRoot, sideline);
    } else {
      log('Step 2: no live data dir present; skipping sideline step.');
    }
    log(`Step 3: copying snapshot into ${absRoot}`);
    await fs.cp(absSnapshot, absRoot, { recursive: true });
  }

  // Step 4: open the restored store and verify it.
  log('Step 4: verifying restored store…');
  const restored = kind === 'sqlite' ? new SqliteStore(absRoot) : new BosStore(absRoot);
  await restored.init();
  const postRestore = await restored.verifyIntegrity();
  if (restored.close) restored.close();
  if (!postRestore.ok) {
    console.error('Restored store failed post-swap integrity check:');
    for (const msg of postRestore.messages) console.error(`  - ${msg}`);
    console.error('Investigate manually. The pre-restore sideline is preserved.');
    process.exit(1);
  }
  log('  ✓ restored store integrity ok');
  log('');
  log('Restore complete. Start the API process. The pre-restore sideline');
  log('is preserved for rollback — delete it manually after confirming');
  log('the restored store is healthy under real traffic.');
}

main().catch((error) => {
  console.error(`restore failed: ${error?.message ?? error}`);
  if (error?.stack) console.error(error.stack);
  process.exit(1);
});
