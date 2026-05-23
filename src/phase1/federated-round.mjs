// §7f Federated learning round — Phase 3.0 substrate.
//
// §7f says: *"the model trains on-device using the user's own data;
// only encrypted gradient updates (with differential privacy noise)
// leave the device."* This module is the substrate for that flow.
// Not the training math itself — gradient computation, model weights,
// TF.js / ONNX Web are Phase 3.1+. This module ships the round
// lifecycle, signed update receipts, donation-consent enforcement,
// and aggregation contract.
//
// §15 bindings that drive the shape:
//
//   • Donation consent ≠ workflow consent. §7f explicitly says each
//     federated contribution needs its own L4 consent artifact. The
//     `submitGradientUpdate` function refuses without a donation
//     consent that names the round ID.
//   • Gradient hashes only — no plaintext gradients persist on the
//     control plane. The round's evidence ledger records the hash +
//     DP epsilon, never the gradient vector. §15 pointer-not-payload.
//   • Signed by the contributor. Every update carries an Ed25519
//     signature from the contributor identity — same primitive as
//     consents and worker authorizations. Aggregation refuses any
//     unsigned update.
//   • Payouts in fiat-credit. Each accepted update mints a mesh
//     contribution event with workloadType `federated_round` (the
//     mesh-contribution module gains this case). §15 — no tokens.
//   • Honest accounting on DP epsilon. The round declares a maximum
//     epsilon (privacy budget); updates that exceed it are refused.
//
// Lifecycle:
//
//   created → accepting_updates → aggregating → completed
//                                            ↘ expired (past deadline)

import { sha256Hex, signText, stableStringify, verifySignature } from '../phase0/core.mjs';

export const FEDERATED_ROUND_PROTOCOL_VERSION = 'bos.phase1.federated-round.v0';

export const FEDERATED_ROUND_WORKLOAD = 'federated_round';

// A round-scoped donation consent must use this exact purpose tag.
// `submitGradientUpdate` checks for it; general workflow consents
// (purpose: 'tenant_verification' etc.) are *not* enough.
export const DONATION_CONSENT_PURPOSE = 'federated_donation';
export const DONATION_CONSENT_SCOPES = ['training.donate', 'consent.record'];

// Per the §7b mesh fiat-credit rates (§13B), federated participation
// is paid at a flat per-update rate. Researchers (the round
// creator) fund the round; operators (contributing nodes) earn
// proportionally.
export const FEDERATED_PAYOUT_PAISE_PER_UPDATE = 200; // ₹2 per accepted gradient update

function nowIso() {
  return new Date().toISOString();
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function validateEpsilon(epsilon) {
  const value = Number(epsilon);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('differentialPrivacyEpsilon must be a positive finite number.');
  }
  if (value > 100) {
    throw new Error('differentialPrivacyEpsilon must be <= 100 (sanity cap).');
  }
  return value;
}

// Round creation — researcher (`createdBy`) declares the model
// they're training, the baseline hash they'll aggregate updates
// against, a max DP epsilon any single update may carry, a deadline,
// and the per-update payout. Returns a `pending` round; transition
// to `accepting_updates` via `openRound`.
export function createFederatedRound({
  createdBy,
  modelName,
  baselineModelHash,
  maxParticipants = 100,
  maxEpsilon,
  payoutPaisePerUpdate = FEDERATED_PAYOUT_PAISE_PER_UPDATE,
  deadlineSecondsFromNow = 24 * 60 * 60,
  at = nowIso()
} = {}) {
  if (!createdBy) throw new Error('createdBy identity ID is required.');
  if (!modelName) throw new Error('modelName is required.');
  if (!baselineModelHash) throw new Error('baselineModelHash is required.');
  const cappedMax = Math.min(Math.max(Number(maxParticipants ?? 100), 1), 10_000);
  const epsilonCap = validateEpsilon(maxEpsilon ?? 1.0);
  const payout = Math.max(0, Number(payoutPaisePerUpdate ?? FEDERATED_PAYOUT_PAISE_PER_UPDATE));
  const deadlineAt = new Date(
    new Date(at).getTime() + Number(deadlineSecondsFromNow) * 1000
  ).toISOString();
  const core = {
    protocolVersion: FEDERATED_ROUND_PROTOCOL_VERSION,
    objectType: 'federated-round',
    status: 'created',
    createdBy,
    modelName,
    baselineModelHash,
    maxParticipants: cappedMax,
    maxEpsilon: epsilonCap,
    payoutPaisePerUpdate: payout,
    createdAt: at,
    deadlineAt,
    openedAt: null,
    closedAt: null,
    aggregatedAt: null,
    aggregatedModelHash: null,
    updateCount: 0,
    epsilonSpent: 0
  };
  return {
    roundId: idFrom('bos:fed-round', core),
    ...core
  };
}

export function openRound(round, { at = nowIso() } = {}) {
  if (round.status !== 'created') {
    throw new Error(`Round must be 'created' to open (currently '${round.status}').`);
  }
  return { ...round, status: 'accepting_updates', openedAt: at };
}

export function expireRound(round, { at = nowIso() } = {}) {
  if (['completed', 'expired'].includes(round.status)) return round;
  if (new Date(at).getTime() < new Date(round.deadlineAt).getTime()) {
    return round;
  }
  return { ...round, status: 'expired', closedAt: at };
}

// A gradient update — what a contributing device produces locally
// after one round of on-device training. The actual gradient bytes
// never reach the control plane; the contributor hashes the gradient
// and submits the hash + DP epsilon + signature.
export function createGradientUpdate({
  roundId,
  contributorId,
  baselineModelHash,
  gradientHash,
  differentialPrivacyEpsilon,
  sampleCount,
  at = nowIso()
} = {}) {
  if (!roundId) throw new Error('roundId is required.');
  if (!contributorId) throw new Error('contributorId is required.');
  if (!baselineModelHash) throw new Error('baselineModelHash is required.');
  if (!gradientHash) throw new Error('gradientHash is required.');
  const epsilon = validateEpsilon(differentialPrivacyEpsilon);
  const samples = Math.max(0, Number(sampleCount ?? 0));
  const core = {
    protocolVersion: FEDERATED_ROUND_PROTOCOL_VERSION,
    objectType: 'federated-gradient-update',
    roundId,
    contributorId,
    baselineModelHash,
    gradientHash,
    differentialPrivacyEpsilon: epsilon,
    sampleCount: samples,
    submittedAt: at,
    signature: null,
    accepted: false,
    payoutPaise: 0
  };
  return {
    updateId: idFrom('bos:fed-update', core),
    ...core
  };
}

export function signGradientUpdate(update, contributorIdentity) {
  if (!contributorIdentity?.id) {
    throw new Error('contributorIdentity is required.');
  }
  if (contributorIdentity.id !== update.contributorId) {
    throw new Error('contributorIdentity must match the update contributorId.');
  }
  const payloadText = stableStringify({
    protocolVersion: update.protocolVersion,
    objectType: update.objectType,
    roundId: update.roundId,
    contributorId: update.contributorId,
    baselineModelHash: update.baselineModelHash,
    gradientHash: update.gradientHash,
    differentialPrivacyEpsilon: update.differentialPrivacyEpsilon,
    sampleCount: update.sampleCount,
    submittedAt: update.submittedAt
  });
  const signature = signText(contributorIdentity, payloadText);
  return { ...update, signature };
}

function verifyUpdateSignature(update, publicRecords) {
  if (!update.signature) return false;
  const subject = publicRecords.find(
    (record) => record.id === update.contributorId
  );
  if (!subject) return false;
  const payloadText = stableStringify({
    protocolVersion: update.protocolVersion,
    objectType: update.objectType,
    roundId: update.roundId,
    contributorId: update.contributorId,
    baselineModelHash: update.baselineModelHash,
    gradientHash: update.gradientHash,
    differentialPrivacyEpsilon: update.differentialPrivacyEpsilon,
    sampleCount: update.sampleCount,
    submittedAt: update.submittedAt
  });
  return verifySignature(subject, payloadText, update.signature);
}

function hasDonationConsent(consents, { contributorId, roundId, at = nowIso() }) {
  const nowMs = new Date(at).getTime();
  return consents.some((consent) => {
    if (consent.subjectId !== contributorId) return false;
    if (consent.purpose !== DONATION_CONSENT_PURPOSE) return false;
    if (!Array.isArray(consent.scopes)) return false;
    const hasScopes = DONATION_CONSENT_SCOPES.every((scope) =>
      consent.scopes.includes(scope)
    );
    if (!hasScopes) return false;
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= nowMs) {
      return false;
    }
    if (consent.revocation?.revokedAt) return false;
    if (consent.constraints?.roundId && consent.constraints.roundId !== roundId) {
      return false;
    }
    return true;
  });
}

// Submit a signed update against an open round, with a donation
// consent for the contributor. Returns `{ round, update }` with the
// round's running totals updated and the update's `accepted` /
// `payoutPaise` set. Throws on any policy violation.
export function submitGradientUpdate({
  round,
  update,
  consents = [],
  publicRecords = [],
  at = nowIso()
} = {}) {
  if (!round || round.objectType !== 'federated-round') {
    throw new Error('round is required.');
  }
  if (!update || update.objectType !== 'federated-gradient-update') {
    throw new Error('update is required.');
  }
  if (round.roundId !== update.roundId) {
    throw new Error('update.roundId must match round.roundId.');
  }
  if (round.status !== 'accepting_updates') {
    throw new Error(
      `round must be 'accepting_updates' to submit (currently '${round.status}').`
    );
  }
  if (new Date(at).getTime() >= new Date(round.deadlineAt).getTime()) {
    throw new Error('round deadline has passed.');
  }
  if (round.updateCount >= round.maxParticipants) {
    throw new Error('round has reached max participants.');
  }
  if (update.baselineModelHash !== round.baselineModelHash) {
    throw new Error('update.baselineModelHash must match the round baseline.');
  }
  if (update.differentialPrivacyEpsilon > round.maxEpsilon) {
    throw new Error(
      `update epsilon ${update.differentialPrivacyEpsilon} exceeds round cap ${round.maxEpsilon}.`
    );
  }
  if (!verifyUpdateSignature(update, publicRecords)) {
    throw new Error('update signature is missing or does not verify.');
  }
  if (
    !hasDonationConsent(consents, {
      contributorId: update.contributorId,
      roundId: round.roundId,
      at
    })
  ) {
    throw new Error(
      `no active 'federated_donation' consent for contributor ${update.contributorId} on round ${round.roundId}.`
    );
  }
  const acceptedUpdate = {
    ...update,
    accepted: true,
    payoutPaise: round.payoutPaisePerUpdate
  };
  const nextRound = {
    ...round,
    updateCount: round.updateCount + 1,
    epsilonSpent: round.epsilonSpent + update.differentialPrivacyEpsilon
  };
  return { round: nextRound, update: acceptedUpdate };
}

// Aggregate the round — closes the lifecycle, computes a new
// aggregated model hash (a deterministic hash of the sorted update
// gradient hashes for this prototype; the real aggregation
// algorithm is Phase 3.1+ TF.js / ONNX averaging), and stamps
// `aggregatedAt` + `aggregatedModelHash`.
export function aggregateRound(round, updates, { at = nowIso() } = {}) {
  if (round.status !== 'accepting_updates') {
    throw new Error(
      `round must be 'accepting_updates' to aggregate (currently '${round.status}').`
    );
  }
  const accepted = updates.filter((u) => u.accepted && u.roundId === round.roundId);
  if (accepted.length === 0) {
    throw new Error('no accepted updates to aggregate.');
  }
  const sortedHashes = accepted
    .map((u) => u.gradientHash)
    .sort();
  const aggregatedModelHash = sha256Hex(
    stableStringify({
      baselineModelHash: round.baselineModelHash,
      gradientHashes: sortedHashes,
      modelName: round.modelName
    })
  );
  return {
    ...round,
    status: 'completed',
    closedAt: at,
    aggregatedAt: at,
    aggregatedModelHash,
    updateCount: accepted.length
  };
}

export function describeRound(round) {
  return {
    roundId: round.roundId,
    status: round.status,
    modelName: round.modelName,
    createdBy: round.createdBy,
    baselineModelHash: round.baselineModelHash,
    maxParticipants: round.maxParticipants,
    updateCount: round.updateCount,
    maxEpsilon: round.maxEpsilon,
    epsilonSpent: round.epsilonSpent,
    payoutPaisePerUpdate: round.payoutPaisePerUpdate,
    deadlineAt: round.deadlineAt,
    aggregatedModelHash: round.aggregatedModelHash
  };
}
