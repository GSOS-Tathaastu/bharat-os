// Backup orchestration helpers — Phase 5.5.
//
// Pure functions over the filesystem that wrap two operations:
//
//   • `snapshotPath(rootPath, { at })` — derives the timestamped
//     snapshot filename inside `<rootPath>/backups/`.
//   • `applyRetention(backupDir, { keep })` — deletes the oldest
//     snapshots in a backup directory, keeping the N most recent.
//   • `listSnapshots(backupDir)` — returns metadata (name, bytes,
//     createdAt) sorted newest-first.
//
// These are split out of the CLI + the admin endpoint so both
// surfaces share one canonical implementation.

import fs from 'node:fs/promises';
import path from 'node:path';

export const BACKUP_PROTOCOL_VERSION = 'bos.phase0.backup.v0';

// SQLite snapshots are single files; file-store snapshots are
// directories. We expose two file-extension conventions so the
// admin endpoint can tell them apart at a glance.
const SQLITE_SUFFIX = '.sqlite';
const FILE_SUFFIX = '.dir';

export function backupTimestamp(at = new Date()) {
  const iso = at.toISOString().replace(/[:.]/g, '-').replace('Z', '');
  return iso;
}

export function snapshotPath({ rootPath, kind, at = new Date() } = {}) {
  if (!rootPath) throw new Error('rootPath is required.');
  if (!kind) throw new Error('kind is required (sqlite | file).');
  const suffix = kind === 'sqlite' ? SQLITE_SUFFIX : FILE_SUFFIX;
  const stamp = backupTimestamp(at);
  return {
    backupDir: path.join(rootPath, 'backups'),
    filename: `bos-store-${stamp}${suffix}`,
    fullPath: path.join(rootPath, 'backups', `bos-store-${stamp}${suffix}`)
  };
}

export async function ensureBackupDir(backupDir) {
  await fs.mkdir(backupDir, { recursive: true });
}

export async function listSnapshots(backupDir) {
  let entries;
  try {
    entries = await fs.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.name.startsWith('bos-store-')) continue;
    const fullPath = path.join(backupDir, entry.name);
    try {
      const stats = await fs.stat(fullPath);
      records.push({
        name: entry.name,
        kind: entry.name.endsWith(SQLITE_SUFFIX) ? 'sqlite' : 'file',
        bytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        fullPath
      });
    } catch (_error) {
      // Skip files that disappeared between readdir + stat.
    }
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return records;
}

// Delete snapshots beyond the most-recent `keep`. Returns the list
// of removed entries so the CLI can log them.
export async function applyRetention(backupDir, { keep = 7 } = {}) {
  if (!Number.isFinite(keep) || keep < 1) {
    throw new Error('keep must be a positive integer.');
  }
  const snapshots = await listSnapshots(backupDir);
  const removed = [];
  for (const snap of snapshots.slice(keep)) {
    try {
      // Directory snapshots from the file store + single-file
      // snapshots from sqlite both removed via rm recursive.
      await fs.rm(snap.fullPath, { recursive: true, force: true });
      removed.push(snap);
    } catch (_error) {
      // Best-effort — log but don't bail; the snapshot is the
      // critical artifact, retention is housekeeping.
    }
  }
  return removed;
}
