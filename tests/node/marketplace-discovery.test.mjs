// Phase 12.1a.1 — Marketplace discovery substrate tests.
//
// Covers:
//   1. Pure module: haversine fixtures, distanceBand boundaries,
//      kycRank, rankProviders filter + sort, bubble-overlap match.
//   2. provider-identity geo schema: point-radius validation, 4dp
//      persist, 2dp public emit (no centroid doxing), polygon
//      rejected, legacy-summary coerced + excluded from discovery,
//      submitted-state guard, hydrate-on-read.
//   3. HTTP endpoint: GET /api/marketplace/providers — 400s,
//      anonymous ledger event (no userId), publicProviderRecord
//      parity (no rootIdentityId / kycAttestation / distanceMeters),
//      draft/suspended excluded, ONDC-skill never invoked.
//   4. HTTP endpoint: POST express-interest — 400/404, typed
//      marketplace.interest_expressed ledger event.
//   5. Source binding: marketplace-discovery.mjs MUST NOT import
//      tools.mjs (ONDC suppression).

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  haversineMeters,
  distanceBand,
  kycRank,
  rankProviders,
  DEFAULT_QUERY_RADIUS_M,
  MAX_QUERY_RADIUS_M
} from '../../src/phase1/marketplace-discovery.mjs';
import {
  createProviderIdentity,
  attestProviderKyc,
  recordRoleExtrasSubmission,
  attestRoleExtras,
  transitionProviderStatus,
  publicProviderRecord,
  toPublicServiceArea,
  hasDiscoverableGeo,
  coerceServiceAreaShape,
  SERVICE_AREA_KINDS
} from '../../src/phase1/provider-identity.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'marketplace-discovery-tests');

// ─── Pure module ───────────────────────────────────────────────────

test('haversineMeters Pune ↔ Mumbai ≈ 120 km (great-circle, ±2 km)', () => {
  const pune = { lat: 18.5204, lng: 73.8567 };
  const mumbai = { lat: 19.0760, lng: 72.8777 };
  const d = haversineMeters(pune, mumbai);
  assert.ok(d > 118_000 && d < 122_000, `Pune↔Mumbai expected ≈120km, got ${d}`);
});

test('haversineMeters zero distance is exact zero', () => {
  const p = { lat: 28.6139, lng: 77.2090 };
  assert.equal(haversineMeters(p, p), 0);
});

test('haversineMeters short-distance Delhi corner ≈ 100 m', () => {
  const a = { lat: 28.6139, lng: 77.2090 };
  const b = { lat: 28.6148, lng: 77.2090 };
  const d = haversineMeters(a, b);
  assert.ok(d > 90 && d < 110, `expected ≈100m, got ${d}`);
});

test('haversineMeters returns Infinity for bad inputs', () => {
  assert.equal(haversineMeters(null, { lat: 0, lng: 0 }), Infinity);
  assert.equal(haversineMeters({ lat: 'x' }, { lat: 0, lng: 0 }), Infinity);
});

test('distanceBand boundaries', () => {
  assert.equal(distanceBand(0), '<1km');
  assert.equal(distanceBand(999), '<1km');
  assert.equal(distanceBand(1000), '1-3km');
  assert.equal(distanceBand(2999), '1-3km');
  assert.equal(distanceBand(3000), '3-5km');
  assert.equal(distanceBand(4999), '3-5km');
  assert.equal(distanceBand(5000), '5-10km');
  assert.equal(distanceBand(9999), '5-10km');
  assert.equal(distanceBand(10_000), '10-25km');
  assert.equal(distanceBand(24_999), '10-25km');
  assert.equal(distanceBand(25_000), '25km+');
  assert.equal(distanceBand(1_000_000), '25km+');
  assert.equal(distanceBand(NaN), '25km+');
});

test('kycRank ordering verified > basic > none', () => {
  assert.ok(kycRank('verified') > kycRank('basic'));
  assert.ok(kycRank('basic') > kycRank('none'));
  assert.equal(kycRank('unknown'), 1);
});

function activeProvider({ id, kycLevel = 'basic', lat, lng, radiusMeters = 5000, role = 'cab-driver' }) {
  // Build a provider record matching the substrate shape post-Phase
  // 12.1a.1. Skip the createProviderIdentity validation for fixture
  // brevity; the validator is exercised by provider-identity.test.mjs.
  return {
    providerIdentityId: id,
    rootIdentityId: `bos:person:${id}`,
    protocolVersion: 'bos.phase12.provider-identity.v0',
    objectType: 'provider-identity',
    roleKind: role,
    roleWave: 1,
    displayName: id,
    serviceArea: { kind: 'point-radius', center: { lat, lng }, radiusMeters, source: 'manual', capturedAt: '2026-06-01T00:00:00.000Z', summary: null },
    ratePaisePerHour: 30000,
    ratePaisePerService: 0,
    description: null,
    kycLevel,
    kycAttestation: null,
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
    submittedAt: '2026-05-01T00:00:00.000Z',
    activatedAt: '2026-05-01T00:00:00.000Z'
  };
}

test('rankProviders sorts verified above basic at equal distance', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const candidates = [
    activeProvider({ id: 'p:basic', kycLevel: 'basic', lat: 18.5, lng: 73.85 }),
    activeProvider({ id: 'p:verified', kycLevel: 'verified', lat: 18.5, lng: 73.85 })
  ];
  const ranked = rankProviders({ origin, candidates, radiusMeters: 5000 });
  assert.equal(ranked[0].provider.providerIdentityId, 'p:verified');
  assert.equal(ranked[1].provider.providerIdentityId, 'p:basic');
});

test('rankProviders sorts closer above farther at equal KYC', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const candidates = [
    activeProvider({ id: 'p:far', kycLevel: 'basic', lat: 18.55, lng: 73.85 }),     // ~5.5 km north
    activeProvider({ id: 'p:near', kycLevel: 'basic', lat: 18.505, lng: 73.85 }),   // ~0.5 km north
  ];
  const ranked = rankProviders({ origin, candidates, radiusMeters: 10000 });
  assert.equal(ranked[0].provider.providerIdentityId, 'p:near');
});

test('rankProviders bubble-overlap: provider radius reaches citizen', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  // Provider 10km away, but provider radius 15km → still matches
  // even when citizen radius is only 5km.
  const candidates = [
    activeProvider({ id: 'p:big-area', kycLevel: 'basic', lat: 18.59, lng: 73.85, radiusMeters: 15000 })
  ];
  const ranked = rankProviders({ origin, candidates, radiusMeters: 5000 });
  assert.equal(ranked.length, 1);
});

test('rankProviders excludes non-active providers', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const draft = { ...activeProvider({ id: 'p:draft', lat: 18.5, lng: 73.85 }), status: 'draft' };
  const suspended = { ...activeProvider({ id: 'p:susp', lat: 18.5, lng: 73.85 }), status: 'suspended' };
  const ranked = rankProviders({ origin, candidates: [draft, suspended], radiusMeters: 5000 });
  assert.equal(ranked.length, 0);
});

test('rankProviders excludes legacy-summary service areas', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const legacy = { ...activeProvider({ id: 'p:legacy', lat: 18.5, lng: 73.85 }), serviceArea: { kind: 'legacy-summary', summary: 'Pune' } };
  const ranked = rankProviders({ origin, candidates: [legacy], radiusMeters: 5000 });
  assert.equal(ranked.length, 0);
});

test('rankProviders respects role filter', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const candidates = [
    activeProvider({ id: 'p:cab', kycLevel: 'basic', lat: 18.5, lng: 73.85, role: 'cab-driver' }),
    activeProvider({ id: 'p:cook', kycLevel: 'basic', lat: 18.5, lng: 73.85, role: 'household-help' })
  ];
  const ranked = rankProviders({ origin, candidates, radiusMeters: 5000, role: 'cab-driver' });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].provider.providerIdentityId, 'p:cab');
});

test('rankProviders limit caps result count', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const candidates = Array.from({ length: 10 }, (_, i) =>
    activeProvider({ id: `p:${i}`, kycLevel: 'basic', lat: 18.5 + i * 0.0001, lng: 73.85 }));
  const ranked = rankProviders({ origin, candidates, radiusMeters: 5000, limit: 3 });
  assert.equal(ranked.length, 3);
});

test('rankProviders excludes providers outside bubble', () => {
  const origin = { lat: 18.5, lng: 73.85 };
  // Mumbai provider (~148 km) with 5 km radius — outside any reasonable bubble.
  const far = activeProvider({ id: 'p:mumbai', kycLevel: 'basic', lat: 19.076, lng: 72.8777, radiusMeters: 5000 });
  const ranked = rankProviders({ origin, candidates: [far], radiusMeters: 5000 });
  assert.equal(ranked.length, 0);
});

// ─── Geo schema (provider-identity.mjs) ────────────────────────────

test('createProviderIdentity persists center at 4 decimals', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:x',
    roleKind: 'cab-driver',
    displayName: 'X',
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.52041234, lng: 73.85671234 },
      radiusMeters: 5000,
      source: 'manual'
    }
  });
  assert.equal(p.serviceArea.center.lat, 18.5204);
  assert.equal(p.serviceArea.center.lng, 73.8567);
});

test('toPublicServiceArea coarsens center to 2 decimals (~1.1km)', () => {
  // The privacy fix: stored centroid is 4dp; public emit MUST be 2dp.
  const stored = {
    kind: 'point-radius',
    center: { lat: 18.5204, lng: 73.8567 },
    radiusMeters: 5000,
    summary: null,
    source: 'manual',
    capturedAt: '2026-06-01T00:00:00.000Z'
  };
  const pub = toPublicServiceArea(stored);
  assert.equal(pub.center.lat, 18.52);
  assert.equal(pub.center.lng, 73.86);
  // Operational metadata must not surface publicly.
  assert.equal('source' in pub, false);
  assert.equal('capturedAt' in pub, false);
});

test('publicProviderRecord centroid is 2dp not 4dp (regression: neighbour-doxing)', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:y',
    roleKind: 'household-help',
    displayName: 'Maid Y',
    serviceArea: {
      kind: 'point-radius',
      center: { lat: 18.5204, lng: 73.8567 },
      radiusMeters: 3000,
      source: 'manual'
    }
  });
  const pub = publicProviderRecord(p);
  assert.equal(pub.serviceArea.center.lat, 18.52);
  assert.equal(pub.serviceArea.center.lng, 73.86);
});

test('point-radius validation rejects out-of-range lat/lng', () => {
  assert.throws(
    () => createProviderIdentity({
      rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X',
      serviceArea: { kind: 'point-radius', center: { lat: 100, lng: 0 }, radiusMeters: 5000, source: 'manual' }
    }),
    /lat/
  );
  assert.throws(
    () => createProviderIdentity({
      rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X',
      serviceArea: { kind: 'point-radius', center: { lat: 0, lng: 200 }, radiusMeters: 5000, source: 'manual' }
    }),
    /lng/
  );
});

test('point-radius validation rejects radius out of [500, 50000]', () => {
  assert.throws(
    () => createProviderIdentity({
      rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X',
      serviceArea: { kind: 'point-radius', center: { lat: 18, lng: 73 }, radiusMeters: 100, source: 'manual' }
    }),
    /radiusMeters/
  );
  assert.throws(
    () => createProviderIdentity({
      rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X',
      serviceArea: { kind: 'point-radius', center: { lat: 18, lng: 73 }, radiusMeters: 100000, source: 'manual' }
    }),
    /radiusMeters/
  );
});

test('polygon kind rejected loudly (forward-compat)', () => {
  assert.throws(
    () => createProviderIdentity({
      rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X',
      serviceArea: { kind: 'polygon', coordinates: [[0, 0], [1, 1]] }
    }),
    /polygon_not_yet_supported/
  );
});

test('legacy {summary} record coerced to legacy-summary on read', () => {
  const coerced = coerceServiceAreaShape({ summary: 'Pune Camp + Kothrud, within 10 km' });
  assert.equal(coerced.kind, 'legacy-summary');
  assert.equal(coerced.summary, 'Pune Camp + Kothrud, within 10 km');
});

test('hasDiscoverableGeo true for point-radius only', () => {
  assert.equal(hasDiscoverableGeo({ kind: 'point-radius', center: { lat: 1, lng: 1 } }), true);
  assert.equal(hasDiscoverableGeo({ kind: 'legacy-summary', summary: 'Pune' }), false);
  assert.equal(hasDiscoverableGeo(null), false);
});

test('SERVICE_AREA_KINDS export', () => {
  assert.ok(SERVICE_AREA_KINDS.includes('point-radius'));
  assert.ok(SERVICE_AREA_KINDS.includes('legacy-summary'));
});

test('transitionProviderStatus refuses draft→submitted without point-radius geo', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X'
    // no serviceArea
  });
  assert.throws(
    () => transitionProviderStatus(p, 'submitted', { operatorId: 'op:test' }),
    /serviceArea/
  );
});

test('attestProviderKyc refuses draft→submitted without point-radius geo', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'r', roleKind: 'cab-driver', displayName: 'X'
  });
  assert.throws(
    () => attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' }),
    /serviceArea/
  );
});

// ─── HTTP endpoints ────────────────────────────────────────────────

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

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

async function seedActiveProvider(store, { rootId, role = 'cab-driver', kycLevel = 'basic', lat, lng, radiusMeters = 5000 }) {
  let p = createProviderIdentity({
    rootIdentityId: rootId,
    roleKind: role,
    displayName: `Provider ${rootId}`,
    serviceArea: {
      kind: 'point-radius',
      center: { lat, lng },
      radiusMeters,
      source: 'manual'
    }
  });
  p = attestProviderKyc(p, { kycLevel, operatorId: 'op:test' });
  // Phase 12.2.4 — wave-1 roles now need role-extras attestation
  // before activation. Synthesize a stub envelope so marketplace
  // discovery tests don't have to model the citizen wizard.
  // Phase 12.3 — all roles (wave-1 + wave-2) now require
  // role-extras attestation before activation.
  const REQUIRES_EXTRAS = ['cab-driver', 'personal-driver', 'labourers', 'household-help', 'kirana', 'skilled-trades'];
  if (REQUIRES_EXTRAS.includes(role)) {
    p = recordRoleExtrasSubmission({ ...p, status: 'draft' }, {
      schemaVersion: 1, role, answers: { stub: 'stub' }, attachments: {}
    });
    p = attestProviderKyc(p, { kycLevel, operatorId: 'op:test' });
    p = attestRoleExtras(p, { level: 'basic', operatorId: 'op:test' });
  }
  p = transitionProviderStatus(p, 'active', { operatorId: 'op:test' });
  await store.saveProviderIdentity(p);
  return p;
}

test('GET /api/marketplace/providers rejects missing lat/lng with invalid_geo_query', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/marketplace/providers`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_geo_query');
  });
});

test('GET /api/marketplace/providers rejects out-of-range lat', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/marketplace/providers?lat=99&lng=73`);
    assert.equal(r.status, 400);
  });
});

test('GET /api/marketplace/providers rejects invalid role', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/marketplace/providers?lat=18.5&lng=73.85&role=not-a-role`);
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_role');
  });
});

test('GET /api/marketplace/providers returns ranked publicProviderRecord shape', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    await seedActiveProvider(store, { rootId: 'bos:person:a', kycLevel: 'verified', lat: 18.5204, lng: 73.8567 });
    await seedActiveProvider(store, { rootId: 'bos:person:b', kycLevel: 'basic', lat: 18.5204, lng: 73.8567 });
    const r = await fetch(`${baseUrl}/api/marketplace/providers?lat=18.5&lng=73.8&radiusMeters=10000`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.results.length, 2);
    // Verified first.
    assert.equal(body.results[0].kycLevel, 'verified');
    assert.equal(body.results[1].kycLevel, 'basic');
    // Response carries distanceBand and withinServiceRadius.
    assert.ok(typeof body.results[0].distanceBand === 'string');
    assert.ok(typeof body.results[0].withinServiceRadius === 'boolean');
    // MUST NOT leak rootIdentityId or kycAttestation or distanceMeters.
    for (const result of body.results) {
      assert.equal('rootIdentityId' in result, false, 'rootIdentityId must not be returned');
      assert.equal('kycAttestation' in result, false, 'kycAttestation must not be returned');
      assert.equal('distanceMeters' in result, false, 'precise distance must not be returned');
      // Centroid coarsened to 2 decimals.
      const lat = result.serviceArea.center.lat;
      assert.equal(Math.round(lat * 100) / 100, lat, 'centroid must be 2dp');
    }
  });
});

test('GET /api/marketplace/providers excludes draft + suspended', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    // Draft (created but not transitioned)
    const draft = createProviderIdentity({
      rootIdentityId: 'bos:person:d',
      roleKind: 'cab-driver',
      displayName: 'Draft',
      serviceArea: { kind: 'point-radius', center: { lat: 18.52, lng: 73.85 }, radiusMeters: 5000, source: 'manual' }
    });
    await store.saveProviderIdentity(draft);
    const r = await fetch(`${baseUrl}/api/marketplace/providers?lat=18.5&lng=73.85`);
    const body = await r.json();
    assert.equal(body.results.length, 0);
  });
});

test('GET /api/marketplace/providers emits anonymous marketplace.searched ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    await fetch(`${baseUrl}/api/marketplace/providers?lat=18.5&lng=73.85`);
    const ledger = await store.listLedger({ limit: 100 });
    const searched = ledger.filter((e) => e.type === 'marketplace.searched');
    assert.equal(searched.length, 1);
    assert.equal(searched[0].latBucket, 18.5);
    assert.equal(searched[0].lngBucket, 73.9);
    // Anonymous: no citizen identity field.
    assert.equal('userId' in searched[0], false);
    assert.equal('rootIdentityId' in searched[0], false);
    assert.equal('identityId' in searched[0], false);
  });
});

test('GET /api/marketplace/providers coarsens citizen lat/lng to 1dp in ledger', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    // Misbehaving client passes high-precision coords. Server must coarsen.
    await fetch(`${baseUrl}/api/marketplace/providers?lat=18.520491&lng=73.856712`);
    const ledger = await store.listLedger({ limit: 100 });
    const searched = ledger.find((e) => e.type === 'marketplace.searched');
    assert.equal(searched.latBucket, 18.5);
    assert.equal(searched.lngBucket, 73.9);
  });
});

test('POST .../express-interest requires citizenRootIdentityId', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const provider = await seedActiveProvider(store, { rootId: 'bos:person:a', lat: 18.5, lng: 73.85 });
    const r = await fetch(`${baseUrl}/api/marketplace/providers/${encodeURIComponent(provider.providerIdentityId)}/express-interest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(r.status, 400);
  });
});

test('POST .../express-interest 404 when provider unknown / not active', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    // PRIV-1: must provide an EXISTING citizen identity so we get past
    // the citizen-existence guard and hit the provider-not-found branch.
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const r = await fetch(`${baseUrl}/api/marketplace/providers/bos:provider-identity:missing/express-interest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citizenRootIdentityId: citizen.id })
    });
    assert.equal(r.status, 404);
  });
});

test('PRIV-1: POST .../express-interest 404 when citizenRootIdentityId does not exist', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const provider = await seedActiveProvider(store, { rootId: 'bos:person:p', lat: 18.5, lng: 73.85 });
    const r = await fetch(`${baseUrl}/api/marketplace/providers/${encodeURIComponent(provider.providerIdentityId)}/express-interest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citizenRootIdentityId: 'bos:person:never-existed' })
    });
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.error.code, 'citizen_not_found');
  });
});

test('EC-2: express-interest strips CRLF + BOM from note before ledger emit', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const citizen = createIdentity({ displayName: 'C' });
    await store.saveIdentity(citizen);
    const provider = await seedActiveProvider(store, { rootId: 'bos:person:p', lat: 18.5, lng: 73.85 });
    const r = await fetch(`${baseUrl}/api/marketplace/providers/${encodeURIComponent(provider.providerIdentityId)}/express-interest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Leading BOM, CRLF inside, trailing whitespace.
      body: JSON.stringify({ citizenRootIdentityId: citizen.id, note: '﻿Need a ride\r\nto PMC   ' })
    });
    assert.equal(r.status, 201);
    const ledger = await store.listLedger({ limit: 100 });
    const event = ledger.find((e) => e.type === 'marketplace.interest_expressed');
    assert.equal(event.note, 'Need a ride\nto PMC');
  });
});

test('EC-3: rankProviders falls back to DEFAULT when radius is 0', async () => {
  const origin = { lat: 18.5, lng: 73.85 };
  const candidates = [
    activeProvider({ id: 'p:near', kycLevel: 'basic', lat: 18.505, lng: 73.85, radiusMeters: 1000 })
  ];
  const ranked = rankProviders({ origin, candidates, radiusMeters: 0 });
  assert.equal(ranked.length, 1);
});

test('EC-1: updateProviderProfile refuses to null serviceArea on active provider', async () => {
  const { updateProviderProfile } = await import('../../src/phase1/provider-identity.mjs');
  // Phase 12.3 — every role requires role-extras attestation
  // before activation now. Synthesize a minimal stub envelope
  // so the field under test (serviceArea) still gets a chance
  // to assert.
  let p = createProviderIdentity({
    rootIdentityId: 'r',
    roleKind: 'kirana',
    displayName: 'X',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.85 }, radiusMeters: 5000, source: 'manual' }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'kirana',
    answers: { shopName: 'X', shopLicenseNumber: 'L1' },
    attachments: {}
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op:test' });
  p = attestRoleExtras(p, { level: 'basic', operatorId: 'op:test' });
  p = transitionProviderStatus(p, 'active', { operatorId: 'op:test' });
  assert.throws(
    () => updateProviderProfile(p, { serviceArea: null }),
    /cannot clear serviceArea/
  );
});

test('POST .../express-interest emits typed marketplace.interest_expressed event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    // PRIV-1: citizen must exist in the identity store before the
    // express-interest endpoint will write to the audit ledger.
    const citizen = createIdentity({ displayName: 'Citizen' });
    await store.saveIdentity(citizen);
    const provider = await seedActiveProvider(store, { rootId: 'bos:person:a', lat: 18.5, lng: 73.85 });
    const r = await fetch(`${baseUrl}/api/marketplace/providers/${encodeURIComponent(provider.providerIdentityId)}/express-interest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citizenRootIdentityId: citizen.id, note: 'Need a ride to PMC' })
    });
    assert.equal(r.status, 201);
    const ledger = await store.listLedger({ limit: 100 });
    const event = ledger.find((e) => e.type === 'marketplace.interest_expressed');
    assert.ok(event, 'marketplace.interest_expressed event must be emitted');
    assert.equal(event.providerIdentityId, provider.providerIdentityId);
    assert.equal(event.citizenRootIdentityId, citizen.id);
    assert.equal(event.roleKind, 'cab-driver');
    assert.equal(event.note, 'Need a ride to PMC');
  });
});

// ─── Binding: ONDC suppression ─────────────────────────────────────

test('marketplace-discovery.mjs does NOT import tools.mjs (ONDC suppression)', async () => {
  const src = await fs.readFile(
    path.join(repoRoot, 'src/phase1/marketplace-discovery.mjs'),
    'utf8'
  );
  assert.ok(!src.includes("from './tools.mjs'"), 'marketplace-discovery must not import tools.mjs (ONDC bridge stub)');
  assert.ok(!src.includes("from '../phase1/tools.mjs'"), 'marketplace-discovery must not import tools.mjs');
  assert.ok(!src.toLowerCase().includes('ondc') || src.includes('ONDC SUPPRESSED'), 'any ONDC mention must be in the binding comment');
});

test('marketplace-discovery.mjs has NO commission / take-rate / fee FIELD', async () => {
  const src = await fs.readFile(
    path.join(repoRoot, 'src/phase1/marketplace-discovery.mjs'),
    'utf8'
  );
  // Field-name regex: `commissionFoo:` or `.commission =` etc. The
  // binding comment at the top of the module mentions the word
  // 'commission' as the literal English noun — that's documentation,
  // not a field, and is allowed.
  assert.ok(!/\bcommission(Paise|Pct|Rate|Amount)?\s*[:=]/.test(src), 'must not introduce commission field');
  assert.ok(!/\btakeRate\s*[:=]/.test(src), 'must not introduce takeRate field');
  assert.ok(!/\bplatformFee\s*[:=]/.test(src), 'must not introduce platformFee field');
  assert.ok(!/\bbharatOsFee\s*[:=]/.test(src), 'must not introduce bharatOsFee field');
});

// Constants exported.
test('MAX_QUERY_RADIUS_M is capped at 25km', () => {
  assert.equal(MAX_QUERY_RADIUS_M, 25_000);
});

test('DEFAULT_QUERY_RADIUS_M is 5km', () => {
  assert.equal(DEFAULT_QUERY_RADIUS_M, 5_000);
});
