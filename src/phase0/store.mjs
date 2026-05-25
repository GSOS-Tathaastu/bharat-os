import fs from 'node:fs/promises';
import path from 'node:path';
import { netContributionScore } from './core.mjs';

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
    this.profileCredentialsPath = path.join(rootPath, 'profile-credentials');
    this.pushSubscriptionsPath = path.join(rootPath, 'push-subscriptions');
    this.workerNotificationsPath = path.join(rootPath, 'worker-notifications');
    this.voiceModelPacksPath = path.join(rootPath, 'voice-model-packs');
    this.ttsModelPacksPath = path.join(rootPath, 'tts-model-packs');
    this.onDeviceModelPacksPath = path.join(rootPath, 'on-device-model-packs');
    this.federatedRoundsPath = path.join(rootPath, 'federated-rounds');
    this.federatedUpdatesPath = path.join(rootPath, 'federated-updates');
    this.attestationsPath = path.join(rootPath, 'attestations');
    this.phoneOtpsPath = path.join(rootPath, 'phone-otps');
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
    await fs.mkdir(this.profileCredentialsPath, { recursive: true });
    await fs.mkdir(this.pushSubscriptionsPath, { recursive: true });
    await fs.mkdir(this.workerNotificationsPath, { recursive: true });
    await fs.mkdir(this.voiceModelPacksPath, { recursive: true });
    await fs.mkdir(this.ttsModelPacksPath, { recursive: true });
    await fs.mkdir(this.onDeviceModelPacksPath, { recursive: true });
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
