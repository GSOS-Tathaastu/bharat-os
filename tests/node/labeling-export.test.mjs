// Phase 10.5 — Signed labeling-job audit export tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, publicIdentity, sha256Hex } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  buildLabelingExportLines,
  bundleNdjson,
  identityHashFor,
  verifyLabelingExportLines,
  LABELING_EXPORT_PROTOCOL_VERSION
} from '../../src/phase1/labeling-export.mjs';
import {
  createLabelingJob,
  createLabelingSubmission
} from '../../src/phase1/labeling-job.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'labeling-export-tests');

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

// ─── Pure builder + verifier ───────────────────────────────────────

function fixtureJob() {
  return createLabelingJob({
    sponsorId: 'bos:sponsor:test',
    taskKind: 'classification',
    language: 'hi',
    perLabelPaise: 500,
    itemCount: 3,
    consentPurposeCode: 'bos:consent:labeling.cls'
  });
}

function fixtureSubmissions(jobId) {
  return [
    createLabelingSubmission({
      jobId,
      itemId: 'bos:labeling-item:i1',
      workerId: 'bos:person:w1',
      taskKind: 'classification',
      labelValue: { value: 'business_loan' }
    }),
    createLabelingSubmission({
      jobId,
      itemId: 'bos:labeling-item:i2',
      workerId: 'bos:person:w2',
      taskKind: 'classification',
      labelValue: { value: 'agri_loan' }
    })
  ];
}

test('identityHashFor rotates per (jobId, workerId)', () => {
  const h1 = identityHashFor('job:A', 'worker:1');
  const h2 = identityHashFor('job:B', 'worker:1');
  assert.ok(h1.startsWith('sha256:'));
  assert.notEqual(h1, h2, 'same worker on different jobs must hash differently');
});

test('buildLabelingExportLines produces header + N submissions + trailer', () => {
  const job = fixtureJob();
  const subs = fixtureSubmissions(job.jobId);
  const signer = createIdentity({ displayName: 'Audit signer' });
  const lines = buildLabelingExportLines({
    job,
    submissions: subs,
    signerIdentity: signer,
    exportedAt: '2026-05-31T12:00:00.000Z'
  });
  assert.equal(lines.length, 4); // 1 header + 2 subs + 1 trailer
  const header = JSON.parse(lines[0]);
  assert.equal(header.type, 'header');
  assert.equal(header.protocolVersion, LABELING_EXPORT_PROTOCOL_VERSION);
  assert.equal(header.jobId, job.jobId);
  assert.equal(header.submissionCount, 2);
  assert.equal(header.signerId, signer.id);
  const sub0 = JSON.parse(lines[1]);
  assert.equal(sub0.type, 'submission');
  assert.equal(sub0.payoutPaise, 500);
  assert.ok(sub0.identityHash.startsWith('sha256:'));
  // Worker id must NEVER appear in the line.
  assert.equal(lines[1].includes('bos:person:w1'), false);
  const trailer = JSON.parse(lines[3]);
  assert.equal(trailer.type, 'trailer');
  assert.equal(typeof trailer.contentSha256, 'string');
  assert.equal(trailer.signature.algorithm, 'Ed25519');
});

test('builder filters out non-accepted submissions', () => {
  const job = fixtureJob();
  const accepted = createLabelingSubmission({
    jobId: job.jobId,
    itemId: 'bos:labeling-item:i1',
    workerId: 'bos:person:w1',
    taskKind: 'classification',
    labelValue: { value: 'x' }
  });
  const pending = createLabelingSubmission({
    jobId: job.jobId,
    itemId: 'bos:labeling-item:i2',
    workerId: 'bos:person:w2',
    taskKind: 'classification',
    labelValue: { value: 'y' },
    status: 'pending_sponsor_review'
  });
  const rejected = createLabelingSubmission({
    jobId: job.jobId,
    itemId: 'bos:labeling-item:i3',
    workerId: 'bos:person:w3',
    taskKind: 'classification',
    labelValue: { value: 'z' },
    status: 'rejected_golden_mismatch'
  });
  const signer = createIdentity({ displayName: 'Audit signer' });
  const lines = buildLabelingExportLines({
    job,
    submissions: [accepted, pending, rejected],
    signerIdentity: signer
  });
  // header + 1 accepted + trailer
  assert.equal(lines.length, 3);
  const header = JSON.parse(lines[0]);
  assert.equal(header.submissionCount, 1);
});

test('verifyLabelingExportLines returns ok for an untampered bundle', () => {
  const job = fixtureJob();
  const signer = createIdentity({ displayName: 'Audit signer' });
  const lines = buildLabelingExportLines({
    job,
    submissions: fixtureSubmissions(job.jobId),
    signerIdentity: signer
  });
  const result = verifyLabelingExportLines(lines, publicIdentity(signer));
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.submissionCount, 2);
});

test('verifyLabelingExportLines detects a tampered submission line', () => {
  const job = fixtureJob();
  const signer = createIdentity({ displayName: 'Audit signer' });
  const lines = buildLabelingExportLines({
    job,
    submissions: fixtureSubmissions(job.jobId),
    signerIdentity: signer
  });
  // Mutate the first submission line to change payoutPaise.
  const tamperedSub = JSON.parse(lines[1]);
  tamperedSub.payoutPaise = 999999;
  lines[1] = JSON.stringify(tamperedSub);
  const result = verifyLabelingExportLines(lines, publicIdentity(signer));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'content_hash_mismatch');
});

test('verifyLabelingExportLines fails when verifier has a different signer key', () => {
  const job = fixtureJob();
  const realSigner = createIdentity({ displayName: 'Real signer' });
  const lines = buildLabelingExportLines({
    job,
    submissions: fixtureSubmissions(job.jobId),
    signerIdentity: realSigner
  });
  const otherSigner = createIdentity({ displayName: 'Attacker' });
  const result = verifyLabelingExportLines(lines, publicIdentity(otherSigner));
  assert.equal(result.ok, false);
});

test('bundleNdjson joins with \\n and ends with a trailing newline', () => {
  const body = bundleNdjson(['{"a":1}', '{"a":2}']);
  assert.equal(body, '{"a":1}\n{"a":2}\n');
});

// ─── HTTP endpoints ────────────────────────────────────────────────

async function withApiServer(callback) {
  const { store } = await freshSqlite('srv');
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

async function onboardAndFundSponsor(baseUrl, adminToken) {
  const create = await fetch(`${baseUrl}/api/admin/sponsors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ displayName: 'Export Sponsor' })
  });
  const { sponsor, bearerToken } = await create.json();
  await fetch(`${baseUrl}/api/admin/sponsors/${encodeURIComponent(sponsor.sponsorId)}/deposit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ amountPaise: 100_000 })
  });
  return { sponsor, bearerToken };
}

async function seedRunningJob(baseUrl, sponsorId, bearerToken) {
  const jobResp = await fetch(
    `${baseUrl}/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
      body: JSON.stringify({
        taskKind: 'classification',
        language: 'hi',
        perLabelPaise: 300,
        itemCount: 2,
        consentPurposeCode: 'bos:consent:labeling.cls'
      })
    }
  );
  const { job: draft } = await jobResp.json();
  await fetch(
    `${baseUrl}/api/sponsors/${encodeURIComponent(sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/items`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
      body: JSON.stringify({
        items: [
          { body: { prompt: 'q1', options: ['a', 'b'] } },
          { body: { prompt: 'q2', options: ['c', 'd'] } }
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

test('GET /api/audit-signer/public-key lazy-bootstraps + reuses the signer', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const before = await store.readAuditSigner();
      assert.equal(before, null);

      const r1 = await fetch(`${baseUrl}/api/audit-signer/public-key`);
      assert.equal(r1.status, 200);
      const signer1 = await r1.json();
      assert.ok(signer1.id.startsWith('bos:person:'));
      assert.ok(typeof signer1.publicKeyPem === 'string');
      // Private key must not leak.
      assert.equal('privateKeyPem' in signer1, false);

      const r2 = await fetch(`${baseUrl}/api/audit-signer/public-key`);
      const signer2 = await r2.json();
      assert.equal(signer2.id, signer1.id, 'signer must be stable across calls');
    });
  });
});

test('GET .../export.ndjson requires a sponsor bearer', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const draft = await seedRunningJob(baseUrl, sponsor.sponsorId, bearerToken);
      const r = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/export.ndjson`
      );
      // No auth header at all → sponsor-auth gate returns 401.
      assert.equal(r.status, 401);
    });
  });
});

test('GET .../export.ndjson returns a verifiable signed bundle + emits ledger event', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl, store }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const draft = await seedRunningJob(baseUrl, sponsor.sponsorId, bearerToken);

      // One worker submits one label so the export has a row.
      const worker = createIdentity({ displayName: 'Worker' });
      await store.saveIdentity(worker);
      const nextResp = await fetch(
        `${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/next-item?workerId=${encodeURIComponent(worker.id)}`
      );
      const { item } = await nextResp.json();
      assert.ok(item);
      await fetch(`${baseUrl}/api/labeling-jobs/${encodeURIComponent(draft.jobId)}/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.itemId, workerId: worker.id, labelValue: { value: 'business_loan' } })
      });

      const exportResp = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/${encodeURIComponent(draft.jobId)}/export.ndjson`,
        { headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(exportResp.status, 200);
      assert.equal(
        exportResp.headers.get('content-type'),
        'application/x-ndjson; charset=utf-8'
      );
      const body = await exportResp.text();
      const lines = body.trimEnd().split('\n');
      assert.equal(lines.length, 3); // header + 1 sub + trailer
      assert.equal(JSON.parse(lines[0]).type, 'header');
      assert.equal(JSON.parse(lines[1]).type, 'submission');
      assert.equal(JSON.parse(lines[2]).type, 'trailer');

      // Worker id should not be in the body.
      assert.equal(body.includes(worker.id), false);

      // Re-verify with the public key endpoint.
      const pkResp = await fetch(`${baseUrl}/api/audit-signer/public-key`);
      const signerPublic = await pkResp.json();
      const verdict = verifyLabelingExportLines(lines, signerPublic);
      assert.equal(verdict.ok, true, verdict.reason);
      assert.equal(verdict.submissionCount, 1);

      // Ledger event present.
      const ledger = await store.listLedger({ limit: 100 });
      const exportEvents = ledger.filter((e) => e.type === 'labeling_export.signed');
      assert.equal(exportEvents.length, 1);
      assert.equal(exportEvents[0].jobId, draft.jobId);
      assert.equal(exportEvents[0].sponsorId, sponsor.sponsorId);
      assert.equal(exportEvents[0].submissionCount, 1);
      assert.equal(typeof exportEvents[0].contentSha256, 'string');
    });
  });
});

test('GET .../export.ndjson 404s for an unknown job on this sponsor', async () => {
  const adminToken = 'a'.repeat(32);
  await withEnv({ BHARAT_OS_ADMIN_TOKEN: adminToken }, async () => {
    await withApiServer(async ({ baseUrl }) => {
      const { sponsor, bearerToken } = await onboardAndFundSponsor(baseUrl, adminToken);
      const r = await fetch(
        `${baseUrl}/api/sponsors/${encodeURIComponent(sponsor.sponsorId)}/labeling-jobs/bos%3Alabeling-job%3Anope/export.ndjson`,
        { headers: { authorization: `Bearer ${bearerToken}` } }
      );
      assert.equal(r.status, 404);
    });
  });
});
