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
import { hydrateProviderIdentity } from '../phase1/provider-identity.mjs';

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

  CREATE TABLE IF NOT EXISTS collective_memberships (
    membership_id TEXT PRIMARY KEY,
    collective_id TEXT,
    member_id TEXT,
    member_role TEXT,
    status TEXT,
    issued_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_collective_memberships_collective ON collective_memberships(collective_id);
  CREATE INDEX IF NOT EXISTS idx_collective_memberships_member ON collective_memberships(member_id);
  CREATE INDEX IF NOT EXISTS idx_collective_memberships_status ON collective_memberships(status);

  CREATE TABLE IF NOT EXISTS blessed_collectives (
    collective_id TEXT PRIMARY KEY,
    collective_name TEXT,
    blessed_at TEXT,
    blessed_by TEXT,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS eshram_registrations (
    registration_id TEXT PRIMARY KEY,
    issuer_id TEXT,
    member_id TEXT,
    uan TEXT,
    state TEXT,
    occupation_category TEXT,
    status TEXT,
    issued_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_eshram_registrations_issuer ON eshram_registrations(issuer_id);
  CREATE INDEX IF NOT EXISTS idx_eshram_registrations_member ON eshram_registrations(member_id);
  CREATE INDEX IF NOT EXISTS idx_eshram_registrations_status ON eshram_registrations(status);

  CREATE TABLE IF NOT EXISTS scheme_entitlements (
    entitlement_id TEXT PRIMARY KEY,
    issuer_id TEXT,
    member_id TEXT,
    scheme_code TEXT,
    status TEXT,
    issued_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scheme_entitlements_issuer ON scheme_entitlements(issuer_id);
  CREATE INDEX IF NOT EXISTS idx_scheme_entitlements_member ON scheme_entitlements(member_id);
  CREATE INDEX IF NOT EXISTS idx_scheme_entitlements_status ON scheme_entitlements(status);

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

  CREATE TABLE IF NOT EXISTS slm_model_packs (
    slm_model_pack_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS installed_slms (
    install_id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_installed_slms_identity ON installed_slms(identity_id);

  CREATE TABLE IF NOT EXISTS skill_agents (
    skill_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS citizen_data_offers (
    offer_id TEXT PRIMARY KEY,
    publisher_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_citizen_data_offers_publisher ON citizen_data_offers(publisher_id);

  CREATE TABLE IF NOT EXISTS sponsors (
    sponsor_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS labeling_jobs (
    job_id TEXT PRIMARY KEY,
    sponsor_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_labeling_jobs_sponsor ON labeling_jobs(sponsor_id);

  CREATE TABLE IF NOT EXISTS labeling_job_items (
    item_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_labeling_items_job ON labeling_job_items(job_id);

  CREATE TABLE IF NOT EXISTS labeling_submissions (
    submission_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_labeling_sub_job ON labeling_submissions(job_id);
  CREATE INDEX IF NOT EXISTS idx_labeling_sub_worker ON labeling_submissions(worker_id);

  CREATE TABLE IF NOT EXISTS audit_signer (
    singleton TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS provider_identities (
    provider_identity_id TEXT PRIMARY KEY,
    root_identity_id TEXT NOT NULL,
    role_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_provider_id_root ON provider_identities(root_identity_id);
  CREATE INDEX IF NOT EXISTS idx_provider_id_role ON provider_identities(role_kind);
  CREATE INDEX IF NOT EXISTS idx_provider_id_status ON provider_identities(status);

  CREATE TABLE IF NOT EXISTS bookings (
    booking_id TEXT PRIMARY KEY,
    citizen_root_identity_id TEXT NOT NULL,
    provider_identity_id TEXT NOT NULL,
    provider_root_identity_id TEXT NOT NULL,
    role_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    seq INTEGER NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_booking_citizen ON bookings(citizen_root_identity_id);
  CREATE INDEX IF NOT EXISTS idx_booking_provider ON bookings(provider_identity_id);
  CREATE INDEX IF NOT EXISTS idx_booking_provider_root ON bookings(provider_root_identity_id);
  CREATE INDEX IF NOT EXISTS idx_booking_status ON bookings(status);

  CREATE TABLE IF NOT EXISTS citizen_escrows (
    citizen_root_identity_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );

  -- Phase 12.2.6 — DigiLocker state + link tables. State is
  -- the OAuth2 CSRF parameter minted at /authorize; link is
  -- the access+refresh token persisted after /callback.
  -- Both cascade by root_identity_id.
  CREATE TABLE IF NOT EXISTS digilocker_states (
    state TEXT PRIMARY KEY,
    root_identity_id TEXT NOT NULL,
    minted_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_digilocker_states_root ON digilocker_states(root_identity_id);
  CREATE INDEX IF NOT EXISTS idx_digilocker_states_expires ON digilocker_states(expires_at);

  CREATE TABLE IF NOT EXISTS digilocker_links (
    root_identity_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    json TEXT NOT NULL
  );

  -- Phase 12.2.3 — Attachment CORE substrate. Binary blobs
  -- owned by a root identity (KYC selfies, ID proofs, per-role
  -- docs, dispute evidence). Composite PK on (sha256, root)
  -- so two citizens uploading the same JPEG hold their own
  -- DPDP-erasable copies. The bytes column is the BLOB (first
  -- in the schema); json mirrors the metadata for cheap reads.
  CREATE TABLE IF NOT EXISTS attachments (
    sha256 TEXT NOT NULL,
    root_identity_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    bytes BLOB NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (sha256, root_identity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_owner_created ON attachments(root_identity_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_attachments_kind ON attachments(kind);
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

  // Phase 7.0 — push services return 410 Gone when a subscription
  // is permanently invalid (user revoked notifications, app
  // uninstalled, browser cleared site data). The recovery-alert
  // sender calls this to clean up automatically.
  async deletePushSubscription(subscriptionId) {
    await this.init();
    const info = this.db
      .prepare('DELETE FROM push_subscriptions WHERE subscription_id = ?')
      .run(subscriptionId);
    return Number(info.changes) > 0;
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

  // ─── Collective memberships — Phase 6.2 ───────────────────────────────

  async saveCollectiveMembership(membership) {
    await this.init();
    if (!membership?.membershipId) {
      throw new Error('collective membership requires membershipId.');
    }
    this._upsert(
      'collective_memberships',
      [
        'membership_id',
        'collective_id',
        'member_id',
        'member_role',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'json'
      ],
      [
        membership.membershipId,
        membership.collectiveId ?? null,
        membership.memberId ?? null,
        membership.memberRole ?? null,
        membership.status ?? 'active',
        membership.issuedAt ?? null,
        membership.expiresAt ?? null,
        membership.revokedAt ?? null,
        JSON.stringify(membership)
      ]
    );
    return membership;
  }

  async readCollectiveMembership(membershipId) {
    await this.init();
    return this._readOne('collective_memberships', 'membership_id', membershipId);
  }

  async listCollectiveMemberships({ collectiveId, memberId, status } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (collectiveId) {
      clauses.push('collective_id = ?');
      values.push(collectiveId);
    }
    if (memberId) {
      clauses.push('member_id = ?');
      values.push(memberId);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM collective_memberships ${where} ORDER BY issued_at DESC`;
    return all(this.db.prepare(sql).all(...values));
  }

  async saveBlessedCollective(record) {
    await this.init();
    if (!record?.collectiveId) {
      throw new Error('blessed-collective record requires collectiveId.');
    }
    this._upsert(
      'blessed_collectives',
      ['collective_id', 'collective_name', 'blessed_at', 'blessed_by', 'json'],
      [
        record.collectiveId,
        record.collectiveName ?? null,
        record.blessedAt ?? null,
        record.blessedBy ?? null,
        JSON.stringify(record)
      ]
    );
    return record;
  }

  async readBlessedCollective(collectiveId) {
    await this.init();
    return this._readOne('blessed_collectives', 'collective_id', collectiveId);
  }

  async listBlessedCollectives() {
    await this.init();
    return this._listAll('blessed_collectives');
  }

  async deleteBlessedCollective(collectiveId) {
    await this.init();
    const sql = 'DELETE FROM blessed_collectives WHERE collective_id = ?';
    const info = this.db.prepare(sql).run(collectiveId);
    return Number(info.changes) > 0;
  }

  // ─── e-Shram registrations — Phase 6.3 ────────────────────────────────

  async saveEShramRegistration(registration) {
    await this.init();
    if (!registration?.registrationId) {
      throw new Error('eshram registration requires registrationId.');
    }
    this._upsert(
      'eshram_registrations',
      [
        'registration_id',
        'issuer_id',
        'member_id',
        'uan',
        'state',
        'occupation_category',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'json'
      ],
      [
        registration.registrationId,
        registration.issuerId ?? null,
        registration.memberId ?? null,
        registration.uan ?? null,
        registration.state ?? null,
        registration.occupationCategory ?? null,
        registration.status ?? 'active',
        registration.issuedAt ?? null,
        registration.expiresAt ?? null,
        registration.revokedAt ?? null,
        JSON.stringify(registration)
      ]
    );
    return registration;
  }

  async readEShramRegistration(registrationId) {
    await this.init();
    return this._readOne('eshram_registrations', 'registration_id', registrationId);
  }

  async listEShramRegistrations({ issuerId, memberId, status } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (issuerId) {
      clauses.push('issuer_id = ?');
      values.push(issuerId);
    }
    if (memberId) {
      clauses.push('member_id = ?');
      values.push(memberId);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM eshram_registrations ${where} ORDER BY issued_at DESC`;
    return all(this.db.prepare(sql).all(...values));
  }

  // ─── Scheme entitlements — Phase 6.3 ──────────────────────────────────

  async saveSchemeEntitlement(entitlement) {
    await this.init();
    if (!entitlement?.entitlementId) {
      throw new Error('scheme entitlement requires entitlementId.');
    }
    this._upsert(
      'scheme_entitlements',
      [
        'entitlement_id',
        'issuer_id',
        'member_id',
        'scheme_code',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'json'
      ],
      [
        entitlement.entitlementId,
        entitlement.issuerId ?? null,
        entitlement.memberId ?? null,
        entitlement.schemeCode ?? null,
        entitlement.status ?? 'active',
        entitlement.issuedAt ?? null,
        entitlement.expiresAt ?? null,
        entitlement.revokedAt ?? null,
        JSON.stringify(entitlement)
      ]
    );
    return entitlement;
  }

  async readSchemeEntitlement(entitlementId) {
    await this.init();
    return this._readOne('scheme_entitlements', 'entitlement_id', entitlementId);
  }

  async listSchemeEntitlements({ issuerId, memberId, schemeCode, status } = {}) {
    await this.init();
    const clauses = [];
    const values = [];
    if (issuerId) {
      clauses.push('issuer_id = ?');
      values.push(issuerId);
    }
    if (memberId) {
      clauses.push('member_id = ?');
      values.push(memberId);
    }
    if (schemeCode) {
      clauses.push('scheme_code = ?');
      values.push(schemeCode);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT json FROM scheme_entitlements ${where} ORDER BY issued_at DESC`;
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

  // Phase 9.0a — Tier-4 SLM registry. Admin-curated metadata for
  // 1.5-4 GB Small Language Model packs (Phi-3-mini, Gemma-2B etc.).
  // Distinct from Tier-2 on-device-model-packs (~7 MB ASR/TTS/intent).
  async saveSlmModelPack(pack) {
    await this.init();
    this._upsert(
      'slm_model_packs',
      ['slm_model_pack_id', 'json'],
      [pack.modelPackId, JSON.stringify(pack)]
    );
    await this.appendLedger({
      type: pack.status === 'revoked'
        ? 'slm_model_pack.revoked'
        : 'slm_model_pack.registered',
      modelPackId: pack.modelPackId,
      family: pack.family,
      variant: pack.variant,
      runtime: pack.runtime,
      quantization: pack.quantization,
      diskBytes: pack.diskBytes,
      operator: pack.status === 'revoked' ? pack.revokedBy : pack.registeredBy
    });
    return pack;
  }

  async readSlmModelPack(id) {
    await this.init();
    return this._readOne('slm_model_packs', 'slm_model_pack_id', id);
  }

  async listSlmModelPacks() {
    await this.init();
    return this._listAll('slm_model_packs');
  }

  // Phase 13.4 — Tier-4 SLM-H skill-agent registry. Admin-curated
  // metadata; not per-identity (no DPDP §12(3) cascade). Mirrors
  // slm_model_packs persistence shape.
  async saveSkillAgent(skillAgent) {
    await this.init();
    this._upsert(
      'skill_agents',
      ['skill_id', 'json'],
      [skillAgent.skillId, JSON.stringify(skillAgent)]
    );
    await this.appendLedger({
      type: skillAgent.status === 'revoked'
        ? 'skill_agent.revoked'
        : 'skill_agent.registered',
      skillId: skillAgent.skillId,
      category: skillAgent.category,
      protocolVersion: skillAgent.protocolVersion,
      operator: skillAgent.status === 'revoked'
        ? skillAgent.revokedBy
        : skillAgent.registeredBy
    });
    return skillAgent;
  }

  async readSkillAgent(skillId) {
    await this.init();
    return this._readOne('skill_agents', 'skill_id', skillId);
  }

  async listSkillAgents() {
    await this.init();
    return this._listAll('skill_agents');
  }

  // Phase 13.5 — citizen data offers. Per-identity (publisher_id);
  // DPDP §12(3) cascade entry in deleteIdentityCascade below.
  async saveCitizenDataOffer(offer) {
    await this.init();
    this._upsert(
      'citizen_data_offers',
      ['offer_id', 'publisher_id', 'json'],
      [offer.offerId, offer.publisherId, JSON.stringify(offer)]
    );
    const eventType =
      offer.status === 'revoked'
        ? 'citizen_data_offer.revoked'
        : offer.status === 'paused'
          ? 'citizen_data_offer.paused'
          : 'citizen_data_offer.published';
    await this.appendLedger({
      type: eventType,
      offerId: offer.offerId,
      publisherId: offer.publisherId,
      dataPointKind: offer.dataPointKind,
      pricePerSalePaise: offer.pricePerSalePaise,
      maxSales: offer.maxSales,
      salesCount: offer.salesCount,
      purposeCount: offer.sponsorPurposeAllowlist.length
    });
    return offer;
  }

  async readCitizenDataOffer(offerId) {
    await this.init();
    return this._readOne('citizen_data_offers', 'offer_id', offerId);
  }

  async listCitizenDataOffers({ publisherId } = {}) {
    await this.init();
    const all = this._listAll('citizen_data_offers');
    if (!publisherId) return all;
    return all.filter((o) => o.publisherId === publisherId);
  }

  // Phase 9.0b — per-identity SLM install records. Pointer-not-
  // payload (model bytes are client-side OPFS). DPDP §12(3)
  // cascade entry below in deleteIdentityCascade.
  async saveInstalledSlm(record) {
    await this.init();
    this._upsert(
      'installed_slms',
      ['install_id', 'identity_id', 'json'],
      [record.installId, record.identityId, JSON.stringify(record)]
    );
    await this.appendLedger({
      type: record.status === 'failed'
        ? 'installed_slm.failed'
        : 'installed_slm.recorded',
      installId: record.installId,
      identityId: record.identityId,
      modelPackId: record.modelPackId,
      runtimeBackend: record.runtimeBackend,
      downloadedBytes: record.downloadedBytes
    });
    return record;
  }

  async readInstalledSlm(installId) {
    await this.init();
    return this._readOne('installed_slms', 'install_id', installId);
  }

  async listInstalledSlms() {
    await this.init();
    return this._listAll('installed_slms');
  }

  async deleteInstalledSlm(installId) {
    await this.init();
    const info = this.db
      .prepare('DELETE FROM installed_slms WHERE install_id = ?')
      .run(installId);
    const deleted = Number(info.changes) > 0;
    if (deleted) {
      await this.appendLedger({
        type: 'installed_slm.removed',
        installId
      });
    }
    return deleted;
  }

  // Phase 9.1 — sponsor records. Admin-curated CRUD + sponsor-bearer-
  // gated mutations on their own resource. Not per-identity → no DPDP
  // §12(3) cascade entry; round-update rows already cascade.
  async saveSponsor(sponsor) {
    if (!sponsor?.sponsorId) {
      throw new Error('sponsor requires sponsorId.');
    }
    await this.init();
    this._upsert(
      'sponsors',
      ['sponsor_id', 'json'],
      [sponsor.sponsorId, JSON.stringify(sponsor)]
    );
    await this.appendLedger({
      type: 'sponsor.saved',
      sponsorId: sponsor.sponsorId,
      displayName: sponsor.displayName,
      status: sponsor.status,
      escrowBalancePaise: sponsor.escrowBalancePaise
    });
    return sponsor;
  }

  async readSponsor(sponsorId) {
    await this.init();
    return this._readOne('sponsors', 'sponsor_id', sponsorId);
  }

  async listSponsors() {
    await this.init();
    return this._listAll('sponsors');
  }

  // Phase 10.1 — labeling marketplace CRUD. labeling_submissions
  // also cascade by worker_id in eraseUserData.
  async saveLabelingJob(job) {
    if (!job?.jobId) throw new Error('labeling job requires jobId.');
    await this.init();
    this._upsert(
      'labeling_jobs',
      ['job_id', 'sponsor_id', 'json'],
      [job.jobId, job.sponsorId, JSON.stringify(job)]
    );
    await this.appendLedger({
      type: 'labeling_job.saved',
      jobId: job.jobId,
      sponsorId: job.sponsorId,
      status: job.status,
      itemCount: job.itemCount,
      perLabelPaise: job.perLabelPaise
    });
    return job;
  }

  async readLabelingJob(jobId) {
    await this.init();
    return this._readOne('labeling_jobs', 'job_id', jobId);
  }

  async listLabelingJobs() {
    await this.init();
    return this._listAll('labeling_jobs');
  }

  async saveLabelingJobItem(item) {
    if (!item?.itemId) throw new Error('labeling job item requires itemId.');
    await this.init();
    this._upsert(
      'labeling_job_items',
      ['item_id', 'job_id', 'json'],
      [item.itemId, item.jobId, JSON.stringify(item)]
    );
    return item;
  }

  async readLabelingJobItem(itemId) {
    await this.init();
    return this._readOne('labeling_job_items', 'item_id', itemId);
  }

  async listLabelingJobItems({ jobId } = {}) {
    await this.init();
    if (jobId) {
      const rows = this.db
        .prepare('SELECT json FROM labeling_job_items WHERE job_id = ?')
        .all(jobId);
      return rows.map((r) => JSON.parse(r.json));
    }
    return this._listAll('labeling_job_items');
  }

  async saveLabelingSubmission(submission) {
    if (!submission?.submissionId) {
      throw new Error('labeling submission requires submissionId.');
    }
    await this.init();
    this._upsert(
      'labeling_submissions',
      ['submission_id', 'job_id', 'worker_id', 'item_id', 'json'],
      [
        submission.submissionId,
        submission.jobId,
        submission.workerId,
        submission.itemId,
        JSON.stringify(submission)
      ]
    );
    await this.appendLedger({
      type: submission.status === 'accepted'
        ? 'labeling_submission.accepted'
        : 'labeling_submission.rejected',
      submissionId: submission.submissionId,
      jobId: submission.jobId,
      itemId: submission.itemId,
      workerId: submission.workerId
    });
    return submission;
  }

  async readLabelingSubmission(submissionId) {
    await this.init();
    return this._readOne('labeling_submissions', 'submission_id', submissionId);
  }

  async listLabelingSubmissions({ jobId, workerId } = {}) {
    await this.init();
    let sql = 'SELECT json FROM labeling_submissions';
    const where = [];
    const params = [];
    if (jobId) {
      where.push('job_id = ?');
      params.push(jobId);
    }
    if (workerId) {
      where.push('worker_id = ?');
      params.push(workerId);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => JSON.parse(r.json));
  }

  // ─── Phase 12.0 Provider identities ──────────────────────────────────

  async saveProviderIdentity(provider) {
    if (!provider?.providerIdentityId) {
      throw new Error('provider identity requires providerIdentityId.');
    }
    if (!provider.rootIdentityId) {
      throw new Error('provider identity requires rootIdentityId.');
    }
    await this.init();
    this._upsert(
      'provider_identities',
      ['provider_identity_id', 'root_identity_id', 'role_kind', 'status', 'json'],
      [
        provider.providerIdentityId,
        provider.rootIdentityId,
        provider.roleKind,
        provider.status,
        JSON.stringify(provider)
      ]
    );
    await this.appendLedger({
      type: 'provider_identity.saved',
      providerIdentityId: provider.providerIdentityId,
      rootIdentityId: provider.rootIdentityId,
      roleKind: provider.roleKind,
      status: provider.status,
      kycLevel: provider.kycLevel
    });
    return provider;
  }

  async readProviderIdentity(providerIdentityId) {
    await this.init();
    const p = await this._readOne('provider_identities', 'provider_identity_id', providerIdentityId);
    return hydrateProviderIdentity(p);
  }

  async listProviderIdentities({ rootIdentityId, roleKind, status } = {}) {
    await this.init();
    let sql = 'SELECT json FROM provider_identities';
    const where = [];
    const params = [];
    if (rootIdentityId) {
      where.push('root_identity_id = ?');
      params.push(rootIdentityId);
    }
    if (roleKind) {
      where.push('role_kind = ?');
      params.push(roleKind);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => hydrateProviderIdentity(JSON.parse(r.json)));
  }

  // ─── Phase 12.1a.2 — Bookings + citizen escrow ────────────────────────

  async saveBooking(booking) {
    if (!booking?.bookingId) throw new Error('booking requires bookingId.');
    await this.init();
    this._upsert(
      'bookings',
      ['booking_id', 'citizen_root_identity_id', 'provider_identity_id', 'provider_root_identity_id', 'role_kind', 'status', 'seq', 'json'],
      [
        booking.bookingId,
        booking.citizenRootIdentityId,
        booking.providerIdentityId,
        booking.providerRootIdentityId,
        booking.roleKind,
        booking.status,
        booking.seq,
        JSON.stringify(booking)
      ]
    );
    return booking;
  }

  async readBooking(bookingId) {
    await this.init();
    return this._readOne('bookings', 'booking_id', bookingId);
  }

  async listBookings({ citizenRootIdentityId, providerIdentityId, status } = {}) {
    await this.init();
    let sql = 'SELECT json FROM bookings';
    const where = [];
    const params = [];
    if (citizenRootIdentityId) {
      where.push('citizen_root_identity_id = ?');
      params.push(citizenRootIdentityId);
    }
    if (providerIdentityId) {
      where.push('provider_identity_id = ?');
      params.push(providerIdentityId);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY booking_id';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => JSON.parse(r.json));
  }

  // Atomic CAS write. UPDATE ... WHERE seq=? + ledger appends within
  // a SQLite transaction. Second concurrent caller observes
  // rowsAffected === 0 and gets a typed stale_seq.
  //
  // node:sqlite does NOT expose better-sqlite3's db.transaction()
  // helper, so we run BEGIN IMMEDIATE / COMMIT manually. BEGIN
  // IMMEDIATE acquires a RESERVED lock so the second concurrent
  // CAS waits — when it reads back the seq, it sees the post-write
  // value and gets `stale_seq` correctly.
  async casUpdateBooking(bookingId, expectedSeq, nextBooking, ledgerEvents = []) {
    await this.init();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db
        .prepare(
          'UPDATE bookings SET status = ?, seq = ?, json = ? WHERE booking_id = ? AND seq = ?'
        )
        .run(nextBooking.status, nextBooking.seq, JSON.stringify(nextBooking), bookingId, expectedSeq);
      if (result.changes !== 1) {
        const current = this.db.prepare('SELECT seq FROM bookings WHERE booking_id = ?').get(bookingId);
        this.db.exec('ROLLBACK');
        if (!current) {
          const err = new Error('unknown_booking');
          err.code = 'unknown_booking';
          throw err;
        }
        const err = new Error('stale_seq');
        err.code = 'stale_seq';
        err.currentSeq = current.seq;
        throw err;
      }
      for (const event of ledgerEvents) {
        this.db
          .prepare(
            'INSERT INTO ledger (type, at, identity_id, subject_id, actor_id, operator_id, json) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            event.type,
            event.at || new Date().toISOString(),
            event.identityId || null,
            event.subjectId || null,
            event.actorId || null,
            event.operatorId || null,
            JSON.stringify(event)
          );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      if (err?.code !== 'stale_seq' && err?.code !== 'unknown_booking') {
        try { this.db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
      }
      throw err;
    }
    return nextBooking;
  }

  async saveCitizenEscrow(escrow) {
    if (!escrow?.citizenRootIdentityId) throw new Error('citizenEscrow requires citizenRootIdentityId.');
    await this.init();
    this._upsert(
      'citizen_escrows',
      ['citizen_root_identity_id', 'json'],
      [escrow.citizenRootIdentityId, JSON.stringify(escrow)]
    );
    return escrow;
  }

  // Phase 12.1a.2 ESCROW-CAS — atomic check+write on citizen escrow.
  // Mirrors casUpdateBooking semantics: only succeeds if the stored
  // seq matches expectedSeq, otherwise throws { code: 'stale_seq' }
  // so the caller can re-read + retry. Used by the booking-create
  // path so two parallel citizen booking-creates can't both pass
  // the available-balance check.
  async casUpdateCitizenEscrow(citizenRootIdentityId, expectedSeq, nextEscrow) {
    await this.init();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT json FROM citizen_escrows WHERE citizen_root_identity_id = ?').get(citizenRootIdentityId);
      if (!row) {
        // No prior record; this is a first-write — only allowed when
        // expectedSeq is null (caller signals "no prior expected").
        if (expectedSeq != null) {
          this.db.exec('ROLLBACK');
          const err = new Error('stale_seq');
          err.code = 'stale_seq';
          err.currentSeq = null;
          throw err;
        }
        this._upsert(
          'citizen_escrows',
          ['citizen_root_identity_id', 'json'],
          [citizenRootIdentityId, JSON.stringify(nextEscrow)]
        );
        this.db.exec('COMMIT');
        return nextEscrow;
      }
      const current = JSON.parse(row.json);
      const currentSeq = Number(current.seq || 0);
      if (Number(expectedSeq) !== currentSeq) {
        this.db.exec('ROLLBACK');
        const err = new Error('stale_seq');
        err.code = 'stale_seq';
        err.currentSeq = currentSeq;
        throw err;
      }
      this._upsert(
        'citizen_escrows',
        ['citizen_root_identity_id', 'json'],
        [citizenRootIdentityId, JSON.stringify(nextEscrow)]
      );
      this.db.exec('COMMIT');
    } catch (err) {
      if (err?.code !== 'stale_seq') {
        try { this.db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      throw err;
    }
    return nextEscrow;
  }

  async readCitizenEscrow(citizenRootIdentityId) {
    await this.init();
    return this._readOne('citizen_escrows', 'citizen_root_identity_id', citizenRootIdentityId);
  }

  // ─── Phase 12.2.3 — Attachment CORE substrate ─────────────────────────

  async saveAttachment(record, { quotaCapBytes } = {}) {
    if (!record?.attachmentId) throw new Error('attachment requires attachmentId.');
    if (!record.rootIdentityId) throw new Error('attachment requires rootIdentityId.');
    if (!Buffer.isBuffer(record.bytes)) throw new Error('attachment.bytes must be a Buffer.');
    await this.init();
    // bytes column is BLOB; the rest of the metadata mirrors
    // into json for cheap meta-only reads.
    const meta = {
      attachmentId: record.attachmentId,
      protocolVersion: record.protocolVersion,
      objectType: record.objectType,
      rootIdentityId: record.rootIdentityId,
      sha256: record.sha256,
      byteLength: record.byteLength,
      mimeType: record.mimeType,
      mayContainExif: Boolean(record.mayContainExif),
      kind: record.kind,
      createdAt: record.createdAt
    };
    // Phase 12.2.3 fix A3-4 — wrap the (current sum + new
    // byteLength) check + INSERT in a single BEGIN IMMEDIATE
    // transaction so two parallel POSTs from the same actor
    // can't both pass the cap check and blow past the limit.
    // When quotaCapBytes is omitted, the txn still serialises
    // the insert (useful for tests) but skips the cap math.
    this.db.prepare('BEGIN IMMEDIATE').run();
    try {
      if (Number.isFinite(quotaCapBytes)) {
        const row = this.db
          .prepare('SELECT COALESCE(SUM(byte_length), 0) AS total FROM attachments WHERE root_identity_id = ?')
          .get(record.rootIdentityId);
        const current = row ? Number(row.total || 0) : 0;
        // Subtract the existing row's bytes if this is an
        // overwrite of the same (sha256, root) — content-
        // addressed so the new bytes are identical, but the
        // count would double otherwise.
        const existingRow = this.db
          .prepare('SELECT byte_length FROM attachments WHERE sha256 = ? AND root_identity_id = ?')
          .get(record.sha256, record.rootIdentityId);
        const existingBytes = existingRow ? Number(existingRow.byte_length || 0) : 0;
        if (current - existingBytes + record.byteLength > quotaCapBytes) {
          this.db.prepare('ROLLBACK').run();
          const err = new Error('attachment would exceed the actor quota.');
          err.code = 'actor_quota_exceeded';
          err.currentBytes = current;
          err.attemptedAdd = record.byteLength;
          err.cap = quotaCapBytes;
          throw err;
        }
      }
      this.db
        .prepare(
          `INSERT INTO attachments (sha256, root_identity_id, mime_type, byte_length, kind, created_at, bytes, json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (sha256, root_identity_id) DO UPDATE SET
             mime_type = excluded.mime_type,
             byte_length = excluded.byte_length,
             kind = excluded.kind,
             created_at = excluded.created_at,
             bytes = excluded.bytes,
             json = excluded.json`
        )
        .run(
          record.sha256,
          record.rootIdentityId,
          record.mimeType,
          record.byteLength,
          record.kind,
          record.createdAt,
          record.bytes,
          JSON.stringify(meta)
        );
      this.db.prepare('COMMIT').run();
    } catch (err) {
      // BEGIN IMMEDIATE always commits or rolls back; ignore
      // the ROLLBACK-after-ROLLBACK error.
      try { this.db.prepare('ROLLBACK').run(); } catch (_) {}
      throw err;
    }
    await this.appendLedger({
      type: 'attachment.saved',
      attachmentId: record.attachmentId,
      rootIdentityId: record.rootIdentityId,
      sha256: record.sha256,
      byteLength: record.byteLength,
      mimeType: record.mimeType,
      kind: record.kind,
      at: record.createdAt
    });
    return record;
  }

  async readAttachment(attachmentId, { rootIdentityId } = {}) {
    await this.init();
    if (!attachmentId) return null;
    // Content-addressed ID encodes the sha256 prefix; we still
    // require the rootIdentityId for the composite key lookup,
    // OR we scan by sha256 prefix (slower, used only when the
    // caller doesn't know the owner — e.g. an operator).
    let row;
    if (rootIdentityId) {
      row = this.db
        .prepare('SELECT json, bytes FROM attachments WHERE sha256 LIKE ? AND root_identity_id = ?')
        .get(attachmentId.slice('bos:att:'.length) + '%', rootIdentityId);
    } else {
      row = this.db
        .prepare('SELECT json, bytes FROM attachments WHERE sha256 LIKE ? LIMIT 1')
        .get(attachmentId.slice('bos:att:'.length) + '%');
    }
    if (!row) return null;
    // node:sqlite returns BLOB as Uint8Array; normalise to
    // Buffer so callers can stream it through response.end +
    // hex-compare in tests.
    const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
    return { ...JSON.parse(row.json), bytes };
  }

  async listAttachments({ rootIdentityId, kind } = {}) {
    await this.init();
    let sql = 'SELECT json FROM attachments';
    const where = [];
    const params = [];
    if (rootIdentityId) {
      where.push('root_identity_id = ?');
      params.push(rootIdentityId);
    }
    if (kind) {
      where.push('kind = ?');
      params.push(kind);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params);
    // The listing endpoint MUST NOT return bytes — that's what
    // GET /api/attachments/:id is for. Metadata only.
    return rows.map((r) => JSON.parse(r.json));
  }

  async sumAttachmentBytesByActor(rootIdentityId) {
    // Phase 12.2.3 fix PII-6 — refuse empty actor.
    if (!rootIdentityId) return 0;
    await this.init();
    const row = this.db
      .prepare('SELECT COALESCE(SUM(byte_length), 0) AS total FROM attachments WHERE root_identity_id = ?')
      .get(rootIdentityId);
    return row ? Number(row.total || 0) : 0;
  }

  async deleteAttachment(attachmentId, { rootIdentityId, at } = {}) {
    await this.init();
    if (!attachmentId) return false;
    const result = this.db
      .prepare('DELETE FROM attachments WHERE sha256 LIKE ? AND root_identity_id = ?')
      .run(attachmentId.slice('bos:att:'.length) + '%', rootIdentityId);
    if (result.changes > 0) {
      await this.appendLedger({
        type: 'attachment.erased',
        attachmentId,
        rootIdentityId,
        at: at || new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  // ─── Phase 12.2.6 — DigiLocker state + link tables ──────────────────

  async saveDigiLockerState(record) {
    if (!record?.state) throw new Error('digilocker state requires state.');
    if (!record.rootIdentityId) throw new Error('digilocker state requires rootIdentityId.');
    await this.init();
    // Persist the FULL record (includes redirectUri + next so
    // the callback can complete the flow); indexed columns
    // mirror just the lookup fields.
    this.db
      .prepare(
        `INSERT INTO digilocker_states (state, root_identity_id, minted_at, expires_at, json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (state) DO UPDATE SET
           root_identity_id = excluded.root_identity_id,
           minted_at = excluded.minted_at,
           expires_at = excluded.expires_at,
           json = excluded.json`
      )
      .run(
        record.state,
        record.rootIdentityId,
        record.mintedAt,
        record.expiresAt,
        JSON.stringify(record)
      );
    return record;
  }

  async peekDigiLockerState(state) {
    await this.init();
    if (!state) return null;
    const row = this.db
      .prepare('SELECT json FROM digilocker_states WHERE state = ?')
      .get(state);
    return row ? JSON.parse(row.json) : null;
  }

  async consumeDigiLockerState(state) {
    await this.init();
    const row = this.db
      .prepare('SELECT json FROM digilocker_states WHERE state = ?')
      .get(state);
    if (!row) return null;
    const meta = JSON.parse(row.json);
    // One-shot — consuming the state deletes it.
    this.db.prepare('DELETE FROM digilocker_states WHERE state = ?').run(state);
    return meta;
  }

  async sweepExpiredDigiLockerStates({ now = new Date().toISOString() } = {}) {
    await this.init();
    const result = this.db
      .prepare('DELETE FROM digilocker_states WHERE expires_at < ?')
      .run(now);
    return result.changes;
  }

  async saveDigiLockerLink(link) {
    if (!link?.rootIdentityId) throw new Error('digilocker link requires rootIdentityId.');
    await this.init();
    this.db
      .prepare(
        `INSERT INTO digilocker_links (root_identity_id, mode, expires_at, linked_at, json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (root_identity_id) DO UPDATE SET
           mode = excluded.mode,
           expires_at = excluded.expires_at,
           linked_at = excluded.linked_at,
           json = excluded.json`
      )
      .run(link.rootIdentityId, link.mode || 'stub', link.expiresAt, link.linkedAt, JSON.stringify(link));
    await this.appendLedger({
      type: 'digilocker.link_saved',
      rootIdentityId: link.rootIdentityId,
      mode: link.mode,
      scope: link.scope,
      expiresAt: link.expiresAt,
      at: link.linkedAt
    });
    return link;
  }

  async readDigiLockerLink(rootIdentityId) {
    await this.init();
    if (!rootIdentityId) return null;
    const row = this.db
      .prepare('SELECT json FROM digilocker_links WHERE root_identity_id = ?')
      .get(rootIdentityId);
    return row ? JSON.parse(row.json) : null;
  }

  async deleteDigiLockerLink(rootIdentityId, { at = new Date().toISOString() } = {}) {
    await this.init();
    if (!rootIdentityId) return false;
    const result = this.db
      .prepare('DELETE FROM digilocker_links WHERE root_identity_id = ?')
      .run(rootIdentityId);
    if (result.changes > 0) {
      await this.appendLedger({
        type: 'digilocker.link_erased',
        rootIdentityId,
        at
      });
      return true;
    }
    return false;
  }

  // ─── Phase 10.5 Audit signer (singleton) ──────────────────────────────

  async readAuditSigner() {
    await this.init();
    const row = this.db
      .prepare('SELECT json FROM audit_signer WHERE singleton = ?')
      .get('audit-signer');
    return row ? JSON.parse(row.json) : null;
  }

  async saveAuditSigner(signer) {
    if (!signer?.id) throw new Error('audit signer requires id.');
    await this.init();
    this.db
      .prepare(
        'INSERT OR REPLACE INTO audit_signer (singleton, json) VALUES (?, ?)'
      )
      .run('audit-signer', JSON.stringify(signer));
    await this.appendLedger({
      type: 'audit_signer.created',
      signerId: signer.id,
      createdAt: signer.createdAt
    });
    return signer;
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
      // Phase 6.2 — erase memberships in which this identity is
      // EITHER the member (most common case) OR the collective
      // issuer. If a collective erases itself, its issued
      // attestations become orphaned and should be cleared so
      // verification consistently returns 'unknown_collective'.
      sections.collectiveMemberships = sweep('collective_memberships', [
        'member_id',
        'collective_id'
      ]);
      // Blessed-collective registry entries — an erased identity
      // that was on the registry is removed from it.
      sections.blessedCollectives = sweep('blessed_collectives', ['collective_id']);
      // Phase 6.3 — e-Shram registrations + scheme entitlements
      // where the identity is EITHER the member (most common) OR
      // the issuer.
      sections.eshramRegistrations = sweep('eshram_registrations', [
        'member_id',
        'issuer_id'
      ]);
      sections.schemeEntitlements = sweep('scheme_entitlements', [
        'member_id',
        'issuer_id'
      ]);
      // Phase 9.0b — per-identity SLM install records. Model bytes
      // are client-side OPFS / IndexedDB, wiped by Phase 4.0's
      // identity-scoped client storage clear; here we erase the
      // server-side install record so it can't be used as a
      // reattachment vector.
      sections.installedSlms = sweep('installed_slms', ['identity_id']);
      // Phase 10.1 — labeling submissions cascade by worker_id.
      // Jobs + items are sponsor-owned and stay.
      sections.labelingSubmissions = sweep('labeling_submissions', ['worker_id']);
      // Phase 12.0 — provider identities cascade by root_identity_id.
      // A providerIdentity is bound to a root citizen/worker identity;
      // when that root erases, all bound provider profiles go too.
      // §15: no orphaned providers in the marketplace.
      sections.providerIdentities = sweep('provider_identities', ['root_identity_id']);
      // Phase 12.1a.2 — bookings cascade if either party's root
      // identity is erased. Citizen erasure removes their booking
      // history; provider-root erasure removes bookings the provider
      // was a party to. Either path satisfies DPDP §12(3).
      sections.bookings = sweep('bookings', ['citizen_root_identity_id', 'provider_root_identity_id']);
      // Citizen-escrow envelope cascades on citizen erasure.
      sections.citizenEscrows = sweep('citizen_escrows', ['citizen_root_identity_id']);
      // Phase 13.5 — citizen data offers cascade by publisher_id.
      // Outstanding offers from a since-erased citizen become
      // unhonourable per §15.
      sections.citizenDataOffers = sweep('citizen_data_offers', ['publisher_id']);
      // Phase 12.2.3 — attachment blobs (KYC selfies, ID proofs,
      // per-role docs, dispute evidence) cascade by
      // root_identity_id. The bytes column goes with the row so
      // erasure is atomic — no half-deleted blob on disk.
      sections.attachments = sweep('attachments', ['root_identity_id']);
      // Phase 12.2.6 — DigiLocker state + link tables cascade
      // by root_identity_id. State is the in-flight OAuth CSRF
      // record; link is the persisted access + refresh token.
      // Atomic with the identity erasure — no orphaned tokens
      // floating after a DPDP request.
      sections.digilockerStates = sweep('digilocker_states', ['root_identity_id']);
      sections.digilockerLinks = sweep('digilocker_links', ['root_identity_id']);
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
