// SQLite-backed store — Phase 4.2.
//
// Drop-in replacement for `BosStore` (file-based, src/phase0/store.mjs).
// Same public surface — every save/read/list method has an identical
// signature — but writes go into a single `.db` file via Node's
// built-in `node:sqlite` (no native binding, no compilation).
//
// Why we want this for launch:
//
//   • **ACID transactions.** The DPDP `eraseUserData` cascade is now
//     atomic. A crash mid-erasure leaves the store in its prior
//     state, not half-deleted.
//   • **Indexed queries.** `collectUserData` (DPDP export) used to
//     scan every directory; now it's index-lookups on
//     `(subjectId, ownerId, actorId, …)`.
//   • **One backup file.** `cp .db .db.backup` is the full snapshot.
//   • **Concurrent reads.** WAL mode lets the API serve reads while
//     a write transaction is in progress.
//
// Storage shape: each record type has its own table with a JSON
// blob column for the full record + extracted columns for the
// fields we filter on. The full record is round-tripped via
// `JSON.parse(JSON.stringify(...))` so callers get the same shape
// the file store returns.
//
// The class is intentionally synchronous-under-the-hood (node:sqlite
// is synchronous) but exposes async methods to match BosStore's
// API. Production deployments can run this safely because the
// transactions are short and the Node event loop is not blocked
// long enough to matter under the load profile we expect (≤ a
// few thousand RPS).

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';

export const SQLITE_STORE_PROTOCOL_VERSION = 'bos.phase0.sqlite-store.v0';

// Table schemas — one row per record. The `json` column holds the
// full record; extracted columns are indexed for query filtering.
const SCHEMAS = `
  CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    created_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_identities_created_at ON identities(created_at);

  CREATE TABLE IF NOT EXISTS nodes (
    node_id TEXT PRIMARY KEY,
    operator_id TEXT,
    kyc_verified INTEGER,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nodes_operator_id ON nodes(operator_id);

  CREATE TABLE IF NOT EXISTS consents (
    consent_id TEXT PRIMARY KEY,
    subject_id TEXT,
    grantee_id TEXT,
    purpose TEXT,
    issued_at TEXT,
    expires_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_consents_subject_id ON consents(subject_id);
  CREATE INDEX IF NOT EXISTS idx_consents_expires_at ON consents(expires_at);

  CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    actor_id TEXT,
    created_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_decisions_actor_id ON decisions(actor_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);

  CREATE TABLE IF NOT EXISTS tool_executions (
    execution_id TEXT PRIMARY KEY,
    actor_id TEXT,
    started_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tool_executions_actor_id ON tool_executions(actor_id);

  CREATE TABLE IF NOT EXISTS orchestrations (
    orchestration_id TEXT PRIMARY KEY,
    actor_id TEXT,
    action_type TEXT,
    completed_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orchestrations_actor_id ON orchestrations(actor_id);
  CREATE INDEX IF NOT EXISTS idx_orchestrations_completed_at ON orchestrations(completed_at);

  CREATE TABLE IF NOT EXISTS skill_preflights (
    preflight_id TEXT PRIMARY KEY,
    actor_id TEXT,
    skill_id TEXT,
    checked_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_skill_preflights_actor_id ON skill_preflights(actor_id);

  CREATE TABLE IF NOT EXISTS memory_records (
    record_id TEXT PRIMARY KEY,
    owner_id TEXT,
    manifest_id TEXT,
    created_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memory_records_owner_id ON memory_records(owner_id);

  CREATE TABLE IF NOT EXISTS worker_authorizations (
    authorization_id TEXT PRIMARY KEY,
    worker_id TEXT,
    operator_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_worker_auth_worker_id ON worker_authorizations(worker_id);

  CREATE TABLE IF NOT EXISTS flag_reports (
    flag_id TEXT PRIMARY KEY,
    reporter_id TEXT,
    subject_id TEXT,
    status TEXT,
    severity TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_flag_reports_subject_id ON flag_reports(subject_id);
  CREATE INDEX IF NOT EXISTS idx_flag_reports_reporter_id ON flag_reports(reporter_id);
  CREATE INDEX IF NOT EXISTS idx_flag_reports_status ON flag_reports(status);

  CREATE TABLE IF NOT EXISTS mesh_contributions (
    contribution_event_id TEXT PRIMARY KEY,
    operator_id TEXT,
    workload_type TEXT,
    at TEXT,
    payout_paise INTEGER,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mesh_operator_id ON mesh_contributions(operator_id);
  CREATE INDEX IF NOT EXISTS idx_mesh_at ON mesh_contributions(at);

  CREATE TABLE IF NOT EXISTS pairing_sessions (
    session_id TEXT PRIMARY KEY,
    issuer_identity_id TEXT,
    claim_code TEXT,
    status TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pairing_issuer ON pairing_sessions(issuer_identity_id);
  CREATE INDEX IF NOT EXISTS idx_pairing_claim_code ON pairing_sessions(claim_code);

  CREATE TABLE IF NOT EXISTS health_documents (
    capture_id TEXT PRIMARY KEY,
    owner_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_health_owner_id ON health_documents(owner_id);

  CREATE TABLE IF NOT EXISTS profile_credentials (
    profile_credential_id TEXT PRIMARY KEY,
    identity_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_profile_credentials_identity ON profile_credentials(identity_id);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    subscription_id TEXT PRIMARY KEY,
    identity_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_identity ON push_subscriptions(identity_id);

  CREATE TABLE IF NOT EXISTS worker_notifications (
    notification_id TEXT PRIMARY KEY,
    identity_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_worker_notifications_identity ON worker_notifications(identity_id);

  CREATE TABLE IF NOT EXISTS federated_rounds (
    round_id TEXT PRIMARY KEY,
    created_by TEXT,
    status TEXT,
    deadline_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_federated_rounds_status ON federated_rounds(status);

  CREATE TABLE IF NOT EXISTS federated_updates (
    update_id TEXT PRIMARY KEY,
    round_id TEXT,
    contributor_id TEXT,
    accepted INTEGER,
    submitted_at TEXT,
    differential_privacy_epsilon REAL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_federated_updates_contributor ON federated_updates(contributor_id);
  CREATE INDEX IF NOT EXISTS idx_federated_updates_round ON federated_updates(round_id);

  CREATE TABLE IF NOT EXISTS attestations (
    attestation_id TEXT PRIMARY KEY,
    subject_id TEXT,
    verifier_name TEXT,
    issued_at TEXT,
    expires_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attestations_subject_id ON attestations(subject_id);

  CREATE TABLE IF NOT EXISTS phone_otps (
    otp_id TEXT PRIMARY KEY,
    identity_id TEXT,
    phone TEXT,
    purpose TEXT,
    status TEXT,
    issued_at TEXT,
    expires_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_phone_otps_identity ON phone_otps(identity_id);
  CREATE INDEX IF NOT EXISTS idx_phone_otps_status ON phone_otps(status);

  CREATE TABLE IF NOT EXISTS earnings_log (
    entry_id TEXT PRIMARY KEY,
    identity_id TEXT,
    date TEXT,
    category TEXT,
    amount_paise INTEGER,
    hours_worked REAL,
    created_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_earnings_log_identity ON earnings_log(identity_id);
  CREATE INDEX IF NOT EXISTS idx_earnings_log_date ON earnings_log(date);
  CREATE INDEX IF NOT EXISTS idx_earnings_log_category ON earnings_log(category);

  CREATE TABLE IF NOT EXISTS portable_attestations (
    token_id TEXT PRIMARY KEY,
    worker_id TEXT,
    category TEXT,
    status TEXT,
    tier INTEGER,
    issued_at TEXT,
    expires_at TEXT,
    signed_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_portable_attestations_worker ON portable_attestations(worker_id);
  CREATE INDEX IF NOT EXISTS idx_portable_attestations_status ON portable_attestations(status);
  CREATE INDEX IF NOT EXISTS idx_portable_attestations_category ON portable_attestations(category);

  CREATE TABLE IF NOT EXISTS income_verification_consents (
    consent_id TEXT PRIMARY KEY,
    worker_id TEXT,
    mfi_name TEXT,
    financial_year TEXT,
    issued_at TEXT,
    expires_at TEXT,
    read_count INTEGER,
    max_reads INTEGER,
    revoked_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_income_verification_consents_worker ON income_verification_consents(worker_id);
  CREATE INDEX IF NOT EXISTS idx_income_verification_consents_expires ON income_verification_consents(expires_at);

  CREATE TABLE IF NOT EXISTS mesh_withdrawals (
    request_id TEXT PRIMARY KEY,
    worker_id TEXT,
    amount_paise INTEGER,
    status TEXT,
    requested_at TEXT,
    accepted_at TEXT,
    paid_at TEXT,
    failed_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mesh_withdrawals_worker ON mesh_withdrawals(worker_id);
  CREATE INDEX IF NOT EXISTS idx_mesh_withdrawals_status ON mesh_withdrawals(status);

  CREATE TABLE IF NOT EXISTS ledger (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    at TEXT,
    identity_id TEXT,
    subject_id TEXT,
    actor_id TEXT,
    operator_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
  CREATE INDEX IF NOT EXISTS idx_ledger_at ON ledger(at);

  CREATE TABLE IF NOT EXISTS control_planes (
    control_plane_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS simulation_reports (
    report_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS manifests (
    manifest_id TEXT PRIMARY KEY,
    owner_id TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_manifests_owner_id ON manifests(owner_id);

  CREATE TABLE IF NOT EXISTS chunks (
    chunk_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS voice_model_packs (
    voice_model_pack_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tts_model_packs (
    tts_model_pack_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS on_device_model_packs (
    on_device_model_pack_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
`;

function parse(row) {
  return row ? JSON.parse(row.json) : null;
}

function all(rows) {
  return rows.map(parse);
}

export class SqliteStore {
  constructor(rootPath) {
    if (!rootPath) {
      throw new Error('SqliteStore requires a root path.');
    }
    this.rootPath = rootPath;
    this.dbPath = path.join(rootPath, 'bos.db');
    this.db = null;
    this.initialised = false;
  }

  // Mirrors BosStore.init — idempotent. Creates the directory + opens
  // the database + applies schemas + sets WAL mode for concurrent
  // reads.
  async init() {
    if (this.initialised) return;
    if (!existsSync(this.rootPath)) {
      mkdirSync(this.rootPath, { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    // WAL = write-ahead log: readers don't block writers.
    this.db.exec("PRAGMA journal_mode = WAL;");
    // NORMAL is the right durability/perf trade-off for a single-
    // tenant launch. FULL would fsync every commit (safer but
    // slower); OFF would drop the durability guarantee entirely.
    this.db.exec("PRAGMA synchronous = NORMAL;");
    // Foreign keys aren't used (each table is independent in our
    // schema), but enable for safety in case future tables add
    // references.
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMAS);
    this.initialised = true;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialised = false;
    }
  }

  // Phase 5.6 — integrity verification. SQLite's `PRAGMA
  // integrity_check` performs a comprehensive scan of the b-tree
  // structure, page allocations, and constraints. Runs in O(db
  // size) — typically <1s for a launch-scale db. Returns "ok"
  // when healthy; a list of error strings otherwise.
  //
  // If `targetPath` is provided, opens that file as a read-only
  // SQLite handle and checks it (used after `snapshotTo` to verify
  // the snapshot is salvageable before counting it as successful).
  // With no argument, checks the live database.
  async verifyIntegrity(targetPath) {
    await this.init();
    let db = this.db;
    let opened = null;
    if (targetPath) {
      try {
        opened = new DatabaseSync(targetPath, { readOnly: true });
        db = opened;
      } catch (error) {
        // File so corrupt SQLite refuses to open it — definitely
        // a failure, but report it cleanly instead of throwing.
        return {
          ok: false,
          targetPath,
          messages: [`open failed: ${error?.message ?? String(error)}`]
        };
      }
    }
    try {
      const rows = db.prepare('PRAGMA integrity_check').all();
      const messages = rows.map((row) => row.integrity_check ?? row.integrityCheck ?? String(row));
      const ok = messages.length === 1 && messages[0] === 'ok';
      return {
        ok,
        targetPath: targetPath ?? this.dbPath,
        messages
      };
    } catch (error) {
      // PRAGMA itself can throw on a sufficiently-damaged file
      // (`database disk image is malformed`). Map to a failure
      // result so callers don't have to wrap every call in
      // try/catch — the contract is "returns { ok, messages }",
      // not "throws on corruption".
      return {
        ok: false,
        targetPath: targetPath ?? this.dbPath,
        messages: [`integrity_check failed: ${error?.message ?? String(error)}`]
      };
    } finally {
      if (opened) opened.close();
    }
  }

  // Phase 5.5 — online snapshot. SQLite's `VACUUM INTO` produces a
  // point-in-time consistent copy of the entire database to a
  // target path. The source db remains fully writable during the
  // operation (it acquires a read lock; WAL writers continue).
  // The destination is a single .sqlite file — no WAL companion —
  // so it's safe to copy/upload/restore as-is.
  //
  // Caller is responsible for choosing the path + ensuring the
  // parent directory exists.
  async snapshotTo(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('snapshotTo requires a target path.');
    }
    await this.init();
    // VACUUM INTO refuses if the target exists. Surface a clear
    // error instead of letting the cryptic SQLite message bubble.
    if (existsSync(targetPath)) {
      throw new Error(`snapshot target already exists: ${targetPath}`);
    }
    const dir = path.dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // node:sqlite has no parameter binding for VACUUM INTO; safe
    // because targetPath is operator-supplied (not user input).
    const escaped = targetPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    const stats = await fs.stat(targetPath);
    return {
      kind: 'sqlite',
      sourcePath: this.dbPath,
      targetPath,
      bytes: stats.size,
      createdAt: stats.mtime.toISOString()
    };
  }

  // Generic helpers — each save/read/list method delegates here.
  _upsert(table, columns, values) {
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((c) => c !== columns[0])
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    const sql =
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ` +
      `ON CONFLICT(${columns[0]}) DO UPDATE SET ${updates}`;
    this.db.prepare(sql).run(...values);
  }

  _readOne(table, idColumn, idValue) {
    const row = this.db.prepare(`SELECT json FROM ${table} WHERE ${idColumn} = ?`).get(idValue);
    return parse(row);
  }

  _listAll(table) {
    const rows = this.db.prepare(`SELECT json FROM ${table}`).all();
    return all(rows);
  }

  // ─── Identities ────────────────────────────────────────────────────────

  async saveIdentity(identity) {
    await this.init();
    this._upsert(
      'identities',
      ['id', 'display_name', 'created_at', 'json'],
      [identity.id, identity.displayName ?? null, identity.createdAt ?? null, JSON.stringify(identity)]
    );
    await this.appendLedger({ type: 'identity.saved', identityId: identity.id, at: new Date().toISOString() });
    return identity;
  }

  async readIdentity(identityId) {
    await this.init();
    return this._readOne('identities', 'id', identityId);
  }

  async listIdentities() {
    await this.init();
    return this._listAll('identities');
  }

  // ─── Nodes ─────────────────────────────────────────────────────────────

  async saveNode(node) {
    await this.init();
    this._upsert(
      'nodes',
      ['node_id', 'operator_id', 'kyc_verified', 'json'],
      [node.nodeId, node.operatorId ?? null, node.kycVerified ? 1 : 0, JSON.stringify(node)]
    );
    await this.appendLedger({
      type: 'node.saved',
      nodeId: node.nodeId,
      operatorId: node.operatorId,
      at: new Date().toISOString()
    });
    return node;
  }

  async readNode(nodeId) {
    await this.init();
    return this._readOne('nodes', 'node_id', nodeId);
  }

  async listNodes() {
    await this.init();
    return this._listAll('nodes');
  }

  // ─── Consents ──────────────────────────────────────────────────────────

  async saveConsent(consent) {
    await this.init();
    this._upsert(
      'consents',
      ['consent_id', 'subject_id', 'grantee_id', 'purpose', 'issued_at', 'expires_at', 'json'],
      [
        consent.consentId,
        consent.subjectId ?? null,
        consent.granteeId ?? null,
        consent.purpose ?? null,
        consent.issuedAt ?? null,
        consent.expiresAt ?? null,
        JSON.stringify(consent)
      ]
    );
    await this.appendLedger({
      type: 'consent.saved',
      consentId: consent.consentId,
      subjectId: consent.subjectId,
      at: new Date().toISOString()
    });
    return consent;
  }

  async readConsent(consentId) {
    await this.init();
    return this._readOne('consents', 'consent_id', consentId);
  }

  async listConsents() {
    await this.init();
    return this._listAll('consents');
  }

  // ─── Decisions ─────────────────────────────────────────────────────────

  async saveDecision(decision) {
    await this.init();
    this._upsert(
      'decisions',
      ['decision_id', 'actor_id', 'created_at', 'json'],
      [decision.decisionId, decision.request?.actorId ?? null, decision.at ?? null, JSON.stringify(decision)]
    );
    return decision;
  }

  async readDecision(decisionId) {
    await this.init();
    return this._readOne('decisions', 'decision_id', decisionId);
  }

  async listDecisions() {
    await this.init();
    return this._listAll('decisions');
  }

  // ─── Tool executions ───────────────────────────────────────────────────

  async saveToolExecution(execution) {
    await this.init();
    this._upsert(
      'tool_executions',
      ['execution_id', 'actor_id', 'started_at', 'json'],
      [
        execution.executionId,
        execution.decision?.request?.actorId ?? null,
        execution.startedAt ?? null,
        JSON.stringify(execution)
      ]
    );
    return execution;
  }

  async readToolExecution(executionId) {
    await this.init();
    return this._readOne('tool_executions', 'execution_id', executionId);
  }

  async listToolExecutions() {
    await this.init();
    return this._listAll('tool_executions');
  }

  // ─── Orchestrations ────────────────────────────────────────────────────

  async saveOrchestration(orchestration) {
    await this.init();
    this._upsert(
      'orchestrations',
      ['orchestration_id', 'actor_id', 'action_type', 'completed_at', 'json'],
      [
        orchestration.orchestrationId,
        orchestration.action?.actorId ?? null,
        orchestration.action?.actionType ?? null,
        orchestration.completedAt ?? null,
        JSON.stringify(orchestration)
      ]
    );
    return orchestration;
  }

  async readOrchestration(orchestrationId) {
    await this.init();
    return this._readOne('orchestrations', 'orchestration_id', orchestrationId);
  }

  async listOrchestrations() {
    await this.init();
    return this._listAll('orchestrations');
  }

  // ─── Skill preflights ──────────────────────────────────────────────────

  async saveSkillPreflight(preflight) {
    await this.init();
    this._upsert(
      'skill_preflights',
      ['preflight_id', 'actor_id', 'skill_id', 'checked_at', 'json'],
      [
        preflight.preflightId,
        preflight.decision?.request?.actorId ?? null,
        preflight.skillId ?? null,
        preflight.checkedAt ?? null,
        JSON.stringify(preflight)
      ]
    );
    return preflight;
  }

  async readSkillPreflight(preflightId) {
    await this.init();
    return this._readOne('skill_preflights', 'preflight_id', preflightId);
  }

  async listSkillPreflights() {
    await this.init();
    return this._listAll('skill_preflights');
  }

  // ─── Memory records ────────────────────────────────────────────────────

  async saveMemoryRecord(record) {
    await this.init();
    this._upsert(
      'memory_records',
      ['record_id', 'owner_id', 'manifest_id', 'created_at', 'json'],
      [
        record.recordId,
        record.ownerId ?? null,
        record.manifestId ?? null,
        record.createdAt ?? null,
        JSON.stringify(record)
      ]
    );
    return record;
  }

  async readMemoryRecord(recordId) {
    await this.init();
    return this._readOne('memory_records', 'record_id', recordId);
  }

  async listMemoryRecords() {
    await this.init();
    return this._listAll('memory_records');
  }

  // ─── Worker authorizations ─────────────────────────────────────────────

  async saveWorkerAuthorization(auth) {
    await this.init();
    this._upsert(
      'worker_authorizations',
      ['authorization_id', 'worker_id', 'operator_id', 'json'],
      [auth.authorizationId, auth.workerId ?? null, auth.operatorId ?? null, JSON.stringify(auth)]
    );
    return auth;
  }

  async readWorkerAuthorization(authorizationId) {
    await this.init();
    return this._readOne('worker_authorizations', 'authorization_id', authorizationId);
  }

  async listWorkerAuthorizations() {
    await this.init();
    return this._listAll('worker_authorizations');
  }

  // ─── Flag reports ──────────────────────────────────────────────────────

  async saveFlagReport(report) {
    await this.init();
    this._upsert(
      'flag_reports',
      ['flag_id', 'reporter_id', 'subject_id', 'status', 'severity', 'json'],
      [
        report.flagId,
        report.reporterId ?? null,
        report.subjectId ?? null,
        report.status ?? null,
        report.severity ?? null,
        JSON.stringify(report)
      ]
    );
    return report;
  }

  async readFlagReport(flagId) {
    await this.init();
    return this._readOne('flag_reports', 'flag_id', flagId);
  }

  async listFlagReports() {
    await this.init();
    return this._listAll('flag_reports');
  }

  // ─── Mesh contribution events ──────────────────────────────────────────

  async saveMeshContributionEvent(event) {
    await this.init();
    this._upsert(
      'mesh_contributions',
      ['contribution_event_id', 'operator_id', 'workload_type', 'at', 'payout_paise', 'json'],
      [
        event.contributionEventId,
        event.operatorId ?? null,
        event.workloadType ?? null,
        event.at ?? null,
        event.payoutPaise ?? 0,
        JSON.stringify(event)
      ]
    );
    await this.appendLedger({
      type: 'mesh_contribution.recorded',
      contributionEventId: event.contributionEventId,
      operatorId: event.operatorId,
      nodeId: event.nodeId,
      workloadType: event.workloadType,
      tokens: event.tokens,
      bytes: event.bytes,
      payoutPaise: event.payoutPaise,
      at: event.at
    });
    return event;
  }

  async readMeshContributionEvent(eventId) {
    await this.init();
    return this._readOne('mesh_contributions', 'contribution_event_id', eventId);
  }

  async listMeshContributionEvents() {
    await this.init();
    return this._listAll('mesh_contributions');
  }

  // ─── Pairing sessions ──────────────────────────────────────────────────

  async savePairingSession(session) {
    await this.init();
    this._upsert(
      'pairing_sessions',
      ['session_id', 'issuer_identity_id', 'claim_code', 'status', 'json'],
      [
        session.sessionId,
        session.issuerIdentityId ?? null,
        session.claimCode ?? null,
        session.status ?? null,
        JSON.stringify(session)
      ]
    );
    return session;
  }

  async readPairingSession(sessionId) {
    await this.init();
    return this._readOne('pairing_sessions', 'session_id', sessionId);
  }

  async listPairingSessions() {
    await this.init();
    return this._listAll('pairing_sessions');
  }

  // ─── Health documents ──────────────────────────────────────────────────

  async saveHealthDocumentCapture(capture) {
    await this.init();
    this._upsert(
      'health_documents',
      ['capture_id', 'owner_id', 'json'],
      [capture.captureId, capture.ownerId ?? null, JSON.stringify(capture)]
    );
    return capture;
  }

  async readHealthDocumentCapture(captureId) {
    await this.init();
    return this._readOne('health_documents', 'capture_id', captureId);
  }

  async listHealthDocumentCaptures() {
    await this.init();
    return this._listAll('health_documents');
  }

  // ─── Profile credentials ───────────────────────────────────────────────

  async saveProfileCredential(credential) {
    await this.init();
    this._upsert(
      'profile_credentials',
      ['profile_credential_id', 'identity_id', 'json'],
      [credential.profileCredentialId, credential.identityId ?? null, JSON.stringify(credential)]
    );
    return credential;
  }

  async readProfileCredential(profileCredentialId) {
    await this.init();
    return this._readOne('profile_credentials', 'profile_credential_id', profileCredentialId);
  }

  async listProfileCredentials() {
    await this.init();
    return this._listAll('profile_credentials');
  }

  // ─── Push subscriptions ────────────────────────────────────────────────

  async savePushSubscription(subscription) {
    await this.init();
    this._upsert(
      'push_subscriptions',
      ['subscription_id', 'identity_id', 'json'],
      [subscription.subscriptionId, subscription.identityId ?? null, JSON.stringify(subscription)]
    );
    return subscription;
  }

  async readPushSubscription(subscriptionId) {
    await this.init();
    return this._readOne('push_subscriptions', 'subscription_id', subscriptionId);
  }

  async listPushSubscriptions() {
    await this.init();
    return this._listAll('push_subscriptions');
  }

  // ─── Worker notifications ──────────────────────────────────────────────

  async saveWorkerNotification(notification) {
    await this.init();
    this._upsert(
      'worker_notifications',
      ['notification_id', 'identity_id', 'json'],
      [notification.notificationId, notification.identityId ?? null, JSON.stringify(notification)]
    );
    return notification;
  }

  async readWorkerNotification(notificationId) {
    await this.init();
    return this._readOne('worker_notifications', 'notification_id', notificationId);
  }

  async listWorkerNotifications() {
    await this.init();
    return this._listAll('worker_notifications');
  }

  // ─── Federated rounds + updates ───────────────────────────────────────

  async saveFederatedRound(round) {
    await this.init();
    this._upsert(
      'federated_rounds',
      ['round_id', 'created_by', 'status', 'deadline_at', 'json'],
      [
        round.roundId,
        round.createdBy ?? null,
        round.status ?? null,
        round.deadlineAt ?? null,
        JSON.stringify(round)
      ]
    );
    await this.appendLedger({
      type: 'federated_round.saved',
      roundId: round.roundId,
      status: round.status,
      modelName: round.modelName,
      updateCount: round.updateCount,
      at: new Date().toISOString()
    });
    return round;
  }

  async readFederatedRound(roundId) {
    await this.init();
    return this._readOne('federated_rounds', 'round_id', roundId);
  }

  async listFederatedRounds() {
    await this.init();
    return this._listAll('federated_rounds');
  }

  async saveFederatedUpdate(update) {
    await this.init();
    this._upsert(
      'federated_updates',
      ['update_id', 'round_id', 'contributor_id', 'accepted', 'submitted_at', 'differential_privacy_epsilon', 'json'],
      [
        update.updateId,
        update.roundId ?? null,
        update.contributorId ?? null,
        update.accepted ? 1 : 0,
        update.submittedAt ?? null,
        update.differentialPrivacyEpsilon ?? null,
        JSON.stringify(update)
      ]
    );
    await this.appendLedger({
      type: 'federated_update.saved',
      updateId: update.updateId,
      roundId: update.roundId,
      contributorId: update.contributorId,
      accepted: update.accepted,
      epsilon: update.differentialPrivacyEpsilon,
      payoutPaise: update.payoutPaise,
      at: new Date().toISOString()
    });
    return update;
  }

  async listFederatedUpdates() {
    await this.init();
    return this._listAll('federated_updates');
  }

  // ─── Attestations ──────────────────────────────────────────────────────

  async saveAttestation(attestation) {
    await this.init();
    this._upsert(
      'attestations',
      ['attestation_id', 'subject_id', 'verifier_name', 'issued_at', 'expires_at', 'json'],
      [
        attestation.attestationId,
        attestation.subjectId ?? null,
        attestation.verifierName ?? null,
        attestation.issuedAt ?? null,
        attestation.expiresAt ?? null,
        JSON.stringify(attestation)
      ]
    );
    await this.appendLedger({
      type: 'attestation.saved',
      attestationId: attestation.attestationId,
      subjectId: attestation.subjectId,
      verifierName: attestation.verifierName,
      purpose: attestation.purpose,
      expiresAt: attestation.expiresAt,
      at: new Date().toISOString()
    });
    return attestation;
  }

  async readAttestation(attestationId) {
    await this.init();
    return this._readOne('attestations', 'attestation_id', attestationId);
  }

  async listAttestations() {
    await this.init();
    return this._listAll('attestations');
  }

  // ─── Phone OTPs (Phase 4.3) ────────────────────────────────────────────

  async savePhoneOtp(otp) {
    await this.init();
    this._upsert(
      'phone_otps',
      ['otp_id', 'identity_id', 'phone', 'purpose', 'status', 'issued_at', 'expires_at', 'json'],
      [
        otp.otpId,
        otp.identityId ?? null,
        otp.phone ?? null,
        otp.purpose ?? null,
        otp.status ?? null,
        otp.issuedAt ?? null,
        otp.expiresAt ?? null,
        JSON.stringify(otp)
      ]
    );
    await this.appendLedger({
      type: 'phone_otp.saved',
      otpId: otp.otpId,
      identityId: otp.identityId,
      phoneMasked: otp.phoneMasked,
      purpose: otp.purpose,
      status: otp.status,
      at: new Date().toISOString()
    });
    return otp;
  }

  async readPhoneOtp(otpId) {
    await this.init();
    return this._readOne('phone_otps', 'otp_id', otpId);
  }

  async listPhoneOtps() {
    await this.init();
    return this._listAll('phone_otps');
  }

  // ─── Earnings log — Phase 6.0 ─────────────────────────────────────────

  async saveEarningsEntry(entry) {
    await this.init();
    if (!entry?.entryId) throw new Error('earnings entry requires entryId.');
    this._upsert(
      'earnings_log',
      [
        'entry_id',
        'identity_id',
        'date',
        'category',
        'amount_paise',
        'hours_worked',
        'created_at',
        'json'
      ],
      [
        entry.entryId,
        entry.identityId ?? null,
        entry.date ?? null,
        entry.category ?? null,
        entry.amountPaise ?? 0,
        entry.hoursWorked ?? null,
        entry.createdAt ?? null,
        JSON.stringify(entry)
      ]
    );
    return entry;
  }

  async readEarningsEntry(entryId) {
    await this.init();
    return this._readOne('earnings_log', 'entry_id', entryId);
  }

  // Lists entries with optional filters. All filters are AND'd; omit
  // a filter to skip it. Newest-first by date.
  async listEarningsEntries({ identityId, fromDate, toDate, category } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (identityId) {
      clauses.push('identity_id = ?');
      values.push(identityId);
    }
    if (fromDate) {
      clauses.push('date >= ?');
      values.push(fromDate);
    }
    if (toDate) {
      clauses.push('date <= ?');
      values.push(toDate);
    }
    if (category) {
      clauses.push('category = ?');
      values.push(category);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM earnings_log ${where} ORDER BY date DESC, created_at DESC`;
    return all(this.db.prepare(sql).all(...values));
  }

  async deleteEarningsEntry(entryId) {
    await this.init();
    const sql = 'DELETE FROM earnings_log WHERE entry_id = ?';
    const info = this.db.prepare(sql).run(entryId);
    return Number(info.changes) > 0;
  }

  // ─── Portable attestations — Phase 5.9 ────────────────────────────────

  async savePortableAttestation(token) {
    await this.init();
    if (!token?.tokenId) throw new Error('portable attestation requires tokenId.');
    this._upsert(
      'portable_attestations',
      [
        'token_id',
        'worker_id',
        'category',
        'status',
        'tier',
        'issued_at',
        'expires_at',
        'signed_at',
        'json'
      ],
      [
        token.tokenId,
        token.workerId ?? null,
        token.category ?? null,
        token.status ?? 'pending',
        token.tier ?? null,
        token.issuedAt ?? null,
        token.expiresAt ?? null,
        token.signedAt ?? null,
        JSON.stringify(token)
      ]
    );
    return token;
  }

  async readPortableAttestation(tokenId) {
    await this.init();
    return this._readOne('portable_attestations', 'token_id', tokenId);
  }

  async listPortableAttestations({ workerId, category, status } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (workerId) {
      clauses.push('worker_id = ?');
      values.push(workerId);
    }
    if (category) {
      clauses.push('category = ?');
      values.push(category);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM portable_attestations ${where} ORDER BY issued_at DESC`;
    return all(this.db.prepare(sql).all(...values));
  }

  // ─── Income verification consents — Phase 6.1 ─────────────────────────

  async saveIncomeVerificationConsent(consent) {
    await this.init();
    if (!consent?.consentId) {
      throw new Error('income-verification consent requires consentId.');
    }
    this._upsert(
      'income_verification_consents',
      [
        'consent_id',
        'worker_id',
        'mfi_name',
        'financial_year',
        'issued_at',
        'expires_at',
        'read_count',
        'max_reads',
        'revoked_at',
        'json'
      ],
      [
        consent.consentId,
        consent.workerId ?? null,
        consent.mfiName ?? null,
        consent.financialYear ?? null,
        consent.issuedAt ?? null,
        consent.expiresAt ?? null,
        consent.readCount ?? 0,
        consent.maxReads ?? 1,
        consent.revokedAt ?? null,
        JSON.stringify(consent)
      ]
    );
    return consent;
  }

  async readIncomeVerificationConsent(consentId) {
    await this.init();
    return this._readOne('income_verification_consents', 'consent_id', consentId);
  }

  async listIncomeVerificationConsents({ workerId } = {}) {
    await this.init();
    if (workerId) {
      const sql =
        'SELECT json FROM income_verification_consents WHERE worker_id = ? ORDER BY issued_at DESC';
      return all(this.db.prepare(sql).all(workerId));
    }
    return this._listAll('income_verification_consents');
  }

  // ─── Mesh withdrawals — Phase 6.1b ────────────────────────────────────

  async saveMeshWithdrawal(request) {
    await this.init();
    if (!request?.requestId) {
      throw new Error('mesh withdrawal requires requestId.');
    }
    this._upsert(
      'mesh_withdrawals',
      [
        'request_id',
        'worker_id',
        'amount_paise',
        'status',
        'requested_at',
        'accepted_at',
        'paid_at',
        'failed_at',
        'json'
      ],
      [
        request.requestId,
        request.workerId ?? null,
        request.amountPaise ?? 0,
        request.status ?? 'pending',
        request.requestedAt ?? null,
        request.acceptedAt ?? null,
        request.paidAt ?? null,
        request.failedAt ?? null,
        JSON.stringify(request)
      ]
    );
    return request;
  }

  async readMeshWithdrawal(requestId) {
    await this.init();
    return this._readOne('mesh_withdrawals', 'request_id', requestId);
  }

  async listMeshWithdrawals({ workerId, status } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (workerId) {
      clauses.push('worker_id = ?');
      values.push(workerId);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM mesh_withdrawals ${where} ORDER BY requested_at DESC`;
    return all(this.db.prepare(sql).all(...values));
  }

  // ─── Control planes / simulation reports / manifests / chunks ─────────
  //
  // Less-used surfaces; we mirror BosStore's methods for compatibility
  // even though most tests don't exercise them.

  async saveControlPlane(controlPlane, controlPlaneId = 'current') {
    await this.init();
    this._upsert(
      'control_planes',
      ['control_plane_id', 'json'],
      [controlPlaneId, JSON.stringify(controlPlane)]
    );
    return controlPlane;
  }

  async readControlPlane(controlPlaneId = 'current') {
    await this.init();
    return this._readOne('control_planes', 'control_plane_id', controlPlaneId);
  }

  async saveSimulationReport(report) {
    await this.init();
    this._upsert(
      'simulation_reports',
      ['report_id', 'json'],
      [report.reportId, JSON.stringify(report)]
    );
    return report;
  }

  async readSimulationReport(reportId) {
    await this.init();
    return this._readOne('simulation_reports', 'report_id', reportId);
  }

  async listSimulationReports() {
    await this.init();
    return this._listAll('simulation_reports');
  }

  async saveBundle(bundle) {
    await this.init();
    this._upsert(
      'manifests',
      ['manifest_id', 'owner_id', 'json'],
      [bundle.manifest.manifestId, bundle.manifest.ownerId ?? null, JSON.stringify(bundle.manifest)]
    );
    for (const chunk of Object.values(bundle.chunks)) {
      this._upsert('chunks', ['chunk_id', 'json'], [chunk.chunkId, JSON.stringify(chunk)]);
    }
    return bundle;
  }

  async readManifest(manifestId) {
    await this.init();
    return this._readOne('manifests', 'manifest_id', manifestId);
  }

  async listManifests() {
    await this.init();
    return this._listAll('manifests');
  }

  async readBundle(manifestId) {
    await this.init();
    const manifest = await this.readManifest(manifestId);
    if (!manifest) return null;
    const chunkIds = (manifest.chunks ?? []).map((c) => c.chunkId);
    const chunks = {};
    for (const id of chunkIds) {
      const c = this._readOne('chunks', 'chunk_id', id);
      if (c) chunks[id] = c;
    }
    return { manifest, chunks };
  }

  // ─── Voice / TTS / on-device model packs ──────────────────────────────

  async saveVoiceModelPack(pack) {
    await this.init();
    this._upsert(
      'voice_model_packs',
      ['voice_model_pack_id', 'json'],
      [pack.voiceModelPackId, JSON.stringify(pack)]
    );
    return pack;
  }

  async readVoiceModelPack(id) {
    await this.init();
    return this._readOne('voice_model_packs', 'voice_model_pack_id', id);
  }

  async listVoiceModelPacks() {
    await this.init();
    return this._listAll('voice_model_packs');
  }

  async saveTtsModelPack(pack) {
    await this.init();
    this._upsert(
      'tts_model_packs',
      ['tts_model_pack_id', 'json'],
      [pack.ttsModelPackId, JSON.stringify(pack)]
    );
    return pack;
  }

  async readTtsModelPack(id) {
    await this.init();
    return this._readOne('tts_model_packs', 'tts_model_pack_id', id);
  }

  async listTtsModelPacks() {
    await this.init();
    return this._listAll('tts_model_packs');
  }

  async saveOnDeviceModelPack(pack) {
    await this.init();
    this._upsert(
      'on_device_model_packs',
      ['on_device_model_pack_id', 'json'],
      [pack.onDeviceModelPackId, JSON.stringify(pack)]
    );
    return pack;
  }

  async readOnDeviceModelPack(id) {
    await this.init();
    return this._readOne('on_device_model_packs', 'on_device_model_pack_id', id);
  }

  async listOnDeviceModelPacks() {
    await this.init();
    return this._listAll('on_device_model_packs');
  }

  // ─── Ledger ────────────────────────────────────────────────────────────

  async appendLedger(event) {
    await this.init();
    const eventWithTime = { ...event, at: event.at ?? new Date().toISOString() };
    this.db
      .prepare(
        'INSERT INTO ledger (type, at, identity_id, subject_id, actor_id, operator_id, json) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        eventWithTime.type ?? null,
        eventWithTime.at,
        eventWithTime.identityId ?? null,
        eventWithTime.subjectId ?? null,
        eventWithTime.actorId ?? null,
        eventWithTime.operatorId ?? null,
        JSON.stringify(eventWithTime)
      );
    return eventWithTime;
  }

  async listLedger({ limit = 100, type, newestFirst = true } = {}) {
    await this.init();
    let sql = 'SELECT json FROM ledger';
    const params = [];
    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }
    sql += ` ORDER BY seq ${newestFirst ? 'DESC' : 'ASC'}`;
    if (limit && Number.isFinite(limit)) {
      sql += ` LIMIT ${Math.max(0, Math.floor(limit))}`;
    }
    return all(this.db.prepare(sql).all(...params));
  }

  // ─── Contribution / NCS computation ────────────────────────────────────
  //
  // BosStore.computeContribution() folds nodes + memory + mesh events
  // into the NCS score. Same arithmetic here, just sourcing from
  // SQL rows instead of file globs.

  async computeContribution(identityId) {
    await this.init();
    const nodes = (await this.listNodes()).filter((n) => n.operatorId === identityId);
    const memoryRecords = (await this.listMemoryRecords()).filter((r) => r.ownerId === identityId);
    const meshEvents = (await this.listMeshContributionEvents()).filter(
      (e) => e.operatorId === identityId
    );
    const contributedBytes = nodes.reduce((sum, n) => sum + Number(n.storageBytes ?? 0), 0);
    const consumedBytes = memoryRecords.reduce((sum, r) => sum + Number(r.plaintextBytes ?? 0), 0);
    const scoreBytes = contributedBytes - consumedBytes;
    const meshPaise = meshEvents.reduce((sum, e) => sum + Number(e.payoutPaise ?? 0), 0);
    const meshTokens = meshEvents
      .filter((e) => e.workloadType === 'inference')
      .reduce((sum, e) => sum + Number(e.tokens ?? 0), 0);
    return {
      identityId,
      contributedBytes,
      consumedBytes,
      scoreBytes,
      class: scoreBytes >= 0 ? 'producer' : 'consumer',
      nodeCount: nodes.length,
      memoryRecordCount: memoryRecords.length,
      meshContributionEventCount: meshEvents.length,
      meshPayoutPaise: meshPaise,
      meshTokensServed: meshTokens
    };
  }

  // ─── DPDP erase (now ACID — Phase 4.2 win) ─────────────────────────────
  //
  // The cascade runs inside a single transaction. A crash mid-erase
  // leaves the store in its prior state — none of the partial-deletion
  // failure modes the file store had.

  async eraseUserData(identityId, { redactLedgerEntry } = {}) {
    if (!identityId) throw new Error('identityId is required.');
    await this.init();

    const sections = {};
    const txn = this.db.exec ? this.db : null;
    this.db.exec('BEGIN');
    try {
      // Helper: count rows matching the user across the table's
      // candidate columns, then delete them.
      const sweep = (table, columns) => {
        const where = columns.map((c) => `${c} = ?`).join(' OR ');
        const params = columns.map(() => identityId);
        const count = this.db
          .prepare(`SELECT COUNT(*) as n FROM ${table} WHERE ${where}`)
          .get(...params).n;
        this.db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...params);
        return count;
      };

      sections.consents = sweep('consents', ['subject_id']);
      sections.decisions = sweep('decisions', ['actor_id']);
      sections.orchestrations = sweep('orchestrations', ['actor_id']);
      sections.skillPreflights = sweep('skill_preflights', ['actor_id']);
      sections.toolExecutions = sweep('tool_executions', ['actor_id']);
      sections.memoryRecords = sweep('memory_records', ['owner_id']);
      sections.workerAuthorizations = sweep('worker_authorizations', ['worker_id']);
      sections.flagReports = sweep('flag_reports', ['reporter_id', 'subject_id']);
      sections.meshContributions = sweep('mesh_contributions', ['operator_id']);
      sections.pairingSessions = sweep('pairing_sessions', ['issuer_identity_id']);
      sections.healthDocuments = sweep('health_documents', ['owner_id']);
      sections.profileCredentials = sweep('profile_credentials', ['identity_id']);
      sections.pushSubscriptions = sweep('push_subscriptions', ['identity_id']);
      sections.workerNotifications = sweep('worker_notifications', ['identity_id']);
      sections.federatedUpdates = sweep('federated_updates', ['contributor_id']);
      sections.attestations = sweep('attestations', ['subject_id']);
      sections.phoneOtps = sweep('phone_otps', ['identity_id']);
      sections.earningsLog = sweep('earnings_log', ['identity_id']);
      sections.portableAttestations = sweep('portable_attestations', ['worker_id']);
      sections.incomeVerificationConsents = sweep('income_verification_consents', ['worker_id']);
      sections.meshWithdrawals = sweep('mesh_withdrawals', ['worker_id']);
      sections.identity = sweep('identities', ['id']);

      // Redact ledger entries that mention this user. We rewrite each
      // row's JSON through redactLedgerEntry + null-out the indexed
      // columns so future queries don't find this user.
      let ledgerRedactions = 0;
      if (typeof redactLedgerEntry === 'function') {
        const rows = this.db
          .prepare(
            'SELECT seq, json FROM ledger WHERE identity_id = ? OR subject_id = ? OR actor_id = ? OR operator_id = ?'
          )
          .all(identityId, identityId, identityId, identityId);
        const update = this.db.prepare(
          'UPDATE ledger SET identity_id = NULL, subject_id = NULL, actor_id = NULL, operator_id = NULL, json = ? WHERE seq = ?'
        );
        for (const row of rows) {
          let event;
          try {
            event = JSON.parse(row.json);
          } catch (_error) {
            continue;
          }
          const redacted = redactLedgerEntry(event, identityId);
          if (JSON.stringify(redacted) !== JSON.stringify(event)) ledgerRedactions += 1;
          update.run(JSON.stringify(redacted), row.seq);
        }
        sections.ledgerRedactions = ledgerRedactions;
      }

      this.db.exec('COMMIT');
      // Tombstone — append AFTER commit so an erase that crashed
      // mid-transaction doesn't leave a misleading tombstone.
      await this.appendLedger({
        type: 'account.erased',
        at: new Date().toISOString(),
        identityId: '<erased>',
        sections,
        ledgerRedactions
      });
      return { sections, ledgerRedactions };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

// Convenience: the file-store CLI path / API used a single
// `BosStore` constructor. The factory below picks the implementation
// based on `BHARAT_OS_STORE_KIND` so callers don't need to import
// both modules.
export async function createStore({ rootPath, kind }) {
  const selected = kind ?? process.env?.BHARAT_OS_STORE_KIND ?? 'file';
  if (selected === 'sqlite') {
    return new SqliteStore(rootPath);
  }
  const { BosStore } = await import('./store.mjs');
  return new BosStore(rootPath);
}
