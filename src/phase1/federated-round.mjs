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
import { assertWithinBudget, DEFAULT_FEDERATED_BUDGET } from './privacy-budget.mjs';

export const FEDERATED_ROUND_PROTOCOL_VERSION = 'bos.phase1.federated-round.v0';

export const FEDERATED_ROUND_WORKLOAD = 'federated_round';

// A round-scoped donation consent must use this exact purpose tag.
// `submitGradientUpdate` checks for it; general workflow consents
// (purpose: 'tenant_verification' etc.) are *not* enough.
export const DONATION_CONSENT_PURPOSE = 'federated_donation';
export const DONATION_CONSENT_SCOPES = ['training.donate', 'consent.record'];

// §7f Phase 3.2 — stricter consent purpose for rounds that ship the
// actual noisy gradient bytes (not just the hash). The contributor
// is donating the gradient vector itself, which weakens §15
// pointer-not-payload in exchange for the server being able to
// FedAvg. The shell must collect a separate explicit consent for
// this purpose; a general `federated_donation` consent is NOT
// enough.
export const BYTES_DONATION_CONSENT_PURPOSE = 'federated_bytes_donation';
export const BYTES_DONATION_CONSENT_SCOPES = [
  'training.donate',
  'training.donate_bytes',
  'consent.record'
];

// Aggregation modes per round.
//   • 'hash_combiner' — Phase 3.0 default. Server sees only the
//     gradient hash; aggregation hashes the sorted hashes (no
//     averaging possible). Strongest §15 binding.
//   • 'fedavg' — Phase 3.2. Server sees the noisy gradient bytes
//     and averages them element-wise. Requires the
//     `BYTES_DONATION_CONSENT_PURPOSE` consent.
export const FEDERATED_AGGREGATION_MODES = ['hash_combiner', 'fedavg'];

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
  aggregationMode = 'hash_combiner',
  contributorBudget = DEFAULT_FEDERATED_BUDGET,
  // Phase 9.0d — optional SLM round target. When set, the round is
  // a fine-tuning task for a specific Tier-4 SLM pack (Phase 9.0a
  // registry id). Workers participating in the round MUST have the
  // pack installed (Phase 9.0b record) before they can submit a
  // gradient update. `targetTask` is a free-form label the round
  // creator uses to name what the fine-tuning is optimising for
  // (e.g. "indic-intent-v1", "kirana-tone-v2"). `loraConfig` is
  // an opaque JSON the worker passes to runtime.computeGradients().
  slmModelPackId = null,
  targetTask = null,
  loraConfig = null,
  // Phase 9.1 — optional sponsor reference + per-round escrow lock.
  // When `sponsorId` is set, the round is sponsor-funded; the
  // route handler at /api/sponsors/:id/federated-rounds verifies
  // the bearer token + locks the sponsor's escrow before calling
  // this. `escrowLockedPaise` should equal
  // `maxParticipants * payoutPaisePerUpdate` so the round can pay
  // every accepted update without overrunning the lock.
  sponsorId = null,
  escrowLockedPaise = 0,
  at = nowIso()
} = {}) {
  if (!createdBy) throw new Error('createdBy identity ID is required.');
  if (!modelName) throw new Error('modelName is required.');
  if (!baselineModelHash) throw new Error('baselineModelHash is required.');
  if (!FEDERATED_AGGREGATION_MODES.includes(aggregationMode)) {
    throw new Error(
      `aggregationMode must be one of: ${FEDERATED_AGGREGATION_MODES.join(', ')}`
    );
  }
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
    aggregationMode,
    contributorBudget: {
      windowHours: Math.max(1, Number(contributorBudget?.windowHours ?? DEFAULT_FEDERATED_BUDGET.windowHours)),
      epsilonCap: validateEpsilon(contributorBudget?.epsilonCap ?? DEFAULT_FEDERATED_BUDGET.epsilonCap)
    },
    // Phase 9.0d — SLM round target, all null for legacy classifier
    // rounds. When non-null the round is a Tier-4 SLM fine-tune.
    slmModelPackId: slmModelPackId == null ? null : String(slmModelPackId).slice(0, 160),
    targetTask: targetTask == null ? null : String(targetTask).slice(0, 80),
    loraConfig: loraConfig == null ? null : loraConfig,
    // Phase 9.1 — sponsor reference + locked escrow snapshot. Null
    // sponsorId = unsponsored (legacy / demo) round.
    sponsorId: sponsorId == null ? null : String(sponsorId).slice(0, 160),
    escrowLockedPaise: Math.max(0, Math.floor(Number(escrowLockedPaise ?? 0))),
    escrowDebitedPaise: 0,
    createdAt: at,
    deadlineAt,
    openedAt: null,
    closedAt: null,
    aggregatedAt: null,
    aggregatedModelHash: null,
    aggregatedGradientBytesBase64: null,
    aggregatedGradientLength: null,
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
// after one round of on-device training. For `hash_combiner` rounds
// only the hash + DP epsilon + signature reach the control plane.
// For `fedavg` rounds the noisy gradient bytes (`gradientBytesBase64`)
// also travel, gated by a stricter consent purpose.
export function createGradientUpdate({
  roundId,
  contributorId,
  baselineModelHash,
  gradientHash,
  gradientBytesBase64 = null,
  gradientLength = null,
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
    gradientBytesBase64: gradientBytesBase64 ?? null,
    gradientLength: gradientLength ?? null,
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

function canonicalUpdatePayload(update) {
  return {
    protocolVersion: update.protocolVersion,
    objectType: update.objectType,
    roundId: update.roundId,
    contributorId: update.contributorId,
    baselineModelHash: update.baselineModelHash,
    gradientHash: update.gradientHash,
    // gradientBytesBase64 is intentionally NOT in the signed
    // payload: bytes are validated by the hash they SHA-256 to,
    // which is in the payload. Signing the hash transitively signs
    // the bytes without bloating the signed text on hash-only
    // rounds.
    gradientLength: update.gradientLength,
    differentialPrivacyEpsilon: update.differentialPrivacyEpsilon,
    sampleCount: update.sampleCount,
    submittedAt: update.submittedAt
  };
}

export function signGradientUpdate(update, contributorIdentity) {
  if (!contributorIdentity?.id) {
    throw new Error('contributorIdentity is required.');
  }
  if (contributorIdentity.id !== update.contributorId) {
    throw new Error('contributorIdentity must match the update contributorId.');
  }
  const payloadText = stableStringify(canonicalUpdatePayload(update));
  const signature = signText(contributorIdentity, payloadText);
  return { ...update, signature };
}

function verifyUpdateSignature(update, publicRecords) {
  if (!update.signature) return false;
  const subject = publicRecords.find(
    (record) => record.id === update.contributorId
  );
  if (!subject) return false;
  const payloadText = stableStringify(canonicalUpdatePayload(update));
  return verifySignature(subject, payloadText, update.signature);
}

function hasMatchingConsent(consents, { contributorId, roundId, purpose, requiredScopes, at = nowIso() }) {
  const nowMs = new Date(at).getTime();
  return consents.some((consent) => {
    if (consent.subjectId !== contributorId) return false;
    if (consent.purpose !== purpose) return false;
    if (!Array.isArray(consent.scopes)) return false;
    const hasScopes = requiredScopes.every((scope) =>
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

function hasDonationConsent(consents, { contributorId, roundId, at = nowIso() }) {
  return hasMatchingConsent(consents, {
    contributorId,
    roundId,
    purpose: DONATION_CONSENT_PURPOSE,
    requiredScopes: DONATION_CONSENT_SCOPES,
    at
  });
}

function hasBytesDonationConsent(consents, { contributorId, roundId, at = nowIso() }) {
  return hasMatchingConsent(consents, {
    contributorId,
    roundId,
    purpose: BYTES_DONATION_CONSENT_PURPOSE,
    requiredScopes: BYTES_DONATION_CONSENT_SCOPES,
    at
  });
}

// Submit a signed update against an open round, with the appropriate
// donation consent for the contributor. Phase 3.2 adds two more
// gates on top of the Phase 3.0 set:
//
//   • For `fedavg` rounds, the update MUST carry
//     `gradientBytesBase64` AND the contributor must hold a
//     `federated_bytes_donation` consent. A `federated_donation`
//     consent alone is NOT sufficient.
//   • The contributor's cumulative ε spend across recent updates
//     (default: 30-day rolling window) must not exceed the round's
//     `contributorBudget.epsilonCap`. Pass `allUpdates` so the
//     accountant can read the history; if omitted, only the current
//     round's updates are considered.
//
// Returns `{ round, update }` with the round's running totals
// updated and the update's `accepted` / `payoutPaise` set. Throws on
// any policy violation.
export function submitGradientUpdate({
  round,
  update,
  consents = [],
  publicRecords = [],
  allUpdates = null,
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

  const mode = round.aggregationMode ?? 'hash_combiner';
  if (mode === 'fedavg') {
    if (!update.gradientBytesBase64) {
      throw new Error(
        `'fedavg' rounds require update.gradientBytesBase64 (the noisy gradient vector).`
      );
    }
    if (
      !hasBytesDonationConsent(consents, {
        contributorId: update.contributorId,
        roundId: round.roundId,
        at
      })
    ) {
      throw new Error(
        `'fedavg' rounds require a 'federated_bytes_donation' consent for contributor ${update.contributorId} on round ${round.roundId}.`
      );
    }
  } else {
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
  }

  // §7f Phase 3.2 — cumulative privacy budget check across recent
  // updates. If the caller didn't pass `allUpdates` (legacy
  // callers), the budget check is skipped — the per-round cap
  // (round.maxEpsilon) still applies.
  if (allUpdates) {
    assertWithinBudget(
      update.contributorId,
      allUpdates,
      update.differentialPrivacyEpsilon,
      {
        windowHours: round.contributorBudget?.windowHours,
        epsilonCap: round.contributorBudget?.epsilonCap,
        at
      }
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

// Aggregate a `hash_combiner` round: deterministic hash of the
// sorted gradient hashes. The aggregated artifact is opaque —
// useful as a provenance record but not as a trainable signal.
// Phase 3.2 keeps this for backward compatibility; new rounds that
// want a real averaged model use `aggregateRoundFedAvg`.
export function aggregateRound(round, updates, { at = nowIso() } = {}) {
  if (round.status !== 'accepting_updates') {
    throw new Error(
      `round must be 'accepting_updates' to aggregate (currently '${round.status}').`
    );
  }
  const mode = round.aggregationMode ?? 'hash_combiner';
  if (mode === 'fedavg') {
    return aggregateRoundFedAvg(round, updates, { at });
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
      modelName: round.modelName,
      aggregationMode: 'hash_combiner'
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

function base64ToFloat32(base64) {
  const source = typeof Buffer !== 'undefined'
    ? Buffer.from(base64, 'base64')
    : (() => {
        const bin = atob(base64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
        return u8;
      })();
  // Node Buffer.slice() returns a VIEW (not a copy) on the shared
  // 8KB pool, so we can't use it here. Copy bytes into a fresh
  // ArrayBuffer of the exact required size, then create the
  // Float32Array view.
  if (source.byteLength % 4 !== 0) {
    throw new Error('gradient bytes length is not a multiple of 4 (float32).');
  }
  const aligned = new ArrayBuffer(source.byteLength);
  new Uint8Array(aligned).set(source);
  return new Float32Array(aligned);
}

function float32ToBase64(floatArray) {
  const u8 = new Uint8Array(
    floatArray.buffer,
    floatArray.byteOffset,
    floatArray.byteLength
  );
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  let binary = '';
  for (const byte of u8) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Aggregate a `fedavg` round: element-wise mean of the noisy
// gradient vectors. Returns the aggregated bytes (so a researcher
// can update the baseline model with them) plus the SHA-256 hash of
// the aggregated bytes as the `aggregatedModelHash`. Throws if any
// accepted update is missing bytes or has a mismatched length.
export function aggregateRoundFedAvg(round, updates, { at = nowIso() } = {}) {
  if (round.status !== 'accepting_updates') {
    throw new Error(
      `round must be 'accepting_updates' to aggregate (currently '${round.status}').`
    );
  }
  if (round.aggregationMode !== 'fedavg') {
    throw new Error(
      `aggregateRoundFedAvg requires aggregationMode === 'fedavg' (got '${round.aggregationMode}').`
    );
  }
  const accepted = updates.filter(
    (u) => u.accepted && u.roundId === round.roundId
  );
  if (accepted.length === 0) {
    throw new Error('no accepted updates to aggregate.');
  }
  // All updates must carry gradient bytes of the same length.
  const decoded = accepted.map((u) => {
    if (!u.gradientBytesBase64) {
      throw new Error(`update ${u.updateId} has no gradientBytesBase64.`);
    }
    return base64ToFloat32(u.gradientBytesBase64);
  });
  const dim = decoded[0].length;
  for (const vec of decoded) {
    if (vec.length !== dim) {
      throw new Error(
        `gradient length mismatch: expected ${dim}, got ${vec.length}.`
      );
    }
  }
  // Element-wise mean.
  const sum = new Float32Array(dim);
  for (const vec of decoded) {
    for (let i = 0; i < dim; i += 1) sum[i] += vec[i];
  }
  const averaged = new Float32Array(dim);
  for (let i = 0; i < dim; i += 1) averaged[i] = sum[i] / decoded.length;
  const aggregatedGradientBytesBase64 = float32ToBase64(averaged);
  // The aggregated model hash is the SHA-256 of the averaged bytes
  // — verifier-checkable, deterministic, and the actual artifact a
  // researcher needs to update the baseline.
  const u8 = new Uint8Array(
    averaged.buffer,
    averaged.byteOffset,
    averaged.byteLength
  );
  const aggregatedModelHash = sha256Hex(Buffer.from(u8).toString('hex'));
  return {
    ...round,
    status: 'completed',
    closedAt: at,
    aggregatedAt: at,
    aggregatedModelHash: `sha256:${aggregatedModelHash}`,
    aggregatedGradientBytesBase64,
    aggregatedGradientLength: dim,
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
    aggregationMode: round.aggregationMode ?? 'hash_combiner',
    contributorBudget: round.contributorBudget ?? null,
    deadlineAt: round.deadlineAt,
    aggregatedModelHash: round.aggregatedModelHash,
    aggregatedGradientLength: round.aggregatedGradientLength ?? null,
    // Phase 9.0d — SLM round target. Surface to the FE so workers
    // can tell which rounds are SLM-fine-tunes vs legacy classifier
    // rounds + filter to packs they have installed.
    slmModelPackId: round.slmModelPackId ?? null,
    targetTask: round.targetTask ?? null,
    loraConfig: round.loraConfig ?? null,
    // Phase 9.1 — sponsor reference + escrow snapshot. The FE renders
    // a "Sponsored by X · ₹Y remaining" badge for these rounds.
    sponsorId: round.sponsorId ?? null,
    escrowLockedPaise: round.escrowLockedPaise ?? 0,
    escrowDebitedPaise: round.escrowDebitedPaise ?? 0
  };
}
