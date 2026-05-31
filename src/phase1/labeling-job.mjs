// Phase 10.1 — Labeling marketplace: job spec + items + submissions.
//
// Reuses the Phase 9.1 sponsor model + escrow lifecycle. Sponsors
// create draft jobs, upload corpus items, launch (escrow locks at
// launch), and workers discover + submit labels. Server accepts +
// records mesh-contribution events with workload 'labeling'.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const LABELING_JOB_PROTOCOL_VERSION = 'bos.phase10.labeling-job.v0';

export const LABELING_TASK_KINDS = [
  'preference_pair',
  'classification',
  'span_annotation',
  'transcription',
  'safety_label'
];

export const LABELING_MODALITIES = ['text', 'voice', 'image'];

export const LABELING_JOB_STATUSES = [
  'draft',     // created; no items uploaded yet, escrow not locked
  'funded',    // items uploaded + escrow locked; not yet open to workers
  'active',    // workers can claim items and submit labels
  'paused',    // sponsor halted; existing items can still be reviewed
  'complete',  // every item has the required number of submissions
  'cancelled'  // sponsor / admin terminated; remaining escrow refundable
];

export const LABELING_SUBMISSION_STATUSES = [
  'accepted',
  'rejected',
  // Phase 10.4 — QC pipeline status variants. `rejected_golden_mismatch`
  // is server-imposed when a worker submits to a golden-set item with
  // the wrong answer; carries no mesh payout. `pending_sponsor_review`
  // marks a sample of accepted submissions for human review by the
  // sponsor; sponsor flips to `rejected_sponsor_review` (claws back
  // mesh credit + refunds escrow) or `accepted` on approve.
  'rejected_golden_mismatch',
  'pending_sponsor_review',
  'rejected_sponsor_review'
];

// Phase 10.4 — accepted-equivalent statuses (count toward job
// completion + worker score numerator). Kept as a Set so callers can
// `has()` cheaply.
export const ACCEPTED_SUBMISSION_STATUSES = new Set(['accepted']);
export const QC_REJECTED_STATUSES = new Set([
  'rejected_golden_mismatch',
  'rejected_sponsor_review'
]);

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertPositiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return n;
}

export function createLabelingJob({
  sponsorId,
  taskKind,
  language,
  modality = 'text',
  perLabelPaise,
  bharatOsFeePaise = 0,
  itemCount,
  ipTerms = 'non_exclusive',
  consentPurposeCode,
  description = null,
  deadlineSecondsFromNow = 30 * 24 * 60 * 60,
  // Phase 10.4 — QC pipeline config. All optional; defaults are
  // permissive in v1 so existing jobs continue working without
  // re-specifying QC params.
  //   qcGoldenItemRateBps: basis-points share of items the sponsor
  //     should mark as golden. 0 = no golden-set check. Default 0.
  //   qcMinWorkerScore: minimum worker score (0..1) the next-item
  //     dispatcher gates on. 0 = no gate. Workers with score >=
  //     this can claim from this job.
  //   qcSponsorReviewRateBps: basis-points share of accepted
  //     submissions to route to the sponsor for human review. 0 =
  //     no sampling. Default 0.
  qcGoldenItemRateBps = 0,
  qcMinWorkerScore = 0,
  qcSponsorReviewRateBps = 0,
  createdBy = sponsorId,
  createdAt = nowIso()
} = {}) {
  const sid = assertNonEmptyString(sponsorId, 'sponsorId', 160);
  if (!LABELING_TASK_KINDS.includes(taskKind)) {
    throw new Error(`taskKind must be one of: ${LABELING_TASK_KINDS.join(', ')}.`);
  }
  if (!LABELING_MODALITIES.includes(modality)) {
    throw new Error(`modality must be one of: ${LABELING_MODALITIES.join(', ')}.`);
  }
  const lang = assertNonEmptyString(language, 'language', 16);
  const perLabel = assertPositiveInteger(perLabelPaise, 'perLabelPaise');
  const fee = Math.max(0, Math.floor(Number(bharatOsFeePaise ?? 0)));
  const items = assertPositiveInteger(itemCount, 'itemCount');
  if (items > 1_000_000) {
    throw new Error('itemCount exceeds the 1M ceiling.');
  }
  const purpose = assertNonEmptyString(consentPurposeCode, 'consentPurposeCode', 120);
  const ip = ['non_exclusive', 'exclusive', 'cc_by_4_0'].includes(ipTerms) ? ipTerms : 'non_exclusive';
  const descTrim = description == null ? null : String(description).slice(0, 600);
  const deadlineAt = new Date(
    new Date(createdAt).getTime() + Number(deadlineSecondsFromNow) * 1000
  ).toISOString();
  // Clamp basis-points into [0, 10000].
  const goldenBps = Math.max(0, Math.min(10_000, Math.floor(Number(qcGoldenItemRateBps ?? 0))));
  const reviewBps = Math.max(0, Math.min(10_000, Math.floor(Number(qcSponsorReviewRateBps ?? 0))));
  // Worker-score gate is in [0, 1].
  const scoreGate = Math.max(0, Math.min(1, Number(qcMinWorkerScore ?? 0)));
  const core = {
    protocolVersion: LABELING_JOB_PROTOCOL_VERSION,
    objectType: 'labeling-job',
    sponsorId: sid,
    createdBy: String(createdBy).slice(0, 160),
    taskKind,
    language: lang,
    modality,
    perLabelPaise: perLabel,
    bharatOsFeePaise: fee,
    itemCount: items,
    ipTerms: ip,
    consentPurposeCode: purpose,
    description: descTrim,
    status: 'draft',
    createdAt,
    deadlineAt,
    launchedAt: null,
    completedAt: null,
    cancelledAt: null,
    submissionsAccepted: 0,
    submissionsRejected: 0,
    escrowLockedPaise: 0,
    escrowDebitedPaise: 0,
    itemsUploaded: 0,
    // Phase 10.4 — QC config snapshot. Locked-at-create; sponsor
    // can't change them mid-job without revoking + re-creating.
    qcGoldenItemRateBps: goldenBps,
    qcMinWorkerScore: scoreGate,
    qcSponsorReviewRateBps: reviewBps
  };
  return {
    jobId: idFrom('bos:labeling-job', { ...core, t: createdAt }),
    ...core
  };
}

// Per-item record. The body is the actual content the worker labels
// (a text snippet, a preference-pair {a, b}, etc.); kept opaque
// because each task kind shapes it differently.
export function createLabelingJobItem({
  jobId,
  taskKind,
  body,
  // For preference_pair / classification, the sponsor may declare
  // the correct answer ahead of time → golden_set item used for QC.
  // For v1 we accept but don't yet QC against it; tracked here so
  // Phase 10.4 can pick it up without re-uploading.
  goldenAnswer = null,
  uploadedAt = nowIso()
} = {}) {
  const jid = assertNonEmptyString(jobId, 'jobId', 160);
  if (!LABELING_TASK_KINDS.includes(taskKind)) {
    throw new Error(`taskKind must be one of: ${LABELING_TASK_KINDS.join(', ')}.`);
  }
  if (body == null) throw new Error('body is required.');
  const core = {
    protocolVersion: LABELING_JOB_PROTOCOL_VERSION,
    objectType: 'labeling-job-item',
    jobId: jid,
    taskKind,
    body,
    goldenAnswer,
    uploadedAt,
    submissionsCount: 0,
    consumed: false
  };
  return {
    itemId: idFrom('bos:labeling-item', { ...core, t: uploadedAt }),
    ...core
  };
}

export function createLabelingSubmission({
  jobId,
  itemId,
  workerId,
  taskKind,
  labelValue,
  submittedAt = nowIso(),
  // Accepted by default in v1. Phase 10.4 QC pipeline will downgrade
  // to 'rejected' for golden-set fails / sponsor sample rejections.
  status = 'accepted',
  rejectionReason = null
} = {}) {
  const jid = assertNonEmptyString(jobId, 'jobId', 160);
  const iid = assertNonEmptyString(itemId, 'itemId', 160);
  const wid = assertNonEmptyString(workerId, 'workerId', 160);
  if (!LABELING_TASK_KINDS.includes(taskKind)) {
    throw new Error(`taskKind must be one of: ${LABELING_TASK_KINDS.join(', ')}.`);
  }
  if (labelValue == null) throw new Error('labelValue is required.');
  if (!LABELING_SUBMISSION_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${LABELING_SUBMISSION_STATUSES.join(', ')}.`);
  }
  if (status === 'rejected' && !rejectionReason) {
    throw new Error('rejectionReason is required when status is rejected.');
  }
  const core = {
    protocolVersion: LABELING_JOB_PROTOCOL_VERSION,
    objectType: 'labeling-submission',
    jobId: jid,
    itemId: iid,
    workerId: wid,
    taskKind,
    labelValue,
    status,
    rejectionReason: rejectionReason == null ? null : String(rejectionReason).slice(0, 400),
    submittedAt
  };
  return {
    submissionId: idFrom('bos:labeling-sub', { ...core, t: submittedAt }),
    ...core
  };
}

// Used by the sponsor-side worker-eligibility filter. Worker can
// claim items from a job when:
//   - job.status === 'active'
//   - job.itemsUploaded > job.submissionsAccepted (still units to do)
//   - worker has not already submitted for this jobId × itemId
//
// FE uses this on the per-item discovery surface; server enforces
// the same on POST. Single-source-of-truth.
export function workerCanClaim(job, item, prevSubmissions) {
  if (!job || job.status !== 'active') return false;
  if (!item || item.consumed) return false;
  if (prevSubmissions && prevSubmissions.some((s) => s.itemId === item.itemId)) {
    return false;
  }
  return true;
}

// Cost-to-launch helper. itemCount × (perLabel + fee) is the total
// escrow that must be locked at launch. Matches the Phase 9.1
// sponsor escrow contract (sponsor must have available >= cost).
export function totalLaunchCostPaise(job) {
  return Number(job.itemCount) * (Number(job.perLabelPaise) + Number(job.bharatOsFeePaise));
}

// Phase 10.4 — worker score in [0, 1] from a list of submissions.
// Numerator = accepted submissions. Denominator = accepted +
// QC-rejected (golden_mismatch + sponsor_review). pending_sponsor_
// review submissions are NOT counted (they haven't been adjudicated
// yet). Workers with zero adjudicated submissions get score 1 (give
// new workers the benefit of the doubt; the score gate is intended
// for repeat offenders, not first-timers).
export function computeWorkerScore(submissions = []) {
  let accepted = 0;
  let rejected = 0;
  for (const sub of submissions) {
    if (sub.status === 'accepted') accepted += 1;
    else if (QC_REJECTED_STATUSES.has(sub.status)) rejected += 1;
  }
  const total = accepted + rejected;
  if (total === 0) return 1;
  return accepted / total;
}

// Whether a labelValue matches the goldenAnswer for a given task
// kind. We compare structurally — workers may submit additional
// metadata (`{choice: 'a', confidence: 0.8}`) but as long as the
// primary answer key matches we accept. Per task kind:
//   preference_pair: equal `choice`
//   classification: equal `value`
//   span_annotation: equal `wordIndices` array (sorted)
//   transcription: case-insensitive trimmed `transcript` equality
//   safety_label: equal set of `values`
//
// Returns null when the goldenAnswer doesn't exist OR the comparison
// is undefined for this task kind. Callers treat null as "no opinion."
export function matchesGoldenAnswer(taskKind, labelValue, goldenAnswer) {
  if (goldenAnswer == null) return null;
  if (taskKind === 'preference_pair') {
    return labelValue?.choice === goldenAnswer.choice;
  }
  if (taskKind === 'classification') {
    return labelValue?.value === goldenAnswer.value;
  }
  if (taskKind === 'span_annotation') {
    const a = Array.isArray(labelValue?.wordIndices)
      ? [...labelValue.wordIndices].sort((x, y) => x - y)
      : null;
    const b = Array.isArray(goldenAnswer?.wordIndices)
      ? [...goldenAnswer.wordIndices].sort((x, y) => x - y)
      : null;
    if (!a || !b) return null;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }
  if (taskKind === 'transcription') {
    const a = String(labelValue?.transcript ?? '').trim().toLowerCase();
    const b = String(goldenAnswer?.transcript ?? '').trim().toLowerCase();
    if (!a || !b) return null;
    return a === b;
  }
  if (taskKind === 'safety_label') {
    const a = new Set(Array.isArray(labelValue?.values) ? labelValue.values : []);
    const b = new Set(Array.isArray(goldenAnswer?.values) ? goldenAnswer.values : []);
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  return null;
}

// Deterministic sampling: hash(submissionId) modulo 10_000 < rateBps.
// Means a sponsor's reviewRate of 500 bps (5%) catches roughly 5% of
// accepted submissions, but a re-run on the same submission always
// produces the same verdict (idempotent). Caller passes the
// submissionId after creation so the same submission isn't sampled
// twice with a different decision.
export function shouldSampleForReview(submissionId, rateBps) {
  if (!rateBps || rateBps <= 0) return false;
  if (!submissionId) return false;
  // 32-bit FNV-1a hash of submissionId (no crypto needed; just need
  // a deterministic 0..2^32 spread).
  let h = 2166136261;
  for (let i = 0; i < submissionId.length; i += 1) {
    h ^= submissionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Unsigned 32-bit modulo 10_000.
  return (h >>> 0) % 10_000 < rateBps;
}
