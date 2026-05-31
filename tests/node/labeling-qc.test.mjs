// Phase 10.4 — QC pipeline tests: golden-set match, worker score
// gate, sponsor review sampling + reject + clawback.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  computeWorkerScore,
  matchesGoldenAnswer,
  shouldSampleForReview,
  createLabelingJob,
  createLabelingJobItem,
  createLabelingSubmission
} from '../../src/phase1/labeling-job.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'labeling-qc-tests');

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

// ─── Pure helpers ───────────────────────────────────────────────────

test('computeWorkerScore returns 1 for a fresh worker (no submissions)', () => {
  assert.equal(computeWorkerScore([]), 1);
});

test('computeWorkerScore = accepted / (accepted + qc-rejected)', () => {
  const subs = [
    { status: 'accepted' },
    { status: 'accepted' },
    { status: 'accepted' },
    { status: 'rejected_golden_mismatch' },
    { status: 'pending_sponsor_review' }, // not adjudicated yet → ignored
    { status: 'rejected_sponsor_review' }
  ];
  // 3 accepted / 5 adjudicated = 0.6
  assert.equal(computeWorkerScore(subs), 3 / 5);
});

test('matchesGoldenAnswer returns null when no golden answer present', () => {
  assert.equal(matchesGoldenAnswer('preference_pair', { choice: 'a' }, null), null);
});

test('matchesGoldenAnswer compares preference_pair choice', () => {
  assert.equal(matchesGoldenAnswer('preference_pair', { choice: 'a' }, { choice: 'a' }), true);
  assert.equal(matchesGoldenAnswer('preference_pair', { choice: 'b' }, { choice: 'a' }), false);
});

test('matchesGoldenAnswer compares classification value', () => {
  assert.equal(matchesGoldenAnswer('classification', { value: 'x' }, { value: 'x' }), true);
  assert.equal(matchesGoldenAnswer('classification', { value: 'y' }, { value: 'x' }), false);
});

test('matchesGoldenAnswer compares span_annotation wordIndices (order-independent)', () => {
  assert.equal(
    matchesGoldenAnswer(
      'span_annotation',
      { wordIndices: [3, 1, 2] },
      { wordIndices: [1, 2, 3] }
    ),
    true
  );
  assert.equal(
    matchesGoldenAnswer(
      'span_annotation',
      { wordIndices: [1, 2] },
      { wordIndices: [1, 2, 3] }
    ),
    false
  );
});

test('matchesGoldenAnswer compares transcription case-insensitively + trimmed', () => {
  assert.equal(
    matchesGoldenAnswer(
      'transcription',
      { transcript: '  Hello World  ' },
      { transcript: 'hello world' }
    ),
    true
  );
});

test('matchesGoldenAnswer compares safety_label as set equality', () => {
  assert.equal(
    matchesGoldenAnswer(
      'safety_label',
      { values: ['threat', 'harassment'] },
      { values: ['harassment', 'threat'] }
    ),
    true
  );
  assert.equal(
    matchesGoldenAnswer(
      'safety_label',
      { values: ['threat'] },
      { values: ['harassment', 'threat'] }
    ),
    false
  );
});

test('shouldSampleForReview is deterministic for the same submissionId', () => {
  const a = shouldSampleForReview('bos:labeling-sub:abc', 5000);
  const b = shouldSampleForReview('bos:labeling-sub:abc', 5000);
  assert.equal(a, b);
});

test('shouldSampleForReview spreads roughly to the requested rate', () => {
  let sampled = 0;
  const N = 1000;
  for (let i = 0; i < N; i += 1) {
    if (shouldSampleForReview(`bos:labeling-sub:${i.toString(16)}`, 2000)) sampled += 1;
  }
  // 20% rate; allow generous slack.
  assert.ok(sampled > N * 0.12, `expected > ${N * 0.12}, got ${sampled}`);
  assert.ok(sampled < N * 0.28, `expected < ${N * 0.28}, got ${sampled}`);
});

test('shouldSampleForReview returns false at rate 0', () => {
  assert.equal(shouldSampleForReview('bos:labeling-sub:x', 0), false);
});

// ─── HTTP wiring ────────────────────────────────────────────────────

async function withApiServer(callback) {
  const { store, root } = await freshSqlite('srv');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

async function onboardAndFundSponsor(baseUrl, adminToken) {
  const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ displayName: 'QC Sponsor' })
  });
  const { sponsor, bearerToken } = await create.json();
  await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ amountPaise: 100_000 })
  });
  return { sponsor, bearerToken };
}

async function seedJobWithGolden(baseUrl, sponsorId, bearerToken, jobOverrides = {}) {
  const job = await fetch(`${baseUrl}/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
    body: JSON.stringify({
      taskKind: 'preference_pair',
      language: 'hi',
      perLabelPaise: 400,
      itemCount: 2,
      consentPurposeCode: 'bos:consent:labeling.pref',
      qcGoldenItemRateBps: 5000,
      qcMinWorkerScore: 0,
      qcSponsorReviewRateBps: 0,
      ...jobOverrides
    })
  });
  const { job: draft } = await job.json();
  // One golden item (correct answer = 'a') + one normal.
  await fetch(
    `${baseUrl}/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/items`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
      body: JSON.stringify({
        items: [
          { body: { prompt: 'q1', a: 'A1', b: 'B1' }, goldenAnswer: { choice: 'a' } },
          { body: { prompt: 'q2', a: 'A2', b: 'B2' } }
        ]
      })
    }
  );
  await fetch(
    `${baseUrl}/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/launch`,
    { method: 'POST', headers: { authorization: `Bearer ${bearerToken}` } }
  );
  return draft;
}

test('golden-set mismatch returns rejected_golden_mismatch + no mesh credit', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const draft = await seedJobWithGolden(baseUrl, sponsor.sponsorId, bearerToken);
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);

      // Try every item until we get the golden one; the worker
      // doesn't know which it is, but the test does (first item).
      let goldenSubmissionVerdict = null;
      for (let i = 0; i < 2; i += 1) {
        const nextResp = await fetch(
          `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
        );
        const { item } = await nextResp.json();
        if (!item) break;
        // Always submit choice 'b' (wrong for the golden item).
        const subResp = await fetch(
          `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId: item.itemId, workerId: worker.id, labelValue: { choice: 'b' } })
          }
        );
        const body = await subResp.json();
        if (body.qcVerdict === 'golden_set_mismatch') {
          goldenSubmissionVerdict = body;
          break;
        }
      }
      assert.ok(goldenSubmissionVerdict, 'should have hit a golden item');
      assert.equal(goldenSubmissionVerdict.submission.status, 'rejected_golden_mismatch');
      assert.equal(goldenSubmissionVerdict.meshContributionEvent, null);
      // Worker score < 1 because of the golden-set fail.
      assert.ok(goldenSubmissionVerdict.workerScore < 1);
    });
  });
});

test('worker below qcMinWorkerScore is gated out of new dispatches', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      // Hand-roll a job so we can upload BOTH a golden item AND a
      // non-golden item, then launch. itemCount: 2; both items
      // uploaded before launch.
      const draftResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            taskKind: 'preference_pair',
            language: 'hi',
            perLabelPaise: 400,
            itemCount: 2,
            consentPurposeCode: 'bos:consent:labeling.pref',
            qcGoldenItemRateBps: 5000,
            qcMinWorkerScore: 0.9
          })
        }
      );
      const { job: draft } = await draftResp.json();
      await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            items: [
              { body: { prompt: 'q1', a: 'A1', b: 'B1' }, goldenAnswer: { choice: 'a' } },
              { body: { prompt: 'q2', a: 'A2', b: 'B2' } }
            ]
          })
        }
      );
      const launchResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/launch`,
        { method: 'POST', headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(launchResp.status, 200);

      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);

      // First submission: always choice 'b'. With golden=='a' on
      // the golden item, this WILL be rejected when the dispatcher
      // happens to serve the golden item.
      let dropped = false;
      for (let i = 0; i < 2 && !dropped; i += 1) {
        const next = await fetch(
          `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
        );
        const data = await next.json();
        if (data.reason === 'below_worker_score_gate') {
          assert.ok(data.workerScore < 0.9);
          assert.equal(data.gate, 0.9);
          dropped = true;
          break;
        }
        if (!data.item) break;
        await fetch(
          `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId: data.item.itemId, workerId: worker.id, labelValue: { choice: 'b' } })
          }
        );
      }
      assert.ok(dropped, 'expected worker to be gated after golden-set fail');
    });
  });
});

test('sponsor reject endpoint claws back mesh credit + refunds escrow', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      // Job with 100% review-sampling so every submission is pending.
      const draft = await seedJobWithGolden(baseUrl, sponsor.sponsorId, bearerToken, {
        qcGoldenItemRateBps: 0,
        qcSponsorReviewRateBps: 10_000
      });
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const next = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      const { item } = await next.json();
      const subResp = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId: item.itemId, workerId: worker.id, labelValue: { choice: 'a' } })
        }
      );
      const sb = await subResp.json();
      assert.equal(sb.qcVerdict, 'sampled_for_sponsor_review');
      assert.equal(sb.submission.status, 'pending_sponsor_review');

      // Sponsor lists pending submissions.
      const list = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions?status=pending_sponsor_review`,
        { headers: { authorization: `Bearer ${bearerToken}` } }
      );
      const { submissions } = await list.json();
      assert.equal(submissions.length, 1);
      assert.ok(submissions[0].identityHash.startsWith('sha256:'));

      // Reject — claws back.
      const reject = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions/${encodeURIComponent(sb.submission.submissionId)}/reject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({ reason: 'low_quality_per_sponsor_qc' })
        }
      );
      assert.equal(reject.status, 200);
      const rejBody = await reject.json();
      assert.equal(rejBody.submission.status, 'rejected_sponsor_review');
      assert.equal(rejBody.clawedBackPaise, 400);

      // Worker's mesh balance now zero (positive Rs 4 + clawback
      // Rs -4 = 0).
      const events = await store.listMeshContributionEvents();
      const workerEvents = events.filter((e) => e.operatorId === worker.id);
      const total = workerEvents.reduce((sum, e) => sum + (e.payoutPaise ?? 0), 0);
      assert.equal(total, 0);
    });
  });
});

test('sponsor accept flips pending → accepted without mesh/escrow changes', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const draft = await seedJobWithGolden(baseUrl, sponsor.sponsorId, bearerToken, {
        qcGoldenItemRateBps: 0,
        qcSponsorReviewRateBps: 10_000
      });
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const next = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      const { item } = await next.json();
      const sub = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId: item.itemId, workerId: worker.id, labelValue: { choice: 'a' } })
        }
      );
      const sb = await sub.json();
      const accept = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions/${encodeURIComponent(sb.submission.submissionId)}/accept`,
        { method: 'POST', headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(accept.status, 200);
      const acBody = await accept.json();
      assert.equal(acBody.submission.status, 'accepted');
      // Worker keeps the original +Rs 4.
      const events = await store.listMeshContributionEvents();
      const total = events
        .filter((e) => e.operatorId === worker.id)
        .reduce((sum, e) => sum + (e.payoutPaise ?? 0), 0);
      assert.equal(total, 400);
    });
  });
});

test('GET /api/identities/:id/labeling-stats returns per-job + overall score', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const draft = await seedJobWithGolden(baseUrl, sponsor.sponsorId, bearerToken);
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const next = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      const { item } = await next.json();
      await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId: item.itemId, workerId: worker.id, labelValue: { choice: 'a' } })
        }
      );
      const statsResp = await fetch(
        `${baseUrl}/api/identities/${encodeURIComponent(worker.id)}/labeling-stats`
      );
      assert.equal(statsResp.status, 200);
      const stats = await statsResp.json();
      assert.equal(stats.identityId, worker.id);
      assert.ok(stats.overall.submissionCount >= 1);
      assert.ok(typeof stats.overall.score === 'number');
      assert.ok(Array.isArray(stats.perJob));
    });
  });
});
