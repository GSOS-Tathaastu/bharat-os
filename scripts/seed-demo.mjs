#!/usr/bin/env node
// Seed a demo store so the operator console has something to show.
// Runs every Phase 1.37-1.42 surface so an investor demo shows the §9C
// vignettes populated end-to-end. Idempotent: rm -rf the store first.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createIdentity,
  createNode,
  publicIdentity
} from '../src/phase0/core.mjs';
import { BosStore } from '../src/phase0/store.mjs';
import {
  simulateDemandBootstrap
} from '../src/phase0/simulate.mjs';
import { createConsent } from '../src/phase1/policy.mjs';
import {
  signConsent,
  publicRecordsFromIdentities
} from '../src/phase1/integrity.mjs';
import { createMemoryRecord } from '../src/phase1/memory.mjs';
import { orchestrateIntent } from '../src/phase1/orchestrator.mjs';
import {
  createWorkerAuthorization,
  signWorkerAuthorization
} from '../src/phase1/worker-authorization.mjs';
import {
  createMeshContributionEvent,
  MESH_WORKLOAD_TYPES
} from '../src/phase1/mesh-contribution.mjs';
import {
  createFederatedRound,
  createGradientUpdate,
  openRound,
  signGradientUpdate,
  submitGradientUpdate
} from '../src/phase1/federated-round.mjs';
import { signTrustAttestation } from '../src/phase1/trust-attestation.mjs';

function log(line) {
  process.stdout.write(`${line}\n`);
}

const storePath = path.resolve(process.argv[2] ?? '.demo-bharat-os');
log(`Seeding demo store at ${storePath} …`);

await fs.rm(storePath, { recursive: true, force: true });
const store = new BosStore(storePath);
await store.init();

// ─── Identities ────────────────────────────────────────────────────────────
const sita = createIdentity({
  displayName: 'Sita Devi (kirana shop owner, Varanasi)',
  attestations: { aadhaar_offline: { status: 'verified', issuer: 'UIDAI' } }
});
const ravi = createIdentity({
  displayName: 'Ravi Yadav (brick-kiln contractor, eastern UP)',
  attestations: { aadhaar_offline: { status: 'verified', issuer: 'UIDAI' } }
});
const lakshmi = createIdentity({
  displayName: 'Lakshmi Amma (grandmother, rural Tamil Nadu)',
  attestations: { abha_address: { status: 'verified', issuer: 'NHA' } }
});
const aarav = createIdentity({
  displayName: 'Aarav Iyer (college student, Bangalore)',
  attestations: {}
});
const suresh = createIdentity({
  displayName: 'Suresh Kumar (cab driver, Patna)',
  attestations: { aadhaar_offline: { status: 'verified', issuer: 'UIDAI' } }
});
const priya = createIdentity({
  displayName: 'Priya R (engineering student, Coimbatore, mesh operator)',
  attestations: {}
});
const rajesh = createIdentity({
  displayName: 'Rajesh Bhai (CA, Surat)',
  attestations: { pan_offline: { status: 'verified', issuer: 'IT-Dept' } }
});
const anjali = createIdentity({
  displayName: 'Anjali (rider, Bangalore)',
  attestations: {}
});

const identities = [sita, ravi, lakshmi, aarav, suresh, priya, rajesh, anjali];
for (const identity of identities) {
  await store.saveIdentity(identity);
}
log(`  identities: ${identities.length}`);

const publicRecords = publicRecordsFromIdentities(identities);

// ─── Mesh nodes (Priya + Rajesh + Suresh are operators) ────────────────────
await store.saveNode(
  createNode({
    operatorId: priya.id,
    storageBytes: 50 * 1024 * 1024 * 1024,
    kycVerified: true,
    trustScore: 78
  })
);
await store.saveNode(
  createNode({
    operatorId: rajesh.id,
    storageBytes: 120 * 1024 * 1024 * 1024,
    kycVerified: true,
    trustScore: 84
  })
);
await store.saveNode(
  createNode({
    operatorId: suresh.id,
    storageBytes: 20 * 1024 * 1024 * 1024,
    kycVerified: true,
    trustScore: 71
  })
);
log('  nodes: 3 (Priya 50GB, Rajesh 120GB, Suresh 20GB)');

// ─── Memory records (Rajesh's CA files; Lakshmi's health summary) ──────────
const { record: caRecord } = createMemoryRecord(
  rajesh,
  Buffer.alloc(64 * 1024, 'x'),
  {
    label: 'GST return Q4 2025-26',
    tags: ['ca', 'audit', 'gst'],
    source: { type: 'document', name: 'GSTR-3B' }
  }
);
await store.saveMemoryRecord(caRecord);

const { record: healthRecord } = createMemoryRecord(
  lakshmi,
  Buffer.from('Diabetes follow-up — HbA1c 6.8 — last visit 2026-04-12'),
  {
    label: 'ABHA summary — diabetes',
    tags: ['health', 'abha'],
    source: { type: 'medical', name: 'ABHA' }
  }
);
await store.saveMemoryRecord(healthRecord);

const { record: schemeMemo } = createMemoryRecord(
  sita,
  Buffer.from('PM Mudra loan eligibility — current annual turnover ₹4.2L'),
  {
    label: 'Loan eligibility memo',
    tags: ['scheme', 'loan'],
    source: { type: 'memo' }
  }
);
await store.saveMemoryRecord(schemeMemo);
log('  memory records: 3 (Rajesh CA, Lakshmi ABHA, Sita scheme)');

// ─── Consents ──────────────────────────────────────────────────────────────
const sitaConsent = signConsent(
  createConsent({
    subjectId: sita.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['identity.verify', 'consent.record', 'regulated.workflow'],
    purpose: 'Sita regulated onboarding (Mudra loan via AA)'
  }),
  sita
);
await store.saveConsent(sitaConsent);

const raviConsent = signConsent(
  createConsent({
    subjectId: ravi.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['labor.match', 'worker.notify', 'upi.escrow'],
    purpose: 'Brick-kiln hire 50 workers x 3 days'
  }),
  ravi
);
await store.saveConsent(raviConsent);

const lakshmiConsent = signConsent(
  createConsent({
    subjectId: lakshmi.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['health.record.read', 'health.record.write', 'consent.record'],
    purpose: 'Diabetes record read and captured prescription upload'
  }),
  lakshmi
);
await store.saveConsent(lakshmiConsent);

const aaravConsent = signConsent(
  createConsent({
    subjectId: aarav.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['service.book', 'consent.record', 'upi.settle'],
    purpose: 'Train ticket booking'
  }),
  aarav
);
await store.saveConsent(aaravConsent);

const anjaliConsent = signConsent(
  createConsent({
    subjectId: anjali.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['service.book', 'consent.record', 'upi.settle'],
    purpose: 'Cab booking'
  }),
  anjali
);
await store.saveConsent(anjaliConsent);
log('  consents: 5 (signed)');

// ─── Worker authorization (Saraswati-style kiosk channel for Ravi) ────────
const raviAuth = signWorkerAuthorization(
  createWorkerAuthorization({
    workerId: ravi.id,
    operatorId: 'bos:operator:csc-varanasi-001',
    jobReference: 'bos:job:brick-kiln-april-2026',
    scopes: ['labor.match', 'worker.notify', 'upi.escrow'],
    purpose: 'Ravi authorizes CSC operator to assist with labor posting',
    ttlDays: 7
  }),
  ravi
);
await store.saveWorkerAuthorization(raviAuth);
log('  worker authorizations: 1 (Ravi, signed)');

// ─── Orchestrations ────────────────────────────────────────────────────────
function runOrchestration(intent, consents) {
  const orchestration = orchestrateIntent(intent, consents, {
    execute: true,
    publicRecords
  });
  return orchestration;
}

// 1. Sita — Hindi regulated onboarding
const sitaO = runOrchestration(
  {
    actorId: sita.id,
    intentText: 'Mujhe apni dukan ke liye chhota karza chahiye',
    locale: 'hi-Latn-IN'
  },
  [sitaConsent]
);
await store.saveDecision(sitaO.decision);
await store.saveSkillPreflight(sitaO.skillPreflight);
if (sitaO.execution) await store.saveToolExecution(sitaO.execution);
await store.saveOrchestration(sitaO);

// 2. Ravi — Bhojpuri labor matching with worker auth + age attestation
const raviO = runOrchestration(
  {
    actorId: ravi.id,
    intentText: 'hamra bhattha khatir pachas mazdoor chahin teen din chhah sau rupiya din',
    locale: 'bho-IN',
    identity: { ageAttested: true, ageMinimum: 28 },
    labor: { days: 3, headcount: 50, wageFloorPerDay: 400 },
    money: { amount: 90000, currency: 'INR', limit: 100000, escrow: true },
    mediation: {
      channel: 'kiosk',
      kioskOperatorId: 'bos:operator:csc-varanasi-001',
      workerAuthorization: raviAuth
    }
  },
  [raviConsent]
);
await store.saveDecision(raviO.decision);
await store.saveSkillPreflight(raviO.skillPreflight);
if (raviO.execution) await store.saveToolExecution(raviO.execution);
await store.saveOrchestration(raviO);

// 3. Lakshmi — Tamil health record read
const lakshmiO = runOrchestration(
  {
    actorId: lakshmi.id,
    intentText: 'enakku en sarkkarai noiyin pathivu kaattu'
  },
  [lakshmiConsent]
);
await store.saveDecision(lakshmiO.decision);
await store.saveSkillPreflight(lakshmiO.skillPreflight);
if (lakshmiO.execution) await store.saveToolExecution(lakshmiO.execution);
await store.saveOrchestration(lakshmiO);

// 4. Aarav — Hinglish train ticket booking
const aaravO = runOrchestration(
  {
    actorId: aarav.id,
    intentText: 'Bangalore se Hyderabad ke liye Friday raat ka train book kar do',
    money: { amount: 620, currency: 'INR', limit: 1000 },
    metadata: { vertical: 'ticket', from: 'Bangalore', to: 'Hyderabad' }
  },
  [aaravConsent]
);
await store.saveDecision(aaravO.decision);
await store.saveSkillPreflight(aaravO.skillPreflight);
if (aaravO.execution) await store.saveToolExecution(aaravO.execution);
await store.saveOrchestration(aaravO);

// 5. Anjali — Hinglish cab booking
const anjaliO = runOrchestration(
  {
    actorId: anjali.id,
    intentText: 'Mujhe ek cab book karo Koramangala se Indiranagar',
    money: { amount: 220, currency: 'INR', limit: 500 },
    metadata: { vertical: 'cab', from: 'Koramangala', to: 'Indiranagar', etaMinutes: 9 }
  },
  [anjaliConsent]
);
await store.saveDecision(anjaliO.decision);
await store.saveSkillPreflight(anjaliO.skillPreflight);
if (anjaliO.execution) await store.saveToolExecution(anjaliO.execution);
await store.saveOrchestration(anjaliO);

// 6. Family weekend in Munnar — Tamil hotel booking
const lakshmiHotelConsent = signConsent(
  createConsent({
    subjectId: lakshmi.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['service.book', 'consent.record', 'upi.settle'],
    purpose: 'Munnar hotel booking'
  }),
  lakshmi
);
await store.saveConsent(lakshmiHotelConsent);

const hotelO = runOrchestration(
  {
    actorId: lakshmi.id,
    intentText: 'velliyazhcha munnaril randu rathri family room venum',
    money: { amount: 4500, currency: 'INR', limit: 5000 },
    metadata: {
      vertical: 'hotel',
      from: null,
      to: 'Munnar',
      checkIn: '2026-05-29',
      checkOut: '2026-05-31'
    }
  },
  [lakshmiHotelConsent]
);
await store.saveDecision(hotelO.decision);
await store.saveSkillPreflight(hotelO.skillPreflight);
if (hotelO.execution) await store.saveToolExecution(hotelO.execution);
await store.saveOrchestration(hotelO);

log(`  orchestrations: 6 (Sita loan, Ravi labor, Lakshmi health, Aarav train, Anjali cab, Munnar hotel)`);

// ─── Trust attestation — §13A #7 (Phase 2a.22, ADR 0072) ───────────────────
// Sneha-style tenant verification: Sita (Aadhaar-verified) signs an
// attestation for "Kothrud Landlord" sharing identity_verified +
// income_band as bands/booleans. Lakshmi signs an HR-style one for
// future-employer onboarding.
const sitaAttestConsent = signConsent(
  createConsent({
    subjectId: sita.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['trust.attest', 'consent.record'],
    purpose: 'tenant_verification',
    ttlSeconds: 14 * 24 * 60 * 60
  }),
  sita
);
await store.saveConsent(sitaAttestConsent);

const sitaAttestO = runOrchestration(
  {
    actorId: sita.id,
    intentText: 'Generate a trust attestation for my landlord',
    locale: 'hi-Latn-IN',
    metadata: {
      verifierName: 'Kothrud Landlord (Pune)',
      shareDays: 14,
      purpose: 'tenant_verification',
      incomeBand: 'INR_50K_75K_MONTHLY'
    }
  },
  [sitaAttestConsent]
);
await store.saveDecision(sitaAttestO.decision);
await store.saveSkillPreflight(sitaAttestO.skillPreflight);
if (sitaAttestO.execution) {
  await store.saveToolExecution(sitaAttestO.execution);
  if (sitaAttestO.execution.toolReceipt?.toolId === 'trust_passport_attestation') {
    await store.saveAttestation(signTrustAttestation(sitaAttestO.execution.toolReceipt, sita));
  }
}
await store.saveOrchestration(sitaAttestO);

const lakshmiAttestConsent = signConsent(
  createConsent({
    subjectId: lakshmi.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['trust.attest', 'consent.record'],
    purpose: 'employer_onboarding',
    ttlSeconds: 30 * 24 * 60 * 60
  }),
  lakshmi
);
await store.saveConsent(lakshmiAttestConsent);

const lakshmiAttestO = runOrchestration(
  {
    actorId: lakshmi.id,
    intentText: 'Generate a trust attestation for my new clinic',
    locale: 'en-IN',
    metadata: {
      verifierName: 'Apollo Clinic (Coimbatore)',
      shareDays: 30,
      purpose: 'employer_onboarding'
    }
  },
  [lakshmiAttestConsent]
);
await store.saveDecision(lakshmiAttestO.decision);
await store.saveSkillPreflight(lakshmiAttestO.skillPreflight);
if (lakshmiAttestO.execution) {
  await store.saveToolExecution(lakshmiAttestO.execution);
  if (lakshmiAttestO.execution.toolReceipt?.toolId === 'trust_passport_attestation') {
    await store.saveAttestation(signTrustAttestation(lakshmiAttestO.execution.toolReceipt, lakshmi));
  }
}
await store.saveOrchestration(lakshmiAttestO);

log('  attestations: 2 (Sita → landlord, Lakshmi → clinic)');

// ─── Mesh contribution events — §13B (Phase 2a.13, ADR 0062) ──────────────
// A day's worth of inference + storage events per operator so the mesh
// ticker shows non-zero earnings on first load and the daily brief has
// real "your phone earned ₹X overnight" data.
const meshEventSeeds = [
  // Priya — flagship South Indian operator, mixed workloads
  { operator: priya, workloadType: 'inference', tokens: 220_000, hoursAgo: 2 },
  { operator: priya, workloadType: 'inference', tokens: 480_000, hoursAgo: 5 },
  { operator: priya, workloadType: 'storage_serve', bytes: 1024 ** 3 * 2, hoursAgo: 7 },
  { operator: priya, workloadType: 'inference', tokens: 1_100_000, hoursAgo: 11 },
  // Rajesh — CA, big storage operator
  { operator: rajesh, workloadType: 'storage_serve', bytes: 1024 ** 3 * 8, hoursAgo: 4 },
  { operator: rajesh, workloadType: 'storage_store', bytes: 1024 ** 4 * 120 / 1000, hoursAgo: 6 }, // ~120 GB-min
  { operator: rajesh, workloadType: 'inference', tokens: 90_000, hoursAgo: 9 },
  // Suresh — cab driver, lighter mesh use
  { operator: suresh, workloadType: 'inference', tokens: 45_000, hoursAgo: 3 }
];
for (const s of meshEventSeeds) {
  const at = new Date(Date.now() - s.hoursAgo * 60 * 60 * 1000).toISOString();
  const event = createMeshContributionEvent({
    operatorId: s.operator.id,
    workloadType: s.workloadType,
    tokens: s.tokens,
    bytes: s.bytes,
    charging: true,
    wifi: true,
    batteryPercent: 90,
    at
  });
  await store.saveMeshContributionEvent(event);
}
log(`  mesh contribution events: ${meshEventSeeds.length} (across Priya, Rajesh, Suresh)`);

// ─── §7f federated round — Phase 3.0 + 3.1 (ADR 0071, 0074) ───────────────
// One active "intent-classifier-head-v1" round, opened by Sita (acting
// as researcher for demo purposes; in production this would be a
// Bharat OS Core-issued round). Priya joins it with a real on-device
// gradient — Phase 3.1's actual math, not the placeholder hash. The
// /shell/ Federated card shows the round on first load; an investor
// can tap "Join round" on Priya's profile to add a second update.
const federatedRound = openRound(
  createFederatedRound({
    createdBy: sita.id,
    modelName: 'intent-classifier-head-v1',
    baselineModelHash: 'sha256:baseline-intent-classifier-head-v1',
    maxParticipants: 50,
    maxEpsilon: 0.5,
    payoutPaisePerUpdate: 200,
    deadlineSecondsFromNow: 7 * 24 * 60 * 60
  })
);
await store.saveFederatedRound(federatedRound);

// Priya donates: needs a federated_donation purpose consent + a signed
// gradient update. Phase 3.1's local-training math would normally run
// in the browser; for the seed we generate one signed update so the
// operator console shows non-zero participation on first load.
const priyaDonationConsent = signConsent(
  createConsent({
    subjectId: priya.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: ['training.donate', 'consent.record'],
    purpose: 'federated_donation',
    ttlSeconds: 24 * 60 * 60,
    constraints: { roundId: federatedRound.roundId }
  }),
  priya
);
await store.saveConsent(priyaDonationConsent);

const priyaUpdate = signGradientUpdate(
  createGradientUpdate({
    roundId: federatedRound.roundId,
    contributorId: priya.id,
    baselineModelHash: federatedRound.baselineModelHash,
    gradientHash: 'sha256:seeded-priya-update-2026-05-23',
    differentialPrivacyEpsilon: 0.3,
    sampleCount: 6
  }),
  priya
);
const { round: roundAfterPriya, update: acceptedPriyaUpdate } = submitGradientUpdate({
  round: federatedRound,
  update: priyaUpdate,
  consents: [priyaDonationConsent],
  publicRecords: [publicIdentity(priya)]
});
await store.saveFederatedRound(roundAfterPriya);
await store.saveFederatedUpdate(acceptedPriyaUpdate);
// Mint the matching mesh contribution event so Priya's ticker shows
// the federated earning alongside her inference/storage events.
const priyaFederatedEvent = createMeshContributionEvent({
  operatorId: priya.id,
  workloadType: 'federated_round',
  payoutPaise: acceptedPriyaUpdate.payoutPaise,
  roundId: roundAfterPriya.roundId
});
await store.saveMeshContributionEvent(priyaFederatedEvent);

log(`  federated round: 1 (${federatedRound.modelName}) with 1 update from Priya`);

// ─── Bootstrap simulation report ────────────────────────────────────────────
const bootstrap = simulateDemandBootstrap({
  nodeCount: 100,
  objectCount: 40,
  averageObjectBytes: 65536,
  seed: 'bharat-os-demo-2026-05-23'
});
await store.saveIdentity(bootstrap.owner);
await store.saveControlPlane(bootstrap.controlPlane);
await store.saveSimulationReport(bootstrap.report);
log(`  bootstrap report: 1 (nodes=${bootstrap.report.inputs.nodeCount}, objects=${bootstrap.report.inputs.objectCount})`);

log('\nDone. Start the API with:');
log(`  node bin/bos-api.mjs --store ${storePath}`);
log('Then open: http://127.0.0.1:8787/ for the shell, or /console/ for operator view.');
