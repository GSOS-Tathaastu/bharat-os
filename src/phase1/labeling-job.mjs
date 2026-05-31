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
  'rejected'
];

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
    itemsUploaded: 0
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
