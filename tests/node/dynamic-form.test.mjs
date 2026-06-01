// Phase 12.1b.3 — Dynamic-form substrate tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  FIELD_KINDS,
  VALIDATORS,
  validateAnswers,
  normaliseAnswers,
  normaliseFieldValue,
  buildRoleAnswersEnvelope,
  DYNAMIC_FORM_PROTOCOL_VERSION
} from '../../src/phase0/dynamic-form.mjs';
import {
  PROVIDER_ROLE_FORMS,
  getProviderRoleForm,
  validateRoleAnswers
} from '../../src/phase1/provider-role-forms.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'dynamic-form-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store };
}

// ─── Pure validator core ───────────────────────────────────────────

test('FIELD_KINDS is exactly the v0 set', () => {
  assert.deepEqual(
    FIELD_KINDS.slice().sort(),
    ['boolean', 'integer', 'longtext', 'multiselect', 'select', 'text']
  );
});

test('VALIDATORS registry has the documented v0 names', () => {
  const names = Object.keys(VALIDATORS).sort();
  assert.deepEqual(names, [
    'boolean-required-true',
    'int-range',
    'max-length',
    'non-empty',
    'one-of',
    'plate-region'
  ]);
});

test('non-empty rejects null / "" / [] but accepts non-blank text + non-empty array', () => {
  const f = { id: 'x', kind: 'text', required: true };
  assert.equal(VALIDATORS['non-empty'](null, { field: f }), 'required');
  assert.equal(VALIDATORS['non-empty']('   ', { field: f }), 'required');
  assert.equal(VALIDATORS['non-empty']([], { field: f }), 'required');
  assert.equal(VALIDATORS['non-empty']('ok', { field: f }), null);
  assert.equal(VALIDATORS['non-empty'](['ok'], { field: f }), null);
});

test('plate-region accepts MH / KA but rejects mh / 12 / MUM', () => {
  const f = { id: 'p', kind: 'text', maxLen: 2 };
  assert.equal(VALIDATORS['plate-region']('MH', { field: f }), null);
  assert.equal(VALIDATORS['plate-region']('KA', { field: f }), null);
  assert.equal(VALIDATORS['plate-region']('mh', { field: f }), 'not_plate_region');
  assert.equal(VALIDATORS['plate-region']('MUM', { field: f }), 'not_plate_region');
  assert.equal(VALIDATORS['plate-region'](null, { field: f }), null);
});

test('int-range respects field.min and field.max', () => {
  const f = { id: 's', kind: 'integer', min: 2, max: 8 };
  assert.equal(VALIDATORS['int-range'](4, { field: f }), null);
  assert.equal(VALIDATORS['int-range'](1, { field: f }), 'below_min');
  assert.equal(VALIDATORS['int-range'](9, { field: f }), 'above_max');
  assert.equal(VALIDATORS['int-range']('not int', { field: f }), 'not_integer');
});

test('one-of treats array as multiselect', () => {
  const f = { id: 'l', kind: 'multiselect', options: [{ value: 'hi' }, { value: 'en' }] };
  assert.equal(VALIDATORS['one-of'](['hi'], { field: f }), null);
  assert.equal(VALIDATORS['one-of'](['hi', 'fr'], { field: f }), 'not_in_options');
});

test('normaliseFieldValue trims text + truncates to maxLen', () => {
  const f = { id: 'd', kind: 'text', maxLen: 5 };
  assert.equal(normaliseFieldValue(f, '  hello world  '), 'hello');
  assert.equal(normaliseFieldValue(f, '   '), '');
});

test('normaliseFieldValue dedupes + caps multiselect', () => {
  const f = { id: 'l', kind: 'multiselect', max: 3 };
  assert.deepEqual(normaliseFieldValue(f, ['hi', 'en', 'hi', 'mr', 'ta']), ['hi', 'en', 'mr']);
});

test('validateAnswers strips empty values from the normalised payload', () => {
  const schema = {
    fields: [
      { id: 'a', kind: 'text' },
      { id: 'b', kind: 'boolean' }
    ]
  };
  const r = validateAnswers(schema, { a: '   ', b: false });
  assert.ok(r.ok);
  assert.deepEqual(r.normalized, { b: false }, 'b is kept; a is stripped (empty after trim)');
});

test('validateAnswers gates dependsOn fields', () => {
  const schema = {
    fields: [
      { id: 'canCook', kind: 'boolean' },
      {
        id: 'canCookNonVeg',
        kind: 'boolean',
        dependsOn: { fieldId: 'canCook', equals: true }
      }
    ]
  };
  // gated off — non-empty value not allowed.
  let r = validateAnswers(schema, { canCook: false, canCookNonVeg: true });
  assert.equal(r.ok, false);
  assert.equal(r.errors.canCookNonVeg, 'gated_off_must_be_empty');
  // gated on — child can be true.
  r = validateAnswers(schema, { canCook: true, canCookNonVeg: true });
  assert.ok(r.ok);
  assert.deepEqual(r.normalized, { canCook: true, canCookNonVeg: true });
});

test('validateAnswers caps the serialised payload at 4 KB', () => {
  const long = 'x'.repeat(5000);
  const schema = { fields: [{ id: 'long', kind: 'longtext', maxLen: 5000 }] };
  const r = validateAnswers(schema, { long });
  assert.equal(r.ok, false);
  assert.equal(r.errors.__schema, 'too_large');
});

test('validateAnswers passes-through unknown / empty schemas (forward-compat)', () => {
  const r = validateAnswers({ fields: [] }, { ignored: 'value' });
  assert.deepEqual(r, { ok: true, errors: {}, normalized: {} });
});

test('DYNAMIC_FORM_PROTOCOL_VERSION constant present', () => {
  assert.ok(DYNAMIC_FORM_PROTOCOL_VERSION.startsWith('bos.phase0.dynamic-form.'));
});

test('buildRoleAnswersEnvelope shape', () => {
  const env = buildRoleAnswersEnvelope({ a: 1 });
  assert.deepEqual(env, { schemaVersion: 1, values: { a: 1 } });
});

// ─── Per-role schemas ──────────────────────────────────────────────

test('PROVIDER_ROLE_FORMS exposes exactly the 4 wave-1 roles', () => {
  assert.deepEqual(
    Object.keys(PROVIDER_ROLE_FORMS).sort(),
    ['cab-driver', 'household-help', 'labourers', 'personal-driver']
  );
});

test('getProviderRoleForm returns null for wave-2 (forward-compat)', () => {
  assert.equal(getProviderRoleForm('kirana'), null);
  assert.equal(getProviderRoleForm('skilled-trades'), null);
});

test('validateRoleAnswers cab-driver happy path', () => {
  const r = validateRoleAnswers('cab-driver', {
    vehicleType: 'taxi-sedan',
    seats: 4,
    plateRegion: 'MH',
    acAvailable: true,
    languages: ['hi', 'mr']
  });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.envelope.schemaVersion, 1);
  assert.equal(r.envelope.values.vehicleType, 'taxi-sedan');
});

test('validateRoleAnswers cab-driver rejects malformed plate', () => {
  const r = validateRoleAnswers('cab-driver', {
    vehicleType: 'taxi-sedan',
    seats: 4,
    plateRegion: 'mh',
    languages: ['hi']
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors.plateRegion, 'not_plate_region');
});

test('validateRoleAnswers household-help non-veg gated by canCook', () => {
  const r = validateRoleAnswers('household-help', {
    canCook: false,
    canCookNonVeg: true,
    languages: ['hi']
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors.canCookNonVeg, 'gated_off_must_be_empty');
});

test('validateRoleAnswers wave-2 role passes through ok with null envelope', () => {
  const r = validateRoleAnswers('kirana', { anything: 'goes' });
  assert.deepEqual(r, { ok: true, errors: {}, envelope: null });
});

// ─── HTTP integration ─────────────────────────────────────────────

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

test('GET /api/provider-role-forms returns all 4 wave-1 schemas', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/provider-role-forms`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(Object.keys(body.forms).sort(), ['cab-driver', 'household-help', 'labourers', 'personal-driver']);
  });
});

test('GET /api/provider-role-forms/:roleKind returns the schema; 404 for unknown', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r1 = await fetch(`${baseUrl}/api/provider-role-forms/cab-driver`);
    assert.equal(r1.status, 200);
    const r2 = await fetch(`${baseUrl}/api/provider-role-forms/kirana`);
    assert.equal(r2.status, 404);
  });
});

test('POST /api/identities/:id/provider-identities accepts roleAnswerValues + persists envelope', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const r = await fetch(`${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roleKind: 'cab-driver',
        displayName: 'Ravi',
        ratePaisePerHour: 30000,
        ratePaisePerService: 50000,
        serviceArea: {
          kind: 'point-radius',
          center: { lat: 18.5204, lng: 73.8567 },
          radiusMeters: 5000,
          source: 'manual'
        },
        roleAnswerValues: {
          vehicleType: 'auto-rickshaw',
          seats: 3,
          plateRegion: 'MH',
          acAvailable: false,
          languages: ['hi', 'mr']
        }
      })
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.providerIdentity.roleAnswers.schemaVersion, 1);
    assert.equal(body.providerIdentity.roleAnswers.values.vehicleType, 'auto-rickshaw');
  });
});

test('POST provider-identities rejects invalid roleAnswerValues with 400 + per-field errors', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const r = await fetch(`${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roleKind: 'cab-driver',
        displayName: 'Ravi',
        ratePaisePerService: 5000,
        serviceArea: { kind: 'point-radius', center: { lat: 18, lng: 73 }, radiusMeters: 5000, source: 'manual' },
        roleAnswerValues: {
          vehicleType: 'taxi-sedan',
          seats: 99,           // above_max
          plateRegion: 'mh',   // not_plate_region
          languages: ['xx']    // not_in_options
        }
      })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'invalid_role_answers');
    assert.equal(body.error.errors.seats, 'above_max');
    assert.equal(body.error.errors.plateRegion, 'not_plate_region');
    assert.equal(body.error.errors.languages, 'not_in_options');
  });
});

test('POST /api/provider-identities/:id/profile re-validates roleAnswerValues + appends provider_identity.updated ledger event', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    // First create a provider.
    const createResp = await fetch(`${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roleKind: 'household-help',
        displayName: 'Lakshmi',
        ratePaisePerService: 5000,
        serviceArea: { kind: 'point-radius', center: { lat: 18, lng: 73 }, radiusMeters: 5000, source: 'manual' }
      })
    });
    assert.equal(createResp.status, 201);
    const { providerIdentity } = await createResp.json();
    // Now PATCH-equivalent (POST .../profile) with role answers.
    const update = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootIdentityId: root.id,
        roleAnswerValues: {
          canCook: true,
          canCookNonVeg: true,
          languages: ['hi', 'ta']
        }
      })
    });
    assert.equal(update.status, 200);
    const body = await update.json();
    assert.equal(body.providerIdentity.roleAnswers.values.canCook, true);
    assert.equal(body.providerIdentity.roleAnswers.values.canCookNonVeg, true);
    // Verify the new ledger event fired.
    const ledger = await store.listLedger({ limit: 100 });
    const updated = ledger.filter((e) => e.type === 'provider_identity.updated');
    assert.equal(updated.length, 1);
    assert.deepEqual(updated[0].updatedFields, ['roleAnswers']);
  });
});

test('publicProviderRecord does NOT echo roleAnswers (citizen privacy)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const root = createIdentity({ displayName: 'Root' });
    await store.saveIdentity(root);
    const create = await fetch(`${baseUrl}/api/identities/${encodeURIComponent(root.id)}/provider-identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roleKind: 'labourers',
        displayName: 'L',
        ratePaisePerService: 5000,
        serviceArea: { kind: 'point-radius', center: { lat: 18, lng: 73 }, radiusMeters: 5000, source: 'manual' },
        roleAnswerValues: {
          tradeSpecialities: ['construction'],
          languages: ['hi']
        }
      })
    });
    const { providerIdentity } = await create.json();
    const pub = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(providerIdentity.providerIdentityId)}`);
    const body = await pub.json();
    assert.equal('roleAnswers' in body.providerIdentity, false);
  });
});

// ─── §15 binding grep ─────────────────────────────────────────────

test('§15 binding: dynamic-form.mjs source has no override / commission / route-by-answer', async () => {
  const src = await fs.readFile(path.join(repoRoot, 'src/phase0/dynamic-form.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/\boverride\b/.test(code), 'no override field');
  assert.ok(!/\bcommission\b/.test(code), 'no commission field');
  assert.ok(!/\bplatformFee\b/.test(code), 'no platformFee field');
  assert.ok(!/\brouteBy[A-Z]/.test(code), 'no routeBy* field');
});
