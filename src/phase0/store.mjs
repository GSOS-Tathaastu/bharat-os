import fs from 'node:fs/promises';
import path from 'node:path';
import { netContributionScore } from './core.mjs';
import { hydrateProviderIdentity } from '../phase1/provider-identity.mjs';

function safeName(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(`${filePath}.tmp`, filePath);
}

async function listJson(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .sort()
        .map((entry) => readJson(path.join(dirPath, entry)))
    );
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export class BosStore {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.identitiesPath = path.join(rootPath, 'identities');
    this.nodesPath = path.join(rootPath, 'nodes');
    this.manifestsPath = path.join(rootPath, 'manifests');
    this.chunksPath = path.join(rootPath, 'chunks');
    this.controlPlanesPath = path.join(rootPath, 'control-planes');
    this.reportsPath = path.join(rootPath, 'reports');
    this.consentsPath = path.join(rootPath, 'consents');
    this.decisionsPath = path.join(rootPath, 'decisions');
    this.toolExecutionsPath = path.join(rootPath, 'tool-executions');
    this.orchestrationsPath = path.join(rootPath, 'orchestrations');
    this.skillPreflightsPath = path.join(rootPath, 'skill-preflights');
    this.memoryRecordsPath = path.join(rootPath, 'memory-records');
    this.workerAuthorizationsPath = path.join(rootPath, 'worker-authorizations');
    this.flagReportsPath = path.join(rootPath, 'flag-reports');
    this.meshContributionsPath = path.join(rootPath, 'mesh-contributions');
    this.pairingSessionsPath = path.join(rootPath, 'pairing-sessions');
    this.healthDocumentsPath = path.join(rootPath, 'health-documents');
    this.incomeVerificationConsentsPath = path.join(rootPath, 'income-verification-consents');
    this.profileCredentialsPath = path.join(rootPath, 'profile-credentials');
    this.pushSubscriptionsPath = path.join(rootPath, 'push-subscriptions');
    this.workerNotificationsPath = path.join(rootPath, 'worker-notifications');
    this.voiceModelPacksPath = path.join(rootPath, 'voice-model-packs');
    this.ttsModelPacksPath = path.join(rootPath, 'tts-model-packs');
    this.onDeviceModelPacksPath = path.join(rootPath, 'on-device-model-packs');
    this.slmModelPacksPath = path.join(rootPath, 'slm-model-packs');
    this.installedSlmsPath = path.join(rootPath, 'installed-slms');
    // Phase 13.4 — skill-agent registry (Tier-4 SLM consumer). One
    // JSON file per skillId; same shape + admin-curation posture as
    // slm-model-packs. Not per-identity (no DPDP §12(3) cascade).
    this.skillAgentsPath = path.join(rootPath, 'skill-agents');
    // Phase 13.5 — citizen data offers. Per-identity (citizen
    // publishes); DPDP §12(3) cascade entry below in eraseUserData.
    this.citizenDataOffersPath = path.join(rootPath, 'citizen-data-offers');
    this.sponsorsPath = path.join(rootPath, 'sponsors');
    this.providerIdentitiesPath = path.join(rootPath, 'provider-identities');
    this.labelingJobsPath = path.join(rootPath, 'labeling-jobs');
    this.labelingJobItemsPath = path.join(rootPath, 'labeling-job-items');
    this.labelingSubmissionsPath = path.join(rootPath, 'labeling-submissions');
    this.federatedRoundsPath = path.join(rootPath, 'federated-rounds');
    this.federatedUpdatesPath = path.join(rootPath, 'federated-updates');
    this.attestationsPath = path.join(rootPath, 'attestations');
    this.phoneOtpsPath = path.join(rootPath, 'phone-otps');
    this.bookingsPath = path.join(rootPath, 'bookings');
    this.citizenEscrowsPath = path.join(rootPath, 'citizen-escrows');
    // Phase 12.2.3 — attachment blob store. Each blob is a
    // single file named <attachmentId>.bin (raw bytes) with a
    // sibling .json carrying metadata. Two-file layout keeps
    // the bytes streamable + the meta scannable. DPDP cascade
    // walks meta files filtered by rootIdentityId.
    this.attachmentsPath = path.join(rootPath, 'attachments');
    // Phase 12.2.6 — DigiLocker state + link directories. State
    // is short-lived (10 min OAuth CSRF param). Link is the
    // persisted access + refresh token, one per root identity.
    this.digilockerStatesPath = path.join(rootPath, 'digilocker-states');
    this.digilockerLinksPath = path.join(rootPath, 'digilocker-links');
    this.ledgerPath = path.join(rootPath, 'ledger.jsonl');
  }

  async init() {
    await fs.mkdir(this.identitiesPath, { recursive: true });
    await fs.mkdir(this.nodesPath, { recursive: true });
    await fs.mkdir(this.manifestsPath, { recursive: true });
    await fs.mkdir(this.chunksPath, { recursive: true });
    await fs.mkdir(this.controlPlanesPath, { recursive: true });
    await fs.mkdir(this.reportsPath, { recursive: true });
    await fs.mkdir(this.consentsPath, { recursive: true });
    await fs.mkdir(this.decisionsPath, { recursive: true });
    await fs.mkdir(this.toolExecutionsPath, { recursive: true });
    await fs.mkdir(this.orchestrationsPath, { recursive: true });
    await fs.mkdir(this.skillPreflightsPath, { recursive: true });
    await fs.mkdir(this.memoryRecordsPath, { recursive: true });
    await fs.mkdir(this.workerAuthorizationsPath, { recursive: true });
    await fs.mkdir(this.flagReportsPath, { recursive: true });
    await fs.mkdir(this.meshContributionsPath, { recursive: true });
    await fs.mkdir(this.pairingSessionsPath, { recursive: true });
    await fs.mkdir(this.healthDocumentsPath, { recursive: true });
    await fs.mkdir(this.incomeVerificationConsentsPath, { recursive: true });
    await fs.mkdir(this.profileCredentialsPath, { recursive: true });
    await fs.mkdir(this.pushSubscriptionsPath, { recursive: true });
    await fs.mkdir(this.workerNotificationsPath, { recursive: true });
    await fs.mkdir(this.voiceModelPacksPath, { recursive: true });
    await fs.mkdir(this.ttsModelPacksPath, { recursive: true });
    await fs.mkdir(this.onDeviceModelPacksPath, { recursive: true });
    await fs.mkdir(this.slmModelPacksPath, { recursive: true });
    await fs.mkdir(this.installedSlmsPath, { recursive: true });
    await fs.mkdir(this.skillAgentsPath, { recursive: true });
    await fs.mkdir(this.citizenDataOffersPath, { recursive: true });
    await fs.mkdir(this.sponsorsPath, { recursive: true });
    await fs.mkdir(this.providerIdentitiesPath, { recursive: true });
    await fs.mkdir(this.bookingsPath, { recursive: true });
    await fs.mkdir(this.citizenEscrowsPath, { recursive: true });
    await fs.mkdir(this.attachmentsPath, { recursive: true });
    await fs.mkdir(this.digilockerStatesPath, { recursive: true });
    await fs.mkdir(this.digilockerLinksPath, { recursive: true });
    await fs.mkdir(this.labelingJobsPath, { recursive: true });
    await fs.mkdir(this.labelingJobItemsPath, { recursive: true });
    await fs.mkdir(this.labelingSubmissionsPath, { recursive: true });
    await fs.mkdir(this.federatedRoundsPath, { recursive: true });
    await fs.mkdir(this.federatedUpdatesPath, { recursive: true });
    await fs.mkdir(this.attestationsPath, { recursive: true });
    await fs.mkdir(this.phoneOtpsPath, { recursive: true });
    await fs.appendFile(this.ledgerPath, '');
  }

  identityFile(identityId) {
    return path.join(this.identitiesPath, `${safeName(identityId)}.json`);
  }

  nodeFile(nodeId) {
    return path.join(this.nodesPath, `${safeName(nodeId)}.json`);
  }

  manifestFile(manifestId) {
    return path.join(this.manifestsPath, `${safeName(manifestId)}.json`);
  }

  chunkFile(chunkId) {
    return path.join(this.chunksPath, `${safeName(chunkId)}.json`);
  }

  controlPlaneFile(controlPlaneId = 'current') {
    return path.join(this.controlPlanesPath, `${safeName(controlPlaneId)}.json`);
  }

  reportFile(reportId) {
    return path.join(this.reportsPath, `${safeName(reportId)}.json`);
  }

  consentFile(consentId) {
    return path.join(this.consentsPath, `${safeName(consentId)}.json`);
  }

  decisionFile(decisionId) {
    return path.join(this.decisionsPath, `${safeName(decisionId)}.json`);
  }

  toolExecutionFile(executionId) {
    return path.join(this.toolExecutionsPath, `${safeName(executionId)}.json`);
  }

  orchestrationFile(orchestrationId) {
    return path.join(this.orchestrationsPath, `${safeName(orchestrationId)}.json`);
  }

  skillPreflightFile(preflightId) {
    return path.join(this.skillPreflightsPath, `${safeName(preflightId)}.json`);
  }

  memoryRecordFile(recordId) {
    return path.join(this.memoryRecordsPath, `${safeName(recordId)}.json`);
  }

  workerAuthorizationFile(authorizationId) {
    return path.join(this.workerAuthorizationsPath, `${safeName(authorizationId)}.json`);
  }

  flagReportFile(flagId) {
    return path.join(this.flagReportsPath, `${safeName(flagId)}.json`);
  }

  meshContributionFile(eventId) {
    return path.join(this.meshContributionsPath, `${safeName(eventId)}.json`);
  }

  pairingSessionFile(sessionId) {
    return path.join(this.pairingSessionsPath, `${safeName(sessionId)}.json`);
  }

  healthDocumentFile(captureId) {
    return path.join(this.healthDocumentsPath, `${safeName(captureId)}.json`);
  }

  profileCredentialFile(profileCredentialId) {
    return path.join(this.profileCredentialsPath, `${safeName(profileCredentialId)}.json`);
  }

  pushSubscriptionFile(subscriptionId) {
    return path.join(this.pushSubscriptionsPath, `${safeName(subscriptionId)}.json`);
  }

  workerNotificationFile(notificationId) {
    return path.join(this.workerNotificationsPath, `${safeName(notificationId)}.json`);
  }

  voiceModelPackFile(voiceModelPackId) {
    return path.join(this.voiceModelPacksPath, `${safeName(voiceModelPackId)}.json`);
  }

  ttsModelPackFile(ttsModelPackId) {
    return path.join(this.ttsModelPacksPath, `${safeName(ttsModelPackId)}.json`);
  }

  onDeviceModelPackFile(onDeviceModelPackId) {
    return path.join(this.onDeviceModelPacksPath, `${safeName(onDeviceModelPackId)}.json`);
  }

  async appendLedger(event) {
    await fs.appendFile(this.ledgerPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  // Phase 5.6 — integrity verification. The file backend has no
  // schema-level integrity check (there's no global b-tree); we
  // perform a structural check instead — verify the directory
  // exists and contains the per-record-type subdirectories the
  // backend writes to. This is the minimum needed to know a
  // snapshot is restore-able; deeper checks (per-file JSON
  // validity) would scan O(records) and aren't justified for the
  // file backend's dev/migration role.
  async verifyIntegrity(targetPath) {
    const root = targetPath ?? this.rootPath;
    const messages = [];
    try {
      const stats = await fs.stat(root);
      if (!stats.isDirectory()) {
        messages.push(`root is not a directory: ${root}`);
      }
    } catch (error) {
      messages.push(`root not readable: ${error.message}`);
      return { ok: false, targetPath: root, messages };
    }
    // Verify at least the identities/ subdir exists — every
    // working BosStore creates it on init().
    const identitiesPath = path.join(root, 'identities');
    try {
      const stats = await fs.stat(identitiesPath);
      if (!stats.isDirectory()) {
        messages.push(`identities/ is not a directory under ${root}`);
      }
    } catch (_error) {
      messages.push(`identities/ subdir missing under ${root}`);
    }
    return {
      ok: messages.length === 0,
      targetPath: root,
      messages: messages.length === 0 ? ['ok'] : messages
    };
  }

  // Phase 5.5 — file-store snapshot. Recursively copies the entire
  // root directory tree to the target path. There is no atomic
  // equivalent of SQLite's `VACUUM INTO` for a directory layout —
  // a write that lands mid-copy will produce a snapshot that
  // includes the new value of some files but not others. For
  // launch we live with this (the file store is dev/migration-only;
  // production runs SQLite per ADR 0081). Mirroring the SQLite
  // store's surface here means scripts/snapshot-store.mjs is
  // backend-agnostic.
  async snapshotTo(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('snapshotTo requires a target path.');
    }
    try {
      await fs.access(targetPath);
      throw new Error(`snapshot target already exists: ${targetPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.cp(this.rootPath, targetPath, { recursive: true });
    const stats = await fs.stat(targetPath);
    return {
      kind: 'file',
      sourcePath: this.rootPath,
      targetPath,
      bytes: stats.size,
      createdAt: stats.mtime.toISOString()
    };
  }

  async listLedger({ limit = 100, type, newestFirst = true } = {}) {
    let raw = '';
    try {
      raw = await fs.readFile(this.ledgerPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }

    let events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    if (type) {
      events = events.filter((event) => event.type === type);
    }

    if (newestFirst) {
      events = events.reverse();
    }

    if (limit === undefined || limit === null) return events;
    return events.slice(0, Number(limit));
  }

  async saveIdentity(identity) {
    await this.init();
    await writeJson(this.identityFile(identity.id), identity);
    await this.appendLedger({ type: 'identity.saved', identityId: identity.id, at: new Date().toISOString() });
    return identity;
  }

  async readIdentity(identityId) {
    return readJson(this.identityFile(identityId));
  }

  async listIdentities() {
    return listJson(this.identitiesPath);
  }

  // DPDP §12(3) right-to-erasure (Phase 4.0 / ADR 0079).
  //
  // Removes the identity file + every per-section file whose record
  // mentions this user. Returns a structured report of what was
  // erased + how many ledger entries were redacted. The actual
  // ledger redaction is done in-place by rewriting ledger.jsonl
  // through `redactLedgerEntry` from `src/phase1/dpdp-rights.mjs`.
  //
  // This is a destructive operation — the API handler must verify
  // the request came from the identity owner (or a nominee per
  // DPDP §14) before calling it.
  async eraseUserData(identityId, { redactLedgerEntry } = {}) {
    if (!identityId) throw new Error('identityId is required.');
    await this.init();

    const sections = {};
    const matchesUser = (r) =>
      r.subjectId === identityId ||
      r.ownerId === identityId ||
      r.actorId === identityId ||
      r.operatorId === identityId ||
      r.contributorId === identityId ||
      r.workerId === identityId ||
      r.identityId === identityId ||
      r.reporterId === identityId ||
      r.issuerIdentityId === identityId ||
      r.decision?.request?.actorId === identityId ||
      r.action?.actorId === identityId;

    const sweep = async (label, listFn, fileFn, idKey) => {
      const records = await listFn().catch(() => []);
      const targets = records.filter(matchesUser);
      let removed = 0;
      for (const record of targets) {
        const id = record[idKey];
        if (!id) continue;
        try {
          await fs.unlink(fileFn.call(this, id));
          removed += 1;
        } catch (_error) {
          // file might already be gone; tolerate
        }
      }
      sections[label] = removed;
    };

    // Sweep every per-user record type. Order matters only insofar
    // as we want errors in one section not to abort the cascade.
    await sweep('consents', () => this.listConsents(), this.consentFile, 'consentId');
    await sweep('decisions', () => this.listDecisions(), this.decisionFile, 'decisionId');
    await sweep('orchestrations', () => this.listOrchestrations(), this.orchestrationFile, 'orchestrationId');
    await sweep('skillPreflights', () => this.listSkillPreflights(), this.skillPreflightFile, 'preflightId');
    await sweep('toolExecutions', () => this.listToolExecutions(), this.toolExecutionFile, 'executionId');
    await sweep('memoryRecords', () => this.listMemoryRecords(), this.memoryRecordFile, 'recordId');
    await sweep(
      'workerAuthorizations',
      () => this.listWorkerAuthorizations(),
      this.workerAuthorizationFile,
      'authorizationId'
    );
    await sweep('flagReports', () => this.listFlagReports(), this.flagReportFile, 'flagId');
    await sweep(
      'meshContributions',
      () => this.listMeshContributionEvents(),
      this.meshContributionFile,
      'contributionEventId'
    );
    await sweep('pairingSessions', () => this.listPairingSessions(), this.pairingSessionFile, 'sessionId');
    await sweep(
      'healthDocuments',
      () => this.listHealthDocumentCaptures(),
      this.healthDocumentFile,
      'captureId'
    );
    await sweep(
      'profileCredentials',
      () => this.listProfileCredentials(),
      this.profileCredentialFile,
      'profileCredentialId'
    );
    await sweep(
      'pushSubscriptions',
      () => this.listPushSubscriptions(),
      this.pushSubscriptionFile,
      'subscriptionId'
    );
    // Phase 9.0b — per-identity SLM install records. The model
    // bytes themselves live in client-side OPFS / IndexedDB and are
    // wiped by Phase 4.0's identity-scoped client storage clear;
    // here we just remove the server-side install record so it can't
    // be used as a reattachment vector.
    await sweep(
      'installedSlms',
      () => this.listInstalledSlms(),
      this.installedSlmFile,
      'installId'
    );
    // Phase 13.5 — citizen data offers cascade by publisherId.
    // Outstanding offers from a since-erased citizen become
    // unhonourable per §15 (sponsor's at-sale-time signature is
    // still in the audit ledger but the citizen's offer record is
    // gone — sponsor cannot reattach against a wiped publisher).
    const citizenDataOffers = await this.listCitizenDataOffers({ publisherId: identityId }).catch(() => []);
    let citizenDataOffersRemoved = 0;
    for (const offer of citizenDataOffers) {
      try {
        await fs.unlink(this.citizenDataOfferFile(offer.offerId));
        citizenDataOffersRemoved += 1;
      } catch (_error) {
        // best-effort
      }
    }
    sections.citizenDataOffers = citizenDataOffersRemoved;
    // Phase 10.1 — labeling submissions are per-worker; cascade
    // on identity erase. Jobs and items are sponsor-owned and stay.
    const labelingSubmissions = await this.listLabelingSubmissions({ workerId: identityId }).catch(() => []);
    let labelingRemoved = 0;
    for (const sub of labelingSubmissions) {
      try {
        await fs.unlink(this.labelingSubmissionFile(sub.submissionId));
        labelingRemoved += 1;
      } catch (_error) {
        // best-effort
      }
    }
    sections.labelingSubmissions = labelingRemoved;
    // Phase 12.0 — provider identities cascade by rootIdentityId.
    // A providerIdentity is bound to a root citizen/worker identity;
    // when that root erases, all bound provider profiles go too.
    // §15: no orphaned providers in the marketplace.
    const providerIdentities = await this.listProviderIdentities({ rootIdentityId: identityId }).catch(() => []);
    let providerRemoved = 0;
    for (const p of providerIdentities) {
      try {
        await fs.unlink(this.providerIdentityFile(p.providerIdentityId));
        providerRemoved += 1;
      } catch (_error) {
        // best-effort
      }
    }
    sections.providerIdentities = providerRemoved;

    // Phase 12.1a.2 — booking + citizen-escrow cascade.
    const bookings = await this.listBookings().catch(() => []);
    let bookingsRemoved = 0;
    for (const b of bookings) {
      if (b.citizenRootIdentityId === identityId || b.providerRootIdentityId === identityId) {
        try {
          await fs.unlink(this.bookingFile(b.bookingId));
          bookingsRemoved += 1;
        } catch (_error) {
          // best-effort
        }
      }
    }
    sections.bookings = bookingsRemoved;

    try {
      await fs.unlink(this.citizenEscrowFile(identityId));
      sections.citizenEscrows = 1;
    } catch (_error) {
      sections.citizenEscrows = 0;
    }

    // Phase 12.2.3 — attachment blob cascade. Walk meta files
    // filtered by rootIdentityId, unlink both .json and .bin
    // siblings. Each blob owned by this root identity goes,
    // satisfying DPDP §12(3) atomically per blob.
    // Phase 12.2.3 fix DPDP-2 — unlink .bin FIRST and only
    // unlink .json if the .bin succeeded. Previous ordering
    // could leave an orphaned naked .bin (no metadata,
    // undeletable via API) if the .bin unlink raced with the
    // OS (EBUSY on Windows / EACCES on a virus scanner lock).
    // We surface the count of TRULY removed pairs only.
    const attachments = await this.listAttachments({ rootIdentityId: identityId }).catch(() => []);
    let attachmentsRemoved = 0;
    for (const a of attachments) {
      let binGone = false;
      try {
        await fs.unlink(this.attachmentBytesFile(a.attachmentId));
        binGone = true;
      } catch (err) {
        // ENOENT is fine — the bytes file may have already
        // been deleted by an earlier cascade attempt. Anything
        // else, we leave BOTH files in place so a retry can
        // sweep the pair atomically.
        if (err && err.code === 'ENOENT') binGone = true;
      }
      if (binGone) {
        try {
          await fs.unlink(this.attachmentMetaFile(a.attachmentId));
          attachmentsRemoved += 1;
        } catch (err) {
          // .json unlink failed AFTER .bin succeeded — the
          // worst case is an orphaned meta pointing at a
          // missing .bin, which the API correctly returns
          // null for. Operator can retry the cascade.
          if (err && err.code !== 'ENOENT') {
            // best-effort; logged via the ledger event below
          } else {
            attachmentsRemoved += 1;
          }
        }
      }
    }
    sections.attachments = attachmentsRemoved;

    // Phase 12.2.6 — DigiLocker state cascade. States are
    // keyed by the OAuth `state` value (not rootIdentityId);
    // walk the directory and unlink the rows owned by this
    // identity.
    let stateRemoved = 0;
    try {
      const allStates = await listJson(this.digilockerStatesPath).catch(() => []);
      for (const meta of allStates) {
        if (meta && meta.rootIdentityId === identityId) {
          await fs.unlink(this.digilockerStateFile(meta.state)).catch(() => {});
          stateRemoved += 1;
        }
      }
    } catch (_error) { /* best-effort */ }
    sections.digilockerStates = stateRemoved;
    const linkErased = await this.deleteDigiLockerLink(identityId).catch(() => false);
    sections.digilockerLinks = linkErased ? 1 : 0;

    await sweep(
      'workerNotifications',
      () => this.listWorkerNotifications(),
      this.workerNotificationFile,
      'notificationId'
    );
    await sweep('federatedUpdates', () => this.listFederatedUpdates(), this.federatedUpdateFile, 'updateId');
    await sweep('attestations', () => this.listAttestations(), this.attestationFile, 'attestationId');

    // Identity itself goes last so a partial failure mid-cascade
    // leaves the identity reachable for retry.
    try {
      await fs.unlink(this.identityFile(identityId));
      sections.identity = 1;
    } catch (_error) {
      sections.identity = 0;
    }

    // Redact ledger entries that mention this user. We rewrite
    // ledger.jsonl in place (read all → redact → atomic replace).
    let ledgerRedactions = 0;
    if (typeof redactLedgerEntry === 'function') {
      try {
        const ledgerContent = await fs.readFile(this.ledgerPath, 'utf8').catch(() => '');
        const lines = ledgerContent.split('\n').filter(Boolean);
        const rewritten = [];
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            const redacted = redactLedgerEntry(event, identityId);
            const changed = JSON.stringify(redacted) !== JSON.stringify(event);
            if (changed) ledgerRedactions += 1;
            rewritten.push(JSON.stringify(redacted));
          } catch (_error) {
            rewritten.push(line);
          }
        }
        const tempPath = `${this.ledgerPath}.tmp`;
        await fs.writeFile(tempPath, rewritten.join('\n') + (rewritten.length > 0 ? '\n' : ''), 'utf8');
        await fs.rename(tempPath, this.ledgerPath);
      } catch (_error) {
        // Ledger redaction is best-effort; do not abort the cascade.
      }
    }

    // Final tombstone ledger entry — the erasure itself is auditable
    // (with the identityId now <erased> so the record is forever
    // anonymous).
    await this.appendLedger({
      type: 'account.erased',
      at: new Date().toISOString(),
      identityId: '<erased>',
      sections,
      ledgerRedactions
    });

    return { sections, ledgerRedactions };
  }

  async saveNode(node) {
    await this.init();
    await writeJson(this.nodeFile(node.nodeId), node);
    await this.appendLedger({ type: 'node.saved', nodeId: node.nodeId, operatorId: node.operatorId, at: new Date().toISOString() });
    return node;
  }

  async readNode(nodeId) {
    return readJson(this.nodeFile(nodeId));
  }

  async listNodes() {
    return listJson(this.nodesPath);
  }

  async saveBundle(bundle) {
    await this.init();
    await writeJson(this.manifestFile(bundle.manifest.manifestId), bundle.manifest);
    for (const chunk of Object.values(bundle.chunks)) {
      await writeJson(this.chunkFile(chunk.chunkId), chunk);
    }
    await this.appendLedger({
      type: 'bundle.saved',
      manifestId: bundle.manifest.manifestId,
      chunkCount: bundle.manifest.chunks.length,
      at: new Date().toISOString()
    });
    return bundle.manifest;
  }

  async readManifest(manifestId) {
    return readJson(this.manifestFile(manifestId));
  }

  async listManifests() {
    return listJson(this.manifestsPath);
  }

  async readBundle(manifestId) {
    const manifest = await this.readManifest(manifestId);
    const chunks = {};
    for (const descriptor of manifest.chunks) {
      chunks[descriptor.chunkId] = await readJson(this.chunkFile(descriptor.chunkId));
    }
    return { manifest, chunks };
  }

  async saveControlPlane(controlPlane, controlPlaneId = 'current') {
    await this.init();
    await writeJson(this.controlPlaneFile(controlPlaneId), controlPlane);
    await this.appendLedger({
      type: 'control_plane.saved',
      controlPlaneId,
      nodeCount: Object.keys(controlPlane.nodes ?? {}).length,
      manifestCount: Object.keys(controlPlane.manifests ?? {}).length,
      commitmentCount: (controlPlane.commitments ?? []).length,
      at: new Date().toISOString()
    });
    return controlPlane;
  }

  async readControlPlane(controlPlaneId = 'current') {
    return readJson(this.controlPlaneFile(controlPlaneId));
  }

  async saveSimulationReport(report) {
    await this.init();
    await writeJson(this.reportFile(report.reportId), report);
    await this.appendLedger({
      type: 'simulation_report.saved',
      reportId: report.reportId,
      nodeCount: report.inputs?.nodeCount,
      objectCount: report.inputs?.objectCount,
      at: new Date().toISOString()
    });
    return report;
  }

  async readSimulationReport(reportId) {
    return readJson(this.reportFile(reportId));
  }

  async listSimulationReports() {
    return listJson(this.reportsPath);
  }

  async saveConsent(consent) {
    await this.init();
    await writeJson(this.consentFile(consent.consentId), consent);
    await this.appendLedger({
      type: 'consent.saved',
      consentId: consent.consentId,
      subjectId: consent.subjectId,
      granteeId: consent.granteeId,
      status: consent.status,
      at: new Date().toISOString()
    });
    return consent;
  }

  async readConsent(consentId) {
    return readJson(this.consentFile(consentId));
  }

  async listConsents() {
    return listJson(this.consentsPath);
  }

  async saveDecision(decision) {
    await this.init();
    await writeJson(this.decisionFile(decision.decisionId), decision);
    await this.appendLedger({
      type: 'decision.saved',
      decisionId: decision.decisionId,
      actorId: decision.request?.actorId,
      actionType: decision.request?.actionType,
      approved: decision.approved,
      at: new Date().toISOString()
    });
    return decision;
  }

  async readDecision(decisionId) {
    return readJson(this.decisionFile(decisionId));
  }

  async listDecisions() {
    return listJson(this.decisionsPath);
  }

  async saveToolExecution(execution) {
    await this.init();
    await writeJson(this.toolExecutionFile(execution.executionId), execution);
    await this.appendLedger({
      type: 'tool_execution.saved',
      executionId: execution.executionId,
      skillPreflightId: execution.skillPreflightId,
      decisionId: execution.decisionId,
      status: execution.status,
      toolId: execution.toolReceipt?.toolId ?? execution.decision?.request?.tool,
      at: new Date().toISOString()
    });
    return execution;
  }

  async readToolExecution(executionId) {
    return readJson(this.toolExecutionFile(executionId));
  }

  async listToolExecutions() {
    return listJson(this.toolExecutionsPath);
  }

  async saveOrchestration(orchestration) {
    await this.init();
    await writeJson(this.orchestrationFile(orchestration.orchestrationId), orchestration);
    await this.appendLedger({
      type: 'orchestration.saved',
      orchestrationId: orchestration.orchestrationId,
      skillPreflightId: orchestration.skillPreflightId,
      decisionId: orchestration.decisionId,
      executionId: orchestration.executionId,
      actionType: orchestration.actionRequest?.actionType,
      status: orchestration.status,
      at: new Date().toISOString()
    });
    return orchestration;
  }

  async readOrchestration(orchestrationId) {
    return readJson(this.orchestrationFile(orchestrationId));
  }

  async listOrchestrations() {
    return listJson(this.orchestrationsPath);
  }

  async saveSkillPreflight(preflight) {
    await this.init();
    await writeJson(this.skillPreflightFile(preflight.preflightId), preflight);
    await this.appendLedger({
      type: 'skill_preflight.saved',
      preflightId: preflight.preflightId,
      skillId: preflight.skillId,
      manifestId: preflight.manifestId,
      decisionId: preflight.decisionId,
      actorId: preflight.decision?.request?.actorId,
      actionType: preflight.decision?.request?.actionType,
      approved: preflight.approved,
      at: preflight.checkedAt ?? new Date().toISOString()
    });
    return preflight;
  }

  async readSkillPreflight(preflightId) {
    return readJson(this.skillPreflightFile(preflightId));
  }

  async listSkillPreflights() {
    return listJson(this.skillPreflightsPath);
  }

  async saveMemoryRecord(record) {
    await this.init();
    await writeJson(this.memoryRecordFile(record.recordId), record);
    await this.appendLedger({
      type: 'memory_record.saved',
      recordId: record.recordId,
      ownerId: record.ownerId,
      manifestId: record.manifestId,
      label: record.label,
      at: new Date().toISOString()
    });
    return record;
  }

  async readMemoryRecord(recordId) {
    return readJson(this.memoryRecordFile(recordId));
  }

  async listMemoryRecords() {
    return listJson(this.memoryRecordsPath);
  }

  async saveWorkerAuthorization(auth) {
    await this.init();
    await writeJson(this.workerAuthorizationFile(auth.authorizationId), auth);
    await this.appendLedger({
      type: 'worker_authorization.saved',
      authorizationId: auth.authorizationId,
      workerId: auth.workerId,
      operatorId: auth.operatorId,
      jobReference: auth.jobReference,
      status: auth.status,
      signatureCount: (auth.signatures ?? []).length,
      at: new Date().toISOString()
    });
    return auth;
  }

  async readWorkerAuthorization(authorizationId) {
    return readJson(this.workerAuthorizationFile(authorizationId));
  }

  async listWorkerAuthorizations() {
    return listJson(this.workerAuthorizationsPath);
  }

  async saveFlagReport(report) {
    await this.init();
    await writeJson(this.flagReportFile(report.flagId), report);
    await this.appendLedger({
      type: 'flag_report.saved',
      flagId: report.flagId,
      reporterId: report.reporterId,
      subjectActorId: report.subjectActorId,
      category: report.category,
      severity: report.severity,
      status: report.status,
      jobReference: report.jobReference,
      at: new Date().toISOString()
    });
    return report;
  }

  async readFlagReport(flagId) {
    return readJson(this.flagReportFile(flagId));
  }

  async listFlagReports() {
    return listJson(this.flagReportsPath);
  }

  async saveMeshContributionEvent(event) {
    await this.init();
    await writeJson(this.meshContributionFile(event.contributionEventId), event);
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
    return readJson(this.meshContributionFile(eventId));
  }

  async listMeshContributionEvents() {
    return listJson(this.meshContributionsPath);
  }

  // §7f federated learning rounds + updates — ADR 0071.

  federatedRoundFile(roundId) {
    return path.join(this.federatedRoundsPath, `${safeName(roundId)}.json`);
  }

  federatedUpdateFile(updateId) {
    return path.join(this.federatedUpdatesPath, `${safeName(updateId)}.json`);
  }

  async saveFederatedRound(round) {
    await this.init();
    await writeJson(this.federatedRoundFile(round.roundId), round);
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
    return readJson(this.federatedRoundFile(roundId));
  }

  async listFederatedRounds() {
    return listJson(this.federatedRoundsPath);
  }

  async saveFederatedUpdate(update) {
    await this.init();
    await writeJson(this.federatedUpdateFile(update.updateId), update);
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
    return listJson(this.federatedUpdatesPath);
  }

  // §13A #7 Trust attestations — ADR 0072.

  attestationFile(attestationId) {
    return path.join(this.attestationsPath, `${safeName(attestationId)}.json`);
  }

  async saveAttestation(attestation) {
    await this.init();
    await writeJson(this.attestationFile(attestation.attestationId), attestation);
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
    return readJson(this.attestationFile(attestationId));
  }

  async listAttestations() {
    return listJson(this.attestationsPath);
  }

  // Phase 4.3 — phone-OTP storage.

  phoneOtpFile(otpId) {
    return path.join(this.phoneOtpsPath, `${safeName(otpId)}.json`);
  }

  async savePhoneOtp(otp) {
    await this.init();
    await writeJson(this.phoneOtpFile(otp.otpId), otp);
    // Ledger captures the lifecycle event but NEVER the plaintext
    // code (the OTP object as stored has only the hash + salt).
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
    return readJson(this.phoneOtpFile(otpId));
  }

  async listPhoneOtps() {
    return listJson(this.phoneOtpsPath);
  }

  async savePairingSession(session) {
    await this.init();
    await writeJson(this.pairingSessionFile(session.sessionId), session);
    await this.appendLedger({
      type: 'pairing_session.saved',
      sessionId: session.sessionId,
      issuerIdentityId: session.issuerIdentityId,
      status: session.status,
      at: new Date().toISOString()
    });
    return session;
  }

  async readPairingSession(sessionId) {
    return readJson(this.pairingSessionFile(sessionId));
  }

  async listPairingSessions() {
    return listJson(this.pairingSessionsPath);
  }

  async saveHealthDocumentCapture(capture) {
    await this.init();
    await writeJson(this.healthDocumentFile(capture.captureId), capture);
    await this.appendLedger({
      type: 'health_document_capture.saved',
      captureId: capture.captureId,
      actorId: capture.actorId,
      documentType: capture.documentType,
      uploadId: capture.abhaUpload?.uploadId,
      status: capture.abhaUpload?.status ?? capture.status,
      at: new Date().toISOString()
    });
    return capture;
  }

  async readHealthDocumentCapture(captureId) {
    return readJson(this.healthDocumentFile(captureId));
  }

  async listHealthDocumentCaptures() {
    return listJson(this.healthDocumentsPath);
  }

  async saveProfileCredential(credential) {
    await this.init();
    await writeJson(this.profileCredentialFile(credential.profileCredentialId), credential);
    await this.appendLedger({
      type: 'profile_credential.saved',
      profileCredentialId: credential.profileCredentialId,
      identityId: credential.identityId,
      credentialIdHash: credential.credentialIdHash,
      at: new Date().toISOString()
    });
    return credential;
  }

  async readProfileCredential(profileCredentialId) {
    return readJson(this.profileCredentialFile(profileCredentialId));
  }

  async listProfileCredentials() {
    return listJson(this.profileCredentialsPath);
  }

  // Phase 1.40 — surface the §13B Net Contribution Score for an identity by
  // aggregating across the nodes they operate (supply side: storageBytes) and
  // the data they have stored on the mesh (demand side: memory-record sizes).
  // The fair-use lever in §13B reads from this: NCS ≥ 0 → producer (free
  // service + earning); NCS < 0 → consumer (pays on the progressive curve).
  async savePushSubscription(subscription) {
    await this.init();
    await writeJson(this.pushSubscriptionFile(subscription.subscriptionId), subscription);
    await this.appendLedger({
      type: 'push_subscription.saved',
      subscriptionId: subscription.subscriptionId,
      identityId: subscription.identityId,
      mode: subscription.mode,
      endpointHost: subscription.endpointHost,
      at: new Date().toISOString()
    });
    return subscription;
  }

  async readPushSubscription(subscriptionId) {
    return readJson(this.pushSubscriptionFile(subscriptionId));
  }

  async listPushSubscriptions() {
    return listJson(this.pushSubscriptionsPath);
  }

  // Phase 7.0 / 8.4 — explicit delete used by Phase 8.4 disable
  // flow and by Phase 7.x 410 Gone cleanup (sqlite-store has the
  // same method; this file-store variant keeps backend parity).
  async deletePushSubscription(subscriptionId) {
    try {
      await fs.unlink(this.pushSubscriptionFile(subscriptionId));
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Phase 6.1 — MFI income-verification consents. Missing from the
  // file store until Phase 11.4 surfaced the gap during smoke. Kept
  // in parity with sqlite-store CRUD shape so the API works under
  // either backend.
  incomeVerificationConsentFile(consentId) {
    return path.join(this.incomeVerificationConsentsPath, `${safeName(consentId)}.json`);
  }

  async saveIncomeVerificationConsent(consent) {
    if (!consent?.consentId) {
      throw new Error('income-verification consent requires consentId.');
    }
    await this.init();
    await writeJson(this.incomeVerificationConsentFile(consent.consentId), consent);
    return consent;
  }

  async readIncomeVerificationConsent(consentId) {
    return readJson(this.incomeVerificationConsentFile(consentId));
  }

  async listIncomeVerificationConsents({ workerId } = {}) {
    const all = await listJson(this.incomeVerificationConsentsPath);
    if (workerId) {
      return all.filter((c) => c.workerId === workerId);
    }
    return all;
  }

  async saveWorkerNotification(notification) {
    await this.init();
    await writeJson(this.workerNotificationFile(notification.notificationId), notification);
    await this.appendLedger({
      type: 'worker_notification.queued',
      notificationId: notification.notificationId,
      workerId: notification.workerId,
      jobReference: notification.jobReference,
      deliveryStatus: notification.delivery?.status,
      at: new Date().toISOString()
    });
    return notification;
  }

  async readWorkerNotification(notificationId) {
    return readJson(this.workerNotificationFile(notificationId));
  }

  async listWorkerNotifications() {
    return listJson(this.workerNotificationsPath);
  }

  async saveVoiceModelPack(modelPack) {
    await this.init();
    await writeJson(this.voiceModelPackFile(modelPack.voiceModelPackId), modelPack);
    await this.appendLedger({
      type: 'voice_model_pack.saved',
      voiceModelPackId: modelPack.voiceModelPackId,
      locale: modelPack.locale,
      engine: modelPack.engine,
      bytes: modelPack.bytes,
      at: new Date().toISOString()
    });
    return modelPack;
  }

  async readVoiceModelPack(voiceModelPackId) {
    return readJson(this.voiceModelPackFile(voiceModelPackId));
  }

  async listVoiceModelPacks() {
    return listJson(this.voiceModelPacksPath);
  }

  async saveTtsModelPack(modelPack) {
    await this.init();
    await writeJson(this.ttsModelPackFile(modelPack.ttsModelPackId), modelPack);
    await this.appendLedger({
      type: 'tts_model_pack.saved',
      ttsModelPackId: modelPack.ttsModelPackId,
      locale: modelPack.locale,
      engine: modelPack.engine,
      bytes: modelPack.bytes,
      at: new Date().toISOString()
    });
    return modelPack;
  }

  async readTtsModelPack(ttsModelPackId) {
    return readJson(this.ttsModelPackFile(ttsModelPackId));
  }

  async listTtsModelPacks() {
    return listJson(this.ttsModelPacksPath);
  }

  async saveOnDeviceModelPack(modelPack) {
    await this.init();
    await writeJson(this.onDeviceModelPackFile(modelPack.onDeviceModelPackId), modelPack);
    await this.appendLedger({
      type: 'on_device_model_pack.saved',
      onDeviceModelPackId: modelPack.onDeviceModelPackId,
      modelId: modelPack.modelId,
      runtime: modelPack.runtime,
      bytes: modelPack.bytes,
      at: new Date().toISOString()
    });
    return modelPack;
  }

  async readOnDeviceModelPack(onDeviceModelPackId) {
    return readJson(this.onDeviceModelPackFile(onDeviceModelPackId));
  }

  async listOnDeviceModelPacks() {
    return listJson(this.onDeviceModelPacksPath);
  }

  // Phase 9.0a — Tier-4 SLM registry. Distinct from the Tier-2
  // on-device-model-packs (those are ~7 MB ASR/TTS/intent packs).
  // These are 1.5-4 GB SLM packs the user explicitly opts into
  // downloading. Admin-curated (Phase 5.7 token); not per-identity,
  // so no DPDP §12(3) cascade entry — installed-on-device records
  // (per-identity) come in a later Phase 9.0 sub-phase and DO
  // cascade.
  slmModelPackFile(modelPackId) {
    return path.join(this.slmModelPacksPath, `${safeName(modelPackId)}.json`);
  }

  async saveSlmModelPack(modelPack) {
    await this.init();
    await writeJson(this.slmModelPackFile(modelPack.modelPackId), modelPack);
    await this.appendLedger({
      type: modelPack.status === 'revoked'
        ? 'slm_model_pack.revoked'
        : 'slm_model_pack.registered',
      modelPackId: modelPack.modelPackId,
      family: modelPack.family,
      variant: modelPack.variant,
      runtime: modelPack.runtime,
      quantization: modelPack.quantization,
      diskBytes: modelPack.diskBytes,
      operator: modelPack.status === 'revoked'
        ? modelPack.revokedBy
        : modelPack.registeredBy,
      at: new Date().toISOString()
    });
    return modelPack;
  }

  async readSlmModelPack(modelPackId) {
    return readJson(this.slmModelPackFile(modelPackId));
  }

  async listSlmModelPacks() {
    return listJson(this.slmModelPacksPath);
  }

  // Phase 9.0b — per-identity SLM install records. Pointer-not-
  // payload: server tracks status + metadata only; the model bytes
  // live in client-side OPFS / IndexedDB. DPDP §12(3) cascade
  // entry is below in deleteIdentityCascade — installed_slms is
  // per-identity and MUST be erased on identity wipe.
  installedSlmFile(installId) {
    return path.join(this.installedSlmsPath, `${safeName(installId)}.json`);
  }

  async saveInstalledSlm(record) {
    await this.init();
    await writeJson(this.installedSlmFile(record.installId), record);
    await this.appendLedger({
      type: record.status === 'failed'
        ? 'installed_slm.failed'
        : 'installed_slm.recorded',
      installId: record.installId,
      identityId: record.identityId,
      modelPackId: record.modelPackId,
      runtimeBackend: record.runtimeBackend,
      downloadedBytes: record.downloadedBytes,
      at: new Date().toISOString()
    });
    return record;
  }

  async readInstalledSlm(installId) {
    return readJson(this.installedSlmFile(installId));
  }

  async listInstalledSlms() {
    return listJson(this.installedSlmsPath);
  }

  async deleteInstalledSlm(installId) {
    try {
      await fs.unlink(this.installedSlmFile(installId));
      await this.appendLedger({
        type: 'installed_slm.removed',
        installId,
        at: new Date().toISOString()
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Phase 13.4 — Tier-4 SLM-H skill-agent registry. Admin-curated
  // metadata; not per-identity (no DPDP §12(3) cascade). Identical
  // shape to slmModelPack persistence: one JSON file per skillId,
  // soft-delete via status='revoked', ledger emits skill_agent.*
  // events with pointer + meta only (never the FE prompt body —
  // that ships in the FE bundle, not the registry).
  skillAgentFile(skillId) {
    return path.join(this.skillAgentsPath, `${safeName(skillId)}.json`);
  }

  async saveSkillAgent(skillAgent) {
    await this.init();
    await writeJson(this.skillAgentFile(skillAgent.skillId), skillAgent);
    await this.appendLedger({
      type: skillAgent.status === 'revoked'
        ? 'skill_agent.revoked'
        : 'skill_agent.registered',
      skillId: skillAgent.skillId,
      category: skillAgent.category,
      protocolVersion: skillAgent.protocolVersion,
      operator: skillAgent.status === 'revoked'
        ? skillAgent.revokedBy
        : skillAgent.registeredBy,
      at: new Date().toISOString()
    });
    return skillAgent;
  }

  async readSkillAgent(skillId) {
    return readJson(this.skillAgentFile(skillId));
  }

  async listSkillAgents() {
    return listJson(this.skillAgentsPath);
  }

  // Phase 13.5 — citizen data offers. Per-identity (citizen-owned);
  // emits citizen_data_offer.* ledger events with POINTER + count-
  // only meta (never the data point bodies). DPDP §12(3) cascade
  // entry below in eraseUserData.
  citizenDataOfferFile(offerId) {
    return path.join(this.citizenDataOffersPath, `${safeName(offerId)}.json`);
  }

  async saveCitizenDataOffer(offer) {
    await this.init();
    await writeJson(this.citizenDataOfferFile(offer.offerId), offer);
    // Audit ledger event — kind depends on status transition. The
    // caller chooses the event type via the offer.status value.
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
      purposeCount: offer.sponsorPurposeAllowlist.length,
      at: new Date().toISOString()
    });
    return offer;
  }

  async readCitizenDataOffer(offerId) {
    return readJson(this.citizenDataOfferFile(offerId));
  }

  async listCitizenDataOffers({ publisherId } = {}) {
    const all = await listJson(this.citizenDataOffersPath);
    if (!publisherId) return all;
    return all.filter((o) => o.publisherId === publisherId);
  }

  // Phase 9.1 — sponsor records. Admin-curated (Phase 5.7 token
  // for create/deposit/revoke); sponsor-owned (per-sponsor bearer
  // token for round creation + export). NOT per-identity, so no
  // DPDP §12(3) cascade entry needed for the sponsor record
  // itself. Round updates submitted by workers ARE per-identity
  // and cascade via the existing federated_updates sweep.
  sponsorFile(sponsorId) {
    return path.join(this.sponsorsPath, `${safeName(sponsorId)}.json`);
  }

  async saveSponsor(sponsor) {
    if (!sponsor?.sponsorId) {
      throw new Error('sponsor requires sponsorId.');
    }
    await this.init();
    await writeJson(this.sponsorFile(sponsor.sponsorId), sponsor);
    await this.appendLedger({
      type: 'sponsor.saved',
      sponsorId: sponsor.sponsorId,
      displayName: sponsor.displayName,
      status: sponsor.status,
      escrowBalancePaise: sponsor.escrowBalancePaise,
      at: new Date().toISOString()
    });
    return sponsor;
  }

  async readSponsor(sponsorId) {
    return readJson(this.sponsorFile(sponsorId));
  }

  async listSponsors() {
    return listJson(this.sponsorsPath);
  }

  // Phase 10.5 — audit signer (singleton). One Ed25519 keypair used to
  // sign every labeling-job audit bundle. Persisted as a single JSON
  // file at `rootPath/audit-signer.json`. Created lazily on first
  // export request; never rotated in v1 (rotation is a Phase 10.5.1
  // follow-up — would require sponsors to re-fetch the public key).
  auditSignerFile() {
    return path.join(this.rootPath, 'audit-signer.json');
  }

  async readAuditSigner() {
    try {
      return await readJson(this.auditSignerFile());
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveAuditSigner(signer) {
    if (!signer?.id) throw new Error('audit signer requires id.');
    await this.init();
    await writeJson(this.auditSignerFile(), signer);
    await this.appendLedger({
      type: 'audit_signer.created',
      signerId: signer.id,
      createdAt: signer.createdAt,
      at: new Date().toISOString()
    });
    return signer;
  }

  // Phase 12.0 — provider identity table. One row per
  // marketplace-listed provider. Bound to a root citizen/worker
  // identity via rootIdentityId; DPDP §12(3) cascade by that field.
  providerIdentityFile(providerIdentityId) {
    return path.join(this.providerIdentitiesPath, `${safeName(providerIdentityId)}.json`);
  }

  async saveProviderIdentity(provider) {
    if (!provider?.providerIdentityId) {
      throw new Error('provider identity requires providerIdentityId.');
    }
    if (!provider.rootIdentityId) {
      throw new Error('provider identity requires rootIdentityId.');
    }
    await this.init();
    await writeJson(this.providerIdentityFile(provider.providerIdentityId), provider);
    await this.appendLedger({
      type: 'provider_identity.saved',
      providerIdentityId: provider.providerIdentityId,
      rootIdentityId: provider.rootIdentityId,
      roleKind: provider.roleKind,
      status: provider.status,
      kycLevel: provider.kycLevel,
      at: new Date().toISOString()
    });
    return provider;
  }

  async readProviderIdentity(providerIdentityId) {
    const p = await readJson(this.providerIdentityFile(providerIdentityId));
    return hydrateProviderIdentity(p);
  }

  async listProviderIdentities({ rootIdentityId, roleKind, status } = {}) {
    const all = await listJson(this.providerIdentitiesPath);
    return all
      .filter((p) => {
        if (rootIdentityId && p.rootIdentityId !== rootIdentityId) return false;
        if (roleKind && p.roleKind !== roleKind) return false;
        if (status && p.status !== status) return false;
        return true;
      })
      .map(hydrateProviderIdentity);
  }

  // Phase 12.1a.2 — booking + citizen-escrow tables.
  //
  // Bookings carry a monotonic `seq` for CAS concurrency. The
  // canonical write helper is casUpdateBooking(bookingId, expectedSeq,
  // next, events) — it atomically check+writes the record AND
  // appends ledger events, so a concurrent provider-accept race
  // can't double-spend escrow.
  //
  // Citizen escrow is one record per rootIdentityId; cascade with
  // identity erasure.
  bookingFile(bookingId) {
    return path.join(this.bookingsPath, `${safeName(bookingId)}.json`);
  }

  citizenEscrowFile(citizenRootIdentityId) {
    return path.join(this.citizenEscrowsPath, `${safeName(citizenRootIdentityId)}.json`);
  }

  async saveBooking(booking) {
    if (!booking?.bookingId) throw new Error('booking requires bookingId.');
    await this.init();
    await writeJson(this.bookingFile(booking.bookingId), booking);
    return booking;
  }

  async readBooking(bookingId) {
    return readJson(this.bookingFile(bookingId));
  }

  async listBookings({ citizenRootIdentityId, providerIdentityId, status } = {}) {
    const all = await listJson(this.bookingsPath);
    return all.filter((b) => {
      if (citizenRootIdentityId && b.citizenRootIdentityId !== citizenRootIdentityId) return false;
      if (providerIdentityId && b.providerIdentityId !== providerIdentityId) return false;
      if (status && b.status !== status) return false;
      return true;
    });
  }

  // Atomic CAS write — reads the current record under the BosStore
  // lock-free contract (FS is single-process for the MVP), asserts
  // the seq matches, writes the next record, then appends ledger
  // events. If seq drifts, throws a typed error so the API layer
  // returns 409 stale_seq to the caller.
  async casUpdateBooking(bookingId, expectedSeq, nextBooking, ledgerEvents = []) {
    const current = await this.readBooking(bookingId).catch(() => null);
    if (!current) {
      const err = new Error('unknown_booking');
      err.code = 'unknown_booking';
      throw err;
    }
    if (Number(current.seq) !== Number(expectedSeq)) {
      const err = new Error('stale_seq');
      err.code = 'stale_seq';
      err.currentSeq = current.seq;
      throw err;
    }
    await writeJson(this.bookingFile(bookingId), nextBooking);
    for (const event of ledgerEvents) {
      await this.appendLedger(event);
    }
    return nextBooking;
  }

  async saveCitizenEscrow(escrow) {
    if (!escrow?.citizenRootIdentityId) throw new Error('citizenEscrow requires citizenRootIdentityId.');
    await this.init();
    await writeJson(this.citizenEscrowFile(escrow.citizenRootIdentityId), escrow);
    return escrow;
  }

  async readCitizenEscrow(citizenRootIdentityId) {
    return readJson(this.citizenEscrowFile(citizenRootIdentityId));
  }

  // Phase 12.2.3 — Attachment CORE substrate. Two-file layout
  // per blob: <id>.bin (raw bytes) + <id>.json (metadata). The
  // .json is what listJson scans; the .bin is read on demand.
  attachmentBytesFile(attachmentId) {
    return path.join(this.attachmentsPath, `${safeName(attachmentId)}.bin`);
  }
  attachmentMetaFile(attachmentId) {
    return path.join(this.attachmentsPath, `${safeName(attachmentId)}.json`);
  }

  async saveAttachment(record, { quotaCapBytes } = {}) {
    if (!record?.attachmentId) throw new Error('attachment requires attachmentId.');
    if (!record.rootIdentityId) throw new Error('attachment requires rootIdentityId.');
    if (!Buffer.isBuffer(record.bytes)) throw new Error('attachment.bytes must be a Buffer.');
    await this.init();
    // Phase 12.2.3 fix A3-4 — best-effort quota check on the
    // file-store. BosStore has no transactional primitive; the
    // file-system race window is small (read-then-write within
    // a single Node microtask), and the production posture is
    // SqliteStore which has the proper BEGIN IMMEDIATE guard.
    if (Number.isFinite(quotaCapBytes)) {
      const current = await this.sumAttachmentBytesByActor(record.rootIdentityId);
      const existing = await readJson(this.attachmentMetaFile(record.attachmentId)).catch(() => null);
      const existingBytes = existing ? Number(existing.byteLength || 0) : 0;
      if (current - existingBytes + record.byteLength > quotaCapBytes) {
        const err = new Error('attachment would exceed the actor quota.');
        err.code = 'actor_quota_exceeded';
        err.currentBytes = current;
        err.attemptedAdd = record.byteLength;
        err.cap = quotaCapBytes;
        throw err;
      }
    }
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
    await fs.writeFile(this.attachmentBytesFile(record.attachmentId), record.bytes);
    await writeJson(this.attachmentMetaFile(record.attachmentId), meta);
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
    if (!attachmentId) return null;
    const meta = await readJson(this.attachmentMetaFile(attachmentId));
    if (!meta) return null;
    if (rootIdentityId && meta.rootIdentityId !== rootIdentityId) return null;
    const bytes = await fs.readFile(this.attachmentBytesFile(attachmentId)).catch(() => null);
    if (!bytes) return null;
    return { ...meta, bytes };
  }

  async listAttachments({ rootIdentityId, kind } = {}) {
    const all = await listJson(this.attachmentsPath);
    return all
      .filter((m) => {
        // Phase 12.2.3 fix PII-6 — REQUIRE a non-empty
        // rootIdentityId. An empty/null caller arg used to
        // short-circuit the filter, leaking every actor's
        // attachments to a buggy internal caller (operators
        // already have an explicit admin-token path).
        if (!rootIdentityId || m.rootIdentityId !== rootIdentityId) return false;
        if (kind && m.kind !== kind) return false;
        return true;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async sumAttachmentBytesByActor(rootIdentityId) {
    // Phase 12.2.3 fix PII-6 — same guard. Without a non-empty
    // actor id, return zero so quota math errs on the side of
    // refusing rather than silently approving.
    if (!rootIdentityId) return 0;
    const all = await listJson(this.attachmentsPath);
    let total = 0;
    for (const m of all) {
      if (m.rootIdentityId === rootIdentityId) total += Number(m.byteLength || 0);
    }
    return total;
  }

  async deleteAttachment(attachmentId, { rootIdentityId, at } = {}) {
    if (!attachmentId) return false;
    const meta = await readJson(this.attachmentMetaFile(attachmentId));
    if (!meta) return false;
    if (rootIdentityId && meta.rootIdentityId !== rootIdentityId) return false;
    await fs.unlink(this.attachmentBytesFile(attachmentId)).catch(() => {});
    await fs.unlink(this.attachmentMetaFile(attachmentId)).catch(() => {});
    await this.appendLedger({
      type: 'attachment.erased',
      attachmentId,
      rootIdentityId: meta.rootIdentityId,
      at: at || new Date().toISOString()
    });
    return true;
  }

  // Phase 12.2.6 — DigiLocker state + link substrate. Each
  // state is a single .json file keyed by state value (the
  // OAuth CSRF parameter); each link is a single .json file
  // keyed by rootIdentityId.
  digilockerStateFile(state) {
    return path.join(this.digilockerStatesPath, `${safeName(state)}.json`);
  }
  digilockerLinkFile(rootIdentityId) {
    return path.join(this.digilockerLinksPath, `${safeName(rootIdentityId)}.json`);
  }

  async saveDigiLockerState(record) {
    if (!record?.state) throw new Error('digilocker state requires state.');
    if (!record.rootIdentityId) throw new Error('digilocker state requires rootIdentityId.');
    await this.init();
    await writeJson(this.digilockerStateFile(record.state), record);
    return record;
  }

  async peekDigiLockerState(state) {
    if (!state) return null;
    return readJson(this.digilockerStateFile(state));
  }

  async consumeDigiLockerState(state) {
    if (!state) return null;
    const file = this.digilockerStateFile(state);
    const meta = await readJson(file);
    if (!meta) return null;
    await fs.unlink(file).catch(() => {});
    return meta;
  }

  async sweepExpiredDigiLockerStates({ now = new Date().toISOString() } = {}) {
    const all = await listJson(this.digilockerStatesPath);
    let removed = 0;
    for (const meta of all) {
      if (meta && meta.expiresAt && meta.expiresAt < now) {
        await fs.unlink(this.digilockerStateFile(meta.state)).catch(() => {});
        removed += 1;
      }
    }
    return removed;
  }

  async saveDigiLockerLink(link) {
    if (!link?.rootIdentityId) throw new Error('digilocker link requires rootIdentityId.');
    await this.init();
    await writeJson(this.digilockerLinkFile(link.rootIdentityId), link);
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
    if (!rootIdentityId) return null;
    return readJson(this.digilockerLinkFile(rootIdentityId));
  }

  async deleteDigiLockerLink(rootIdentityId, { at = new Date().toISOString() } = {}) {
    if (!rootIdentityId) return false;
    const link = await readJson(this.digilockerLinkFile(rootIdentityId));
    if (!link) return false;
    await fs.unlink(this.digilockerLinkFile(rootIdentityId)).catch(() => {});
    await this.appendLedger({
      type: 'digilocker.link_erased',
      rootIdentityId,
      at
    });
    return true;
  }

  // Phase 10.1 — labeling marketplace tables. Three resources:
  //   labeling_jobs       — one row per sponsor-created job
  //   labeling_job_items  — one row per uploaded corpus item
  //   labeling_submissions — one row per worker label submission
  // Sponsor-created jobs live in the sponsor's lane (sponsor-bearer
  // gated); items + submissions cascade by job. Per-identity worker
  // submissions DO go in the DPDP §12(3) sweep so a worker's labels
  // get anonymised on identity erase.
  labelingJobFile(jobId) {
    return path.join(this.labelingJobsPath, `${safeName(jobId)}.json`);
  }
  labelingJobItemFile(itemId) {
    return path.join(this.labelingJobItemsPath, `${safeName(itemId)}.json`);
  }
  labelingSubmissionFile(submissionId) {
    return path.join(this.labelingSubmissionsPath, `${safeName(submissionId)}.json`);
  }

  async saveLabelingJob(job) {
    if (!job?.jobId) throw new Error('labeling job requires jobId.');
    await this.init();
    await writeJson(this.labelingJobFile(job.jobId), job);
    await this.appendLedger({
      type: 'labeling_job.saved',
      jobId: job.jobId,
      sponsorId: job.sponsorId,
      status: job.status,
      itemCount: job.itemCount,
      perLabelPaise: job.perLabelPaise,
      at: new Date().toISOString()
    });
    return job;
  }

  async readLabelingJob(jobId) {
    return readJson(this.labelingJobFile(jobId));
  }

  async listLabelingJobs() {
    return listJson(this.labelingJobsPath);
  }

  async saveLabelingJobItem(item) {
    if (!item?.itemId) throw new Error('labeling job item requires itemId.');
    await this.init();
    await writeJson(this.labelingJobItemFile(item.itemId), item);
    return item;
  }

  async readLabelingJobItem(itemId) {
    return readJson(this.labelingJobItemFile(itemId));
  }

  async listLabelingJobItems({ jobId } = {}) {
    const all = await listJson(this.labelingJobItemsPath);
    if (jobId) return all.filter((i) => i.jobId === jobId);
    return all;
  }

  async saveLabelingSubmission(submission) {
    if (!submission?.submissionId) {
      throw new Error('labeling submission requires submissionId.');
    }
    await this.init();
    await writeJson(this.labelingSubmissionFile(submission.submissionId), submission);
    await this.appendLedger({
      type: submission.status === 'accepted'
        ? 'labeling_submission.accepted'
        : 'labeling_submission.rejected',
      submissionId: submission.submissionId,
      jobId: submission.jobId,
      itemId: submission.itemId,
      workerId: submission.workerId,
      at: new Date().toISOString()
    });
    return submission;
  }

  async readLabelingSubmission(submissionId) {
    return readJson(this.labelingSubmissionFile(submissionId));
  }

  async listLabelingSubmissions({ jobId, workerId } = {}) {
    const all = await listJson(this.labelingSubmissionsPath);
    let r = all;
    if (jobId) r = r.filter((s) => s.jobId === jobId);
    if (workerId) r = r.filter((s) => s.workerId === workerId);
    return r;
  }

  async computeContribution(identityId) {
    const [nodes, memoryRecords, contributionEvents] = await Promise.all([
      this.listNodes(),
      this.listMemoryRecords(),
      this.listMeshContributionEvents()
    ]);
    const operatorNodes = nodes.filter((node) => node.operatorId === identityId);
    const ownedRecords = memoryRecords.filter((record) => record.ownerId === identityId);
    const ownEvents = contributionEvents.filter((event) => event.operatorId === identityId);

    // Static capacity: the storage the operator's nodes advertise.
    const advertisedCapacityBytes = operatorNodes.reduce(
      (sum, node) => sum + Number(node.storageBytes ?? 0),
      0
    );
    const usedBytesOnOwnNodes = operatorNodes.reduce(
      (sum, node) => sum + Number(node.usedBytes ?? 0),
      0
    );

    // Dynamic contribution: actual bytes served (storage egress) + actual
    // bytes stored on others' nodes via this operator's contributions.
    // §13B fair-use lever is "real service", not just advertised capacity.
    const servedBytes = ownEvents
      .filter((event) => event.workloadType === 'storage_serve' || event.workloadType === 'storage_store')
      .reduce((sum, event) => sum + Number(event.bytes ?? 0), 0);
    const tokensServed = ownEvents
      .filter((event) => event.workloadType === 'inference')
      .reduce((sum, event) => sum + Number(event.tokens ?? 0), 0);
    const totalPaiseEarned = ownEvents.reduce(
      (sum, event) => sum + Number(event.payoutPaise ?? 0),
      0
    );

    const contributedBytes = advertisedCapacityBytes + servedBytes;
    const consumedBytes = ownedRecords.reduce(
      (sum, record) => sum + Number(record.plaintextBytes ?? 0),
      0
    );

    const ncs = netContributionScore({ contributedBytes, consumedBytes });

    return {
      identityId,
      ...ncs,
      nodeCount: operatorNodes.length,
      usedBytesOnOwnNodes,
      memoryRecordCount: ownedRecords.length,
      advertisedCapacityBytes,
      servedBytes,
      tokensServed,
      contributionEventCount: ownEvents.length,
      earningsPaise: totalPaiseEarned,
      earningsRupees: Number((totalPaiseEarned / 100).toFixed(2)),
      computedAt: new Date().toISOString()
    };
  }
}
