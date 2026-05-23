import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { listenPhase0Api } from '../../src/phase0/api.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { simulateDemandBootstrap } from '../../src/phase0/simulate.mjs';
import { BosStore } from '../../src/phase0/store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

async function withApi(store, body) {
  const server = await listenPhase0Api({ store, host: '127.0.0.1', port: 0 });
  const { port } = server.address();
  try {
    return await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readJson(response) {
  const text = await response.text();
  return JSON.parse(text);
}

test('Phase 0 API exposes health and route catalog', async () => {
  const { store } = await freshStore('api-health');
  await withApi(store, async (baseUrl) => {
    const health = await readJson(await fetch(`${baseUrl}/health`));
    assert.equal(health.ok, true);
    assert.equal(health.service, 'bharat-os-phase0-api');

    const catalog = await readJson(await fetch(`${baseUrl}/api`));
    assert.ok(catalog.routes.includes('POST /api/simulations/bootstrap'));
    assert.ok(catalog.routes.includes('GET /shell/'));
    assert.ok(catalog.routes.includes('GET /console/'));
    assert.ok(catalog.routes.includes('POST /api/orchestrations'));
    assert.ok(catalog.routes.includes('POST /api/integrity/verify'));
    assert.ok(catalog.routes.includes('GET /api/skills'));
    assert.ok(catalog.routes.includes('GET /api/skills/:skillId'));
    assert.ok(catalog.routes.includes('POST /api/skills/:skillId/preflight'));
    assert.ok(catalog.routes.includes('GET /api/skill-preflights'));
    assert.ok(catalog.routes.includes('GET /api/skill-preflights/:preflightId'));
    assert.ok(catalog.routes.includes('POST /api/skill-preflights/:preflightId/consent'));
    assert.ok(catalog.routes.includes('POST /api/skill-preflights/:preflightId/retry'));
    assert.ok(catalog.routes.includes('POST /api/skill-preflights/:preflightId/execute'));
    assert.ok(catalog.routes.includes('GET /api/skill-preflights/:preflightId/trace'));
    assert.ok(catalog.routes.includes('GET /api/consents'));
    assert.ok(catalog.routes.includes('POST /api/consents/:consentId/revoke'));
    assert.ok(catalog.routes.includes('GET /api/ledger'));
    assert.ok(catalog.routes.includes('GET /api/ledger.ndjson'));
    assert.ok(catalog.routes.includes('GET /api/trust-passports'));
    assert.ok(catalog.routes.includes('GET /api/trust-passports/:identityId'));
    assert.ok(catalog.routes.includes('POST /api/trust-passports/:identityId/sign'));
    assert.ok(catalog.routes.includes('GET /api/memory-search'));
    assert.ok(catalog.routes.includes('GET /api/memory-records/:recordId/provenance'));
    assert.ok(catalog.routes.includes('POST /api/memory-records/:recordId/read'));
    assert.ok(catalog.routes.includes('GET /api/health-documents'));
    assert.ok(catalog.routes.includes('POST /api/health-documents'));
    assert.ok(catalog.routes.includes('POST /api/profile-auth/challenges'));
    assert.ok(catalog.routes.includes('GET /api/profile-auth/credentials'));
    assert.ok(catalog.routes.includes('POST /api/profile-auth/credentials'));
    assert.ok(catalog.routes.includes('POST /api/profile-auth/assertions'));
    assert.ok(catalog.routes.includes('GET /api/push/subscriptions'));
    assert.ok(catalog.routes.includes('POST /api/push/subscriptions'));
    assert.ok(catalog.routes.includes('GET /api/worker-notifications'));
    assert.ok(catalog.routes.includes('POST /api/worker-notifications'));
    assert.ok(catalog.routes.includes('GET /api/voice/runtime'));
    assert.ok(catalog.routes.includes('GET /api/voice/model-packs'));
    assert.ok(catalog.routes.includes('POST /api/voice/model-packs'));
    assert.ok(catalog.routes.includes('GET /api/tts/runtime'));
    assert.ok(catalog.routes.includes('GET /api/tts/model-packs'));
    assert.ok(catalog.routes.includes('POST /api/tts/model-packs'));
    assert.ok(catalog.routes.includes('GET /api/on-device/runtime'));
    assert.ok(catalog.routes.includes('GET /api/on-device/model-packs'));
    assert.ok(catalog.routes.includes('POST /api/on-device/model-packs'));
    assert.ok(catalog.routes.includes('GET /api/identities'));
    assert.ok(catalog.routes.includes('POST /api/identities'));
  });
});

test('Phase 0 API serves the shell and operator console assets', async () => {
  const { store } = await freshStore('api-console');
  await withApi(store, async (baseUrl) => {
    const redirected = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(redirected.status, 302);
    assert.equal(redirected.headers.get('location'), '/shell/');

    const shellHtml = await fetch(`${baseUrl}/shell/`);
    assert.equal(shellHtml.status, 200);
    const shellText = await shellHtml.text();
    assert.match(shellText, /Bharat OS/);
    assert.match(shellText, /What do you want to do today/);
    assert.match(shellText, /Profile security/);
    assert.match(shellText, /Worker alerts/);

    const shellScript = await fetch(`${baseUrl}/shell/app.js`);
    assert.equal(shellScript.status, 200);
    const shellScriptText = await shellScript.text();
    assert.match(shellScriptText, /sendIntent/);
    assert.match(shellScriptText, /\/api\/orchestrations/);
    assert.match(shellScriptText, /Pay with UPI/);
    assert.match(shellScriptText, /uploadHealthDocument/);
    assert.match(shellScriptText, /bindProfilePasskey/);
    assert.match(shellScriptText, /\/api\/profile-auth\/challenges/);
    assert.match(shellScriptText, /enableWorkerAlerts/);
    assert.match(shellScriptText, /\/api\/worker-notifications/);
    assert.match(shellScriptText, /loadVoiceRuntimePlan/);
    assert.match(shellScriptText, /\/api\/voice\/runtime/);
    assert.match(shellScriptText, /loadTtsRuntimePlan/);
    assert.match(shellScriptText, /speakLatestLocalizedResponse/);
    assert.match(shellScriptText, /loadOnDeviceRuntimePlan/);
    assert.match(shellScriptText, /\/api\/on-device\/runtime/);

    const html = await fetch(`${baseUrl}/console/`);
    assert.equal(html.status, 200);
    const htmlText = await html.text();
    assert.match(htmlText, /Mesh Bootstrap Control Plane/);
    assert.match(htmlText, /Identity Profiles/);
    assert.match(htmlText, /Display Name/);
    assert.match(htmlText, /Memory Provenance/);
    assert.match(htmlText, /Consent Timeline/);
    assert.match(htmlText, /Phase 1\.36/);
    assert.match(htmlText, /Skill Registry/);
    assert.match(htmlText, /Preflight/);
    assert.match(htmlText, /Preflights/);
    assert.match(htmlText, /Version/);
    assert.match(htmlText, /Manifest/);
    assert.match(htmlText, /Language/);
    assert.match(htmlText, /Event Type/);
    assert.match(htmlText, /Export/);
    assert.match(htmlText, /Trust Passports/);
    assert.match(htmlText, /Skills/);

    const script = await fetch(`${baseUrl}/console/app.js`);
    assert.equal(script.status, 200);
    const scriptText = await script.text();
    assert.match(scriptText, /orchestrateIntent/);
    assert.match(scriptText, /renderSkills/);
    assert.match(scriptText, /loadSkills/);
    assert.match(scriptText, /preflightSkill/);
    assert.match(scriptText, /grantLatestPreflightConsent/);
    assert.match(scriptText, /retryData/);
    assert.match(scriptText, /executeLatestPreflight/);
    assert.match(scriptText, /traceLatestPreflight/);
    assert.match(scriptText, /preflightGrantButton/);
    assert.match(scriptText, /preflightExecuteButton/);
    assert.match(scriptText, /preflightTraceButton/);
    assert.match(scriptText, /latestSkillPreflightText/);
    assert.match(scriptText, /intentLocaleInput/);
    assert.match(scriptText, /renderIdentities/);
    assert.match(scriptText, /createIdentityProfile/);
    assert.match(scriptText, /useIdentity/);
    assert.match(scriptText, /readMemoryRecord/);
    assert.match(scriptText, /grantMemoryConsent/);
    assert.match(scriptText, /renderConsents/);
    assert.match(scriptText, /revokeConsentById/);
    assert.match(scriptText, /verifyConsentById/);
    assert.match(scriptText, /loadLedger/);
    assert.match(scriptText, /exportLedger/);
    assert.match(scriptText, /renderTrustPassports/);
    assert.match(scriptText, /loadTrustPassports/);
    assert.match(scriptText, /signTrustPassport/);
  });
});

test('Phase 2a API uploads captured health documents to the mocked ABHA structured path', async () => {
  const { store } = await freshStore('api-health-document');
  const identity = createIdentity({ displayName: 'API health upload actor' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const consentResponse = await fetch(`${baseUrl}/api/consents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: identity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['health.record.write', 'consent.record'],
        purpose: 'Captured prescription upload',
        signWithIdentityId: identity.id
      })
    });
    assert.equal(consentResponse.status, 201);

    const uploadResponse = await fetch(`${baseUrl}/api/health-documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        documentType: 'prescription',
        captureMode: 'camera_or_file',
        locale: 'en-IN',
        image: { mimeType: 'image/jpeg', byteLength: 2048, sha256: 'b'.repeat(64) },
        ocrText: 'Patient: Secret Name\nDiagnosis diabetes\nHbA1c 7.1\nTab Metformin 500mg'
      })
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await readJson(uploadResponse);
    assert.equal(uploaded.ok, true);
    assert.equal(uploaded.capture.status, 'uploaded');
    assert.equal(uploaded.capture.imageEvidence.rawImageStored, false);
    assert.equal(uploaded.capture.structured.rawOcrTextStored, false);
    assert.equal(uploaded.execution.toolReceipt.status, 'structured_upload_mocked');
    assert.equal(uploaded.execution.toolReceipt.privacy.pointerNotPayload, true);
    assert.equal(JSON.stringify(uploaded.capture).includes('Secret Name'), false);

    const listed = await readJson(await fetch(`${baseUrl}/api/health-documents`));
    assert.equal(listed.captures.length, 1);
    assert.equal(listed.captures[0].captureId, uploaded.capture.captureId);

    const fetched = await readJson(
      await fetch(`${baseUrl}/api/health-documents/${encodeURIComponent(uploaded.capture.captureId)}`)
    );
    assert.equal(fetched.capture.abhaUpload.uploadId, uploaded.capture.abhaUpload.uploadId);
  });
});

test('Phase 2a API binds and verifies profile passkey metadata', async () => {
  const { store } = await freshStore('api-profile-auth');
  const identity = createIdentity({ displayName: 'API passkey actor' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const registerChallengeResponse = await fetch(`${baseUrl}/api/profile-auth/challenges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityId: identity.id, ceremony: 'register' })
    });
    assert.equal(registerChallengeResponse.status, 201);
    const registerChallengeBody = await readJson(registerChallengeResponse);
    assert.match(registerChallengeBody.challenge.challengeId, /^bos:profile-auth-challenge:/);

    const credentialResponse = await fetch(`${baseUrl}/api/profile-auth/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        credentialId: 'api-passkey-credential',
        challenge: registerChallengeBody.challenge,
        transports: ['internal'],
        userVerified: true
      })
    });
    assert.equal(credentialResponse.status, 201);
    const credentialBody = await readJson(credentialResponse);
    assert.equal(credentialBody.credential.identityId, identity.id);
    assert.equal(credentialBody.credential.challengeId, registerChallengeBody.challenge.challengeId);

    const listed = await readJson(
      await fetch(`${baseUrl}/api/profile-auth/credentials?identityId=${encodeURIComponent(identity.id)}`)
    );
    assert.equal(listed.credentials.length, 1);
    assert.equal(listed.credentials[0].credentialIdHash, credentialBody.credential.credentialIdHash);

    const verifyChallengeResponse = await fetch(`${baseUrl}/api/profile-auth/challenges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityId: identity.id, ceremony: 'verify' })
    });
    assert.equal(verifyChallengeResponse.status, 201);
    const verifyChallengeBody = await readJson(verifyChallengeResponse);

    const assertionResponse = await fetch(`${baseUrl}/api/profile-auth/assertions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        credentialId: 'api-passkey-credential',
        challenge: verifyChallengeBody.challenge
      })
    });
    assert.equal(assertionResponse.status, 200);
    const assertionBody = await readJson(assertionResponse);
    assert.equal(assertionBody.ok, true);
    assert.equal(assertionBody.verification.valid, true);

    const rejectedResponse = await fetch(`${baseUrl}/api/profile-auth/assertions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        credentialId: 'wrong-credential',
        challenge: verifyChallengeBody.challenge
      })
    });
    assert.equal(rejectedResponse.status, 403);
    const rejectedBody = await readJson(rejectedResponse);
    assert.equal(rejectedBody.ok, false);
  });
});

test('Phase 2a API records worker notification capability and queues job alerts', async () => {
  const { store } = await freshStore('api-worker-notifications');
  const worker = createIdentity({ displayName: 'API notification worker' });
  await store.saveIdentity(worker);

  await withApi(store, async (baseUrl) => {
    const subscriptionResponse = await fetch(`${baseUrl}/api/push/subscriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: worker.id,
        endpoint: 'https://push.example.test/send/sensitive-endpoint',
        keys: { p256dh: 'secret-p256dh', auth: 'secret-auth' },
        permission: 'granted',
        source: 'shell'
      })
    });
    assert.equal(subscriptionResponse.status, 201);
    const subscriptionBody = await readJson(subscriptionResponse);
    assert.equal(subscriptionBody.subscription.identityId, worker.id);
    assert.equal(subscriptionBody.subscription.rawEndpointStored, false);
    assert.equal(JSON.stringify(subscriptionBody.subscription).includes('sensitive-endpoint'), false);

    const notificationResponse = await fetch(`${baseUrl}/api/worker-notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workerId: worker.id,
        jobReference: 'api-job-1',
        title: 'Nearby job',
        body: 'Three-day work is available. Escrow is required.',
        urgency: 'high'
      })
    });
    assert.equal(notificationResponse.status, 201);
    const notificationBody = await readJson(notificationResponse);
    assert.equal(notificationBody.ok, true);
    assert.equal(notificationBody.notification.delivery.status, 'queued_web_push');
    assert.equal(notificationBody.notification.delivery.vapidIntegrated, false);
    assert.equal(notificationBody.notification.privacy.rawPushEndpointStored, false);

    const listedSubscriptions = await readJson(
      await fetch(`${baseUrl}/api/push/subscriptions?identityId=${encodeURIComponent(worker.id)}`)
    );
    assert.equal(listedSubscriptions.subscriptions.length, 1);

    const listedNotifications = await readJson(
      await fetch(`${baseUrl}/api/worker-notifications?workerId=${encodeURIComponent(worker.id)}`)
    );
    assert.equal(listedNotifications.notifications.length, 1);
  });
});

test('Phase 2a API plans voice runtime and records local ASR model packs', async () => {
  const { store } = await freshStore('api-voice-runtime');

  await withApi(store, async (baseUrl) => {
    const fallback = await readJson(
      await fetch(`${baseUrl}/api/voice/runtime?locale=hi-IN&webSpeechAvailable=true&secureContext=true`)
    );
    assert.equal(fallback.plan.runtime, 'web_speech_api');
    assert.equal(fallback.plan.offlineReady, false);
    assert.equal(fallback.plan.modelBytesStoredInReceipt, false);

    const modelResponse = await fetch(`${baseUrl}/api/voice/model-packs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locale: 'hi-IN',
        modelId: 'indic-whisper-small-hi-q5',
        bytes: 128000000,
        sha256: 'd'.repeat(64),
        source: 'side-loaded'
      })
    });
    assert.equal(modelResponse.status, 201);
    const modelBody = await readJson(modelResponse);
    assert.equal(modelBody.modelPack.modelBytesStored, false);

    const offline = await readJson(
      await fetch(`${baseUrl}/api/voice/runtime?locale=hi-IN&webSpeechAvailable=true&secureContext=true`)
    );
    assert.equal(offline.plan.runtime, 'indic_whisper_wasm');
    assert.equal(offline.plan.offlineReady, true);
    assert.equal(offline.plan.selectedModelPackId, modelBody.modelPack.voiceModelPackId);

    const packs = await readJson(await fetch(`${baseUrl}/api/voice/model-packs?locale=hi-IN`));
    assert.equal(packs.modelPacks.length, 1);
  });
});

test('Phase 2a API plans TTS runtime and records local TTS model packs', async () => {
  const { store } = await freshStore('api-tts-runtime');

  await withApi(store, async (baseUrl) => {
    const fallback = await readJson(
      await fetch(`${baseUrl}/api/tts/runtime?locale=bn-IN&speechSynthesisAvailable=true`)
    );
    assert.equal(fallback.plan.runtime, 'browser_speech_synthesis');
    assert.equal(fallback.plan.offlineReady, false);

    const modelResponse = await fetch(`${baseUrl}/api/tts/model-packs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locale: 'bn-IN',
        modelId: 'indic-tts-small-bn-q5',
        bytes: 64000000,
        sha256: 'f'.repeat(64),
        source: 'side-loaded'
      })
    });
    assert.equal(modelResponse.status, 201);
    const modelBody = await readJson(modelResponse);
    assert.equal(modelBody.modelPack.modelBytesStored, false);

    const offline = await readJson(
      await fetch(`${baseUrl}/api/tts/runtime?locale=bn-IN&speechSynthesisAvailable=true`)
    );
    assert.equal(offline.plan.runtime, 'indic_tts_wasm');
    assert.equal(offline.plan.offlineReady, true);
    assert.equal(offline.plan.selectedModelPackId, modelBody.modelPack.ttsModelPackId);

    const packs = await readJson(await fetch(`${baseUrl}/api/tts/model-packs?locale=bn-IN`));
    assert.equal(packs.modelPacks.length, 1);
  });
});

test('Phase 2a API plans on-device SLM runtime and records local model packs', async () => {
  const { store } = await freshStore('api-on-device-runtime');

  await withApi(store, async (baseUrl) => {
    const fallback = await readJson(
      await fetch(`${baseUrl}/api/on-device/runtime?task=intent_planning&webGpuAvailable=true&wasmAvailable=true`)
    );
    assert.equal(fallback.plan.runtime, 'deterministic_rules_with_model_slot');
    assert.equal(fallback.plan.localModelReady, false);

    const modelResponse = await fetch(`${baseUrl}/api/on-device/model-packs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: 'gemma-2b-it-q4-webgpu',
        family: 'gemma-2b-it-q4',
        runtime: 'webgpu_transformersjs',
        bytes: 1250000000,
        sha256: '1'.repeat(64),
        capabilities: ['intent_planning', 'summarization'],
        localeCoverage: ['en-IN', 'hi-IN'],
        source: 'side-loaded'
      })
    });
    assert.equal(modelResponse.status, 201);
    const modelBody = await readJson(modelResponse);
    assert.equal(modelBody.modelPack.modelBytesStored, false);

    const ready = await readJson(
      await fetch(`${baseUrl}/api/on-device/runtime?task=intent_planning&webGpuAvailable=true&wasmAvailable=true`)
    );
    assert.equal(ready.plan.runtime, 'webgpu_transformersjs');
    assert.equal(ready.plan.localModelReady, true);
    assert.equal(ready.plan.selectedModelPackId, modelBody.modelPack.onDeviceModelPackId);

    const packs = await readJson(await fetch(`${baseUrl}/api/on-device/model-packs?task=summarization`));
    assert.equal(packs.modelPacks.length, 1);
  });
});

test('Phase 1 API exposes policies, consents, and decision evaluation', async () => {
  const { store } = await freshStore('api-phase1');
  const identity = createIdentity({ displayName: 'API policy actor' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const policies = await readJson(await fetch(`${baseUrl}/api/policies`));
    assert.ok(policies.policies.length >= 5);

    const consentResponse = await fetch(`${baseUrl}/api/consents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: identity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
        purpose: 'API decision test',
        signWithIdentityId: identity.id
      })
    });
    assert.equal(consentResponse.status, 201);
    const createdConsent = await readJson(consentResponse);
    assert.equal(createdConsent.consent.signatures.length, 1);

    const listedConsents = await readJson(await fetch(`${baseUrl}/api/consents`));
    assert.equal(listedConsents.consents.length, 1);
    assert.equal(listedConsents.consents[0].lifecycle.status, 'active');
    assert.equal(listedConsents.consents[0].signatures.length, 1);

    const consentIntegrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'consent',
          id: createdConsent.consent.consentId
        })
      })
    );
    assert.equal(consentIntegrity.integrity.valid, true);
    assert.equal(consentIntegrity.integrity.signatureValid, true);
    assert.equal(consentIntegrity.integrity.artifactType, 'consent');

    const decisionResponse = await fetch(`${baseUrl}/api/decisions/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        actionType: 'regulated_onboarding',
        scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
        regulated: true,
        piiHandling: 'tokenized'
      })
    });
    assert.equal(decisionResponse.status, 201);
    const decision = await readJson(decisionResponse);
    assert.equal(decision.decision.approved, true);

    const decisionIntegrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'decision',
          id: decision.decision.decisionId
        })
      })
    );
    assert.equal(decisionIntegrity.integrity.valid, true);

    const dashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(dashboard.phase1.activeConsentCount, 1);
    assert.equal(dashboard.phase1.signedConsentCount, 1);
    assert.equal(dashboard.phase1.decisionCount, 1);
    assert.equal(dashboard.phase1.latestDecision.approved, true);
    assert.equal(dashboard.phase1.integrity.latestDecision.valid, true);

    const revokeResponse = await fetch(
      `${baseUrl}/api/consents/${encodeURIComponent(createdConsent.consent.consentId)}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'api_test_revocation',
          signWithIdentityId: identity.id
        })
      }
    );
    assert.equal(revokeResponse.status, 200);
    const revoked = await readJson(revokeResponse);
    assert.equal(revoked.lifecycle.status, 'revoked');
    assert.equal(revoked.consent.revocation.signatures.length, 1);

    const listedAfterRevoke = await readJson(await fetch(`${baseUrl}/api/consents`));
    assert.equal(listedAfterRevoke.consents[0].lifecycle.status, 'revoked');
    assert.equal(listedAfterRevoke.consents[0].revocation.signatures.length, 1);

    const revokedIntegrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'consent',
          id: createdConsent.consent.consentId
        })
      })
    );
    assert.equal(revokedIntegrity.integrity.valid, true);
    assert.equal(revokedIntegrity.integrity.revocation.valid, true);

    const blockedResponse = await fetch(`${baseUrl}/api/decisions/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        actionType: 'regulated_onboarding',
        scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
        regulated: true,
        piiHandling: 'tokenized'
      })
    });
    assert.equal(blockedResponse.status, 201);
    const blocked = await readJson(blockedResponse);
    assert.equal(blocked.decision.approved, false);
    assert.equal(blocked.decision.checks[0].candidateConsents[0].status, 'revoked');

    const revokedDashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(revokedDashboard.phase1.activeConsentCount, 0);
    assert.equal(revokedDashboard.phase1.revokedConsentCount, 1);
    assert.equal(revokedDashboard.phase1.decisionCount, 2);
    assert.ok(revokedDashboard.ledger.recentEvents.some((event) => event.type === 'consent.saved'));

    const ledger = await readJson(await fetch(`${baseUrl}/api/ledger?limit=20`));
    assert.ok(ledger.events.some((event) => event.type === 'decision.saved'));

    const consentEvents = await readJson(await fetch(`${baseUrl}/api/ledger?type=consent.saved`));
    assert.ok(consentEvents.events.every((event) => event.type === 'consent.saved'));

    const ledgerExport = await fetch(`${baseUrl}/api/ledger.ndjson?type=consent.saved&limit=5`);
    assert.equal(ledgerExport.status, 200);
    assert.match(ledgerExport.headers.get('content-type'), /ndjson/);
    const exportedEvents = (await ledgerExport.text())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(exportedEvents.length >= 1);
    assert.ok(exportedEvents.every((event) => event.type === 'consent.saved'));
  });
});

test('Phase 1 API exposes public identity profiles without vault material', async () => {
  const { store } = await freshStore('api-identities');
  const identity = createIdentity({
    displayName: 'API identity profile',
    attestations: { offline_kyc: { status: 'mocked' } }
  });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Created through API',
        attestations: { local_profile: { status: 'created' } }
      })
    });
    assert.equal(createdResponse.status, 201);
    const created = await readJson(createdResponse);
    assert.equal(created.identity.displayName, 'Created through API');
    assert.equal(created.identity.attestations.local_profile.status, 'created');
    assert.equal('privateKeyPem' in created.identity, false);
    assert.equal('vaultKeyBase64' in created.identity, false);

    const body = await readJson(await fetch(`${baseUrl}/api/identities`));
    assert.equal(body.identities.length, 2);
    assert.ok(body.identities.some((item) => item.displayName === 'API identity profile'));
    assert.ok(body.identities.some((item) => item.displayName === 'Created through API'));
    assert.ok(body.identities.every((item) => 'publicKeyPem' in item));
    assert.ok(body.identities.every((item) => !('privateKeyPem' in item)));
    assert.ok(body.identities.every((item) => !('vaultKeyBase64' in item)));
  });
});

test('Phase 1 API exposes public Trust Passport v1 without private or plaintext data', async () => {
  const { store } = await freshStore('api-trust-passport');
  const identity = createIdentity({
    displayName: 'API trust passport owner',
    attestations: { offline_kyc: { status: 'verified', issuer: 'mock-uidai' } }
  });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const consentResponse = await fetch(`${baseUrl}/api/consents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: identity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
        purpose: 'Trust passport consent evidence',
        signWithIdentityId: identity.id
      })
    });
    assert.equal(consentResponse.status, 201);

    const memoryResponse = await fetch(`${baseUrl}/api/memory-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        label: 'private note',
        text: 'Secret passport test plaintext',
        tags: ['trust'],
        source: { type: 'api_test', ref: 'trust-passport' }
      })
    });
    assert.equal(memoryResponse.status, 201);

    const skillPreflightResponse = await fetch(`${baseUrl}/api/skills/${encodeURIComponent('bos:skill:mesh-storage')}/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        piiHandling: 'none'
      })
    });
    assert.equal(skillPreflightResponse.status, 200);

    const passportResponse = await fetch(`${baseUrl}/api/trust-passports/${encodeURIComponent(identity.id)}`);
    assert.equal(passportResponse.status, 200);
    const { passport } = await readJson(passportResponse);
    assert.equal(passport.objectType, 'trust-passport-v1');
    assert.equal(passport.subjectId, identity.id);
    assert.equal(passport.assurance.level, 'verified');
    assert.equal(passport.attestations.count, 1);
    assert.deepEqual(passport.attestations.types, ['offline_kyc']);
    assert.equal(passport.consents.active, 1);
    assert.equal(passport.consents.signed, 1);
    assert.equal(passport.memory.recordCount, 1);
    assert.equal(passport.skillInvocations.preflightCount, 1);
    assert.equal(passport.skillInvocations.approvedPreflightCount, 1);
    assert.equal(passport.skillInvocations.executionCount, 0);
    assert.deepEqual(passport.skillInvocations.skillIds, ['bos:skill:mesh-storage']);
    assert.equal(passport.privacy.privateKeyIncluded, false);
    assert.equal(passport.privacy.vaultKeyIncluded, false);
    assert.equal(passport.privacy.memoryPlaintextIncluded, false);
    assert.equal(passport.privacy.rawAttestationPayloadsIncluded, false);

    const rawPassport = JSON.stringify(passport);
    assert.equal(rawPassport.includes('privateKeyPem'), false);
    assert.equal(rawPassport.includes('vaultKeyBase64'), false);
    assert.equal(rawPassport.includes('Secret passport test plaintext'), false);

    const listed = await readJson(await fetch(`${baseUrl}/api/trust-passports?identityId=${encodeURIComponent(identity.id)}`));
    assert.equal(listed.passports.length, 1);
    assert.equal(listed.passports[0].passportId, passport.passportId);

    const signedResponse = await fetch(`${baseUrl}/api/trust-passports/${encodeURIComponent(identity.id)}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'subject' })
    });
    assert.equal(signedResponse.status, 201);
    const signed = await readJson(signedResponse);
    assert.equal(signed.ok, true);
    assert.equal(signed.snapshot.objectType, 'signed-trust-passport-snapshot');
    assert.equal(signed.snapshot.subjectId, identity.id);
    assert.equal(signed.snapshot.signerId, identity.id);
    assert.equal(signed.snapshot.passport.subjectId, identity.id);
    assert.equal(signed.integrity.valid, true);
    assert.equal(signed.integrity.payloadHashValid, true);
    assert.equal(signed.integrity.signatureValid, true);

    const rawSnapshot = JSON.stringify(signed.snapshot);
    assert.equal(rawSnapshot.includes('privateKeyPem'), false);
    assert.equal(rawSnapshot.includes('vaultKeyBase64'), false);
    assert.equal(rawSnapshot.includes('Secret passport test plaintext'), false);
  });
});

test('Phase 1 API stores encrypted memory and gates reads through consent', async () => {
  const { store } = await freshStore('api-memory');
  const identity = createIdentity({ displayName: 'API memory owner' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/memory-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identityId: identity.id,
        label: 'preferred language',
        text: 'Prefers Marathi and Hindi',
        tags: ['profile', 'language'],
        source: { type: 'api_test', ref: 'profile-card' }
      })
    });
    assert.equal(createdResponse.status, 201);
    const created = await readJson(createdResponse);
    assert.equal(created.memory.label, 'preferred language');

    const listed = await readJson(await fetch(`${baseUrl}/api/memory-records?ownerId=${encodeURIComponent(identity.id)}`));
    assert.equal(listed.memory.length, 1);

    const searched = await readJson(await fetch(`${baseUrl}/api/memory-search?query=language&tags=profile`));
    assert.equal(searched.memory.length, 1);
    assert.equal(searched.memory[0].recordId, created.memory.recordId);
    assert.equal(searched.memory[0].provenance.source.ref, 'profile-card');
    assert.equal(JSON.stringify(searched).includes('Marathi'), false);

    const plaintextOnlySearch = await readJson(await fetch(`${baseUrl}/api/memory-search?query=Marathi`));
    assert.equal(plaintextOnlySearch.memory.length, 0);

    const provenance = await readJson(
      await fetch(`${baseUrl}/api/memory-records/${encodeURIComponent(created.memory.recordId)}/provenance`)
    );
    assert.equal(provenance.provenance.exposure, 'metadata_only');
    assert.equal(provenance.provenance.source.type, 'api_test');
    assert.equal(JSON.stringify(provenance).includes('Marathi'), false);

    const blockedResponse = await fetch(`${baseUrl}/api/memory-records/${encodeURIComponent(created.memory.recordId)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityId: identity.id })
    });
    assert.equal(blockedResponse.status, 403);
    const blocked = await readJson(blockedResponse);
    assert.equal(blocked.approved, false);

    const grantResponse = await fetch(`${baseUrl}/api/consents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: identity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['memory.read', 'consent.record'],
        purpose: 'API memory read',
        signWithIdentityId: identity.id
      })
    });
    assert.equal(grantResponse.status, 201);
    const grant = await readJson(grantResponse);
    assert.equal(grant.consent.signatures.length, 1);

    const readResponse = await fetch(`${baseUrl}/api/memory-records/${encodeURIComponent(created.memory.recordId)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityId: identity.id })
    });
    assert.equal(readResponse.status, 200);
    const read = await readJson(readResponse);
    assert.equal(read.approved, true);
    assert.equal(read.plaintext, 'Prefers Marathi and Hindi');

    const dashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(dashboard.phase1.memoryRecordCount, 1);
    assert.equal(dashboard.phase1.latestMemoryRecord.label, 'preferred language');
  });
});

test('Phase 1 API executes mocked tools behind consent gate', async () => {
  const { store } = await freshStore('api-tools');
  const identity = createIdentity({ displayName: 'API tool actor' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const tools = await readJson(await fetch(`${baseUrl}/api/tools`));
    assert.ok(tools.tools.some((tool) => tool.toolId === 'digilocker'));

    const skills = await readJson(await fetch(`${baseUrl}/api/skills`));
    assert.ok(skills.skills.some((skill) => skill.toolBinding.toolId === 'digilocker'));
    assert.ok(skills.skills.every((skill) => skill.permissions.rawPiiAllowed === false));
    const digilockerSkill = skills.skills.find((skill) => skill.toolBinding.toolId === 'digilocker');
    const skillDetail = await readJson(await fetch(`${baseUrl}/api/skills/${encodeURIComponent(digilockerSkill.skillId)}`));
    assert.equal(skillDetail.skill.skillId, digilockerSkill.skillId);
    assert.equal(skillDetail.skill.permissions.dataExposure, 'document_references_only');
    assert.match(skillDetail.skill.manifestHash, /^[a-f0-9]{64}$/);

    const skillIntegrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'skill',
          id: digilockerSkill.skillId
        })
      })
    );
    assert.equal(skillIntegrity.integrity.artifactType, 'skill-manifest');
    assert.equal(skillIntegrity.integrity.valid, true);
    assert.equal(skillIntegrity.integrity.manifestHashValid, true);

    const blockedPreflight = await readJson(
      await fetch(`${baseUrl}/api/skills/${encodeURIComponent(digilockerSkill.skillId)}/preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: identity.id })
      })
    );
    assert.match(blockedPreflight.preflight.preflightId, /^bos:skill-preflight:/);
    assert.equal(blockedPreflight.preflight.integrity.valid, true);
    assert.equal(blockedPreflight.preflight.approved, false);
    assert.equal(blockedPreflight.preflight.remediation.status, 'action_required');
    assert.equal(blockedPreflight.preflight.remediation.consentGrant.subjectId, identity.id);

    const grantFromPreflight = await fetch(
      `${baseUrl}/api/skill-preflights/${encodeURIComponent(blockedPreflight.preflight.preflightId)}/consent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signWithIdentityId: identity.id
        })
      }
    );
    assert.equal(grantFromPreflight.status, 201);
    const remediationGrant = await readJson(grantFromPreflight);
    assert.equal(remediationGrant.consent.subjectId, identity.id);
    assert.equal(remediationGrant.consent.constraints.skillId, digilockerSkill.skillId);
    assert.equal(remediationGrant.consent.signatures.length, 1);
    assert.equal(remediationGrant.lifecycle.status, 'active');
    assert.equal(remediationGrant.integrity.valid, true);
    assert.equal(remediationGrant.integrity.signatureValid, true);

    const retryResponse = await fetch(
      `${baseUrl}/api/skill-preflights/${encodeURIComponent(blockedPreflight.preflight.preflightId)}/retry`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }
    );
    assert.equal(retryResponse.status, 201);
    const retriedPreflight = await readJson(retryResponse);
    assert.equal(retriedPreflight.sourcePreflightId, blockedPreflight.preflight.preflightId);
    assert.equal(retriedPreflight.preflight.approved, true);
    assert.equal(
      retriedPreflight.preflight.decision.request.metadata.retryOfPreflightId,
      blockedPreflight.preflight.preflightId
    );

    const approvedPreflight = await readJson(
      await fetch(`${baseUrl}/api/skills/${encodeURIComponent(digilockerSkill.skillId)}/preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: identity.id })
      })
    );
    assert.equal(approvedPreflight.preflight.approved, true);
    assert.equal(approvedPreflight.preflight.remediation.status, 'none');
    assert.match(approvedPreflight.preflight.auditHash, /^[a-f0-9]{64}$/);
    assert.equal(approvedPreflight.preflight.decision.request.tool, 'digilocker');

    const preflights = await readJson(await fetch(`${baseUrl}/api/skill-preflights`));
    assert.equal(preflights.preflights.length, 3);

    const preflightDetail = await readJson(
      await fetch(`${baseUrl}/api/skill-preflights/${encodeURIComponent(approvedPreflight.preflight.preflightId)}`)
    );
    assert.equal(preflightDetail.preflight.preflightId, approvedPreflight.preflight.preflightId);

    const preflightIntegrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'skill-preflight',
          id: approvedPreflight.preflight.preflightId
        })
      })
    );
    assert.equal(preflightIntegrity.integrity.artifactType, 'skill-preflight');
    assert.equal(preflightIntegrity.integrity.valid, true);

    const preflightExecutionResponse = await fetch(
      `${baseUrl}/api/skill-preflights/${encodeURIComponent(retriedPreflight.preflight.preflightId)}/execute`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }
    );
    assert.equal(preflightExecutionResponse.status, 201);
    const preflightExecution = await readJson(preflightExecutionResponse);
    assert.equal(preflightExecution.preflightId, retriedPreflight.preflight.preflightId);
    assert.equal(preflightExecution.execution.status, 'completed');
    assert.equal(preflightExecution.execution.skillPreflightId, retriedPreflight.preflight.preflightId);
    assert.equal(preflightExecution.execution.toolReceipt.toolId, 'digilocker');
    assert.equal(preflightExecution.integrity.artifactType, 'tool-execution');
    assert.equal(preflightExecution.integrity.valid, true);

    const executionResponse = await fetch(`${baseUrl}/api/tools/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        actionType: 'scheme_delivery',
        tool: 'digilocker',
        scopes: ['scheme.eligibility', 'consent.record', 'identity.verify'],
        regulated: true,
        piiHandling: 'tokenized',
        metadata: { documents: ['income', 'land_record'] }
      })
    });
    assert.equal(executionResponse.status, 201);
    const execution = await readJson(executionResponse);
    assert.match(execution.preflight.preflightId, /^bos:skill-preflight:/);
    assert.equal(execution.preflight.approved, true);
    assert.equal(execution.execution.status, 'completed');
    assert.equal(execution.execution.skillPreflightId, execution.preflight.preflightId);
    assert.equal(execution.execution.toolReceipt.toolId, 'digilocker');
    assert.equal(execution.execution.toolReceipt.documents.length, 2);

    const listed = await readJson(await fetch(`${baseUrl}/api/tool-executions`));
    assert.equal(listed.executions.length, 2);
    assert.ok(listed.executions.some((item) => item.skillPreflightId === execution.preflight.preflightId));
    assert.ok(listed.executions.some((item) => item.skillPreflightId === retriedPreflight.preflight.preflightId));

    const traceResponse = await fetch(
      `${baseUrl}/api/skill-preflights/${encodeURIComponent(blockedPreflight.preflight.preflightId)}/trace`
    );
    assert.equal(traceResponse.status, 200);
    const trace = await readJson(traceResponse);
    assert.equal(trace.trace.objectType, 'skill-invocation-trace');
    assert.match(trace.trace.traceId, /^bos:skill-trace:/);
    assert.match(trace.trace.evidenceHash, /^[a-f0-9]{64}$/);
    assert.equal(trace.trace.privacy.rawPiiIncluded, false);
    assert.equal(trace.trace.rootPreflightId, blockedPreflight.preflight.preflightId);
    assert.ok(trace.trace.preflightIds.includes(retriedPreflight.preflight.preflightId));
    assert.ok(trace.trace.executionIds.includes(preflightExecution.execution.executionId));
    assert.ok(trace.trace.consentIds.includes(remediationGrant.consent.consentId));
    assert.ok(trace.trace.ledgerEvents.some((event) => event.type === 'skill_preflight.saved'));

    const dashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(dashboard.phase1.toolExecutionCount, 2);
    assert.equal(dashboard.phase1.skillPreflightCount, 4);
    assert.equal(dashboard.phase1.latestSkillPreflight.skillId, digilockerSkill.skillId);
    assert.equal(dashboard.phase1.integrity.latestSkillPreflight.valid, true);
    assert.equal(dashboard.phase1.latestToolExecution.status, 'completed');
    assert.equal(dashboard.phase1.latestToolExecution.skillPreflightId, execution.preflight.preflightId);
  });
});

test('Phase 1 API orchestrates intents into approved tool executions', async () => {
  const { store } = await freshStore('api-orchestrator');
  const identity = createIdentity({ displayName: 'API orchestration actor' });
  await store.saveIdentity(identity);

  await withApi(store, async (baseUrl) => {
    const templates = await readJson(await fetch(`${baseUrl}/api/orchestration-templates`));
    assert.ok(templates.templates.some((template) => template.actionType === 'scheme_delivery'));

    await fetch(`${baseUrl}/api/consents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectId: identity.id,
        granteeId: 'bharat-os-orchestrator',
        scopes: ['identity.verify', 'scheme.eligibility', 'consent.record'],
        purpose: 'API orchestration test'
      })
    });

    const response = await fetch(`${baseUrl}/api/orchestrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: identity.id,
        intentText: 'Mujhe sarkari yojana ke labh chahiye',
        locale: 'hi-Latn-IN',
        execute: true
      })
    });
    assert.equal(response.status, 201);
    const body = await readJson(response);
    assert.equal(body.orchestration.status, 'completed');
    assert.equal(body.orchestration.intent.detectedLocale, 'hi-Latn-IN');
    assert.match(body.orchestration.intent.normalizedText, /scheme/);
    assert.equal(body.orchestration.actionRequest.actionType, 'scheme_delivery');
    assert.equal(body.orchestration.actionRequest.skillId, 'bos:skill:digilocker-docrefs');
    assert.match(body.orchestration.actionRequest.skillManifestId, /^bos:skill-manifest:/);
    assert.match(body.orchestration.skillPreflightId, /^bos:skill-preflight:/);
    assert.equal(body.orchestration.skillPreflight.approved, true);
    assert.equal(body.orchestration.execution.skillPreflightId, body.orchestration.skillPreflightId);
    assert.equal(body.orchestration.execution.toolReceipt.toolId, 'digilocker');

    const integrity = await readJson(
      await fetch(`${baseUrl}/api/integrity/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactType: 'orchestration',
          id: body.orchestration.orchestrationId
        })
      })
    );
    assert.equal(integrity.integrity.valid, true);

    const listed = await readJson(await fetch(`${baseUrl}/api/orchestrations`));
    assert.equal(listed.orchestrations.length, 1);

    const preflights = await readJson(await fetch(`${baseUrl}/api/skill-preflights`));
    assert.equal(preflights.preflights.length, 1);
    assert.equal(preflights.preflights[0].preflightId, body.orchestration.skillPreflightId);

    const dashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(dashboard.phase1.orchestrationCount, 1);
    assert.equal(dashboard.phase1.skillPreflightCount, 1);
    assert.equal(dashboard.phase1.latestOrchestration.status, 'completed');
    assert.equal(dashboard.phase1.latestOrchestration.skillId, 'bos:skill:digilocker-docrefs');
    assert.equal(dashboard.phase1.latestOrchestration.skillPreflightId, body.orchestration.skillPreflightId);
    assert.equal(dashboard.phase1.integrity.latestOrchestration.valid, true);
  });
});

test('Phase 0 API runs bootstrap simulation and exposes report markdown', async () => {
  const { store } = await freshStore('api-bootstrap');
  await withApi(store, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/simulations/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seed: 'api-bootstrap',
        nodeCount: 250,
        objectCount: 12,
        averageObjectBytes: 2048,
        chunkSizeBytes: 1024,
        replicationFactor: 2
      })
    });
    assert.equal(createdResponse.status, 201);
    const created = await readJson(createdResponse);
    assert.equal(created.ok, true);
    assert.equal(created.report.results.storedObjectCount, 12);
    assert.equal(created.controlPlane.nodeCount, 250);

    const reports = await readJson(await fetch(`${baseUrl}/api/reports`));
    assert.equal(reports.reports.length, 1);
    assert.equal(reports.reports[0].reportId, created.report.reportId);

    const dashboard = await readJson(await fetch(`${baseUrl}/api/dashboard`));
    assert.equal(dashboard.latestReport.reportId, created.report.reportId);
    assert.equal(dashboard.controlPlane.nodeCount, 250);
    assert.ok(dashboard.nodes.length > 0);

    const report = await readJson(await fetch(`${baseUrl}/api/reports/${created.report.reportId}`));
    assert.equal(report.reportId, created.report.reportId);

    const markdownResponse = await fetch(`${baseUrl}/api/reports/${created.report.reportId}.md`);
    assert.equal(markdownResponse.status, 200);
    assert.match(await markdownResponse.text(), /Bharat OS Phase 0 Bootstrap Report/);
  });
});

test('Phase 0 API exposes persisted control-plane summary and manifests', async () => {
  const { store } = await freshStore('api-control-plane');
  const simulation = simulateDemandBootstrap({
    seed: 'api-control-plane',
    nodeCount: 120,
    objectCount: 8,
    averageObjectBytes: 1024,
    chunkSizeBytes: 512,
    replicationFactor: 2
  });
  await store.saveIdentity(simulation.owner);
  await store.saveControlPlane(simulation.controlPlane, 'bootstrap');
  await store.saveSimulationReport(simulation.report);

  await withApi(store, async (baseUrl) => {
    const nodes = await readJson(await fetch(`${baseUrl}/api/nodes`));
    assert.equal(nodes.bootstrap.nodeCount, 120);

    const controlPlane = await readJson(await fetch(`${baseUrl}/api/control-planes/bootstrap`));
    assert.equal(controlPlane.summary.controlPlaneId, 'bootstrap');
    assert.equal(controlPlane.summary.nodeCount, 120);
    assert.equal(controlPlane.summary.manifestCount, 8);

    const identities = await readJson(await fetch(`${baseUrl}/api/identities`));
    assert.equal(identities.identities.length, 1);
    assert.equal('privateKeyPem' in identities.identities[0], false);
    assert.equal('vaultKeyBase64' in identities.identities[0], false);
  });
});
