// §9A safeguard escalation — flag reports.
//
// A flag is a signed report by a reporter against a subject (the actor being
// reported). It captures who reported whom, the category, severity, optional
// free-text note, and a job/booking reference. The reporter signs the
// canonical payload with their local identity key; the policy engine reads
// pending high-severity flags to rate-limit or block repeat offenders before
// a human review resolves them.
//
// Phase 2a.9 (ADR 0058) is the protocol + signing primitives. The L4 policy
// rule that consumes these flags lives in src/phase1/policy.mjs; the API
// routes and shell button live in src/phase0/api.mjs and public/shell/.

import {
  sha256Hex,
  signText,
  stableStringify,
  verifySignature
} from '../phase0/core.mjs';

export const FLAG_REPORT_PROTOCOL_VERSION = 'bos.phase2a.flag-report.v0';

// §9A enumerates the harm vectors the system must protect against. The
// category set mirrors that list. Free-text note is allowed for everything
// outside the structured categories.
export const FLAG_CATEGORIES = [
  'advance_fee',          // worker was asked to pay to access work
  'wage_non_payment',     // wage not released after work completed
  'unsafe_conditions',    // dangerous worksite
  'underage_worker',      // child labour suspected
  'no_show',              // worker or counterparty did not show up
  'fraud',                // impersonation / fake job post / data harvesting
  'exploitation',         // bonded labour, trafficking, abuse
  'abuse',                // verbal / physical abuse
  'other'
];

// Severity drives the policy threshold. high-severity flags count toward
// the auto-block; medium and low accumulate for human review only.
export const FLAG_SEVERITIES = ['low', 'medium', 'high'];

// Status lifecycle. A flag starts pending, goes under_review when an
// operator picks it up, and ends as resolved or dismissed with a reason.
export const FLAG_STATUSES = ['pending', 'under_review', 'resolved', 'dismissed'];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function canonicalFlagReportPayload(report) {
  return {
    protocolVersion: report.protocolVersion,
    objectType: report.objectType,
    reporterId: report.reporterId,
    subjectActorId: report.subjectActorId,
    category: report.category,
    severity: report.severity,
    jobReference: report.jobReference ?? null,
    summary: report.summary,
    reportedAt: report.reportedAt
  };
}

export function createFlagReport({
  reporterId,
  subjectActorId,
  category,
  severity = 'medium',
  jobReference,
  summary,
  reportedAt = nowIso()
}) {
  if (!reporterId) throw new Error('reporterId is required.');
  if (!subjectActorId) throw new Error('subjectActorId is required.');
  if (reporterId === subjectActorId) {
    throw new Error('reporterId and subjectActorId cannot be the same identity.');
  }
  if (!FLAG_CATEGORIES.includes(category)) {
    throw new Error(`category must be one of: ${FLAG_CATEGORIES.join(', ')}`);
  }
  if (!FLAG_SEVERITIES.includes(severity)) {
    throw new Error(`severity must be one of: ${FLAG_SEVERITIES.join(', ')}`);
  }
  if (!summary || String(summary).trim().length < 4) {
    throw new Error('summary is required and must be at least 4 characters.');
  }

  const core = {
    protocolVersion: FLAG_REPORT_PROTOCOL_VERSION,
    objectType: 'flag-report',
    reporterId,
    subjectActorId,
    category,
    severity,
    jobReference: jobReference ?? null,
    summary: String(summary).trim().slice(0, 280),
    reportedAt
  };

  return {
    flagId: idFrom('bos:flag', core),
    status: 'pending',
    signatures: [],
    review: null,
    ...core
  };
}

export function signFlagReport(report, signerIdentity, { at = nowIso() } = {}) {
  if (!signerIdentity?.id) throw new Error('signerIdentity is required.');
  if (signerIdentity.id !== report.reporterId) {
    throw new Error('Flag report must be signed by the reporter identity itself.');
  }

  const payload = canonicalFlagReportPayload(report);
  const payloadText = stableStringify(payload);
  const signature = signText(signerIdentity, payloadText);
  const signatureRecord = {
    protocolVersion: FLAG_REPORT_PROTOCOL_VERSION,
    role: 'reporter',
    signerId: signerIdentity.id,
    signedAt: at,
    payloadHash: sha256Hex(payloadText),
    signature
  };

  return {
    ...report,
    signatures: [...(report.signatures ?? []), signatureRecord]
  };
}

export function verifyFlagReport(report, publicRecord) {
  const reasons = [];
  if (!report || report.objectType !== 'flag-report') {
    return {
      artifactType: 'flag-report',
      valid: false,
      signatureValid: false,
      reasons: ['invalid or missing flag report']
    };
  }

  const payload = canonicalFlagReportPayload(report);
  const payloadText = stableStringify(payload);
  const payloadHash = sha256Hex(payloadText);
  const expectedId = idFrom('bos:flag', payload);
  const idValid = report.flagId === expectedId;
  if (!idValid) reasons.push('flag id does not match canonical payload');

  const reporterSig = (report.signatures ?? []).find(
    (sig) => sig.role === 'reporter' && sig.signerId === report.reporterId
  );

  let signatureValid = false;
  if (!reporterSig) {
    reasons.push('reporter signature missing');
  } else if (reporterSig.payloadHash !== payloadHash) {
    reasons.push('reporter signature payload hash mismatch');
  } else if (!publicRecord) {
    reasons.push('reporter public record unavailable');
  } else if (publicRecord.id !== report.reporterId) {
    reasons.push('reporter public record does not match reporterId');
  } else {
    signatureValid = verifySignature(publicRecord, payloadText, reporterSig.signature);
    if (!signatureValid) reasons.push('reporter signature does not verify');
  }

  return {
    artifactType: 'flag-report',
    valid: reasons.length === 0 && signatureValid,
    idValid,
    signatureValid,
    expectedId,
    actualId: report.flagId,
    reasons
  };
}

export function resolveFlagReport(report, { status, reason, resolvedBy, at = nowIso() }) {
  if (!['resolved', 'dismissed', 'under_review'].includes(status)) {
    throw new Error('resolution status must be resolved, dismissed, or under_review.');
  }
  if (!resolvedBy) throw new Error('resolvedBy is required.');
  if (!reason || String(reason).trim().length < 3) {
    throw new Error('resolution reason is required.');
  }
  return {
    ...report,
    status,
    review: {
      status,
      resolvedBy,
      reason: String(reason).trim().slice(0, 280),
      resolvedAt: at
    }
  };
}

// Aggregate the actor's open high-severity flag count. This is the signal
// the L4 policy uses to block repeat offenders before a human review picks
// up the queue. The threshold itself lives in the policy rule.
export function flagSummaryForSubject(subjectActorId, flags = []) {
  const subjectFlags = flags.filter((flag) => flag.subjectActorId === subjectActorId);
  const pending = subjectFlags.filter((flag) => flag.status === 'pending');
  const underReview = subjectFlags.filter((flag) => flag.status === 'under_review');
  const open = [...pending, ...underReview];

  const openHigh = open.filter((flag) => flag.severity === 'high').length;
  const openMedium = open.filter((flag) => flag.severity === 'medium').length;
  const openLow = open.filter((flag) => flag.severity === 'low').length;

  return {
    subjectActorId,
    totalCount: subjectFlags.length,
    openCount: open.length,
    openHigh,
    openMedium,
    openLow,
    resolvedCount: subjectFlags.filter((flag) => flag.status === 'resolved').length,
    dismissedCount: subjectFlags.filter((flag) => flag.status === 'dismissed').length
  };
}
