# ADR 0092: Phase 5.6 — Snapshot Integrity Verification + Restore CLI + Backup-Age Metric

## Status

Accepted

## Context

Phase 5.5 (ADR 0091) shipped the snapshot CLI + Litestream sidecar
config. Three future-work items were called out:

- **Snapshot integrity verification** — `VACUUM INTO` produces a
  file, but doesn't prove that file is restore-able. A corrupt
  write at the source ends up as a corrupt snapshot; retention
  then deletes the previously-good snapshot to keep `--keep N`,
  and a single bad cron run silently destroys the recovery
  story.
- **Restore CLI** — Phase 5.5 left restore as a manual `cp
  snap.sqlite /data/bos.db` documented in the runbook. Manual
  steps invite manual mistakes (skipping integrity check,
  forgetting to stop the API, overwriting without a sideline).
- **Snapshot rate metric** — Grafana scrapes `/metrics`, not
  `/api/admin/backup-status`. A scrape-only alerting setup needs
  the freshness data in `/metrics`.

Phase 5.6 ships all three.

## Decision

### `store.verifyIntegrity(targetPath?)` on both backends

New method symmetric with `store.snapshotTo(targetPath)`:

- **SqliteStore** — opens the target (or live db when omitted) as
  a SQLite handle and runs `PRAGMA integrity_check`. SQLite scans
  the b-tree structure, page allocations, and constraint
  invariants. Returns `{ ok: true, targetPath, messages: ['ok'] }`
  on success or `{ ok: false, ..., messages: [...] }` enumerating
  the problems.
- **BosStore** — performs a structural check: directory exists,
  `identities/` subdir exists. Deeper per-file JSON validity
  would be O(records); not justified for the file backend's
  dev/migration role.

Both expose the same return shape so callers don't need to know
which backend they're against.

### Snapshot CLI runs integrity check post-snapshot

`scripts/snapshot-store.mjs` now calls `store.verifyIntegrity(target)`
immediately after `snapshotTo`. On failure:

- Logs the per-message detail to stdout
- Removes the corrupt snapshot file
- **Skips retention** so the previously-good snapshots are
  preserved
- Exits 1 (cron healthcheck trips)

This closes the silent-corruption hole. A failing cron job is
visible without manual inspection — and even when ops misses the
log, the previous good snapshot stays untouched.

### Restore CLI — `scripts/restore-store.mjs`

Symmetric inverse of the snapshot CLI. Four-step procedure:

1. **Validate the snapshot.** Calls `store.verifyIntegrity(absSnapshot)`
   BEFORE touching the live db. Exits 1 on failure unless
   `--force` is passed.
2. **Sideline the live db / data dir.** Moves `bos.db` →
   `bos.db.pre-restore-<timestamp>` so the operator has a manual
   rollback target if anything goes wrong post-restore.
3. **Copy the snapshot in.** `fs.cp` for the sqlite case;
   `fs.cp recursive` for the file case.
4. **Verify the restored store.** Opens the restored db and
   re-runs `verifyIntegrity()` on the live path. Exits 1 if the
   post-swap check fails (the sideline is preserved so the
   operator can swap back).

The pre-restore sideline is intentionally NOT deleted. Manual
cleanup after a successful restore + healthy traffic is the
documented runbook step. This matches the "destructive operations
get a sideline" philosophy from Phase 4.x.

SAFETY caveat in the help text: the operator MUST stop the API
process first (SQLite write lock prevents atomic swap while the
API is up).

### Backup freshness Prometheus gauges

Three new gauges in `/metrics`:

```
# HELP bos_backup_latest_timestamp_seconds Unix epoch (seconds) of the most recent successful snapshot. 0 when no snapshot has been observed.
# TYPE bos_backup_latest_timestamp_seconds gauge
bos_backup_latest_timestamp_seconds 1779963600

# HELP bos_backup_latest_age_seconds Seconds since the most recent snapshot was created. NaN when no snapshot has been observed.
# TYPE bos_backup_latest_age_seconds gauge
bos_backup_latest_age_seconds 1234

# HELP bos_backup_latest_bytes Size in bytes of the most recent snapshot. 0 when no snapshot has been observed.
# TYPE bos_backup_latest_bytes gauge
bos_backup_latest_bytes 1048576
```

Refresh strategy:

- **`/metrics` reads the backup dir on every scrape** (one
  `readdir` + `stat` per scrape; ≤ 15-30s scrape interval is
  fine). This guarantees Grafana sees fresh values regardless of
  whether `/api/admin/backup-status` traffic exists.
- **`/api/admin/backup-status` also refreshes** the same gauges.
  Both surfaces stay in sync from one source of truth.

`NaN` age value when no snapshot is observed is the Prometheus
idiom — Grafana renders it as a gap, alerts trigger as
"no data" or with explicit `absent()` rules. Operators alert on
`bos_backup_latest_age_seconds > 90000` (no snapshot in >25h —
1h grace past a daily cron).

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Integrity check never reads user data | `PRAGMA integrity_check` operates on the b-tree structure; it does not return row content. The result is a list of structural error strings, never identity refs. |
| Restore CLI never logs user data | Status messages are file paths + counts + timestamps. The snapshot bytes flow through `fs.cp` without being parsed by the script. |
| Sideline preservation respects DPDP §12(3) | The pre-restore sideline IS user data — operators must treat it under the same retention rules as the primary db. ADR 0092 calls this out so it's not an honesty gap. |
| `/metrics` gauges are operational, not user data | File metadata (count, timestamp, size) only. No identity refs anywhere in the metric output. |

## Tests

`tests/node/backup-integrity.test.mjs` — 11 tests:

**`SqliteStore.verifyIntegrity`** (3 tests):
1. Returns `ok` on a healthy live db
2. Returns `ok` on a freshly-snapshotted db (snapshot-time
   consistency check)
3. Flags a corrupt snapshot — middle-of-file byte corruption
   detected by `PRAGMA integrity_check`

**`BosStore.verifyIntegrity`** (3 tests):
4. Returns `ok` for a healthy data dir
5. Flags a missing `identities/` subdir
6. Flags a non-existent root

**Backup freshness metric** (5 tests):
7. `recordBackupFreshness` updates state
8. `recordBackupFreshness({ createdAt: null })` clears state
9. `renderMetrics` emits NaN age when no snapshot observed
10. `renderMetrics` emits real age — exercises the Date.now()
    arithmetic path; verifies the ~10min synthetic offset
11. Bad `createdAt` input rejected silently

Full suite: **467 / 467 green** (was 456; +11 new). No SW change
(server-side only).

Live CLI smoke confirmed end-to-end:
- `snapshot-store.mjs` → 376KB sqlite snapshot in 68ms, integrity
  check passes inline
- `restore-store.mjs` validates the snapshot, sidelines the live
  db, copies in, post-swap integrity check passes

## Consequences

- **Silent backup corruption is no longer possible.** A bad
  snapshot fails the cron and preserves prior known-good
  snapshots. Ops sees the failure via exit-code monitoring +
  `bos_backup_latest_age_seconds` stalling.
- **Restore is now a documented, scripted operation.** Operators
  follow the four-step `restore-store.mjs` flow instead of doing
  raw `cp` and hoping. The sideline gives a one-command rollback.
- **Prometheus-only deployments work.** A team that scrapes
  `/metrics` but doesn't poll `/api/admin/backup-status` still
  sees backup freshness — and can alert on it — through one
  endpoint.
- **The Phase 5.5 future-work list is closed.** Integrity
  verification + restore CLI + age metric were the three concrete
  items. Snapshot rate metric → `bos_backup_latest_age_seconds`
  is the same idea expressed as a gauge instead of a counter.
- **Zero new runtime dependencies.** `PRAGMA integrity_check` is
  built into `node:sqlite`; `fs.cp` is built into Node 16+.

## Future polish

- **Off-site upload from the CLI** — `--upload-to s3://bucket/path`
  flag that pushes the verified snapshot. Today operators run
  Litestream separately for off-site DR.
- **Restore-from-Litestream CLI** — `scripts/restore-store.mjs`
  today restores from a LOCAL snapshot path. A Litestream-aware
  mode (`--from-litestream s3://bucket/path --at <timestamp>`)
  would close the symmetry for off-site recovery.
- **Automatic post-restore smoke** — after the post-swap
  integrity check, optionally hit `/readyz` against a freshly-
  spawned API process to verify the restored store serves
  real requests. Today the operator does this manually.
- **Snapshot diff metric** — `bos_backup_latest_bytes_delta` —
  bytes difference vs the previous snapshot. A sudden 10x growth
  is a useful "did someone do something weird" alert.
- **Encrypted snapshots** — `--encrypt-with <vault-master-key>`
  for snapshots stored on shared infrastructure. Today snapshot
  files are at-rest plaintext (same as the live db).
