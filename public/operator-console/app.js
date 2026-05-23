const state = {
  dashboard: null,
  memory: [],
  consents: [],
  identities: [],
  skills: [],
  trustPassports: [],
  latestPreflight: null,
  busy: false
};

const $ = (id) => document.getElementById(id);

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function shortId(id) {
  if (!id) return '--';
  const parts = String(id).split(':');
  const tail = parts.at(-1) ?? id;
  return tail.length > 12 ? `${tail.slice(0, 6)}...${tail.slice(-6)}` : tail;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setBusy(value) {
  state.busy = value;
  $('runButton').disabled = value;
  $('refreshButton').disabled = value;
  $('decisionButton').disabled = value;
  $('toolButton').disabled = value;
  $('orchestrateButton').disabled = value;
  $('preflightGrantButton').disabled = value || !state.latestPreflight?.remediation?.consentGrant;
  $('preflightExecuteButton').disabled = value || !state.latestPreflight?.approved;
  $('preflightTraceButton').disabled = value || !state.latestPreflight?.preflightId;
  $('revokeConsentButton').disabled = value || !state.dashboard?.phase1?.latestActiveConsent;
  $('memorySearchButton').disabled = value;
  $('identityCreateButton').disabled = value;
  $('ledgerFilterButton').disabled = value;
  $('ledgerExportButton').disabled = value;
  document.querySelectorAll('.row-action').forEach((button) => {
    button.disabled = value;
  });
  $('runButton').textContent = value ? 'Running' : 'Run Bootstrap';
}

function setApiStatus(ok, text) {
  $('apiStatusDot').className = `status-dot ${ok ? 'ok' : 'bad'}`;
  $('apiStatusText').textContent = text;
}

function metric(id, value) {
  $(id).textContent = value;
}

function renderReasons(result) {
  const reasons = result?.rejectionReasons ?? {};
  const entries = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  $('rejectedCount').textContent = `${result?.rejectedNodeCount ?? 0} rejected`;

  if (entries.length === 0) {
    $('rejectionList').innerHTML = '<p class="verdict">No rejected nodes in the latest report.</p>';
    return;
  }

  $('rejectionList').innerHTML = entries
    .map(([reason, count]) => {
      const width = Math.max(3, (count / max) * 100);
      return `
        <div class="reason-row">
          <span>${reason.replaceAll('_', ' ')}</span>
          <b>${count}</b>
          <div class="reason-track"><div class="reason-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join('');
}

function renderNodes(nodes) {
  $('nodeCountLabel').textContent = `${state.dashboard?.controlPlane?.nodeCount ?? nodes.length} nodes`;
  if (nodes.length === 0) {
    $('nodesTable').innerHTML = '<tr><td colspan="6">No node data yet.</td></tr>';
    return;
  }

  $('nodesTable').innerHTML = nodes
    .map((node) => {
      const power = node.wifi && node.charging ? 'ready' : node.wifi ? 'not charging' : 'offline';
      return `
        <tr>
          <td class="mono" title="${node.nodeId}">${shortId(node.nodeId)}</td>
          <td><span class="tag ${node.kycVerified ? 'good' : 'bad'}">${node.kycVerified ? 'KYC' : 'No KYC'}</span></td>
          <td><span class="tag ${power === 'ready' ? 'good' : 'warn'}">${power}</span></td>
          <td>${node.batteryPercent}%</td>
          <td>${node.trustScore}</td>
          <td>${formatBytes(node.usedBytes)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderReports(reports) {
  $('reportCountLabel').textContent = `${reports.length} reports`;
  if (reports.length === 0) {
    $('reportsTable').innerHTML = '<tr><td colspan="5">No reports yet.</td></tr>';
    return;
  }

  $('reportsTable').innerHTML = reports
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(
      (report) => `
        <tr>
          <td class="mono" title="${report.reportId}">${shortId(report.reportId)}</td>
          <td>${report.seed}</td>
          <td>${report.results.storedObjectCount}/${report.inputs.objectCount}</td>
          <td>${formatPercent(report.results.successRate, 1)}</td>
          <td>${new Date(report.createdAt).toLocaleString()}</td>
        </tr>
      `
    )
    .join('');
}

function eventArtifact(event) {
  return (
    event.consentId ??
    event.decisionId ??
    event.executionId ??
    event.orchestrationId ??
    event.preflightId ??
    event.recordId ??
    event.reportId ??
    event.controlPlaneId ??
    event.manifestId ??
    event.nodeId ??
    event.identityId ??
    '--'
  );
}

function renderLedger(events) {
  $('ledgerCountLabel').textContent = `${events.length} events`;
  if (events.length === 0) {
    $('ledgerTable').innerHTML = '<tr><td colspan="5">No ledger events yet.</td></tr>';
    return;
  }

  $('ledgerTable').innerHTML = events
    .map((event) => {
      const decision = event.approved === undefined ? '--' : event.approved ? 'approved' : 'blocked';
      const status = event.status ?? event.actionType ?? event.toolId ?? '--';
      return `
        <tr>
          <td>${event.type}</td>
          <td class="mono" title="${eventArtifact(event)}">${shortId(eventArtifact(event))}</td>
          <td>${decision}</td>
          <td>${status}</td>
          <td>${event.at ? new Date(event.at).toLocaleString() : '--'}</td>
        </tr>
      `;
    })
    .join('');
}

function publicKeyLabel(identity) {
  const normalized = String(identity.publicKeyPem ?? '').replace(/\s+/g, '');
  if (!normalized) return '--';
  return normalized.length > 16 ? `${normalized.slice(0, 8)}...${normalized.slice(-8)}` : normalized;
}

function renderIdentities(identities) {
  state.identities = identities;
  $('identityCountLabel').textContent = `${identities.length} identities`;
  if (identities.length === 0) {
    $('identitiesTable').innerHTML = '<tr><td colspan="6">No public identities yet.</td></tr>';
    return;
  }

  $('identitiesTable').innerHTML = identities
    .slice()
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((identity) => {
      const attestationKeys = Object.keys(identity.attestations ?? {});
      const attestationText = attestationKeys.length > 0 ? attestationKeys.join(', ') : 'none';
      return `
        <tr>
          <td>${escapeHtml(identity.displayName)}</td>
          <td class="mono" title="${escapeHtml(identity.id)}">${escapeHtml(shortId(identity.id))}</td>
          <td>${escapeHtml(attestationText)}</td>
          <td class="mono" title="${escapeHtml(identity.publicKeyPem)}">${escapeHtml(publicKeyLabel(identity))}</td>
          <td>${identity.createdAt ? new Date(identity.createdAt).toLocaleString() : '--'}</td>
          <td><button class="row-action" type="button" data-identity-use="${escapeHtml(identity.id)}">Use</button></td>
        </tr>
      `;
    })
    .join('');
}

function renderSkills(skills) {
  state.skills = skills;
  $('skillRegistryCountLabel').textContent = `${skills.length} skills`;
  if (skills.length === 0) {
    $('skillsTable').innerHTML = '<tr><td colspan="10">No skills registered yet.</td></tr>';
    return;
  }

  $('skillsTable').innerHTML = skills
    .slice()
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name))
    .map((skill) => `
      <tr>
        <td title="${escapeHtml(skill.summary)}">${escapeHtml(skill.name)}</td>
        <td>${escapeHtml(skill.version ?? '--')}</td>
        <td>${escapeHtml(skill.category)}</td>
        <td class="mono" title="${escapeHtml(skill.toolBinding?.toolId)}">${escapeHtml(skill.toolBinding?.toolId ?? '--')}</td>
        <td><span class="tag ${skill.permissions?.consentRequired ? 'warn' : 'good'}">${skill.permissions?.consentRequired ? 'required' : 'not required'}</span></td>
        <td>${escapeHtml(skill.permissions?.dataExposure ?? '--')}</td>
        <td>${escapeHtml(skill.sandbox?.modelContext ?? '--')}</td>
        <td class="mono" title="${escapeHtml(skill.manifestHash)}">${escapeHtml(shortId(skill.manifestHash))}</td>
        <td>${escapeHtml(skill.developer?.displayName ?? '--')}</td>
        <td><button class="row-action" type="button" data-skill-preflight="${escapeHtml(skill.skillId)}">Preflight</button></td>
      </tr>
    `)
    .join('');
}

function assuranceClass(level) {
  if (level === 'verified') return 'good';
  if (level === 'active') return 'warn';
  return '';
}

function renderTrustPassports(passports) {
  state.trustPassports = passports;
  $('trustPassportCountLabel').textContent = `${passports.length} passports`;
  if (passports.length === 0) {
    $('trustPassportsTable').innerHTML = '<tr><td colspan="11">No trust passports yet.</td></tr>';
    return;
  }

  $('trustPassportsTable').innerHTML = passports
    .slice()
    .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))
    .map((passport) => {
      const attestationTypes = passport.attestations?.types ?? [];
      const mesh = passport.mesh ?? {};
      const meshClass = mesh.class === 'producer' ? 'good' : 'warn';
      const meshLabel = `${formatBytes(mesh.scoreBytes ?? 0)} (${mesh.class ?? 'consumer'})`;
      const meshTitle = `contributed ${formatBytes(mesh.contributedBytes ?? 0)} • consumed ${formatBytes(mesh.consumedBytes ?? 0)} • ${mesh.nodeCount ?? 0} nodes`;
      return `
        <tr>
          <td class="mono" title="${escapeHtml(passport.subjectId)}">${escapeHtml(shortId(passport.subjectId))}</td>
          <td><span class="tag ${assuranceClass(passport.assurance?.level)}">${escapeHtml(passport.assurance?.level ?? 'basic')}</span></td>
          <td title="${escapeHtml(attestationTypes.join(', '))}">${passport.attestations?.count ?? 0}</td>
          <td>${passport.consents?.active ?? 0}</td>
          <td>${passport.consents?.signed ?? 0}/${passport.consents?.total ?? 0}</td>
          <td>${passport.memory?.recordCount ?? 0} / ${formatBytes(passport.memory?.plaintextBytes ?? 0)}</td>
          <td>${passport.skillInvocations?.approvedPreflightCount ?? 0}/${passport.skillInvocations?.preflightCount ?? 0} preflight, ${passport.skillInvocations?.executionCount ?? 0} runs</td>
          <td title="${escapeHtml(meshTitle)}"><span class="tag ${meshClass}">${escapeHtml(meshLabel)}</span></td>
          <td class="mono" title="${escapeHtml(passport.evidenceHash)}">${escapeHtml(shortId(passport.evidenceHash))}</td>
          <td>${passport.generatedAt ? new Date(passport.generatedAt).toLocaleString() : '--'}</td>
          <td><button class="row-action" type="button" data-trust-sign="${escapeHtml(passport.subjectId)}">Sign</button></td>
        </tr>
      `;
    })
    .join('');
}

function renderServiceMarketplace(orchestrations) {
  state.marketplaceOrchestrations = orchestrations;
  const bookings = orchestrations.filter(
    (o) => o.actionRequest?.actionType === 'service_booking'
  );
  $('marketplaceCountLabel').textContent = `${bookings.length} bookings`;
  if (bookings.length === 0) {
    $('marketplaceTable').innerHTML =
      '<tr><td colspan="8">No service bookings yet. Try "Book me a cab from X to Y".</td></tr>';
    return;
  }

  $('marketplaceTable').innerHTML = bookings
    .slice()
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((orchestration) => {
      const receipt = orchestration.execution?.toolReceipt ?? {};
      const fare = receipt.fare
        ? `₹${receipt.fare.amount} ${receipt.fare.currency ?? 'INR'}`
        : '--';
      const provider = receipt.chosen?.providerName ?? receipt.providerName ?? '--';
      const source = receipt.chosen?.source ?? receipt.source ?? '--';
      const sourceClass = source === 'native' ? 'good' : 'warn';
      const locale = orchestration.intent?.detectedLocale ?? '--';
      const statusClass = orchestration.status === 'completed' ? 'good' : orchestration.status === 'blocked' ? 'bad' : 'warn';
      const bookingRef = receipt.bookingRef ?? orchestration.orchestrationId ?? '';
      return `
        <tr>
          <td class="mono" title="${escapeHtml(bookingRef)}">${escapeHtml(shortId(bookingRef))}</td>
          <td>${escapeHtml(receipt.vertical ?? '--')}</td>
          <td title="${escapeHtml(provider)}">${escapeHtml(provider)}</td>
          <td><span class="tag ${sourceClass}">${escapeHtml(source)}</span></td>
          <td>${escapeHtml(fare)}</td>
          <td class="mono">${escapeHtml(locale)}</td>
          <td><span class="tag ${statusClass}">${escapeHtml(orchestration.status ?? '--')}</span></td>
          <td>${orchestration.createdAt ? new Date(orchestration.createdAt).toLocaleString() : '--'}</td>
        </tr>
      `;
    })
    .join('');
}

function renderWorkerAuthorizations(authorizations) {
  state.workerAuthorizations = authorizations;
  $('workerAuthCountLabel').textContent = `${authorizations.length} receipts`;
  if (authorizations.length === 0) {
    $('workerAuthTable').innerHTML =
      '<tr><td colspan="8">No worker authorizations yet. §9A kiosk-mediated flows require these.</td></tr>';
    return;
  }

  $('workerAuthTable').innerHTML = authorizations
    .slice()
    .sort((left, right) => String(right.issuedAt).localeCompare(String(left.issuedAt)))
    .map((auth) => {
      const statusClass = auth.status === 'signed' ? 'good' : 'warn';
      const sigCount = (auth.signatures ?? []).length;
      return `
        <tr>
          <td class="mono" title="${escapeHtml(auth.authorizationId)}">${escapeHtml(shortId(auth.authorizationId))}</td>
          <td class="mono" title="${escapeHtml(auth.workerId)}">${escapeHtml(shortId(auth.workerId))}</td>
          <td class="mono" title="${escapeHtml(auth.operatorId)}">${escapeHtml(shortId(auth.operatorId))}</td>
          <td title="${escapeHtml(auth.purpose ?? '')}">${escapeHtml(shortId(auth.jobReference ?? ''))}</td>
          <td><span class="tag ${statusClass}">${escapeHtml(auth.status ?? 'unsigned')}</span></td>
          <td>${sigCount}</td>
          <td>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleString() : '--'}</td>
          <td><button class="row-action" type="button" data-worker-auth-verify="${escapeHtml(auth.authorizationId)}">Verify</button></td>
        </tr>
      `;
    })
    .join('');
}

function consentStatusClass(status) {
  if (status === 'active') return 'good';
  if (status === 'revoked') return 'bad';
  return 'warn';
}

function renderConsents(consents) {
  state.consents = consents;
  $('consentTimelineCountLabel').textContent = `${consents.length} consents`;
  if (consents.length === 0) {
    $('consentsTable').innerHTML = '<tr><td colspan="8">No consent grants yet.</td></tr>';
    return;
  }

  $('consentsTable').innerHTML = consents
    .slice()
    .sort((left, right) => String(right.issuedAt).localeCompare(String(left.issuedAt)))
    .map((consent) => {
      const status = consent.lifecycle?.status ?? consent.status;
      const signedCount = consent.signatures?.length ?? 0;
      const revokedSignedCount = consent.revocation?.signatures?.length ?? 0;
      const signedText = revokedSignedCount > 0 ? `${signedCount}+${revokedSignedCount}` : String(signedCount);
      const canRevoke = status === 'active';
      return `
        <tr>
          <td><span class="tag ${consentStatusClass(status)}">${escapeHtml(status)}</span></td>
          <td class="mono" title="${escapeHtml(consent.subjectId)}">${escapeHtml(shortId(consent.subjectId))}</td>
          <td title="${escapeHtml(consent.granteeId)}">${escapeHtml(shortId(consent.granteeId))}</td>
          <td>${escapeHtml((consent.scopes ?? []).join(', '))}</td>
          <td title="${escapeHtml(consent.purpose)}">${escapeHtml(consent.purpose)}</td>
          <td>${escapeHtml(signedText)}</td>
          <td>${consent.expiresAt ? new Date(consent.expiresAt).toLocaleDateString() : '--'}</td>
          <td>
            <div class="row-actions">
              <button class="row-action verify-action" type="button" data-consent-verify="${escapeHtml(consent.consentId)}">Verify</button>
              <button class="row-action warning-row-action" type="button" data-consent-revoke="${escapeHtml(consent.consentId)}" ${canRevoke ? '' : 'disabled'}>Revoke</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function sourceText(source) {
  if (!source) return '--';
  const detail = source.ref ?? source.uri ?? source.id ?? source.name;
  if (source.type && detail) return `${source.type}: ${detail}`;
  if (source.type) return source.type;
  try {
    return JSON.stringify(source);
  } catch {
    return '--';
  }
}

function renderMemory(records) {
  state.memory = records;
  $('memorySearchCountLabel').textContent = `${records.length} records`;
  if (records.length === 0) {
    $('memoryTable').innerHTML = '<tr><td colspan="8">No memory records found.</td></tr>';
    return;
  }

  $('memoryTable').innerHTML = records
    .map((record) => {
      const provenance = record.provenance ?? record;
      const tags = (provenance.tags ?? record.tags ?? [])
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join(' ');
      return `
        <tr>
          <td title="${escapeHtml(record.recordId)}">${escapeHtml(record.label)}</td>
          <td class="mono" title="${escapeHtml(record.ownerId)}">${escapeHtml(shortId(record.ownerId))}</td>
          <td>${tags || '--'}</td>
          <td>${escapeHtml(sourceText(provenance.source))}</td>
          <td class="mono" title="${escapeHtml(provenance.manifestId)}">${escapeHtml(shortId(provenance.manifestId))}</td>
          <td>${formatBytes(record.plaintextBytes)}</td>
          <td>${record.createdAt ? new Date(record.createdAt).toLocaleString() : '--'}</td>
          <td>
            <div class="row-actions">
              <button class="row-action grant-action" type="button" data-memory-grant="${escapeHtml(record.recordId)}">Grant</button>
              <button class="row-action" type="button" data-memory-read="${escapeHtml(record.recordId)}">Read</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderPhase1(phase1) {
  $('policyCount').textContent = phase1?.policyCount ?? '--';
  $('skillCount').textContent = phase1?.skillCount ?? '--';
  $('activeConsentCount').textContent = phase1?.activeConsentCount ?? '--';
  $('revokedConsentCount').textContent = phase1?.revokedConsentCount ?? '--';
  $('expiredConsentCount').textContent = phase1?.expiredConsentCount ?? '--';
  $('signedConsentCount').textContent = phase1?.signedConsentCount ?? '--';
  $('decisionCount').textContent = phase1?.decisionCount ?? '--';
  $('toolExecutionCount').textContent = phase1?.toolExecutionCount ?? '--';
  $('orchestrationCount').textContent = phase1?.orchestrationCount ?? '--';
  $('skillPreflightCount').textContent = phase1?.skillPreflightCount ?? '--';
  $('memoryRecordCount').textContent = phase1?.memoryRecordCount ?? '--';
  const integrityChecks = [
    phase1?.integrity?.latestDecision,
    phase1?.integrity?.latestToolExecution,
    phase1?.integrity?.latestOrchestration,
    phase1?.integrity?.latestSkillPreflight
  ].filter(Boolean);
  const validIntegrityChecks = integrityChecks.filter((item) => item.valid).length;
  $('integrityStatus').textContent = integrityChecks.length > 0 ? `${validIntegrityChecks}/${integrityChecks.length}` : '--';
  $('revokeConsentButton').disabled = state.busy || !phase1?.latestActiveConsent;
  $('latestConsentText').textContent = phase1?.latestActiveConsent
    ? `${shortId(phase1.latestActiveConsent.consentId)} active until ${new Date(phase1.latestActiveConsent.expiresAt).toLocaleDateString()}`
    : 'No active consent.';

  const integrityLabel = (result) => {
    if (!result) return 'not checked';
    return result.valid ? 'receipt ok' : 'receipt mismatch';
  };

  if (!phase1?.latestDecision) {
    $('latestDecisionText').textContent = 'No decision evaluations yet.';
  } else {
    const latest = phase1.latestDecision;
    $('latestDecisionText').textContent = `${latest.actionType} ${latest.approved ? 'passed' : 'blocked'} with ${latest.failedChecks} failed checks; ${integrityLabel(phase1.integrity?.latestDecision)}.`;
  }

  if (!phase1?.latestToolExecution) {
    $('latestToolText').textContent = 'No tool executions yet.';
  } else {
    const latestTool = phase1.latestToolExecution;
    $('latestToolText').textContent = `${latestTool.toolId} ${latestTool.status} for ${latestTool.actionType}; preflight: ${shortId(latestTool.skillPreflightId)}; ${integrityLabel(phase1.integrity?.latestToolExecution)}.`;
  }

  if (!phase1?.latestOrchestration) {
    $('latestOrchestrationText').textContent = 'No orchestrations yet.';
  } else {
    const latest = phase1.latestOrchestration;
    $('latestOrchestrationText').textContent = `${latest.actionType} orchestration ${latest.status}; skill: ${shortId(latest.skillId)}; preflight: ${shortId(latest.skillPreflightId)}; locale: ${latest.locale ?? 'en-IN'}; executed: ${latest.executed ? 'yes' : 'no'}; ${integrityLabel(phase1.integrity?.latestOrchestration)}.`;
  }

  if (!phase1?.latestSkillPreflight) {
    $('latestSkillPreflightText').textContent = 'No skill preflights yet.';
  } else {
    const latest = phase1.latestSkillPreflight;
    $('latestSkillPreflightText').textContent = `${shortId(latest.skillId)} preflight ${latest.approved ? 'approved' : 'blocked'} for ${latest.actionType}; ${integrityLabel(phase1.integrity?.latestSkillPreflight)}.`;
  }

  if (!phase1?.latestMemoryRecord) {
    $('latestMemoryText').textContent = 'No memory records yet.';
  } else {
    const latest = phase1.latestMemoryRecord;
    $('latestMemoryText').textContent = `${latest.label} memory stored for ${shortId(latest.ownerId)}; ${latest.plaintextBytes} encrypted bytes.`;
  }
}

function renderDashboard(data) {
  state.dashboard = data;
  const report = data.latestReport;
  const result = report?.results;

  metric('successRate', result ? formatPercent(result.successRate, 1) : '--');
  metric(
    'eligibleNodes',
    result ? `${result.eligibleNodeCount}/${result.nodeCount}` : '--'
  );
  metric(
    'storedObjects',
    result ? `${result.storedObjectCount}/${report.inputs.objectCount}` : '--'
  );
  metric('eligibleStorage', result ? formatBytes(result.eligibleStorageBytes) : '--');

  const eligibleRatio = result?.nodeCount ? result.eligibleNodeCount / result.nodeCount : 0;
  $('eligibilityDonut').style.setProperty('--value', String(Math.round(eligibleRatio * 100)));
  $('donutValue').textContent = formatPercent(eligibleRatio, 0);
  $('reportIdLabel').textContent = report ? shortId(report.reportId) : 'No report';
  $('utilizationBar').style.width = `${Math.min(100, (result?.utilization ?? 0) * 100)}%`;
  $('utilizationValue').textContent = result ? formatPercent(result.utilization, 4) : '0%';

  const replicationRatio = result?.storedPlaintextBytes
    ? result.replicatedBytes / result.storedPlaintextBytes
    : 0;
  $('replicationBar').style.width = `${Math.min(100, (replicationRatio / 4) * 100)}%`;
  $('replicationValue').textContent = `${replicationRatio.toFixed(2)}x`;
  $('verdictText').textContent = result
    ? result.successRate >= 0.99
      ? 'The latest simulated demand profile clears the Phase 0 mesh target.'
      : 'The latest simulated demand profile needs more eligible capacity.'
    : 'Waiting for bootstrap data.';

  renderReasons(result);
  renderNodes(data.nodes ?? []);
  renderReports(data.reports ?? []);
  if (!state.busy) {
    renderLedger(data.ledger?.recentEvents ?? []);
  }
  renderPhase1(data.phase1);
}

async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderDashboard(await response.json());
    await loadSkills();
    await loadIdentities();
    await loadTrustPassports();
    await loadDefaultActor();
    await loadMemory();
    await loadConsents();
    await loadServiceMarketplace();
    await loadWorkerAuthorizations();
    await loadFlagReports();
    setApiStatus(true, 'Connected');
  } catch (error) {
    setApiStatus(false, 'Disconnected');
    console.error(error);
  }
}

async function loadIdentities() {
  const response = await fetch('/api/identities');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderIdentities(data.identities ?? []);
}

async function loadSkills() {
  const response = await fetch('/api/skills');
  if (response.status === 404) {
    renderSkills([]);
    return;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderSkills(data.skills ?? []);
}

async function preflightSkill(skillId) {
  const actorId = $('decisionActorInput').value.trim();
  if (!actorId) {
    $('decisionOutput').textContent = 'Actor ID is required for skill preflight.';
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(`/api/skills/${encodeURIComponent(skillId)}/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId,
        piiHandling: $('decisionPiiInput').value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    state.latestPreflight = data.preflight;
    $('decisionOutput').textContent = JSON.stringify(
      {
        preflightId: data.preflight.preflightId,
        skillId: data.preflight.skillId,
        approved: data.preflight.approved,
        auditHash: data.preflight.auditHash,
        integrityValid: data.preflight.integrity.valid,
        remediation: data.preflight.remediation,
        decisionId: data.preflight.decision.decisionId,
        failedPolicies: data.preflight.decision.checks
          ?.filter((item) => item.status === 'fail')
          .map((item) => item.policyId)
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Skill preflight failed');
  } finally {
    setBusy(false);
  }
}

async function grantLatestPreflightConsent() {
  const preflight = state.latestPreflight;
  if (!preflight?.remediation?.consentGrant) {
    $('decisionOutput').textContent = 'No consent remediation is available for the latest preflight.';
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(`/api/skill-preflights/${encodeURIComponent(preflight.preflightId)}/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signWithIdentityId: preflight.remediation.consentGrant.subjectId
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    const retryResponse = await fetch(`/api/skill-preflights/${encodeURIComponent(preflight.preflightId)}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const retryData = await retryResponse.json();
    if (!retryResponse.ok) throw new Error(JSON.stringify(retryData));

    state.latestPreflight = retryData.preflight;
    $('decisionOutput').textContent = JSON.stringify(
      {
        preflightId: data.preflightId,
        consentId: data.consent.consentId,
        subjectId: data.consent.subjectId,
        scopes: data.consent.scopes,
        signatureCount: data.consent.signatures?.length ?? 0,
        lifecycle: data.lifecycle,
        integrity: {
          valid: data.integrity?.valid,
          signatureValid: data.integrity?.signatureValid,
          reasons: data.integrity?.reasons ?? []
        },
        retry: {
          preflightId: retryData.preflight.preflightId,
          sourcePreflightId: retryData.sourcePreflightId,
          approved: retryData.preflight.approved,
          failedPolicies: retryData.preflight.decision.checks
            ?.filter((item) => item.status === 'fail')
            .map((item) => item.policyId)
        },
        constraints: data.consent.constraints
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Preflight consent grant failed');
  } finally {
    setBusy(false);
  }
}

async function executeLatestPreflight() {
  const preflight = state.latestPreflight;
  if (!preflight?.approved) {
    $('decisionOutput').textContent = 'An approved preflight is required before execution.';
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(`/api/skill-preflights/${encodeURIComponent(preflight.preflightId)}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        preflightId: data.preflightId,
        executionId: data.execution.executionId,
        status: data.execution.status,
        approved: data.execution.decision.approved,
        integrity: {
          valid: data.integrity?.valid,
          auditHashValid: data.integrity?.auditHashValid,
          reasons: data.integrity?.reasons ?? []
        },
        toolReceipt: data.execution.toolReceipt,
        failedPolicies: data.execution.decision.checks
          ?.filter((item) => item.status === 'fail')
          .map((item) => item.policyId)
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Preflight execution failed');
  } finally {
    setBusy(false);
  }
}

async function traceLatestPreflight() {
  const preflight = state.latestPreflight;
  if (!preflight?.preflightId) {
    $('decisionOutput').textContent = 'A preflight receipt is required before tracing.';
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(`/api/skill-preflights/${encodeURIComponent(preflight.preflightId)}/trace`);
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        traceId: data.trace.traceId,
        evidenceHash: data.trace.evidenceHash,
        status: data.trace.status,
        skillId: data.trace.skillId,
        privacy: data.trace.privacy,
        preflightIds: data.trace.preflightIds,
        executionIds: data.trace.executionIds,
        consentIds: data.trace.consentIds,
        ledgerEvents: data.trace.ledgerEvents.length
      },
      null,
      2
    );
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Preflight trace failed');
  } finally {
    setBusy(false);
  }
}

async function loadTrustPassports() {
  const response = await fetch('/api/trust-passports');
  if (response.status === 404) {
    renderTrustPassports([]);
    return;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderTrustPassports(data.passports ?? []);
}

async function loadServiceMarketplace() {
  try {
    const response = await fetch('/api/orchestrations');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderServiceMarketplace(data.orchestrations ?? []);
  } catch (error) {
    renderServiceMarketplace([]);
  }
}

async function loadWorkerAuthorizations() {
  try {
    const response = await fetch('/api/worker-authorizations');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderWorkerAuthorizations(data.authorizations ?? []);
  } catch (error) {
    renderWorkerAuthorizations([]);
  }
}

// §9A flag review queue (Phase 2a.11). Operator sees flag reports the
// citizen filed via /shell/, can resolve / dismiss with a reason, and the
// audit ledger records the resolution. Three open high-severity flags
// against an actor auto-block their sensitive actions via L4 policy;
// resolving them unwinds the block.
function flagSeverityClass(severity) {
  if (severity === 'high') return 'bad';
  if (severity === 'medium') return 'warn';
  return 'good';
}

function flagStatusClass(status) {
  if (status === 'pending') return 'warn';
  if (status === 'under_review') return 'warn';
  if (status === 'resolved') return 'good';
  if (status === 'dismissed') return '';
  return '';
}

function renderFlagReports(flags) {
  state.flagReports = flags;
  $('flagReportsCountLabel').textContent =
    flags.length === 1 ? '1 flag' : `${flags.length} flags`;
  if (flags.length === 0) {
    $('flagReportsTable').innerHTML =
      '<tr><td colspan="9">No flags match this filter. The §9A safeguard escalation surface is quiet.</td></tr>';
    return;
  }

  // Open flags first, by severity (high → medium → low), then newest first.
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const statusWeight = { pending: 4, under_review: 3, resolved: 2, dismissed: 1 };
  const sorted = flags.slice().sort((left, right) => {
    const sd = (statusWeight[right.status] ?? 0) - (statusWeight[left.status] ?? 0);
    if (sd !== 0) return sd;
    const sev = (severityWeight[right.severity] ?? 0) - (severityWeight[left.severity] ?? 0);
    if (sev !== 0) return sev;
    return String(right.reportedAt).localeCompare(String(left.reportedAt));
  });

  $('flagReportsTable').innerHTML = sorted
    .map((flag) => {
      const isOpen = flag.status === 'pending' || flag.status === 'under_review';
      const actionButtons = isOpen
        ? `
          <button class="row-action" type="button" data-flag-resolve="${escapeHtml(flag.flagId)}" data-resolution="resolved">Resolve</button>
          <button class="row-action" type="button" data-flag-resolve="${escapeHtml(flag.flagId)}" data-resolution="dismissed">Dismiss</button>
        `
        : `<span class="row-action-meta">${escapeHtml(flag.review?.resolvedBy ?? '--')}</span>`;
      const summaryText = flag.summary ?? '';
      return `
        <tr>
          <td class="mono" title="${escapeHtml(flag.flagId)}">${escapeHtml(shortId(flag.flagId))}</td>
          <td class="mono" title="${escapeHtml(flag.subjectActorId)}">${escapeHtml(shortId(flag.subjectActorId))}</td>
          <td class="mono" title="${escapeHtml(flag.reporterId)}">${escapeHtml(shortId(flag.reporterId))}</td>
          <td>${escapeHtml(flag.category)}</td>
          <td><span class="tag ${flagSeverityClass(flag.severity)}">${escapeHtml(flag.severity)}</span></td>
          <td title="${escapeHtml(summaryText)}">${escapeHtml(summaryText.length > 60 ? summaryText.slice(0, 60) + '…' : summaryText)}</td>
          <td><span class="tag ${flagStatusClass(flag.status)}">${escapeHtml(flag.status)}</span></td>
          <td>${flag.reportedAt ? new Date(flag.reportedAt).toLocaleString() : '--'}</td>
          <td class="row-actions">${actionButtons}</td>
        </tr>
      `;
    })
    .join('');
}

async function loadFlagReports() {
  try {
    const statusFilter = $('flagStatusFilter').value;
    let url = '/api/flags';
    if (statusFilter && statusFilter !== 'open') {
      url += `?status=${encodeURIComponent(statusFilter)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    let flags = data.flags ?? [];
    if (statusFilter === 'open') {
      flags = flags.filter((flag) => flag.status === 'pending' || flag.status === 'under_review');
    }
    renderFlagReports(flags);
  } catch (error) {
    renderFlagReports([]);
  }
}

async function resolveFlagReport(flagId, resolution) {
  const reason = window.prompt(
    resolution === 'resolved'
      ? 'Resolution reason — what was done? (e.g., "NGO mediation completed, contractor released wages")'
      : 'Dismissal reason — why is this not actionable? (e.g., "duplicate of earlier report")'
  );
  if (!reason || reason.trim().length < 3) {
    return;
  }
  const resolvedBy = window.prompt(
    'Reviewer identifier (operator id, NGO, etc.)',
    'bos:operator:console'
  );
  if (!resolvedBy) return;

  setBusy(true);
  try {
    const response = await fetch(
      `/api/flags/${encodeURIComponent(flagId)}/resolve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: resolution, reason: reason.trim(), resolvedBy: resolvedBy.trim() })
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionOutput').textContent = JSON.stringify(
      {
        flagId,
        status: data.flag?.status,
        resolvedBy: data.flag?.review?.resolvedBy,
        reason: data.flag?.review?.reason,
        threshold: 'Subject\'s §9A auto-block recomputes on the next orchestration.'
      },
      null,
      2
    );
    await loadFlagReports();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Flag resolve failed');
  } finally {
    setBusy(false);
  }
}

async function verifyWorkerAuth(authorizationId) {
  setBusy(true);
  try {
    const response = await fetch(
      `/api/worker-authorizations/${encodeURIComponent(authorizationId)}/verify`,
      { method: 'POST' }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionOutput').textContent = JSON.stringify(
      {
        authorizationId,
        valid: data.verification?.valid,
        signatureValid: data.verification?.signatureValid,
        reasons: data.verification?.reasons ?? []
      },
      null,
      2
    );
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Worker authorization verify failed');
  } finally {
    setBusy(false);
  }
}

async function signTrustPassport(identityId) {
  setBusy(true);
  try {
    const response = await fetch(`/api/trust-passports/${encodeURIComponent(identityId)}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'subject' })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    const blob = new Blob([`${JSON.stringify(data.snapshot, null, 2)}\n`], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replaceAll(':', '-');
    link.href = objectUrl;
    link.download = `bharat-os-trust-passport-${shortId(identityId)}-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    $('decisionOutput').textContent = JSON.stringify(
      {
        snapshotId: data.snapshot.snapshotId,
        signerId: data.snapshot.signerId,
        valid: data.integrity.valid,
        payloadHashValid: data.integrity.payloadHashValid,
        signatureValid: data.integrity.signatureValid,
        filename: link.download
      },
      null,
      2
    );
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Trust passport sign failed');
  } finally {
    setBusy(false);
  }
}

async function createIdentityProfile() {
  const displayName = $('identityNameInput').value.trim();
  if (!displayName) {
    $('decisionOutput').textContent = 'Display name is required.';
    return;
  }

  setBusy(true);
  try {
    const response = await fetch('/api/identities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName,
        attestations: { local_profile: { status: 'created' } }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionActorInput').value = data.identity.id;
    $('decisionOutput').textContent = JSON.stringify(
      {
        identityId: data.identity.id,
        displayName: data.identity.displayName,
        selected: true
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Identity create failed');
  } finally {
    setBusy(false);
  }
}

async function loadConsents() {
  const response = await fetch('/api/consents');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderConsents(data.consents ?? []);
}

function ledgerQueryParams() {
  const params = new URLSearchParams();
  const type = $('ledgerTypeInput').value.trim();
  const limit = Number($('ledgerLimitInput').value || 50);
  params.set('limit', String(Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50));
  if (type) params.set('type', type);
  return params;
}

async function loadLedger() {
  const response = await fetch(`/api/ledger?${ledgerQueryParams().toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderLedger(data.events ?? []);
}

async function exportLedger() {
  setBusy(true);
  try {
    const params = ledgerQueryParams();
    const response = await fetch(`/api/ledger.ndjson?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replaceAll(':', '-');
    link.href = objectUrl;
    link.download = `bharat-os-ledger-${stamp}.ndjson`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    $('decisionOutput').textContent = JSON.stringify(
      {
        exported: true,
        route: `/api/ledger.ndjson?${params.toString()}`,
        filename: link.download
      },
      null,
      2
    );
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Ledger export failed');
  } finally {
    setBusy(false);
  }
}

async function loadMemory() {
  const params = new URLSearchParams({ limit: '20' });
  const query = $('memorySearchInput').value.trim();
  if (query) params.set('query', query);

  const response = await fetch(`/api/memory-search?${params.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  renderMemory(data.memory ?? []);
}

function memoryById(recordId) {
  return state.memory.find((record) => record.recordId === recordId);
}

async function grantMemoryConsent(recordId) {
  const record = memoryById(recordId);
  if (!record) return;

  setBusy(true);
  try {
    const response = await fetch('/api/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: record.ownerId,
        granteeId: 'bharat-os-orchestrator',
        scopes: record.scopes ?? ['memory.read', 'consent.record'],
        purpose: `Operator console memory reveal: ${record.label}`,
        signWithIdentityId: record.ownerId
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        consentId: data.consent.consentId,
        subjectId: data.consent.subjectId,
        granteeId: data.consent.granteeId,
        scopes: data.consent.scopes,
        signatureCount: data.consent.signatures?.length ?? 0,
        expiresAt: data.consent.expiresAt
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Grant failed');
  } finally {
    setBusy(false);
  }
}

async function readMemoryRecord(recordId) {
  setBusy(true);
  try {
    const response = await fetch(`/api/memory-records/${encodeURIComponent(recordId)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ granteeId: 'bharat-os-orchestrator' })
    });
    const data = await response.json();
    if (!response.ok && response.status !== 403) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        recordId,
        approved: data.approved,
        decisionId: data.decision?.decisionId,
        failedPolicies: data.decision?.checks
          ?.filter((item) => item.status === 'fail')
          .map((item) => item.policyId),
        plaintext: data.plaintext
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Memory read failed');
  } finally {
    setBusy(false);
  }
}

async function loadDefaultActor() {
  if ($('decisionActorInput').value) return;
  const first = state.identities[0];
  if (first) {
    $('decisionActorInput').value = first.id;
  }
}

function useIdentity(identityId) {
  $('decisionActorInput').value = identityId;
  $('decisionOutput').textContent = JSON.stringify(
    {
      actorId: identityId,
      selected: true
    },
    null,
    2
  );
}

function readInteger(id) {
  const value = Number($(id).value);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${id} must be a positive integer.`);
  }
  return value;
}

async function runBootstrap() {
  setBusy(true);
  try {
    const response = await fetch('/api/simulations/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nodeCount: readInteger('nodesInput'),
        objectCount: readInteger('objectsInput'),
        averageObjectBytes: readInteger('objectBytesInput'),
        replicationFactor: readInteger('replicationInput'),
        requireKyc: $('kycInput').checked,
        seed: `operator-${Date.now()}`
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    await loadDashboard();
  } catch (error) {
    setApiStatus(false, 'Run failed');
    console.error(error);
  } finally {
    setBusy(false);
  }
}

async function evaluateDecision() {
  setBusy(true);
  try {
    const response = await fetch('/api/decisions/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: $('decisionActorInput').value.trim(),
        actionType: $('decisionActionInput').value,
        tool: $('toolInput').value || undefined,
        scopes: $('decisionScopesInput').value,
        regulated: $('decisionRegulatedInput').checked,
        piiHandling: $('decisionPiiInput').value,
        identity: {
          aadhaarRequired: false,
          fallbackAvailable: true
        },
        money: {
          amount: 0,
          currency: 'INR',
          workerPays: false
        }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    const failed = data.decision.checks.filter((item) => item.status === 'fail');
    $('decisionOutput').textContent = JSON.stringify(
      {
        decisionId: data.decision.decisionId,
        approved: data.decision.approved,
        failedChecks: failed.map((item) => item.policyId),
        plan: data.decision.plan
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Decision failed');
  } finally {
    setBusy(false);
  }
}

async function executeTool() {
  setBusy(true);
  try {
    const response = await fetch('/api/tools/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: $('decisionActorInput').value.trim(),
        actionType: $('decisionActionInput').value,
        tool: $('toolInput').value || undefined,
        scopes: $('decisionScopesInput').value,
        regulated: $('decisionRegulatedInput').checked,
        piiHandling: $('decisionPiiInput').value,
        identity: {
          aadhaarRequired: false,
          fallbackAvailable: true
        },
        money: {
          amount: $('decisionActionInput').value === 'labor_match_post' ? 1000 : 0,
          limit: $('decisionActionInput').value === 'labor_match_post' ? 1000 : undefined,
          currency: 'INR',
          workerPays: false
        }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        executionId: data.execution.executionId,
        skillPreflightId: data.execution.skillPreflightId,
        status: data.execution.status,
        preflightApproved: data.preflight?.approved,
        approved: data.execution.decision.approved,
        toolReceipt: data.execution.toolReceipt,
        blockedBy: data.execution.decision.checks
          .filter((item) => item.status === 'fail')
          .map((item) => item.policyId)
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Tool failed');
  } finally {
    setBusy(false);
  }
}

async function orchestrateIntent() {
  setBusy(true);
  try {
    const response = await fetch('/api/orchestrations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: $('decisionActorInput').value.trim(),
        intentText: $('intentInput').value.trim(),
        locale: $('intentLocaleInput').value,
        actionType: $('decisionActionInput').value,
        tool: $('toolInput').value || undefined,
        scopes: $('decisionScopesInput').value,
        regulated: $('decisionRegulatedInput').checked,
        piiHandling: $('decisionPiiInput').value,
        execute: true,
        identity: {
          aadhaarRequired: false,
          fallbackAvailable: true
        },
        money: {
          amount: $('decisionActionInput').value === 'labor_match_post' ? 1000 : 0,
          limit: $('decisionActionInput').value === 'labor_match_post' ? 1000 : undefined,
          currency: 'INR',
          workerPays: false
        }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    $('decisionOutput').textContent = JSON.stringify(
      {
        orchestrationId: data.orchestration.orchestrationId,
        status: data.orchestration.status,
        actionType: data.orchestration.actionRequest.actionType,
        tool: data.orchestration.actionRequest.tool,
        skillId: data.orchestration.actionRequest.skillId,
        skillPreflightId: data.orchestration.skillPreflightId,
        locale: data.orchestration.intent.detectedLocale,
        normalizedText: data.orchestration.intent.normalizedText,
        approved: data.orchestration.approved,
        executed: data.orchestration.executed,
        failedPolicies: data.orchestration.failedPolicies,
        executionId: data.orchestration.executionId
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Orchestration failed');
  } finally {
    setBusy(false);
  }
}

async function revokeLatestConsent() {
  const consent = state.dashboard?.phase1?.latestActiveConsent;
  if (!consent) return;
  setBusy(true);
  try {
    const actorId = $('decisionActorInput').value.trim();
    const response = await fetch(`/api/consents/${encodeURIComponent(consent.consentId)}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'operator_console_revocation',
        signWithIdentityId: actorId || undefined
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionOutput').textContent = JSON.stringify(
      {
        consentId: data.consent.consentId,
        status: data.lifecycle.status,
        revokedAt: data.consent.revokedAt,
        reason: data.consent.revokeReason
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Revoke failed');
  } finally {
    setBusy(false);
  }
}

async function revokeConsentById(consentId) {
  const consent = state.consents.find((item) => item.consentId === consentId);
  if (!consent) return;

  setBusy(true);
  try {
    const response = await fetch(`/api/consents/${encodeURIComponent(consent.consentId)}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'operator_console_timeline_revocation',
        signWithIdentityId: consent.subjectId
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionOutput').textContent = JSON.stringify(
      {
        consentId: data.consent.consentId,
        status: data.lifecycle.status,
        revokedAt: data.consent.revokedAt,
        signatureCount: data.consent.revocation?.signatures?.length ?? 0
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Timeline revoke failed');
  } finally {
    setBusy(false);
  }
}

async function verifyConsentById(consentId) {
  setBusy(true);
  try {
    const response = await fetch('/api/integrity/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        artifactType: 'consent',
        id: consentId
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    $('decisionOutput').textContent = JSON.stringify(
      {
        consentId,
        valid: data.integrity.valid,
        signatureValid: data.integrity.signatureValid,
        revocationValid: data.integrity.revocation?.valid,
        reasons: data.integrity.reasons ?? []
      },
      null,
      2
    );
    await loadDashboard();
  } catch (error) {
    $('decisionOutput').textContent = error.message;
    setApiStatus(false, 'Verify failed');
  } finally {
    setBusy(false);
  }
}

$('refreshButton').addEventListener('click', loadDashboard);
$('runButton').addEventListener('click', runBootstrap);
$('decisionButton').addEventListener('click', evaluateDecision);
$('toolButton').addEventListener('click', executeTool);
$('orchestrateButton').addEventListener('click', orchestrateIntent);
$('preflightGrantButton').addEventListener('click', grantLatestPreflightConsent);
$('preflightExecuteButton').addEventListener('click', executeLatestPreflight);
$('preflightTraceButton').addEventListener('click', traceLatestPreflight);
$('revokeConsentButton').addEventListener('click', revokeLatestConsent);
$('identityCreateButton').addEventListener('click', createIdentityProfile);
$('memorySearchButton').addEventListener('click', loadMemory);
$('ledgerFilterButton').addEventListener('click', loadLedger);
$('ledgerExportButton').addEventListener('click', exportLedger);
$('memorySearchInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadMemory();
  }
});
$('ledgerTypeInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadLedger();
  }
});
$('memoryTable').addEventListener('click', (event) => {
  const grantButton = event.target.closest('[data-memory-grant]');
  if (grantButton) {
    grantMemoryConsent(grantButton.dataset.memoryGrant);
    return;
  }

  const readButton = event.target.closest('[data-memory-read]');
  if (readButton) {
    readMemoryRecord(readButton.dataset.memoryRead);
  }
});
$('consentsTable').addEventListener('click', (event) => {
  const verifyButton = event.target.closest('[data-consent-verify]');
  if (verifyButton) {
    verifyConsentById(verifyButton.dataset.consentVerify);
    return;
  }

  const revokeButton = event.target.closest('[data-consent-revoke]');
  if (!revokeButton || revokeButton.disabled) return;
  revokeConsentById(revokeButton.dataset.consentRevoke);
});
$('identitiesTable').addEventListener('click', (event) => {
  const useButton = event.target.closest('[data-identity-use]');
  if (!useButton) return;
  useIdentity(useButton.dataset.identityUse);
});
$('skillsTable').addEventListener('click', (event) => {
  const preflightButton = event.target.closest('[data-skill-preflight]');
  if (!preflightButton || preflightButton.disabled) return;
  preflightSkill(preflightButton.dataset.skillPreflight);
});
$('trustPassportsTable').addEventListener('click', (event) => {
  const signButton = event.target.closest('[data-trust-sign]');
  if (!signButton || signButton.disabled) return;
  signTrustPassport(signButton.dataset.trustSign);
});

$('workerAuthTable').addEventListener('click', (event) => {
  const verifyButton = event.target.closest('[data-worker-auth-verify]');
  if (!verifyButton || verifyButton.disabled) return;
  verifyWorkerAuth(verifyButton.dataset.workerAuthVerify);
});

$('flagReportsTable').addEventListener('click', (event) => {
  const resolveButton = event.target.closest('[data-flag-resolve]');
  if (!resolveButton || resolveButton.disabled) return;
  const resolution = resolveButton.dataset.resolution ?? 'resolved';
  resolveFlagReport(resolveButton.dataset.flagResolve, resolution);
});

$('flagStatusFilter').addEventListener('change', loadFlagReports);
$('refreshFlagsButton').addEventListener('click', loadFlagReports);

loadDashboard();
