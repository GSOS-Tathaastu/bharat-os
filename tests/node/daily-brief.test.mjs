// Phase 2a.19 — daily brief composer (signal gather + template render).

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  DAILY_BRIEF_PROTOCOL_VERSION,
  gatherDailyBriefSignals,
  renderDailyBrief
} from '../../src/phase1/daily-brief.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'daily-brief-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { root, store };
}

test('gatherDailyBriefSignals returns an empty shape for a brand-new identity', async () => {
  const { store } = await freshStore('empty');
  const identity = createIdentity({ displayName: 'Fresh actor' });
  await store.saveIdentity(identity);
  const signals = await gatherDailyBriefSignals(store, identity.id);
  assert.equal(signals.protocolVersion, DAILY_BRIEF_PROTOCOL_VERSION);
  assert.equal(signals.recent.length, 0);
  assert.equal(signals.mesh.eventCount, 0);
  assert.equal(signals.mesh.earnedPaise, 0);
  assert.equal(signals.expiringConsents.length, 0);
  assert.equal(signals.openFlags, 0);
});

test('gatherDailyBriefSignals folds mesh contribution events into earned-paise total', async () => {
  const { store } = await freshStore('mesh');
  const identity = createIdentity({ displayName: 'Mesh actor' });
  await store.saveIdentity(identity);
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh:e1',
    operatorId: identity.id,
    nodeId: 'bos:node:a',
    workloadType: 'inference',
    tokens: 1_000_000,
    bytes: 0,
    payoutPaise: 800,
    at: new Date().toISOString()
  });
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh:e2',
    operatorId: identity.id,
    nodeId: 'bos:node:a',
    workloadType: 'storage_serve',
    tokens: 0,
    bytes: 1024 * 1024 * 1024,
    payoutPaise: 200,
    at: new Date().toISOString()
  });
  const signals = await gatherDailyBriefSignals(store, identity.id);
  assert.equal(signals.mesh.eventCount, 2);
  assert.equal(signals.mesh.earnedPaise, 1000);
  assert.equal(signals.mesh.tokens, 1_000_000);
});

test('gatherDailyBriefSignals only includes events in the horizon window', async () => {
  const { store } = await freshStore('horizon');
  const identity = createIdentity({ displayName: 'Horizon actor' });
  await store.saveIdentity(identity);
  const oldAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const recentAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh:old',
    operatorId: identity.id,
    workloadType: 'inference',
    payoutPaise: 999,
    at: oldAt
  });
  await store.saveMeshContributionEvent({
    contributionEventId: 'bos:mesh:recent',
    operatorId: identity.id,
    workloadType: 'inference',
    payoutPaise: 111,
    at: recentAt
  });
  const signals = await gatherDailyBriefSignals(store, identity.id, { horizonHours: 24 });
  assert.equal(signals.mesh.eventCount, 1);
  assert.equal(signals.mesh.earnedPaise, 111);
});

test('renderDailyBrief produces locale-appropriate text for each supported locale', () => {
  const signals = {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    horizonHours: 24,
    asOf: new Date().toISOString(),
    recent: [{ summary: 'booked a service', status: 'completed' }],
    mesh: { earnedPaise: 273, tokens: 1000, bytes: 0, eventCount: 2 },
    expiringConsents: [
      { purpose: 'tenant_verification', expiresAt: '2026-06-01T00:00:00.000Z', scopes: ['trust.attest'] }
    ],
    openFlags: 0
  };
  for (const locale of ['en-IN', 'hi-IN', 'hi-Latn-IN', 'mr-IN', 'bho-IN', 'ta-IN', 'bn-IN']) {
    const brief = renderDailyBrief({ signals, locale, displayName: 'Priya' });
    assert.equal(brief.locale, locale);
    assert.equal(brief.renderer, 'template_v0');
    assert.equal(brief.rawPiiReturned, false);
    assert.ok(brief.text.length > 0, `brief has text for ${locale}`);
    assert.ok(brief.sectionsPopulated.includes('mesh'), `${locale} populated mesh section`);
    assert.ok(brief.sectionsPopulated.includes('recent'), `${locale} populated recent section`);
    assert.ok(brief.sectionsPopulated.includes('consents'), `${locale} populated consents section`);
  }
});

test('renderDailyBrief surfaces empty-state lines when no signals fired', () => {
  const signals = {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    horizonHours: 24,
    asOf: new Date().toISOString(),
    recent: [],
    mesh: { earnedPaise: 0, tokens: 0, bytes: 0, eventCount: 0 },
    expiringConsents: [],
    openFlags: 0
  };
  const brief = renderDailyBrief({ signals, locale: 'en-IN' });
  assert.equal(brief.sectionsPopulated.length, 0);
  assert.ok(brief.text.includes('idle'));
  assert.ok(brief.text.includes('No recent actions'));
});

test('renderDailyBrief warns on open §9A flags against the subject', () => {
  const signals = {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    horizonHours: 24,
    asOf: new Date().toISOString(),
    recent: [],
    mesh: { earnedPaise: 0, tokens: 0, bytes: 0, eventCount: 0 },
    expiringConsents: [],
    openFlags: 2
  };
  const brief = renderDailyBrief({ signals, locale: 'en-IN' });
  assert.ok(brief.sectionsPopulated.includes('flags'));
  assert.ok(brief.text.includes('§9A flag'));
});

test('renderDailyBrief footer carries the §7e on-device framing in every locale', () => {
  const signals = {
    protocolVersion: DAILY_BRIEF_PROTOCOL_VERSION,
    horizonHours: 24,
    asOf: new Date().toISOString(),
    recent: [],
    mesh: { earnedPaise: 0, tokens: 0, bytes: 0, eventCount: 0 },
    expiringConsents: [],
    openFlags: 0
  };
  for (const locale of ['en-IN', 'hi-IN', 'hi-Latn-IN', 'mr-IN', 'bho-IN', 'ta-IN', 'bn-IN']) {
    const brief = renderDailyBrief({ signals, locale });
    assert.ok(brief.text.includes('§7e'), `${locale} footer references §7e`);
  }
});

test('renderDailyBrief requires signals; rejects empty input', () => {
  assert.throws(() => renderDailyBrief({}), /signals is required/);
});
