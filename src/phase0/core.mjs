import crypto from 'node:crypto';

export const PROTOCOL_VERSION = 'bos.phase0.v1';

export function nowIso() {
  return new Date().toISOString();
}

export function stableStringify(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item) ?? 'null').join(',')}]`;
  }

  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

export function sha256Hex(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function randomId(prefix, seed = crypto.randomBytes(32)) {
  return `${prefix}:${sha256Hex(seed).slice(0, 32)}`;
}

function asBytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function deriveKey(key, context) {
  return crypto.createHmac('sha512', key).update(context).digest().subarray(0, 32);
}

function protectBytes(plainBytes, key, context) {
  const iv = crypto.randomBytes(12);
  const derived = deriveKey(key, context);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: 'AES-256-GCM',
    ivBase64: iv.toString('base64'),
    ciphertextBase64: ciphertext.toString('base64'),
    tagBase64: tag.toString('base64')
  };
}

function unprotectBytes(protectedObject, key, context) {
  if (protectedObject.algorithm !== 'AES-256-GCM') {
    throw new Error(`Unsupported protected object algorithm: ${protectedObject.algorithm}`);
  }

  const iv = Buffer.from(protectedObject.ivBase64, 'base64');
  const ciphertext = Buffer.from(protectedObject.ciphertextBase64, 'base64');
  const tag = Buffer.from(protectedObject.tagBase64, 'base64');
  const derived = deriveKey(key, context);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function createIdentity({ displayName, attestations = {} }) {
  if (!displayName || typeof displayName !== 'string') {
    throw new Error('displayName is required.');
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const id = `bos:person:${sha256Hex(publicKey).slice(0, 32)}`;

  return {
    protocolVersion: PROTOCOL_VERSION,
    id,
    displayName,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    vaultKeyBase64: crypto.randomBytes(32).toString('base64'),
    attestations,
    createdAt: nowIso()
  };
}

export function publicIdentity(identity) {
  return {
    protocolVersion: identity.protocolVersion,
    id: identity.id,
    displayName: identity.displayName,
    publicKeyPem: identity.publicKeyPem,
    attestations: identity.attestations ?? {},
    createdAt: identity.createdAt
  };
}

export function signText(identity, text) {
  const signature = crypto.sign(null, Buffer.from(text, 'utf8'), identity.privateKeyPem);
  return {
    algorithm: 'Ed25519',
    signerId: identity.id,
    signatureBase64: signature.toString('base64')
  };
}

export function verifySignature(publicRecord, text, signature) {
  if (signature.algorithm !== 'Ed25519' || signature.signerId !== publicRecord.id) {
    return false;
  }

  return crypto.verify(
    null,
    Buffer.from(text, 'utf8'),
    publicRecord.publicKeyPem,
    Buffer.from(signature.signatureBase64, 'base64')
  );
}

export function createEncryptedObject(
  identity,
  bytes,
  { chunkSizeBytes = 262144, contentType = 'application/octet-stream' } = {}
) {
  if (chunkSizeBytes < 1) {
    throw new Error('chunkSizeBytes must be positive.');
  }

  const plainBytes = asBytes(bytes);
  const vaultKey = Buffer.from(identity.vaultKeyBase64, 'base64');
  const fileKey = crypto.randomBytes(32);
  const sealedFileKey = protectBytes(fileKey, vaultKey, `bos:vault-file-key:${identity.id}`);
  const chunks = {};
  const descriptors = [];
  const chunkCount = Math.max(1, Math.ceil(plainBytes.length / chunkSizeBytes));

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * chunkSizeBytes;
    const plainChunk = plainBytes.subarray(start, Math.min(start + chunkSizeBytes, plainBytes.length));
    const protectedChunk = protectBytes(plainChunk, fileKey, `bos:chunk:${index}`);
    const ciphertextBytes = Buffer.from(protectedChunk.ciphertextBase64, 'base64');
    const ciphertextSha256 = sha256Hex(ciphertextBytes);
    const chunkId = `bos:chunk:${ciphertextSha256.slice(0, 32)}`;

    chunks[chunkId] = {
      chunkId,
      ciphertextBase64: protectedChunk.ciphertextBase64
    };
    descriptors.push({
      index,
      chunkId,
      plaintextBytes: plainChunk.length,
      ciphertextBytes: ciphertextBytes.length,
      ciphertextSha256,
      ivBase64: protectedChunk.ivBase64,
      tagBase64: protectedChunk.tagBase64,
      algorithm: protectedChunk.algorithm
    });
  }

  const manifestCore = {
    protocolVersion: PROTOCOL_VERSION,
    objectType: 'encrypted-chunk-manifest',
    ownerId: identity.id,
    contentType,
    chunkSizeBytes,
    plaintextBytes: plainBytes.length,
    sealedFileKey,
    chunks: descriptors,
    createdAt: nowIso()
  };
  const manifestId = `bos:manifest:${sha256Hex(stableStringify(manifestCore)).slice(0, 32)}`;

  return {
    manifest: {
      manifestId,
      ...manifestCore
    },
    chunks
  };
}

export function assertManifest(manifest) {
  if (manifest.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported manifest protocol version: ${manifest.protocolVersion}`);
  }
  if (manifest.objectType !== 'encrypted-chunk-manifest') {
    throw new Error(`Unsupported manifest type: ${manifest.objectType}`);
  }
  if (!manifest.ownerId?.startsWith('bos:person:')) {
    throw new Error('Manifest owner must be a Bharat OS person identity.');
  }
  if (!manifest.manifestId?.startsWith('bos:manifest:')) {
    throw new Error('Manifest ID must use bos:manifest prefix.');
  }

  for (const chunk of manifest.chunks ?? []) {
    if (!chunk.chunkId?.startsWith('bos:chunk:')) {
      throw new Error(`Invalid chunk ID: ${chunk.chunkId}`);
    }
    if ('ciphertextBase64' in chunk || 'plaintextBase64' in chunk) {
      throw new Error('Manifest violates pointer-not-payload semantics.');
    }
  }

  return true;
}

export function readEncryptedObject(identity, bundle) {
  const { manifest, chunks } = bundle;
  assertManifest(manifest);

  if (manifest.ownerId !== identity.id) {
    throw new Error(`Identity ${identity.id} cannot read manifest owned by ${manifest.ownerId}.`);
  }

  const vaultKey = Buffer.from(identity.vaultKeyBase64, 'base64');
  const fileKey = unprotectBytes(
    manifest.sealedFileKey,
    vaultKey,
    `bos:vault-file-key:${identity.id}`
  );
  const parts = [];

  for (const descriptor of [...manifest.chunks].sort((left, right) => left.index - right.index)) {
    const storedChunk = chunks[descriptor.chunkId];
    if (!storedChunk) {
      throw new Error(`Missing encrypted chunk: ${descriptor.chunkId}`);
    }

    const ciphertextBytes = Buffer.from(storedChunk.ciphertextBase64, 'base64');
    if (sha256Hex(ciphertextBytes) !== descriptor.ciphertextSha256) {
      throw new Error(`Chunk hash verification failed for ${descriptor.chunkId}.`);
    }

    parts.push(
      unprotectBytes(
        {
          algorithm: descriptor.algorithm,
          ivBase64: descriptor.ivBase64,
          ciphertextBase64: storedChunk.ciphertextBase64,
          tagBase64: descriptor.tagBase64
        },
        fileKey,
        `bos:chunk:${descriptor.index}`
      )
    );
  }

  const plaintext = Buffer.concat(parts);
  if (plaintext.length !== manifest.plaintextBytes) {
    throw new Error(
      `Plaintext length mismatch. Expected ${manifest.plaintextBytes}, got ${plaintext.length}.`
    );
  }

  return plaintext;
}

export function createNode({
  operatorId,
  storageBytes,
  kycVerified = false,
  charging = true,
  wifi = true,
  batteryPercent = 100,
  trustScore = 50,
  capabilities = ['storage']
}) {
  if (!operatorId) {
    throw new Error('operatorId is required.');
  }
  if (!Number.isInteger(storageBytes) || storageBytes < 1) {
    throw new Error('storageBytes must be a positive integer.');
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    nodeId: randomId('bos:node', `${operatorId}:${nowIso()}:${crypto.randomUUID()}`),
    operatorId,
    kycVerified,
    charging,
    wifi,
    batteryPercent,
    trustScore,
    storageBytes,
    usedBytes: 0,
    capabilities,
    lastSeenAt: nowIso()
  };
}

export function nodeEligibility(node, requiredBytes, { requireKyc = true, batteryThreshold = 40 } = {}) {
  const reasons = [];
  const availableBytes = node.storageBytes - node.usedBytes;

  if (requireKyc && !node.kycVerified) reasons.push('kyc_required');
  if (!node.wifi) reasons.push('wifi_required');
  if (!node.charging) reasons.push('charging_required');
  if (node.batteryPercent < batteryThreshold) reasons.push('battery_below_threshold');
  if (availableBytes < requiredBytes) reasons.push('insufficient_storage');
  if (!node.capabilities?.includes('storage')) reasons.push('storage_capability_required');

  return {
    eligible: reasons.length === 0,
    reasons,
    availableBytes
  };
}

export function createControlPlane() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    nodes: {},
    manifests: {},
    commitments: [],
    ledger: [],
    createdAt: nowIso()
  };
}

export function registerNode(controlPlane, node) {
  controlPlane.nodes[node.nodeId] = node;
  controlPlane.ledger.push({
    type: 'node.registered',
    nodeId: node.nodeId,
    operatorId: node.operatorId,
    at: nowIso()
  });
  return node;
}

export function publishManifest(controlPlane, manifest) {
  assertManifest(manifest);
  controlPlane.manifests[manifest.manifestId] = manifest;
  controlPlane.ledger.push({
    type: 'manifest.published',
    manifestId: manifest.manifestId,
    ownerId: manifest.ownerId,
    at: nowIso()
  });
  return manifest;
}

export function createPlacementPlan(
  controlPlane,
  manifest,
  { replicationFactor = 3, requireKyc = true, batteryThreshold = 40 } = {}
) {
  assertManifest(manifest);
  const plannedUse = Object.fromEntries(
    Object.values(controlPlane.nodes).map((node) => [node.nodeId, node.usedBytes])
  );
  const placements = [];

  for (const chunk of manifest.chunks) {
    const requiredBytes = chunk.ciphertextBytes;
    const eligible = Object.values(controlPlane.nodes)
      .map((node) => ({ ...node, usedBytes: plannedUse[node.nodeId] }))
      .filter((node) =>
        nodeEligibility(node, requiredBytes, { requireKyc, batteryThreshold }).eligible
      )
      .sort(
        (left, right) =>
          right.trustScore - left.trustScore ||
          right.storageBytes - left.storageBytes ||
          left.nodeId.localeCompare(right.nodeId)
      );
    const selected = eligible.slice(0, replicationFactor);

    if (selected.length < replicationFactor) {
      throw new Error(
        `Not enough eligible nodes for chunk ${chunk.chunkId}. Needed ${replicationFactor}, found ${selected.length}.`
      );
    }

    for (const node of selected) {
      plannedUse[node.nodeId] += requiredBytes;
      placements.push({
        manifestId: manifest.manifestId,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.index,
        nodeId: node.nodeId,
        bytes: requiredBytes
      });
    }
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    planId: `bos:placement:${sha256Hex(stableStringify({ manifestId: manifest.manifestId, placements })).slice(0, 32)}`,
    manifestId: manifest.manifestId,
    replicationFactor,
    placements,
    createdAt: nowIso()
  };
}

export function commitPlacementPlan(controlPlane, plan) {
  for (const placement of plan.placements) {
    const node = controlPlane.nodes[placement.nodeId];
    if (!node) {
      throw new Error(`Cannot commit placement for unknown node ${placement.nodeId}.`);
    }

    node.usedBytes += placement.bytes;
    controlPlane.commitments.push(placement);
    controlPlane.ledger.push({
      type: 'chunk.placed',
      planId: plan.planId,
      manifestId: placement.manifestId,
      chunkId: placement.chunkId,
      nodeId: placement.nodeId,
      bytes: placement.bytes,
      at: nowIso()
    });
  }

  return plan;
}

export function netContributionScore({ contributedBytes, consumedBytes }) {
  const scoreBytes = contributedBytes - consumedBytes;
  return {
    contributedBytes,
    consumedBytes,
    scoreBytes,
    class: scoreBytes >= 0 ? 'producer' : 'consumer'
  };
}
