import fs from 'node:fs/promises';
import path from 'node:path';

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
}
