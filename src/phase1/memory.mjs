import {
  createEncryptedObject,
  readEncryptedObject,
  sha256Hex,
  stableStringify
} from '../phase0/core.mjs';
import { evaluateDecision, nowIso } from './policy.mjs';

export const MEMORY_PROTOCOL_VERSION = 'bos.phase1.memory.v0';

function normalizeScopes(scopes = ['memory.read', 'consent.record']) {
  if (typeof scopes === 'string') {
    return scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
      .sort();
  }

  return [...new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))].sort();
}

function normalizeTags(tags = []) {
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .sort();
  }

  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].sort();
}

function normalizeOptionalList(value, normalizer) {
  if (value === undefined || value === null || value === '') return [];
  return normalizer(value).map((item) => item.toLowerCase());
}

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function searchableMemoryFields(record) {
  return {
    recordId: record.recordId,
    ownerId: record.ownerId,
    label: record.label,
    contentType: record.contentType,
    sensitivity: record.sensitivity,
    source: stableStringify(record.source ?? {}),
    tags: (record.tags ?? []).join(' '),
    scopes: (record.scopes ?? []).join(' ')
  };
}

function metadataMatches(record, query) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  if (!normalizedQuery) return { matched: true, fields: [], score: 0 };

  const matches = Object.entries(searchableMemoryFields(record))
    .filter(([, value]) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    .map(([field]) => field);

  return {
    matched: matches.length > 0,
    fields: matches,
    score: matches.length
  };
}

export function createMemoryRecord(
  identity,
  plaintext,
  {
    label,
    contentType = 'text/plain; charset=utf-8',
    scopes = ['memory.read', 'consent.record'],
    source = { type: 'user_supplied' },
    tags = [],
    sensitivity = 'personal',
    chunkSizeBytes = 262144,
    createdAt = nowIso()
  } = {}
) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!label) throw new Error('label is required.');
  if (plaintext === undefined || plaintext === null) throw new Error('plaintext is required.');

  const bytes = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  const bundle = createEncryptedObject(identity, bytes, { contentType, chunkSizeBytes });
  const core = {
    protocolVersion: MEMORY_PROTOCOL_VERSION,
    objectType: 'identity-memory-record',
    ownerId: identity.id,
    label,
    contentType,
    manifestId: bundle.manifest.manifestId,
    plaintextBytes: bundle.manifest.plaintextBytes,
    scopes: normalizeScopes(scopes),
    source,
    tags: normalizeTags(tags),
    sensitivity,
    createdAt
  };

  return {
    record: {
      recordId: idFrom('bos:memory', core),
      ...core
    },
    bundle
  };
}

export function memorySummary(record) {
  return {
    recordId: record.recordId,
    ownerId: record.ownerId,
    label: record.label,
    contentType: record.contentType,
    plaintextBytes: record.plaintextBytes,
    scopes: record.scopes,
    source: record.source,
    tags: record.tags ?? [],
    sensitivity: record.sensitivity,
    createdAt: record.createdAt
  };
}

export function memoryProvenance(record) {
  return {
    recordId: record.recordId,
    ownerId: record.ownerId,
    label: record.label,
    source: record.source,
    tags: record.tags ?? [],
    scopes: record.scopes,
    sensitivity: record.sensitivity,
    manifestId: record.manifestId,
    contentType: record.contentType,
    plaintextBytes: record.plaintextBytes,
    createdAt: record.createdAt,
    exposure: 'metadata_only'
  };
}

export function searchMemoryRecords(
  records,
  {
    ownerId,
    query,
    tags,
    scopes,
    limit = 20
  } = {}
) {
  const requestedTags = normalizeOptionalList(tags, normalizeTags);
  const requestedScopes = normalizeOptionalList(scopes, normalizeScopes);
  const requestedLimit = Number.isInteger(Number(limit)) ? Number(limit) : 20;
  const cappedLimit = Math.max(0, Math.min(requestedLimit, 100));

  return records
    .map((record) => {
      const match = metadataMatches(record, query);
      return { record, match };
    })
    .filter(({ record, match }) => {
      if (ownerId && record.ownerId !== ownerId) return false;
      if (!match.matched) return false;

      const recordTags = (record.tags ?? []).map((tag) => String(tag).toLowerCase());
      const recordScopes = (record.scopes ?? []).map((scope) => String(scope).toLowerCase());
      const hasTags = requestedTags.every((tag) => recordTags.includes(tag));
      const hasScopes = requestedScopes.every((scope) => recordScopes.includes(scope));
      return hasTags && hasScopes;
    })
    .sort((left, right) => String(right.record.createdAt).localeCompare(String(left.record.createdAt)))
    .slice(0, cappedLimit)
    .map(({ record, match }) => ({
      ...memorySummary(record),
      provenance: memoryProvenance(record),
      match
    }));
}

export function readMemoryRecord(identity, record, bundle) {
  if (!identity?.id) throw new Error('identity is required.');
  if (identity.id !== record.ownerId) {
    throw new Error(`Identity ${identity.id} cannot read memory owned by ${record.ownerId}.`);
  }
  if (bundle.manifest.manifestId !== record.manifestId) {
    throw new Error(`Memory record ${record.recordId} points to manifest ${record.manifestId}, not ${bundle.manifest.manifestId}.`);
  }

  return readEncryptedObject(identity, bundle);
}

export function evaluateMemoryRead(record, consents = [], {
  granteeId = 'bharat-os-orchestrator',
  piiHandling = 'summary',
  at = nowIso()
} = {}) {
  return evaluateDecision(
    {
      actorId: record.ownerId,
      granteeId,
      actionType: 'memory_read',
      tool: 'memory.vault',
      scopes: record.scopes,
      regulated: true,
      piiHandling,
      metadata: {
        recordId: record.recordId,
        label: record.label,
        source: record.source
      }
    },
    consents,
    { at }
  );
}

export function readMemoryRecordWithConsent(identity, record, bundle, consents = [], options = {}) {
  const decision = evaluateMemoryRead(record, consents, options);
  if (!decision.approved) {
    return {
      approved: false,
      decision,
      plaintext: null
    };
  }

  return {
    approved: true,
    decision,
    plaintext: readMemoryRecord(identity, record, bundle).toString('utf8')
  };
}
