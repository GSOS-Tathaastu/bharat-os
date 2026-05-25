// Phase 5.5 — online snapshot + retention tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  applyRetention,
  backupTimestamp,
  ensureBackupDir,
  listSnapshots,
  snapshotPath
} from '../../src/phase0/backup.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'backup-tests');

async function freshSqliteStore(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

async function freshFileStore(name) {
  const root = path.join(tmpRoot, `file-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

// ─── snapshotPath ─────────────────────────────────────────────────────

test('snapshotPath derives a timestamped path under <rootPath>/backups/', () => {
  const at = new Date('2026-05-25T10:30:00.000Z');
  const out = snapshotPath({ rootPath: '/data', kind: 'sqlite', at });
  assert.equal(out.backupDir, path.join('/data', 'backups'));
  assert.equal(out.filename, 'bos-store-2026-05-25T10-30-00-000.sqlite');
  assert.equal(
    out.fullPath,
    path.join('/data', 'backups', 'bos-store-2026-05-25T10-30-00-000.sqlite')
  );
});

test('snapshotPath uses .dir suffix for file-store snapshots', () => {
  const out = snapshotPath({ rootPath: '/data', kind: 'file' });
  assert.ok(out.filename.endsWith('.dir'));
});

test('snapshotPath rejects missing arguments', () => {
  assert.throws(() => snapshotPath({}), /rootPath is required/);
  assert.throws(() => snapshotPath({ rootPath: '/x' }), /kind is required/);
});

test('backupTimestamp is filesystem-safe (no colons or dots)', () => {
  const stamp = backupTimestamp(new Date('2026-05-25T10:30:00.123Z'));
  assert.ok(!stamp.includes(':'), 'should not contain colons');
  assert.ok(!stamp.includes('.'), 'should not contain dots');
  assert.match(stamp, /^2026-05-25T10-30-00-123$/);
});

// ─── SqliteStore.snapshotTo ──────────────────────────────────────────

test('SqliteStore.snapshotTo produces a valid copy that round-trips identities', async () => {
  const { root, store } = await freshSqliteStore('roundtrip');
  const id = createIdentity({ displayName: 'Snapshot subject' });
  await store.saveIdentity(id);

  const target = path.join(root, 'snap.sqlite');
  const report = await store.snapshotTo(target);
  assert.equal(report.kind, 'sqlite');
  assert.equal(report.targetPath, target);
  assert.ok(report.bytes > 0);

  // Open the snapshot as a fresh store and verify the identity
  // is intact.
  const restoredRoot = path.join(root, 'restored');
  await fs.mkdir(restoredRoot, { recursive: true });
  await fs.cp(target, path.join(restoredRoot, 'bos.db'));
  const restored = new SqliteStore(restoredRoot);
  await restored.init();
  const read = await restored.readIdentity(id.id);
  assert.equal(read.id, id.id);
  assert.equal(read.displayName, 'Snapshot subject');
  restored.close();
  store.close();
});

test('SqliteStore.snapshotTo refuses to overwrite an existing file', async () => {
  const { root, store } = await freshSqliteStore('refuse-overwrite');
  const target = path.join(root, 'snap.sqlite');
  await store.snapshotTo(target);
  await assert.rejects(
    () => store.snapshotTo(target),
    /snapshot target already exists/
  );
  store.close();
});

test('SqliteStore.snapshotTo creates missing parent directories', async () => {
  const { root, store } = await freshSqliteStore('mkdir-parent');
  const target = path.join(root, 'nested', 'deep', 'snap.sqlite');
  await store.snapshotTo(target);
  const stats = await fs.stat(target);
  assert.ok(stats.isFile());
  store.close();
});

// ─── BosStore.snapshotTo ──────────────────────────────────────────────

test('BosStore.snapshotTo recursively copies the data directory', async () => {
  const { root, store } = await freshFileStore('cp-recursive');
  const id = createIdentity({ displayName: 'File subject' });
  await store.saveIdentity(id);

  const target = path.join(tmpRoot, `file-snap-${Date.now()}.dir`);
  const report = await store.snapshotTo(target);
  assert.equal(report.kind, 'file');
  assert.equal(report.targetPath, target);

  // Verify the snapshot is a working store.
  const restored = new BosStore(target);
  await restored.init();
  const read = await restored.readIdentity(id.id);
  assert.equal(read.displayName, 'File subject');
});

test('BosStore.snapshotTo refuses to overwrite an existing target', async () => {
  const { store } = await freshFileStore('refuse-overwrite');
  const target = path.join(tmpRoot, `file-snap-${Date.now()}-${process.pid}.dir`);
  await store.snapshotTo(target);
  await assert.rejects(
    () => store.snapshotTo(target),
    /snapshot target already exists/
  );
});

// ─── listSnapshots + applyRetention ──────────────────────────────────

test('listSnapshots returns [] when the backup dir does not exist', async () => {
  const result = await listSnapshots(path.join(tmpRoot, 'never-created'));
  assert.deepEqual(result, []);
});

test('listSnapshots returns newest-first metadata', async () => {
  const dir = path.join(tmpRoot, `list-${Date.now()}-${process.pid}`);
  await ensureBackupDir(dir);
  // Create three snapshot stubs with deterministic mtimes.
  const names = [
    'bos-store-2026-05-23T10-00-00-000.sqlite',
    'bos-store-2026-05-24T10-00-00-000.sqlite',
    'bos-store-2026-05-25T10-00-00-000.sqlite'
  ];
  for (let i = 0; i < names.length; i += 1) {
    const fullPath = path.join(dir, names[i]);
    await fs.writeFile(fullPath, `payload-${i}`);
    const when = new Date(Date.parse(`2026-05-${23 + i}T10:00:00.000Z`));
    await fs.utimes(fullPath, when, when);
  }
  const result = await listSnapshots(dir);
  assert.equal(result.length, 3);
  // Newest first.
  assert.equal(result[0].name, names[2]);
  assert.equal(result[1].name, names[1]);
  assert.equal(result[2].name, names[0]);
  // Metadata shape.
  assert.equal(result[0].kind, 'sqlite');
  assert.ok(result[0].bytes > 0);
  assert.ok(result[0].createdAt);
});

test('listSnapshots ignores files that do not match the bos-store- prefix', async () => {
  const dir = path.join(tmpRoot, `filter-${Date.now()}-${process.pid}`);
  await ensureBackupDir(dir);
  await fs.writeFile(path.join(dir, 'random-noise.txt'), 'x');
  await fs.writeFile(
    path.join(dir, 'bos-store-2026-05-25T10-00-00-000.sqlite'),
    'snap'
  );
  const result = await listSnapshots(dir);
  assert.equal(result.length, 1);
  assert.equal(
    result[0].name,
    'bos-store-2026-05-25T10-00-00-000.sqlite'
  );
});

test('applyRetention keeps the most recent N and deletes the rest', async () => {
  const dir = path.join(tmpRoot, `retention-${Date.now()}-${process.pid}`);
  await ensureBackupDir(dir);
  for (let i = 0; i < 5; i += 1) {
    const day = String(20 + i).padStart(2, '0');
    const fullPath = path.join(dir, `bos-store-2026-05-${day}T10-00-00-000.sqlite`);
    await fs.writeFile(fullPath, `payload-${i}`);
    const when = new Date(Date.parse(`2026-05-${day}T10:00:00.000Z`));
    await fs.utimes(fullPath, when, when);
  }
  const removed = await applyRetention(dir, { keep: 2 });
  assert.equal(removed.length, 3);
  const remaining = await listSnapshots(dir);
  assert.equal(remaining.length, 2);
  // Newest two should remain.
  assert.match(remaining[0].name, /2026-05-24/);
  assert.match(remaining[1].name, /2026-05-23/);
});

test('applyRetention rejects bad keep values', async () => {
  const dir = path.join(tmpRoot, `bad-${Date.now()}-${process.pid}`);
  await ensureBackupDir(dir);
  await assert.rejects(
    () => applyRetention(dir, { keep: 0 }),
    /keep must be a positive integer/
  );
  await assert.rejects(
    () => applyRetention(dir, { keep: -1 }),
    /keep must be a positive integer/
  );
});

test('applyRetention is a no-op when count <= keep', async () => {
  const dir = path.join(tmpRoot, `noop-${Date.now()}-${process.pid}`);
  await ensureBackupDir(dir);
  await fs.writeFile(
    path.join(dir, 'bos-store-2026-05-25T10-00-00-000.sqlite'),
    'snap'
  );
  const removed = await applyRetention(dir, { keep: 7 });
  assert.equal(removed.length, 0);
  const remaining = await listSnapshots(dir);
  assert.equal(remaining.length, 1);
});
