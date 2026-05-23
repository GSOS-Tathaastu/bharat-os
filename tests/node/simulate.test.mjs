import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { simulateDemandBootstrap } from '../../src/phase0/simulate.mjs';
import { BosStore } from '../../src/phase0/store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');
const cliPath = path.join(repoRoot, 'bin', 'bos.mjs');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('bootstrap simulator handles a 1,000-node Phase 0 demand profile', () => {
  const simulation = simulateDemandBootstrap({
    seed: 'test-1000-node-bootstrap',
    nodeCount: 1000,
    objectCount: 80,
    averageObjectBytes: 2048,
    objectJitter: 0.2,
    chunkSizeBytes: 1024,
    replicationFactor: 3
  });

  assert.equal(simulation.report.inputs.nodeCount, 1000);
  assert.equal(simulation.report.inputs.objectCount, 80);
  assert.equal(simulation.report.results.storedObjectCount, 80);
  assert.equal(simulation.report.results.failedObjectCount, 0);
  assert.equal(simulation.report.results.successRate, 1);
  assert.ok(simulation.report.results.eligibleNodeCount >= 100);
  assert.ok(simulation.report.results.replicatedBytes > simulation.report.results.storedPlaintextBytes);
  assert.equal(simulation.report.results.netContributionScore.class, 'producer');
});

test('persistent store saves bootstrap control plane and report', async () => {
  const { store } = await freshStore('bootstrap-store');
  const simulation = simulateDemandBootstrap({
    seed: 'store-bootstrap',
    nodeCount: 150,
    objectCount: 12,
    averageObjectBytes: 1024,
    chunkSizeBytes: 512,
    replicationFactor: 2
  });

  await store.saveControlPlane(simulation.controlPlane, 'bootstrap');
  await store.saveSimulationReport(simulation.report);

  const controlPlane = await store.readControlPlane('bootstrap');
  const report = await store.readSimulationReport(simulation.report.reportId);

  assert.equal(Object.keys(controlPlane.nodes).length, 150);
  assert.equal(report.reportId, simulation.report.reportId);
  assert.equal((await store.listSimulationReports()).length, 1);
});

test('CLI writes bootstrap report markdown and persisted report JSON', async () => {
  const { root, store } = await freshStore('bootstrap-cli');
  const reportOut = path.join(root, 'bootstrap.md');
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'simulate',
      'bootstrap',
      '--nodes',
      '200',
      '--objects',
      '10',
      '--avg-object-bytes',
      '2048',
      '--chunk-size',
      '1024',
      '--replication',
      '2',
      '--seed',
      'cli-bootstrap',
      '--report-out',
      reportOut,
      '--store',
      root
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.summary.storedObjectCount, 10);
  assert.equal(output.summary.failedObjectCount, 0);
  assert.match(await fs.readFile(reportOut, 'utf8'), /Bharat OS Phase 0 Bootstrap Report/);

  const report = await store.readSimulationReport(output.reportId);
  assert.equal(report.reportId, output.reportId);
});

