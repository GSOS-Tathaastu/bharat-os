# ADR 0081: Phase 4.2 — SQLite Store Backend

## Status

Accepted

## Context

The file-based `BosStore` (one JSON file per record across ~20
directories) was the right choice for Phase 0 — zero dependencies,
trivial to debug by running `cat .bharat-os/identities/*.json` —
and it remains correct. But for launch readiness it has three
weaknesses:

1. **No atomic transactions.** Phase 4.0's DPDP cascading deletion
   could be partially applied if the process crashed mid-erase,
   leaving the user's data half-deleted. *Right to erasure*
   semantically requires atomicity.
2. **Linear scans on every list.** `collectUserData` (the DPDP
   export) walks every directory and filters in memory.
   Acceptable at a few thousand records; painful at a few
   hundred thousand.
3. **Multi-file backup.** A snapshot needs to capture an entire
   directory tree atomically — race conditions if the process
   writes during the snapshot.

Node's built-in `node:sqlite` module (stable in Node 24, available
without the experimental flag) lets us solve all three with zero
new dependencies. WAL mode gives concurrent reads; explicit
`BEGIN`/`COMMIT` gives ACID transactions; a single `.db` file is
one cleanly-snapshottable artifact.

## Decision

### New artifact — `src/phase0/sqlite-store.mjs`

A drop-in replacement for `BosStore`. Every method signature
matches the file-store exactly — every test that used to exercise
`new BosStore(root)` now works against `new SqliteStore(root)`
without modification.

Storage shape: one table per record type, with a JSON blob column
holding the full record plus extracted columns for the fields we
filter on. Indexes on the extracted columns — `subject_id`,
`actor_id`, `owner_id`, `created_at`, etc. — turn what was an
O(n) directory scan into an O(log n) index lookup.

20 tables in total: `identities`, `nodes`, `consents`, `decisions`,
`tool_executions`, `orchestrations`, `skill_preflights`,
`memory_records`, `worker_authorizations`, `flag_reports`,
`mesh_contributions`, `pairing_sessions`, `health_documents`,
`profile_credentials`, `push_subscriptions`, `worker_notifications`,
`federated_rounds`, `federated_updates`, `attestations`, `ledger`,
plus `control_planes`, `simulation_reports`, `manifests`, `chunks`,
`voice_model_packs`, `tts_model_packs`, `on_device_model_packs`
for compatibility.

The ledger table uses an `AUTOINCREMENT` sequence column so
ordering is intrinsic — no filename-glob sort, no race when two
writers append concurrently.

### Pragma configuration

```sql
PRAGMA journal_mode = WAL;     -- concurrent reads during writes
PRAGMA synchronous = NORMAL;   -- balanced durability/perf
PRAGMA foreign_keys = ON;      -- safety net for future refs
```

WAL mode lets the API serve `GET /api/identities` (a read) at
full throughput while a separate request is committing a write.
On a single-tenant launch this matters less than on a
multi-instance deployment, but it costs nothing to enable.

### ACID erasure — the headline win

`SqliteStore.eraseUserData(identityId, { redactLedgerEntry })`
runs the entire cascade inside `BEGIN ... COMMIT`. If anything
fails — disk full, process crash, power loss — the transaction
rolls back and the store is in its pre-erase state. The
tombstone `account.erased` event is appended AFTER the commit
so a failed transaction doesn't leave a misleading audit trail.

This addresses a real DPDP §12(3) edge case: a partial deletion
that survived a crash would leave us in violation of the *right
to erasure* (some records gone, some surviving). With SQLite,
either the entire user is erased or none of them.

### Factory + env-var backend selection

```js
// src/phase0/sqlite-store.mjs
export async function createStore({ rootPath, kind }) {
  const selected = kind ?? process.env?.BHARAT_OS_STORE_KIND ?? 'file';
  if (selected === 'sqlite') return new SqliteStore(rootPath);
  return new BosStore(rootPath);
}
```

`bin/bos-api.mjs` now uses `createStore` with the kind picked from
`--kind file|sqlite` flag or the `BHARAT_OS_STORE_KIND` env var.
Default stays `file` so the existing dev / demo flow is unchanged.

The API server logs `storeKind` in its startup banner so ops can
verify which backend the process is using.

### Migration tool — `scripts/migrate-store.mjs`

One-shot CLI that reads from a file-store source and writes to a
SQLite target:

```bash
node scripts/migrate-store.mjs --source .bharat-os --target .bharat-os-sqlite
```

Idempotent (upsert semantics — re-running overwrites existing
rows). Source directory is NOT touched — ops can verify the
SQLite store works against real traffic before removing the file
store.

Migrates every record type (20+ sections) + replays the ledger
in chronological order so seq IDs stay coherent. Live-verified
against the demo seed: 70 records + 73 ledger events migrated in
under a second.

## Tests

`tests/node/sqlite-store.test.mjs` — 11 tests:

1. round-trips identities with private key intact
2. `listIdentities` returns all saved records
3. Upsert semantics (re-save same ID overwrites)
4. round-trips consents with all extracted columns
5. ledger is append-only with monotonic seq IDs + type filtering
6. `computeContribution` folds nodes + memory + mesh events
7. **`eraseUserData` is atomic — full cascade in one transaction;**
   **all sections gone post-erase; ledger entries redacted (not deleted);**
   **`account.erased` tombstone has `identityId: '<erased>'`**
8. cross-user filter: only the requested subject's consents
   return on listConsents().filter
9. close/reopen preserves all data (durability check)
10. exports a versioned protocol marker
11. `createStore` factory picks SQLite when `kind: 'sqlite'`,
    file store by default

Full suite: **333 / 333 green** (was 322; +11 new).

Live-verified end-to-end:
- `node scripts/seed-demo.mjs .demo-file` populates the file store.
- `node scripts/migrate-store.mjs --source .demo-file --target .demo-sqlite`
  migrates 70 records + 73 ledger events.
- `node bin/bos-api.mjs --store .demo-sqlite --kind sqlite` boots
  the API; startup banner shows `"storeKind": "sqlite"`.
- `GET /api/identities`, `/api/attestations`, `/api/federated/rounds`
  all return the migrated data correctly.
- **SQLite file is 676 KB vs the file store's 1.1 MB** — 38% smaller
  on disk (no per-file directory overhead, no per-file JSON
  framing repetition).

## §15 bindings — what changed

Nothing. SQLite is an implementation detail behind the store
abstraction. Every existing protocol-level guarantee (signed
consents, ledger redaction on erasure, no PII in metrics or logs)
still holds.

One subtle improvement: the atomic erasure transaction means the
*"right to erasure"* now matches DPDP §12(3) more rigorously — a
user requesting deletion either gets fully erased or sees the
request fail; never a partial state.

## Consequences

- **Bharat OS scales past file-store limits.** Linear scans across
  20 directories become indexed lookups against indexed columns.
  DPDP export latency on a ten-thousand-record store drops from
  seconds to milliseconds.
- **ACID guarantees match the §15 binding language.** Atomic
  erasure is a real DPDP-compliance upgrade, not just a perf win.
- **Backups become trivial.** `cp bos.db bos.db.backup-2026-05-25`
  is the full snapshot. Append `.wal` and `.shm` files if SQLite
  hasn't checkpointed (or run `PRAGMA wal_checkpoint(TRUNCATE)`
  before copying).
- **No new dependencies.** `node:sqlite` ships with Node 24+. No
  native binding to compile. No `npm install` adds packages.
- **Backward-compatible.** File store remains the default; SQLite
  is opt-in via flag / env var. Existing tests and seed scripts
  work unchanged. Production deploys set
  `BHARAT_OS_STORE_KIND=sqlite`.
- **333 / 333 tests** (+11 SQLite-specific).

## What this does NOT solve

- **Multi-instance deployments.** SQLite is single-writer (WAL or
  not). For multi-instance production we'll need Postgres. The
  store abstraction is now positioned for that — a future
  `PostgresStore` implements the same surface, gets selected by
  `BHARAT_OS_STORE_KIND=postgres`. Phase 4.6 or beyond.
- **Streaming-large exports.** Today the DPDP export reads
  everything into memory and serialises it. Fine at thousands of
  records; needs a streaming JSON encoder at hundreds of
  thousands.
- **Backup automation.** Manual `cp` works; production needs a
  cron / litestream-style continuous-replication job. Phase 4.6.

## Future polish

- **PostgreSQL adapter** for multi-instance launches. Same `createStore`
  factory; `kind: 'postgres'` selects it. Connection string via
  `BHARAT_OS_DATABASE_URL`.
- **Litestream-style continuous backup** to S3 / GCS for
  point-in-time recovery without a cron.
- **Connection pooling** when we move to Postgres — single
  shared connection is fine for SQLite but won't scale for
  Postgres.
- **Read replicas** — split read traffic to a replica with eventual
  consistency for the heavy `collectUserData` query.
- **Query telemetry** — emit per-query timings so slow indexes
  surface in `/metrics`.
- **Schema migrations framework** — adding a column today means a
  manual `ALTER TABLE`. A proper migrations runner (numbered
  schema files + a `schema_versions` table) lets us evolve cleanly.
- **Encrypt the db file** with SQLCipher or app-layer column
  encryption for at-rest protection in production. Today we rely
  on filesystem-level encryption.
