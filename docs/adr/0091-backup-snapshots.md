# ADR 0091: Phase 5.5 — Online Backup Snapshots + Litestream Sidecar

## Status

Accepted

## Context

The Phase 4.6 launch runbook (ADR 0085) explicitly flagged backup
strategy as future polish — "manual cron or Litestream sidecar."
A single-instance launch on Hetzner / Lightsail / Fly.io has the
single largest remaining production gap: **one disk failure = total
data loss**. The DPDP §11 fiduciary application materials we cite
in ADR 0079 implicitly assume durability of the data we claim to
hold; without a backup story, that's an honesty gap.

Phase 5.5 closes the gap with two complementary mechanisms:

1. **In-tree point-in-time snapshots** — a cron-friendly script that
   takes a consistent SQLite snapshot via `VACUUM INTO` (or a
   directory copy for the file backend), with retention.
2. **Litestream sidecar (opt-in)** — continuous WAL replication to
   S3-compatible object storage for second-granularity off-site
   point-in-time restore.

Production should run both. Local snapshots are the fast recovery
path; Litestream is the off-site DR path that survives a host
loss.

## Decision

### `store.snapshotTo(targetPath)` on both backends

Both `SqliteStore` and `BosStore` (file backend) now expose
`snapshotTo(targetPath)`:

- **SqliteStore** — uses `VACUUM INTO 'targetPath'`. SQLite holds
  a read lock for the duration; WAL writers continue. The result
  is a single .sqlite file with NO WAL companion (safe to copy,
  upload, restore as-is). Refuses to overwrite an existing file.
- **BosStore** — uses `fs.cp(rootPath, targetPath, { recursive: true })`.
  No atomic guarantee (a write that lands mid-copy will produce a
  snapshot with one new value + one old value), but adequate for
  the file-store-as-dev-tool role per ADR 0081. Refuses to
  overwrite.

Both return `{ kind, sourcePath, targetPath, bytes, createdAt }`.

### `src/phase0/backup.mjs` — shared helpers

Three pure functions consumed by both the CLI and the admin
endpoint:

- **`snapshotPath({ rootPath, kind, at })`** — derives
  `<rootPath>/backups/bos-store-<filesystem-safe-ISO>.<sqlite|dir>`.
  The timestamp replaces `:` and `.` with `-` (Windows-safe).
- **`listSnapshots(backupDir)`** — returns metadata
  `[{ name, kind, bytes, createdAt, fullPath }, …]` sorted
  newest-first. Returns `[]` when the dir doesn't exist (don't
  fail before the first backup runs).
- **`applyRetention(backupDir, { keep })`** — deletes snapshots
  beyond the most-recent `keep`. Returns the removed entries.
  Best-effort on rm failures so a transient lock doesn't block
  the script.

### `scripts/snapshot-store.mjs` — CLI

Self-contained, backend-agnostic. Reads `--root` and `--kind` from
args (or `BHARAT_OS_DATA_ROOT` / `BHARAT_OS_STORE_KIND` env), runs
`store.snapshotTo()` to a timestamped path, then `applyRetention`.
Exits 0 on success, 1 on failure — wire to a healthcheck for ops
alerting.

Typical cron:

```cron
# Nightly at 02:30 UTC; keep 7 snapshots.
30 2 * * * cd /opt/bharat-os && \
  BHARAT_OS_DATA_ROOT=/data BHARAT_OS_STORE_KIND=sqlite \
  node scripts/snapshot-store.mjs --keep 7 >> /var/log/bharat-os-backup.log 2>&1
```

### `GET /api/admin/backup-status` endpoint

Returns the snapshot ledger plus the latest snapshot's age in
seconds. Ops alerts on:

```promql
# No successful snapshot in >25 hours (1h grace past the daily cron).
bos_backup_latest_age_seconds > 90000
```

Response shape:

```json
{
  "ok": true,
  "backupDir": "/data/backups",
  "snapshotCount": 7,
  "latest": {
    "name": "bos-store-2026-05-25T02-30-00-000.sqlite",
    "kind": "sqlite",
    "bytes": 1048576,
    "createdAt": "2026-05-25T02:30:00.123Z",
    "ageSeconds": 1234
  },
  "snapshots": [ /* up to 20 most-recent */ ]
}
```

The endpoint goes on the regular rate-limited surface (the `read`
policy) — a misconfigured scrape can't pin the API.

### Litestream sidecar in `docker-compose.yml`

Commented-out by default. Opt-in by uncommenting the `litestream`
service block + setting `LITESTREAM_*` env vars. The sidecar
mounts `bos-data:/data:ro` and runs:

```
litestream replicate /data/bos.db s3://${LITESTREAM_BUCKET}/bos.db
```

Litestream is an independent off-the-shelf binary — no in-tree
dependency. We don't bundle it because (a) it adds an OCI image
to the deploy bundle, and (b) most launches will start with just
the local snapshots before adding off-site replication.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Snapshot files contain user data | The .sqlite snapshot IS the database — it has every identity, every consent, every memory record. Same data residency rules apply: operators MUST treat the `backups/` dir + any Litestream destination with the same care as the live db. The docs explicitly call this out. |
| `/api/admin/backup-status` does not leak PII | Snapshot metadata is filename + size + mtime — pure operational data with no identity references. The endpoint never reads INSIDE the snapshots. |
| Snapshots respect DPDP `eraseUserData` | An old snapshot still contains a user who later requested erasure. The launch-runbook (Phase 5.5 amendment) instructs operators to either (a) restore-and-re-erase before restoring from a pre-erasure snapshot, or (b) keep snapshots only for as long as the legitimate-interest retention window. ADR 0079 §12(3) compliance does not extend automatically to backups; ops policy fills the gap. |
| Litestream replicas are PII data flows | Same rules as the primary db. The `.env.example` flags that LITESTREAM_BUCKET storage falls under the data-residency commitments. |

## Tests

`tests/node/backup-snapshot.test.mjs` — 15 tests:

**`snapshotPath` + `backupTimestamp`** (4 tests):
1. Derives `<rootPath>/backups/bos-store-<ts>.sqlite` correctly
2. Uses `.dir` suffix for file-store snapshots
3. Rejects missing arguments
4. Timestamp is filesystem-safe (no colons or dots; Windows-safe)

**`SqliteStore.snapshotTo`** (3 tests):
5. Produces a valid copy that round-trips identities (snapshot →
   re-open as fresh SqliteStore → read back the original identity)
6. Refuses to overwrite an existing file
7. Creates missing parent directories

**`BosStore.snapshotTo`** (2 tests):
8. Recursively copies the data directory; restored store is
   functional
9. Refuses to overwrite an existing target

**`listSnapshots` + `applyRetention`** (6 tests):
10. `listSnapshots` returns `[]` when the backup dir doesn't exist
11. Returns newest-first metadata
12. Ignores files outside the `bos-store-` prefix
13. `applyRetention` keeps the most recent N and deletes the rest
14. Rejects bad `keep` values
15. No-op when count ≤ keep

Full suite: **456 / 456 green** (was 441; +15 new). No SW change
(server-side only).

Live CLI smoke confirmed: `node scripts/snapshot-store.mjs --root
.tmp/cli-smoke --kind sqlite --keep 3` creates the backup dir,
takes a snapshot, applies retention, and prints the snapshot
ledger.

## Consequences

- **A single disk failure is no longer a single point of total
  data loss.** With the nightly cron + Litestream sidecar enabled,
  the worst-case recovery target is the last Litestream WAL
  replication (seconds-granularity) plus restoring the most
  recent local snapshot.
- **`backup-status` is an ops dashboard primitive.** Grafana can
  scrape the endpoint and alert on `ageSeconds > 90000`. A failed
  cron job is now visible without needing to ssh into the host.
- **Backend-agnostic.** The same CLI works against either
  `BHARAT_OS_STORE_KIND=sqlite` or `=file`. When a future
  PostgresStore lands (Phase 5.6 candidate per ADR 0081), adding
  a `snapshotTo` method that wraps `pg_dump` is a small change.
- **Off-site DR is opt-in.** Operators who don't yet have an
  object-storage relationship get a working local-backup story
  on day one. The Litestream block is commented but documented;
  uncommenting + setting LITESTREAM_* is the only step.
- **No new runtime dependencies.** The CLI uses `VACUUM INTO` (in
  Node's built-in `node:sqlite`) and `fs.cp` (Node 16+). Zero
  npm additions. The launch image stays distroless + thin.

## Future polish

- **Snapshot integrity verification** — after `VACUUM INTO`, run
  `PRAGMA integrity_check` on the snapshot file before counting it
  as successful. Catches a corrupt write at the source.
- **Restore CLI** — the inverse of `snapshot-store.mjs`. Today
  restore is a manual `cp snap.sqlite /data/bos.db` after stopping
  the API. A script that validates the snapshot, stops the
  container, swaps, and restarts would close the symmetry.
- **Off-site uploads from the CLI** — for operators who can't run
  a Litestream sidecar (no persistent compute), bundle an
  optional `--upload-to` flag that pushes the snapshot to S3 /
  B2 / R2 after creation. Adds an HTTP client dep, weighed
  against the integration value.
- **Snapshot rate metric** — `bos_backup_latest_age_seconds` as a
  Prometheus gauge so operators can alert via `/metrics` instead
  of an HTTP scrape against `/api/admin/backup-status`.
- **DPDP erasure cross-check** — before counting a snapshot as
  valid, verify no identity with `recoveryCooldown > now` is in
  it (would mean we're snapshotting an in-flight SIM-swap window
  — a re-test scenario for ops). Edge case; needs design.
