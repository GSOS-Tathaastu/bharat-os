// Phase 10.1 — labeling marketplace tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createLabelingJob,
  createLabelingJobItem,
  createLabelingSubmission,
  workerCanClaim,
  totalLaunchCostPaise,
  LABELING_TASK_KINDS,
  LABELING_JOB_STATUSES
} from '../../src/phase1/labeling-job.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'labeling-job-tests');

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
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

async function freshFile(name) {
  const root = path.join(tmpRoot, `file-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

// ─── Module: createLabelingJob ──────────────────────────────────────

test('LABELING_TASK_KINDS enumerates the five v1 task kinds', () => {
  assert.deepEqual(LABELING_TASK_KINDS, [
    'preference_pair',
    'classification',
    'span_annotation',
    'transcription',
    'safety_label'
  ]);
});

test('LABELING_JOB_STATUSES enumerates the six lifecycle states', () => {
  assert.deepEqual(LABELING_JOB_STATUSES, [
    'draft',
    'funded',
    'active',
    'paused',
    'complete',
    'cancelled'
  ]);
});

test('createLabelingJob returns a draft job with derived id', () => {
  const job = createLabelingJob({
    sponsorId: 'bos:sponsor:abc',
    taskKind: 'preference_pair',
    language: 'hi',
    perLabelPaise: 400,
    itemCount: 100,
    consentPurposeCode: 'bos:consent:labeling.pref'
  });
  assert.match(job.jobId, /^bos:labeling-job:[0-9a-f]{32}$/);
  assert.equal(job.status, 'draft');
  assert.equal(job.itemsUploaded, 0);
  assert.equal(job.submissionsAccepted, 0);
  assert.equal(job.escrowLockedPaise, 0);
});

test('createLabelingJob rejects unsupported task kind', () => {
  assert.throws(
    () =>
      createLabelingJob({
        sponsorId: 'x',
        taskKind: 'reasoning_trace',
        language: 'en',
        perLabelPaise: 100,
        itemCount: 10,
        consentPurposeCode: 'p'
      }),
    /taskKind must be one of/
  );
});

test('createLabelingJob rejects non-positive perLabelPaise', () => {
  assert.throws(
    () =>
      createLabelingJob({
        sponsorId: 'x',
        taskKind: 'preference_pair',
        language: 'en',
        perLabelPaise: 0,
        itemCount: 10,
        consentPurposeCode: 'p'
      }),
    /perLabelPaise/
  );
});

test('totalLaunchCostPaise computes itemCount * (perLabel + fee)', () => {
  const job = createLabelingJob({
    sponsorId: 'x',
    taskKind: 'preference_pair',
    language: 'en',
    perLabelPaise: 400,
    bharatOsFeePaise: 100,
    itemCount: 10,
    consentPurposeCode: 'p'
  });
  assert.equal(totalLaunchCostPaise(job), 5000);
});

test('createLabelingJobItem requires body', () => {
  assert.throws(
    () => createLabelingJobItem({ jobId: 'x', taskKind: 'preference_pair' }),
    /body/
  );
});

test('createLabelingSubmission rejected requires rejectionReason', () => {
  assert.throws(
    () =>
      createLabelingSubmission({
        jobId: 'j',
        itemId: 'i',
        workerId: 'w',
        taskKind: 'preference_pair',
        labelValue: { choice: 'a' },
        status: 'rejected'
      }),
    /rejectionReason/
  );
});

test('workerCanClaim refuses when worker already submitted for the item', () => {
  const job = { jobId: 'j', status: 'active' };
  const item = { itemId: 'i', consumed: false };
  const prev = [{ itemId: 'i', workerId: 'w' }];
  assert.equal(workerCanClaim(job, item, prev), false);
});

test('workerCanClaim allows fresh worker on an unconsumed item', () => {
  const job = { jobId: 'j', status: 'active' };
  const item = { itemId: 'i', consumed: false };
  assert.equal(workerCanClaim(job, item, []), true);
});

test('workerCanClaim refuses when job is not active', () => {
  const job = { jobId: 'j', status: 'draft' };
  const item = { itemId: 'i', consumed: false };
  assert.equal(workerCanClaim(job, item, []), false);
});

// ─── Storage ────────────────────────────────────────────────────────

test('SqliteStore round-trips labeling jobs + items + submissions', async () => {
  const { store } = await freshSqlite('store');
  const job = createLabelingJob({
    sponsorId: 'bos:sponsor:test',
    taskKind: 'preference_pair',
    language: 'hi',
    perLabelPaise: 400,
    itemCount: 1,
    consentPurposeCode: 'p'
  });
  await store.saveLabelingJob(job);
  const item = createLabelingJobItem({
    jobId: job.jobId,
    taskKind: 'preference_pair',
    body: { prompt: 'q', a: 'A', b: 'B' }
  });
  await store.saveLabelingJobItem(item);
  const sub = createLabelingSubmission({
    jobId: job.jobId,
    itemId: item.itemId,
    workerId: 'bos:person:w',
    taskKind: 'preference_pair',
    labelValue: { choice: 'a' }
  });
  await store.saveLabelingSubmission(sub);

  assert.equal((await store.readLabelingJob(job.jobId)).status, 'draft');
  const items = await store.listLabelingJobItems({ jobId: job.jobId });
  assert.equal(items.length, 1);
  const subs = await store.listLabelingSubmissions({ workerId: 'bos:person:w' });
  assert.equal(subs.length, 1);
  store.close();
});

test('BosStore round-trips labeling resources', async () => {
  const { store } = await freshFile('file-store');
  const job = createLabelingJob({
    sponsorId: 'bos:sponsor:test',
    taskKind: 'preference_pair',
    language: 'hi',
    perLabelPaise: 400,
    itemCount: 1,
    consentPurposeCode: 'p'
  });
  await store.saveLabelingJob(job);
  assert.equal((await store.readLabelingJob(job.jobId)).status, 'draft');
});

test('SqliteStore eraseUserData removes a workers labeling submissions', async () => {
  const { store } = await freshSqlite('cascade');
  const worker = createIdentity({ displayName: 'W' });
  await store.saveIdentity(worker);
  const job = createLabelingJob({
    sponsorId: 'bos:sponsor:x',
    taskKind: 'preference_pair',
    language: 'en',
    perLabelPaise: 100,
    itemCount: 1,
    consentPurposeCode: 'p'
  });
  await store.saveLabelingJob(job);
  const item = createLabelingJobItem({
    jobId: job.jobId,
    taskKind: 'preference_pair',
    body: { a: 'a', b: 'b' }
  });
  await store.saveLabelingJobItem(item);
  await store.saveLabelingSubmission(
    createLabelingSubmission({
      jobId: job.jobId,
      itemId: item.itemId,
      workerId: worker.id,
      taskKind: 'preference_pair',
      labelValue: { choice: 'a' }
    })
  );
  const report = await store.eraseUserData(worker.id, { redactLedgerEntry: (e) => e });
  assert.equal(report.sections.labelingSubmissions, 1);
  const remaining = await store.listLabelingSubmissions({ workerId: worker.id });
  assert.equal(remaining.length, 0);
  store.close();
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

async function onboardSponsor(baseUrl, adminToken, displayName = 'TestSponsor') {
  const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ displayName })
  });
  return create.json();
}

test('full draft → items → launch → worker submit lifecycle', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardSponsor(baseUrl, adminToken);
      // Top up enough escrow.
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });

      // 1. Draft.
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
            consentPurposeCode: 'bos:consent:labeling.pref'
          })
        }
      );
      assert.equal(draftResp.status, 201);
      const { job: draft } = await draftResp.json();
      assert.equal(draft.status, 'draft');

      // 2. Upload items.
      const uploadResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            items: [
              { body: { prompt: 'q1', a: 'A1', b: 'B1' } },
              { body: { prompt: 'q2', a: 'A2', b: 'B2' } }
            ]
          })
        }
      );
      assert.equal(uploadResp.status, 201);
      const uploadBody = await uploadResp.json();
      assert.equal(uploadBody.itemsCreated, 2);

      // 3. Launch.
      const launchResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/launch`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${bearerToken}` }
        }
      );
      assert.equal(launchResp.status, 200);
      const launchBody = await launchResp.json();
      assert.equal(launchBody.job.status, 'active');
      assert.equal(launchBody.job.escrowLockedPaise, 800);
      assert.equal(launchBody.sponsor.escrowLockedPaise, 800);

      // 4. Worker discovers via public listing.
      const list = await fetch(`${baseUrl}/api/labeling-jobs?language=hi`);
      const listBody = await list.json();
      assert.equal(listBody.jobs.length, 1);
      assert.equal(listBody.jobs[0].jobId, draft.jobId);
      assert.equal('escrowLockedPaise' in listBody.jobs[0], false); // worker surface strips it

      // 5. Worker fetches next-item.
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const nextResp = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      assert.equal(nextResp.status, 200);
      const nextBody = await nextResp.json();
      assert.ok(nextBody.item);
      assert.equal('goldenAnswer' in nextBody.item, false); // golden answer stripped

      // 6. Worker submits a label.
      const subResp = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            itemId: nextBody.item.itemId,
            workerId: worker.id,
            labelValue: { choice: 'a' }
          })
        }
      );
      assert.equal(subResp.status, 201);
      const subBody = await subResp.json();
      assert.equal(subBody.submission.status, 'accepted');
      assert.equal(subBody.meshContributionEvent.workloadType, 'labeling');
      assert.equal(subBody.meshContributionEvent.payoutPaise, 400);

      // 7. Sponsor escrow debited.
      const selfResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/self`,
        { headers: { authorization: `Bearer ${bearerToken}` } }
      );
      const { sponsor: selfSponsor } = await selfResp.json();
      assert.equal(selfSponsor.escrowBalancePaise, 100_000 - 400);
      assert.equal(selfSponsor.escrowLockedPaise, 800 - 400);
    });
  });
});

test('launch refuses when items incomplete', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const { sponsor, bearerToken } = await onboardSponsor(baseUrl, adminToken);
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });
      const draft = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            taskKind: 'preference_pair',
            language: 'en',
            perLabelPaise: 100,
            itemCount: 5,
            consentPurposeCode: 'p'
          })
        }
      );
      const { job } = await draft.json();
      const launch = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(job.jobId)}/launch`,
        { method: 'POST', headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(launch.status, 400);
      const body = await launch.json();
      assert.equal(body.error.code, 'items_incomplete');
    });
  });
});

test('worker cannot resubmit for the same item', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardSponsor(baseUrl, adminToken);
      await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ amountPaise: 100_000 })
      });
      const draft = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({
            taskKind: 'preference_pair',
            language: 'en',
            perLabelPaise: 100,
            itemCount: 1,
            consentPurposeCode: 'p'
          })
        }
      );
      const { job } = await draft.json();
      await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(job.jobId)}/items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
          body: JSON.stringify({ items: [{ body: { a: 'A', b: 'B' } }] })
        }
      );
      await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(job.jobId)}/launch`,
        { method: 'POST', headers: { authorization: `Bearer ${bearerToken}` } }
      );
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const next = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(job.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      const { item } = await next.json();
      // First submit succeeds.
      const first = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(job.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            itemId: item.itemId,
            workerId: worker.id,
            labelValue: { choice: 'a' }
          })
        }
      );
      assert.equal(first.status, 201);
      // Second submit for same item is refused.
      const second = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(job.jobId)}/submissions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            itemId: item.itemId,
            workerId: worker.id,
            labelValue: { choice: 'b' }
          })
        }
      );
      assert.equal(second.status, 409);
      const body = await second.json();
      assert.equal(body.error.code, 'cannot_claim');
    });
  });
});
