import crypto from 'node:crypto';
import {
  commitPlacementPlan,
  createControlPlane,
  createEncryptedObject,
  createIdentity,
  createNode,
  createPlacementPlan,
  netContributionScore,
  nodeEligibility,
  publishManifest,
  registerNode,
  sha256Hex,
  stableStringify
} from './core.mjs';

const GB = 1024 * 1024 * 1024;

export class SeededRandom {
  constructor(seed = 'bharat-os-phase0') {
    const hash = crypto.createHash('sha256').update(seed).digest();
    this.state = hash.readUInt32LE(0) || 1;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  bool(probability) {
    return this.next() < probability;
  }
}

function buildPayload(sizeBytes, index) {
  const buffer = Buffer.alloc(sizeBytes);
  const pattern = Buffer.from(`bharat-os-demand-${index}:`, 'utf8');
  for (let offset = 0; offset < buffer.length; offset += pattern.length) {
    pattern.copy(buffer, offset);
  }
  return buffer;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function addReasonCounts(counts, reasons) {
  for (const reason of reasons) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
}

export function createNodeFleet({
  nodeCount = 1000,
  operatorId,
  seed = 'bharat-os-phase0',
  kycRate = 0.86,
  wifiRate = 0.78,
  chargingRate = 0.64,
  minStorageGb = 4,
  maxStorageGb = 128
}) {
  const random = new SeededRandom(seed);
  const nodes = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const storageGb = random.int(minStorageGb, maxStorageGb);
    nodes.push(
      createNode({
        operatorId,
        storageBytes: storageGb * GB,
        kycVerified: random.bool(kycRate),
        wifi: random.bool(wifiRate),
        charging: random.bool(chargingRate),
        batteryPercent: random.int(5, 100),
        trustScore: random.int(35, 100)
      })
    );
  }

  return nodes;
}

export function summarizeControlPlane(controlPlane, { requireKyc = true, batteryThreshold = 40 } = {}) {
  const nodes = Object.values(controlPlane.nodes);
  const rejectionReasons = {};
  let eligibleNodeCount = 0;
  let totalStorageBytes = 0;
  let eligibleStorageBytes = 0;
  let committedBytes = 0;

  for (const node of nodes) {
    totalStorageBytes += node.storageBytes;
    committedBytes += node.usedBytes;
    const result = nodeEligibility(node, 1, { requireKyc, batteryThreshold });
    if (result.eligible) {
      eligibleNodeCount += 1;
      eligibleStorageBytes += result.availableBytes;
    } else {
      addReasonCounts(rejectionReasons, result.reasons);
    }
  }

  const utilization = eligibleStorageBytes > 0 ? committedBytes / eligibleStorageBytes : 0;
  const nodeUsedBytes = nodes.map((node) => node.usedBytes);

  return {
    nodeCount: nodes.length,
    eligibleNodeCount,
    rejectedNodeCount: nodes.length - eligibleNodeCount,
    totalStorageBytes,
    eligibleStorageBytes,
    committedBytes,
    utilization,
    rejectionReasons,
    p50NodeUsedBytes: percentile(nodeUsedBytes, 50),
    p90NodeUsedBytes: percentile(nodeUsedBytes, 90),
    p99NodeUsedBytes: percentile(nodeUsedBytes, 99)
  };
}

export function simulateDemandBootstrap({
  seed = 'bharat-os-phase0',
  nodeCount = 1000,
  objectCount = 100,
  averageObjectBytes = 64 * 1024,
  objectJitter = 0.35,
  chunkSizeBytes = 16 * 1024,
  replicationFactor = 3,
  batteryThreshold = 40,
  requireKyc = true
} = {}) {
  const owner = createIdentity({
    displayName: 'Phase 0 Bootstrap Tenant',
    attestations: { phase0: 'simulated-offline-ekyc' }
  });
  const controlPlane = createControlPlane();
  const random = new SeededRandom(`${seed}:objects`);
  const nodes = createNodeFleet({
    nodeCount,
    operatorId: owner.id,
    seed: `${seed}:nodes`
  });

  for (const node of nodes) {
    registerNode(controlPlane, node);
  }

  const objects = [];
  const failures = [];

  for (let index = 0; index < objectCount; index += 1) {
    const spread = Math.round(averageObjectBytes * objectJitter);
    const sizeBytes = Math.max(1, averageObjectBytes + random.int(-spread, spread));
    const bundle = createEncryptedObject(owner, buildPayload(sizeBytes, index), {
      chunkSizeBytes,
      contentType: 'application/vnd.bharat-os.simulated-demand'
    });
    publishManifest(controlPlane, bundle.manifest);

    try {
      const plan = createPlacementPlan(controlPlane, bundle.manifest, {
        replicationFactor,
        requireKyc,
        batteryThreshold
      });
      commitPlacementPlan(controlPlane, plan);
      objects.push({
        index,
        manifestId: bundle.manifest.manifestId,
        plaintextBytes: bundle.manifest.plaintextBytes,
        chunkCount: bundle.manifest.chunks.length,
        placementCount: plan.placements.length,
        replicatedBytes: plan.placements.reduce((sum, placement) => sum + placement.bytes, 0)
      });
    } catch (error) {
      failures.push({
        index,
        manifestId: bundle.manifest.manifestId,
        plaintextBytes: bundle.manifest.plaintextBytes,
        message: error.message
      });
    }
  }

  const summary = summarizeControlPlane(controlPlane, { requireKyc, batteryThreshold });
  const storedPlaintextBytes = objects.reduce((sum, object) => sum + object.plaintextBytes, 0);
  const replicatedBytes = objects.reduce((sum, object) => sum + object.replicatedBytes, 0);
  const ncs = netContributionScore({
    contributedBytes: summary.eligibleStorageBytes,
    consumedBytes: replicatedBytes
  });
  const successRate = objectCount > 0 ? objects.length / objectCount : 1;
  const reportCore = {
    type: 'phase0.bootstrap_report',
    seed,
    inputs: {
      nodeCount,
      objectCount,
      averageObjectBytes,
      objectJitter,
      chunkSizeBytes,
      replicationFactor,
      batteryThreshold,
      requireKyc
    },
    results: {
      storedObjectCount: objects.length,
      failedObjectCount: failures.length,
      successRate,
      storedPlaintextBytes,
      replicatedBytes,
      averageChunksPerObject:
        objects.length > 0
          ? objects.reduce((sum, object) => sum + object.chunkCount, 0) / objects.length
          : 0,
      ...summary,
      netContributionScore: ncs
    },
    failures,
    createdAt: new Date().toISOString()
  };

  const report = {
    reportId: `bos:report:${sha256Hex(stableStringify(reportCore)).slice(0, 32)}`,
    ...reportCore
  };

  return {
    owner,
    controlPlane,
    objects,
    report
  };
}

export function renderBootstrapMarkdown(report) {
  const result = report.results;
  const lines = [
    '# Bharat OS Phase 0 Bootstrap Report',
    '',
    `- Report ID: ${report.reportId}`,
    `- Seed: ${report.seed}`,
    `- Nodes: ${report.inputs.nodeCount}`,
    `- Objects requested: ${report.inputs.objectCount}`,
    `- Objects stored: ${result.storedObjectCount}`,
    `- Success rate: ${(result.successRate * 100).toFixed(2)}%`,
    `- Eligible nodes: ${result.eligibleNodeCount}/${result.nodeCount}`,
    `- Eligible storage: ${(result.eligibleStorageBytes / GB).toFixed(2)} GB`,
    `- Replicated bytes committed: ${result.replicatedBytes}`,
    `- Utilization of eligible storage: ${(result.utilization * 100).toFixed(4)}%`,
    `- Net contribution class: ${result.netContributionScore.class}`,
    '',
    '## Rejection Reasons',
    ''
  ];

  const rejectionEntries = Object.entries(result.rejectionReasons);
  if (rejectionEntries.length === 0) {
    lines.push('- None');
  } else {
    for (const [reason, count] of rejectionEntries.sort()) {
      lines.push(`- ${reason}: ${count}`);
    }
  }

  lines.push('', '## Verdict', '');
  if (result.successRate >= 0.99 && result.eligibleNodeCount >= 100) {
    lines.push('The simulated mesh can satisfy this Phase 0 demand profile.');
  } else {
    lines.push('The simulated mesh cannot yet satisfy this Phase 0 demand profile.');
  }

  return `${lines.join('\n')}\n`;
}
