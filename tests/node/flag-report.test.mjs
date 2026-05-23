import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publicIdentity } from '../../src/phase0/core.mjs';
import {
  createFlagReport,
  flagSummaryForSubject,
  resolveFlagReport,
  signFlagReport,
  verifyFlagReport,
  FLAG_CATEGORIES,
  FLAG_SEVERITIES
} from '../../src/phase1/flag-report.mjs';
import { evaluateDecision, createConsent } from '../../src/phase1/policy.mjs';

const LABOR_SCOPES = ['labor.match', 'worker.notify', 'upi.escrow'];

function laborRequest(actorId, overrides = {}) {
  return {
    actorId,
    actionType: 'labor_match_post',
    tool: 'upi_escrow',
    scopes: LABOR_SCOPES,
    regulated: true,
    piiHandling: 'tokenized',
    identity: { ageAttested: true, ageMinimum: 21 },
    labor: { days: 1, headcount: 1, wageFloorPerDay: 400, legalMinAge: 18 },
    money: { amount: 1000, currency: 'INR', limit: 1000, workerPays: false, escrow: true },
    ...overrides
  };
}

test('FLAG_CATEGORIES and FLAG_SEVERITIES expose the §9A harm vectors', () => {
  for (const required of ['advance_fee', 'wage_non_payment', 'exploitation', 'underage_worker']) {
    assert.ok(FLAG_CATEGORIES.includes(required), `missing category ${required}`);
  }
  assert.deepEqual(FLAG_SEVERITIES, ['low', 'medium', 'high']);
});

test('createFlagReport rejects self-reports and validates required fields', () => {
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  assert.throws(
    () => createFlagReport({ reporterId: a.id, subjectActorId: a.id, category: 'fraud', summary: 'self-report' }),
    /cannot be the same/
  );
  assert.throws(
    () => createFlagReport({ reporterId: a.id, subjectActorId: b.id, category: 'nope', summary: 'x' }),
    /category must be one of/
  );
  assert.throws(
    () => createFlagReport({ reporterId: a.id, subjectActorId: b.id, category: 'fraud' }),
    /summary is required/
  );
});

test('createFlagReport produces a deterministic canonical ID', () => {
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  const r = createFlagReport({
    reporterId: a.id,
    subjectActorId: b.id,
    category: 'advance_fee',
    summary: 'Asked me to pay ₹500 to register',
    reportedAt: '2026-05-23T10:00:00.000Z'
  });
  assert.match(r.flagId, /^bos:flag:/);
  assert.equal(r.status, 'pending');
  assert.deepEqual(r.signatures, []);
  assert.equal(r.summary, 'Asked me to pay ₹500 to register');
});

test('signFlagReport refuses any signer that is not the reporter', () => {
  const reporter = createIdentity({ displayName: 'Reporter' });
  const someoneElse = createIdentity({ displayName: 'Outsider' });
  const subject = createIdentity({ displayName: 'Subject' });
  const report = createFlagReport({
    reporterId: reporter.id,
    subjectActorId: subject.id,
    category: 'exploitation',
    severity: 'high',
    summary: 'Forced overtime, no pay'
  });
  assert.throws(() => signFlagReport(report, someoneElse), /signed by the reporter/);
});

test('signed flag verifies with the reporter public record', () => {
  const reporter = createIdentity({ displayName: 'Reporter' });
  const subject = createIdentity({ displayName: 'Subject' });
  const signed = signFlagReport(
    createFlagReport({
      reporterId: reporter.id,
      subjectActorId: subject.id,
      category: 'wage_non_payment',
      severity: 'high',
      summary: 'Wages still pending after 14 days'
    }),
    reporter
  );
  const result = verifyFlagReport(signed, publicIdentity(reporter));
  assert.equal(result.valid, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.idValid, true);
});

test('tampering with the summary after signing breaks verification', () => {
  const reporter = createIdentity({ displayName: 'Reporter' });
  const subject = createIdentity({ displayName: 'Subject' });
  const signed = signFlagReport(
    createFlagReport({
      reporterId: reporter.id,
      subjectActorId: subject.id,
      category: 'fraud',
      severity: 'medium',
      summary: 'Fake job listing'
    }),
    reporter
  );
  const tampered = { ...signed, summary: 'tampered text' };
  const result = verifyFlagReport(tampered, publicIdentity(reporter));
  assert.equal(result.valid, false);
  // ID derives from the canonical payload that includes summary,
  // so tampering invalidates both id and signature payload hash
  assert.equal(result.idValid, false);
});

test('resolveFlagReport requires status, reason, and resolvedBy', () => {
  const reporter = createIdentity({ displayName: 'Reporter' });
  const subject = createIdentity({ displayName: 'Subject' });
  const report = createFlagReport({
    reporterId: reporter.id,
    subjectActorId: subject.id,
    category: 'abuse',
    summary: 'Verbal abuse at worksite'
  });
  assert.throws(() => resolveFlagReport(report, { status: 'invalid', reason: 'x', resolvedBy: 'op' }), /resolution status must be/);
  assert.throws(() => resolveFlagReport(report, { status: 'resolved', resolvedBy: 'op' }), /reason is required/);
  assert.throws(() => resolveFlagReport(report, { status: 'resolved', reason: 'ok now' }), /resolvedBy is required/);

  const resolved = resolveFlagReport(report, {
    status: 'resolved',
    reason: 'NGO contacted contractor; wages released',
    resolvedBy: 'bos:operator:csc-001'
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.review.resolvedBy, 'bos:operator:csc-001');
});

test('flagSummaryForSubject counts open high/medium/low correctly', () => {
  const subject = createIdentity({ displayName: 'Subject' });
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  const c = createIdentity({ displayName: 'C' });

  const flags = [
    createFlagReport({ reporterId: a.id, subjectActorId: subject.id, category: 'advance_fee', severity: 'high', summary: '₹500 demanded' }),
    createFlagReport({ reporterId: b.id, subjectActorId: subject.id, category: 'wage_non_payment', severity: 'high', summary: 'No wages' }),
    createFlagReport({ reporterId: c.id, subjectActorId: subject.id, category: 'no_show', severity: 'low', summary: 'Did not show' })
  ];

  const summary = flagSummaryForSubject(subject.id, flags);
  assert.equal(summary.openHigh, 2);
  assert.equal(summary.openLow, 1);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.openCount, 3);

  // Resolve one — it should leave the open counts
  flags[0] = resolveFlagReport(flags[0], {
    status: 'resolved',
    reason: 'NGO mediation',
    resolvedBy: 'bos:operator:test'
  });
  const post = flagSummaryForSubject(subject.id, flags);
  assert.equal(post.openHigh, 1);
  assert.equal(post.resolvedCount, 1);
});

test('policy.report.flag_review_threshold blocks sensitive action when actor has 3+ open high flags', () => {
  const offender = createIdentity({ displayName: 'Repeat offender contractor' });
  const r1 = createIdentity({ displayName: 'Worker 1' });
  const r2 = createIdentity({ displayName: 'Worker 2' });
  const r3 = createIdentity({ displayName: 'Worker 3' });

  const flags = [
    createFlagReport({ reporterId: r1.id, subjectActorId: offender.id, category: 'advance_fee', severity: 'high', summary: 'Demanded ₹500 for the brick-kiln job' }),
    createFlagReport({ reporterId: r2.id, subjectActorId: offender.id, category: 'wage_non_payment', severity: 'high', summary: 'Wages overdue for 3 weeks' }),
    createFlagReport({ reporterId: r3.id, subjectActorId: offender.id, category: 'exploitation', severity: 'high', summary: 'Forced overtime without consent' })
  ];

  const consent = createConsent({
    subjectId: offender.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: LABOR_SCOPES,
    purpose: 'Brick-kiln hire'
  });

  const decision = evaluateDecision(laborRequest(offender.id), [consent], { flags });
  const flagCheck = decision.checks.find((check) => check.policyId === 'policy.report.flag_review_threshold');
  assert.equal(flagCheck.status, 'fail');
  assert.equal(flagCheck.openHigh, 3);
  assert.equal(decision.approved, false);
});

test('policy.report.flag_review_threshold passes when actor has fewer than 3 open high flags', () => {
  const actor = createIdentity({ displayName: 'Clean actor' });
  const reporter = createIdentity({ displayName: 'Reporter' });
  const flags = [
    createFlagReport({
      reporterId: reporter.id,
      subjectActorId: actor.id,
      category: 'no_show',
      severity: 'low',
      summary: 'Worker did not show up'
    })
  ];

  const consent = createConsent({
    subjectId: actor.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: LABOR_SCOPES,
    purpose: 'Hire'
  });

  const decision = evaluateDecision(laborRequest(actor.id), [consent], { flags });
  const flagCheck = decision.checks.find((check) => check.policyId === 'policy.report.flag_review_threshold');
  assert.equal(flagCheck.status, 'pass');
});

test('resolved high-severity flags no longer count toward the threshold', () => {
  const offender = createIdentity({ displayName: 'Reformed contractor' });
  const a = createIdentity({ displayName: 'A' });
  const b = createIdentity({ displayName: 'B' });
  const c = createIdentity({ displayName: 'C' });
  const flags = [
    createFlagReport({ reporterId: a.id, subjectActorId: offender.id, category: 'advance_fee', severity: 'high', summary: '₹500' }),
    createFlagReport({ reporterId: b.id, subjectActorId: offender.id, category: 'wage_non_payment', severity: 'high', summary: 'Late wages' }),
    createFlagReport({ reporterId: c.id, subjectActorId: offender.id, category: 'exploitation', severity: 'high', summary: 'Overtime' })
  ].map((flag) =>
    resolveFlagReport(flag, {
      status: 'resolved',
      reason: 'NGO mediation completed',
      resolvedBy: 'bos:operator:csc-001'
    })
  );

  const consent = createConsent({
    subjectId: offender.id,
    granteeId: 'bharat-os-orchestrator',
    scopes: LABOR_SCOPES,
    purpose: 'Hire after review'
  });
  const decision = evaluateDecision(laborRequest(offender.id), [consent], { flags });
  const flagCheck = decision.checks.find((check) => check.policyId === 'policy.report.flag_review_threshold');
  assert.equal(flagCheck.status, 'pass');
});
