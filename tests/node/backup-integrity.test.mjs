// Phase 5.6 — snapshot integrity verification + backup-age metric tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  backupFreshnessSnapshot,
  recordBackupFreshness,
  renderMetrics,
  resetMetrics
} from '../../src/phase0/metrics.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'integrity-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

async function freshFile(name) {
  const root = path.join(tmpRoot, `file-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

// ─── SqliteStore.verifyIntegrity ──────────────────────────────────────

test('SqliteStore.verifyIntegrity returns ok on a healthy live db', async () => {
  const { store } = await freshSqlite('live-healthy');
  await store.saveIdentity(createIdentity({ displayName: 'Healthy' }));
  const result = await store.verifyIntegrity();
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, ['ok']);
  store.close();
});

test('SqliteStore.verifyIntegrity returns ok on a freshly-snapshotted db', async () => {
  const { root, store } = await freshSqlite('snap-healthy');
  await store.saveIdentity(createIdentity({ displayName: 'Snap subject' }));
  const target = path.join(root, 'snap.sqlite');
  await store.snapshotTo(target);
  const result = await store.verifyIntegrity(target);
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, ['ok']);
  store.close();
});

test('SqliteStore.verifyIntegrity flags a corrupt snapshot', async () => {
  const { root, store } = await freshSqlite('corrupt');
  await store.saveIdentity(createIdentity({ displayName: 'C' }));
  const target = path.join(root, 'corrupt.sqlite');
  await store.snapshotTo(target);
  // Corrupt several b-tree page boundaries by writing 0xff bursts
  // at every 4 KiB page header. Single-region corruption can land
  // in an unused page that PRAGMA integrity_check legitimately
  // skips; spraying across page headers guarantees we hit pages
  // SQLite actually validates.
  const stats = await fs.stat(target);
  const fh = await fs.open(target, 'r+');
  try {
    const burst = Buffer.alloc(64, 0xff);
    // Skip page 0 (db header) to keep the file recognisable as
    // SQLite; corrupt every subsequent 4 KiB page header.
    for (let offset = 4096; offset < stats.size; offset += 4096) {
      await fh.write(burst, 0, burst.length, offset);
    }
  } finally {
    await fh.close();
  }
  const result = await store.verifyIntegrity(target);
  assert.equal(result.ok, false, `expected integrity failure, got ${JSON.stringify(result.messages)}`);
  assert.ok(result.messages.length >= 1);
  store.close();
});

// ─── BosStore.verifyIntegrity ─────────────────────────────────────────

test('BosStore.verifyIntegrity returns ok for a healthy data dir', async () => {
  const { root, store } = await freshFile('healthy');
  await store.saveIdentity(createIdentity({ displayName: 'F' }));
  const result = await store.verifyIntegrity(root);
  assert.equal(result.ok, true);
});

test('BosStore.verifyIntegrity flags a missing identities/ subdir', async () => {
  const broken = path.join(tmpRoot, `file-broken-${Date.now()}-${process.pid}`);
  await fs.rm(broken, { recursive: true, force: true });
  await fs.mkdir(broken, { recursive: true });
  // No identities/ subdir.
  const store = new BosStore(broken);
  const result = await store.verifyIntegrity(broken);
  assert.equal(result.ok, false);
  assert.match(result.messages.join('\n'), /identities\/ subdir missing/);
});

test('BosStore.verifyIntegrity flags a non-existent root', async () => {
  const store = new BosStore('/this/path/does/not/exist');
  const result = await store.verifyIntegrity('/this/path/does/not/exist');
  assert.equal(result.ok, false);
  assert.match(result.messages.join('\n'), /not readable/);
});

// ─── Backup freshness metric ─────────────────────────────────────────

test('recordBackupFreshness updates the snapshot state', () => {
  resetMetrics();
  recordBackupFreshness({
    createdAt: '2026-05-25T12:00:00.000Z',
    bytes: 1048576,
    kind: 'sqlite'
  });
  const snap = backupFreshnessSnapshot();
  assert.equal(snap.latestBackupAt, Date.parse('2026-05-25T12:00:00.000Z'));
  assert.equal(snap.latestBackupBytes, 1048576);
  assert.equal(snap.latestBackupKind, 'sqlite');
});

test('recordBackupFreshness({ createdAt: null }) clears state', () => {
  resetMetrics();
  recordBackupFreshness({ createdAt: '2026-05-25T12:00:00.000Z', bytes: 1024 });
  recordBackupFreshness({ createdAt: null });
  const snap = backupFreshnessSnapshot();
  assert.equal(snap.latestBackupAt, null);
  assert.equal(snap.latestBackupBytes, null);
});

test('renderMetrics emits backup gauges with NaN age when no snapshot', () => {
  resetMetrics();
  const text = renderMetrics();
  assert.match(text, /# HELP bos_backup_latest_timestamp_seconds/);
  assert.match(text, /# TYPE bos_backup_latest_timestamp_seconds gauge/);
  assert.match(text, /bos_backup_latest_timestamp_seconds 0/);
  assert.match(text, /bos_backup_latest_age_seconds NaN/);
  assert.match(text, /bos_backup_latest_bytes 0/);
});

test('renderMetrics emits real age when a snapshot is recorded', () => {
  resetMetrics();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  recordBackupFreshness({
    createdAt: tenMinutesAgo,
    bytes: 1024,
    kind: 'sqlite'
  });
  const text = renderMetrics();
  const ageMatch = text.match(/bos_backup_latest_age_seconds (\d+)/);
  assert.ok(ageMatch, 'expected an integer age value');
  const ageSec = Number(ageMatch[1]);
  // Should be ~600 seconds, within a small margin.
  assert.ok(ageSec >= 595 && ageSec <= 610, `age outside expected range: ${ageSec}`);
  assert.match(text, /bos_backup_latest_bytes 1024/);
});

test('renderMetrics rejects bad createdAt input silently', () => {
  resetMetrics();
  recordBackupFreshness({ createdAt: 'not-a-date', bytes: 1024 });
  const snap = backupFreshnessSnapshot();
  // State unchanged because the value was invalid.
  assert.equal(snap.latestBackupAt, null);
});
