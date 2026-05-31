// Phase 10.5 — Signed labeling-job audit export.
//
// What this is. A canonical, signed NDJSON bundle of every accepted
// submission on a labeling job, intended for the sponsor's external
// audit pipeline. The sponsor's downstream training stack can pull
// this file, verify the signature against the Bharat OS audit-signer
// public key, and have a tamper-evident record of what they paid for.
//
// What this is NOT. This is not a raw submissions dump — it strips
// worker identity (rotates an identityHash per (job, worker)) and
// it does not carry rejected_golden_mismatch or pending_sponsor_
// review rows. Pending rows are excluded because their final
// verdict isn't yet known; if the sponsor wants to track them they
// use the review-list endpoint (Phase 10.4).
//
// §15 bindings the bundle shape enforces:
//
//   • Pointer-not-payload. The per-submission line carries the
//     submissionId + the labelValue + the submittedAt; not the
//     worker's identity, phone number, or device.
//   • Cross-job correlation prevented. identityHash =
//     sha256(jobId::workerId) rotates per (job, worker) — the same
//     worker on a different job hashes to a different value.
//     Same scheme as Phase 9.1 federated-round export and the
//     Phase 10.4 sponsor review-list endpoint.
//   • Tamper-evident. A trailer line carries the SHA-256 of the
//     concatenation of all preceding lines + an Ed25519 signature
//     over that hash from the audit-signer identity. Mutating any
//     line breaks verification.
//   • Server-anchored audit. The export endpoint emits a
//     `labeling_export.signed` ledger event with the same content
//     SHA-256, so a sponsor cannot quietly downgrade a verified
//     bundle to a tampered one and claim it was the original.
//
// Bundle layout (NDJSON — one JSON object per line, '\n' separated):
//
//   {type: 'header', protocolVersion, jobId, sponsorId, taskKind,
//    language, modality, perLabelPaise, ipTerms, consentPurposeCode,
//    submissionCount, exportedAt, signerId}
//   {type: 'submission', submissionId, jobId, sponsorId, itemId,
//    taskKind, labelValue, status, submittedAt, identityHash,
//    payoutPaise}
//   ...
//   {type: 'trailer', contentSha256, signature: {algorithm,
//    signerId, signatureBase64}}
//
// The content SHA-256 is computed over the UTF-8 bytes of
// `header_line + '\n' + sub1_line + '\n' + ... + subN_line + '\n'`
// — i.e. everything that comes BEFORE the trailer. Adding a final
// '\n' is mandatory (NDJSON convention).
//
// Verification:
//
//   1. Recompute SHA-256 over the body lines (everything before the
//      trailer + the final '\n').
//   2. Confirm trailer.contentSha256 matches the recomputed hash.
//   3. Verify the Ed25519 signature against the audit-signer's
//      public key (fetched from `GET /api/audit-signer/public-key`).
//
// `verifyLabelingExportLines` does all three in one call.

import { sha256Hex, signText, stableStringify, verifySignature } from '../phase0/core.mjs';
import { ACCEPTED_SUBMISSION_STATUSES } from './labeling-job.mjs';

export const LABELING_EXPORT_PROTOCOL_VERSION = 'bos.phase10.labeling-export.v0';

function nowIso() {
  return new Date().toISOString();
}

// Compute the rotating identityHash for (job, worker). Same scheme
// as the Phase 10.4 sponsor-review list and the Phase 9.1
// federated-round export. The hash is prefixed with 'sha256:' for
// algorithmic agility on the receiving side.
export function identityHashFor(jobId, workerId) {
  return 'sha256:' + sha256Hex(`${String(jobId)}::${String(workerId)}`);
}

// Body builder used by both the live export endpoint and the test
// suite. Pure: same inputs → same lines. Caller is responsible for
// filtering submissions to the job — this function does not
// re-filter by jobId.
//
// `submissions` should ALREADY be the set the sponsor is entitled to
// see: accepted (or accepted-equivalent), one per (job, worker, item)
// triple. `perLabelPaise` is read off the job snapshot — we re-record
// it on every submission line so the bundle is self-contained for
// audit even if the job is later renamed or relaunched.
export function buildLabelingExportLines({
  job,
  submissions,
  signerIdentity,
  exportedAt = nowIso()
} = {}) {
  if (!job || typeof job !== 'object') {
    throw new Error('job is required.');
  }
  if (!Array.isArray(submissions)) {
    throw new Error('submissions must be an array.');
  }
  if (!signerIdentity || typeof signerIdentity !== 'object') {
    throw new Error('signerIdentity is required.');
  }
  if (!signerIdentity.privateKeyPem) {
    throw new Error('signerIdentity.privateKeyPem is required.');
  }

  const accepted = submissions.filter(
    (sub) => sub && ACCEPTED_SUBMISSION_STATUSES.has(sub.status)
  );

  const headerObj = {
    type: 'header',
    protocolVersion: LABELING_EXPORT_PROTOCOL_VERSION,
    jobId: job.jobId,
    sponsorId: job.sponsorId,
    taskKind: job.taskKind,
    language: job.language,
    modality: job.modality,
    perLabelPaise: Number(job.perLabelPaise),
    ipTerms: job.ipTerms,
    consentPurposeCode: job.consentPurposeCode,
    submissionCount: accepted.length,
    exportedAt,
    signerId: signerIdentity.id
  };
  const headerLine = stableStringify(headerObj);

  const submissionLines = accepted.map((sub) => {
    const subObj = {
      type: 'submission',
      submissionId: sub.submissionId,
      jobId: job.jobId,
      sponsorId: job.sponsorId,
      itemId: sub.itemId,
      taskKind: sub.taskKind,
      labelValue: sub.labelValue,
      status: sub.status,
      submittedAt: sub.submittedAt,
      identityHash: identityHashFor(job.jobId, sub.workerId),
      payoutPaise: Number(job.perLabelPaise)
    };
    return stableStringify(subObj);
  });

  const bodyLines = [headerLine, ...submissionLines];
  const bodyText = bodyLines.join('\n') + '\n';
  const contentSha256 = sha256Hex(bodyText);
  const signature = signText(signerIdentity, contentSha256);

  const trailerLine = stableStringify({
    type: 'trailer',
    contentSha256,
    signature
  });

  return [...bodyLines, trailerLine];
}

// Returns the NDJSON body (string) for the given lines. Final
// newline included — NDJSON convention.
export function bundleNdjson(lines) {
  return lines.join('\n') + '\n';
}

// Verify a previously-emitted bundle. Returns
// {ok, reason?, contentSha256?, submissionCount?}.
//
// `signerPublicRecord` should be the audit signer's public record
// ({id, publicKeyPem, ...}) as returned by
// `GET /api/audit-signer/public-key`. The verifier:
//
//   1. Confirms the last line is a trailer.
//   2. Confirms the trailer's contentSha256 equals the hash of the
//      preceding-lines body (joined with '\n' + trailing '\n').
//   3. Confirms the Ed25519 signature is valid against the
//      audit-signer public record and the contentSha256.
//   4. Optionally cross-checks signerId fields agree.
export function verifyLabelingExportLines(lines, signerPublicRecord) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { ok: false, reason: 'too_few_lines' };
  }
  if (!signerPublicRecord || !signerPublicRecord.publicKeyPem) {
    return { ok: false, reason: 'missing_signer_public_key' };
  }

  let trailer;
  try {
    trailer = JSON.parse(lines[lines.length - 1]);
  } catch (error) {
    return { ok: false, reason: 'trailer_not_json' };
  }
  if (!trailer || trailer.type !== 'trailer') {
    return { ok: false, reason: 'missing_trailer' };
  }
  if (typeof trailer.contentSha256 !== 'string' || !trailer.signature) {
    return { ok: false, reason: 'malformed_trailer' };
  }

  const bodyLines = lines.slice(0, -1);
  const bodyText = bodyLines.join('\n') + '\n';
  const recomputed = sha256Hex(bodyText);
  if (recomputed !== trailer.contentSha256) {
    return { ok: false, reason: 'content_hash_mismatch', contentSha256: recomputed };
  }

  let header;
  try {
    header = JSON.parse(bodyLines[0]);
  } catch (error) {
    return { ok: false, reason: 'header_not_json' };
  }
  if (!header || header.type !== 'header') {
    return { ok: false, reason: 'missing_header' };
  }
  if (header.signerId && header.signerId !== signerPublicRecord.id) {
    return { ok: false, reason: 'header_signer_mismatch' };
  }
  if (
    trailer.signature.signerId &&
    trailer.signature.signerId !== signerPublicRecord.id
  ) {
    return { ok: false, reason: 'trailer_signer_mismatch' };
  }

  const sigOk = verifySignature(
    signerPublicRecord,
    trailer.contentSha256,
    trailer.signature
  );
  if (!sigOk) {
    return { ok: false, reason: 'signature_invalid' };
  }

  const submissionCount = bodyLines.length - 1;
  return { ok: true, contentSha256: recomputed, submissionCount };
}
