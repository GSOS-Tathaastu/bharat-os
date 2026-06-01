// Phase 12.2.4 — Per-role heavy extras substrate + endpoints +
// activation guard.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity, sha256Hex } from '../../src/phase0/core.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import {
  createProviderIdentity,
  recordRoleExtrasSubmission,
  attestRoleExtras,
  attestProviderKyc,
  transitionProviderStatus,
  selfProviderRecord,
  submitKycLevel1,
  publicProviderRecord,
  ROLE_EXTRAS_ATTESTATION_LEVELS
} from '../../src/phase1/provider-identity.mjs';
import {
  PROVIDER_ROLE_EXTRAS,
  PROVIDER_ROLE_EXTRAS_PROTOCOL_VERSION,
  RoleExtrasValidationError,
  validateRoleExtras,
  getRoleExtrasSchema,
  roleRequiresExtras,
  ROLES_REQUIRING_EXTRAS
} from '../../src/phase1/provider-role-extras.mjs';
import { buildAttachmentRecord } from '../../src/phase1/attachment.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'role-extras-tests');

async function freshSqlite(name) {
  const root = path.join(tmpRoot, `sql-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { store, root };
}

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

// ─── Substrate ────────────────────────────────────────────────────

test('protocol version + frozen role list (wave-1 + wave-2)', () => {
  assert.equal(PROVIDER_ROLE_EXTRAS_PROTOCOL_VERSION, 'bos.phase12.provider-role-extras.v0');
  assert.deepEqual([...ROLES_REQUIRING_EXTRAS].sort(), [
    'cab-driver', 'household-help', 'kirana', 'labourers', 'personal-driver', 'skilled-trades'
  ]);
});

test('every wave-1 role has a schema with required + attachments', () => {
  for (const role of ROLES_REQUIRING_EXTRAS) {
    const s = getRoleExtrasSchema(role);
    assert.ok(s, `${role} schema missing`);
    assert.ok(s.required.length > 0, `${role} has zero required fields`);
    assert.ok(s.requiredAttachmentKinds.length > 0, `${role} has zero required attachment kinds`);
    assert.equal(typeof s.schemaVersion, 'number');
  }
});

test('roleRequiresExtras true for wave-1 + wave-2; false for unknown', () => {
  assert.equal(roleRequiresExtras('cab-driver'), true);
  assert.equal(roleRequiresExtras('personal-driver'), true);
  assert.equal(roleRequiresExtras('labourers'), true);
  assert.equal(roleRequiresExtras('household-help'), true);
  // Phase 12.3 — wave-2 roles flipped from false to true.
  assert.equal(roleRequiresExtras('kirana'), true);
  assert.equal(roleRequiresExtras('skilled-trades'), true);
  assert.equal(roleRequiresExtras('made-up-role'), false);
  assert.equal(roleRequiresExtras(null), false);
});

test('validateRoleExtras happy path — cab-driver', async () => {
  const env = await validateRoleExtras('cab-driver', {
    answers: {
      drivingLicenceNumber: 'MH1420130012345',
      vehicleRegistrationNumber: 'MH12AB1234',
      commercialPermitNumber: 'CP-2025-7890',
      insuranceExpiryDate: '2026-12-31'
    },
    attachments: {
      driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
      vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`
    }
  });
  assert.equal(env.role, 'cab-driver');
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.answers.drivingLicenceNumber, 'MH1420130012345');
  assert.equal(env.answers.insuranceExpiryDate, '2026-12-31');
  assert.ok(env.attachments.driving_licence);
  assert.ok(env.attachments.vehicle_registration);
});

test('validateRoleExtras refuses missing required field', async () => {
  await assert.rejects(
    validateRoleExtras('cab-driver', {
      answers: { drivingLicenceNumber: 'X', vehicleRegistrationNumber: 'Y' },
      attachments: {
        driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
        vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`
      }
    }),
    (e) => e instanceof RoleExtrasValidationError && e.code === 'commercialPermitNumber_required'
  );
});

test('validateRoleExtras refuses missing required attachment kind', async () => {
  await assert.rejects(
    validateRoleExtras('cab-driver', {
      answers: {
        drivingLicenceNumber: 'X',
        vehicleRegistrationNumber: 'Y',
        commercialPermitNumber: 'Z'
      },
      attachments: { driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}` }
    }),
    (e) => e.code === 'vehicle_registration_attachment_required'
  );
});

test('validateRoleExtras refuses unknown answer field (closed substrate)', async () => {
  await assert.rejects(
    validateRoleExtras('cab-driver', {
      answers: {
        drivingLicenceNumber: 'X',
        vehicleRegistrationNumber: 'Y',
        commercialPermitNumber: 'Z',
        bogusField: 'oops'
      },
      attachments: {
        driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
        vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`
      }
    }),
    (e) => e.code === 'unknown_field' && e.field === 'bogusField'
  );
});

test('validateRoleExtras refuses unknown attachment kind', async () => {
  await assert.rejects(
    validateRoleExtras('cab-driver', {
      answers: {
        drivingLicenceNumber: 'X',
        vehicleRegistrationNumber: 'Y',
        commercialPermitNumber: 'Z'
      },
      attachments: {
        driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
        vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`,
        kyc_l1_selfie: `bos:att:${sha256Hex(Buffer.from([9, 9])).slice(0, 32)}`
      }
    }),
    (e) => e.code === 'unknown_attachment_kind' && e.field === 'kyc_l1_selfie'
  );
});

test('validateRoleExtras refuses malformed attachment ID', async () => {
  await assert.rejects(
    validateRoleExtras('labourers', {
      answers: { contractorName: 'Sardar Singh', contractorAttestationNumber: 'A-001' },
      attachments: { contractor_attestation: 'not-an-id' }
    }),
    (e) => e.code === 'contractor_attestation_attachment_invalid'
  );
});

test('validateRoleExtras refuses bad phone shape', async () => {
  await assert.rejects(
    validateRoleExtras('household-help', {
      answers: {
        policeVerificationNumber: 'PCC-1',
        priorEmployerName: 'Mr X',
        priorEmployerContact: '12345' // too short
      },
      attachments: {
        police_verification: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
        employer_reference: `bos:att:${sha256Hex(Buffer.from([1, 2])).slice(0, 32)}`
      }
    }),
    (e) => e.code === 'priorEmployerContact_phone_invalid'
  );
});

test('validateRoleExtras refuses bad date shape + invalid calendar date', async () => {
  const baseOk = {
    drivingLicenceNumber: 'X',
    vehicleRegistrationNumber: 'Y',
    commercialPermitNumber: 'Z'
  };
  const att = {
    driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
    vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`
  };
  await assert.rejects(
    validateRoleExtras('cab-driver', { answers: { ...baseOk, insuranceExpiryDate: '31/12/2026' }, attachments: att }),
    (e) => e.code === 'insuranceExpiryDate_date_invalid'
  );
  await assert.rejects(
    validateRoleExtras('cab-driver', { answers: { ...baseOk, insuranceExpiryDate: '2026-02-31' }, attachments: att }),
    (e) => e.code === 'insuranceExpiryDate_date_invalid'
  );
});

test('validateRoleExtras rejects malformed GSTIN + FSSAI on kirana (Phase 12.3 pattern enforcement)', async () => {
  const baseOk = { shopName: 'Sharma Provision Store', shopLicenseNumber: 'SHOP-001' };
  const att = { shop_license: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}` };
  // Garbage GSTIN (within length cap, wrong shape) must be rejected.
  await assert.rejects(
    validateRoleExtras('kirana', {
      answers: { ...baseOk, gstinNumber: 'notarealgstin12' },
      attachments: att
    }),
    (e) => e.code === 'gstinNumber_pattern_invalid'
  );
  // Garbage FSSAI must be rejected.
  await assert.rejects(
    validateRoleExtras('kirana', {
      answers: { ...baseOk, fssaiLicenseNumber: '12345' },
      attachments: att
    }),
    (e) => e.code === 'fssaiLicenseNumber_pattern_invalid'
  );
  // Valid GSTIN (lowercase) gets normalised to upper and accepted.
  const out = await validateRoleExtras('kirana', {
    answers: { ...baseOk, gstinNumber: '27aapfu0939f1zv', fssaiLicenseNumber: '12345678901234' },
    attachments: att
  });
  assert.equal(out.answers.gstinNumber, '27AAPFU0939F1ZV', 'GSTIN must be normalised to upper');
  assert.equal(out.answers.fssaiLicenseNumber, '12345678901234');
});

test('attachmentVerifier rejects foreign-owned blob', async () => {
  await assert.rejects(
    validateRoleExtras('labourers', {
      answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
      attachments: { contractor_attestation: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}` }
    }, {
      attachmentVerifier: async () => false
    }),
    (e) => e.code === 'contractor_attestation_attachment_not_owned'
  );
});

// ─── provider-identity integration ────────────────────────────────

test('createProviderIdentity initialises roleExtrasSubmission + roleExtrasAttestation null', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  assert.equal(p.roleExtrasSubmission, null);
  assert.equal(p.roleExtrasAttestation, null);
});

test('recordRoleExtrasSubmission accepts draft + submitted; refuses active/suspended/revoked (L2-1 fix)', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test'
  });
  const envelope = { schemaVersion: 1, role: 'labourers', answers: { contractorName: 'X' }, attachments: {} };
  const r = recordRoleExtrasSubmission(p, envelope, { at: '2026-06-01T00:00:00.000Z' });
  assert.equal(r.roleExtrasSubmission.role, 'labourers');
  assert.equal(r.roleExtrasSubmission.submittedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(r.status, 'draft', 'status unchanged');

  // submitted is now allowed (citizen can complete after KYC attest).
  const onSubmitted = recordRoleExtrasSubmission({ ...p, status: 'submitted' }, envelope);
  assert.equal(onSubmitted.roleExtrasSubmission.role, 'labourers');

  for (const blocked of ['active', 'suspended', 'revoked']) {
    assert.throws(
      () => recordRoleExtrasSubmission({ ...p, status: blocked }, envelope),
      (e) => e.code === 'invalid_status_for_role_extras',
      `${blocked} should still be blocked`
    );
  }
});

test('attestRoleExtras refuses missing submission', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test'
  });
  assert.throws(
    () => attestRoleExtras(p, { level: 'basic', operatorId: 'op' }),
    (e) => e.code === 'no_role_extras_submission'
  );
});

test('attestRoleExtras records envelope + pins schemaVersion', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test'
  });
  const submitted = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
    attachments: { contractor_attestation: 'bos:att:abc' }
  });
  const attested = attestRoleExtras(submitted, {
    level: 'verified',
    operatorId: 'bos:operator:reviewer-1',
    notes: 'sardar called + confirmed'
  });
  assert.equal(attested.roleExtrasAttestation.level, 'verified');
  assert.equal(attested.roleExtrasAttestation.operatorId, 'bos:operator:reviewer-1');
  assert.equal(attested.roleExtrasAttestation.attestedSchemaVersion, 1);
});

test('publicProviderRecord does NOT echo roleExtrasSubmission (§15)', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  const withExtras = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'MH123', vehicleRegistrationNumber: 'MH12AB', commercialPermitNumber: 'CP-1' },
    attachments: {}
  });
  const pub = publicProviderRecord(withExtras);
  assert.ok(!('roleExtrasSubmission' in pub));
  assert.ok(!('roleExtrasAttestation' in pub));
  const json = JSON.stringify(pub);
  assert.ok(!/MH123/.test(json), 'DL number not in public record');
});

test('selfProviderRecord redacts roleExtrasSubmission verification numbers', () => {
  const p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test'
  });
  const withExtras = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'MH123', vehicleRegistrationNumber: 'MH12AB', commercialPermitNumber: 'CP-1' },
    attachments: { driving_licence: 'bos:att:abc' }
  });
  const self = selfProviderRecord(withExtras);
  assert.equal(self.roleExtrasSubmission.answers.drivingLicenceNumber, '••••');
  assert.equal(self.roleExtrasSubmission.answers.vehicleRegistrationNumber, '••••');
  // Attachment refs (substrate handles) stay.
  assert.equal(self.roleExtrasSubmission.attachments.driving_licence, 'bos:att:abc');
});

test('transitionProviderStatus activation refuses missing role-extras attestation', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Driver',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  // After KYC attest, status is 'submitted' but role extras
  // still null. Activation must refuse.
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op' }),
    (e) => e.code === 'role_extras_attestation_required'
  );
  // Add role extras + attestation → activation allowed.
  p = recordRoleExtrasSubmission(p === undefined ? p : { ...p, status: 'draft' }, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'X', vehicleRegistrationNumber: 'Y', commercialPermitNumber: 'Z' },
    attachments: {}
  });
  // Re-attest KYC to land back at 'submitted'.
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  p = attestRoleExtras(p, { level: 'verified', operatorId: 'op' });
  const active = transitionProviderStatus(p, 'active', { operatorId: 'op' });
  assert.equal(active.status, 'active');
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

async function seedIdentityAndProvider(store, roleKind = 'cab-driver') {
  const id = createIdentity({ displayName: `Test ${Math.floor(Math.random() * 1e9)}` });
  await store.saveIdentity(id);
  const p = createProviderIdentity({
    rootIdentityId: id.id,
    roleKind,
    displayName: 'Provider',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  await store.saveProviderIdentity(p);
  return { identity: id, provider: p };
}

async function uploadAttachment(baseUrl, ownerId, kind) {
  const bytes = Buffer.concat([TINY_JPEG, Buffer.from([Math.floor(Math.random() * 255)])]);
  const r = await fetch(`${baseUrl}/api/attachments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actingRootIdentityId: ownerId,
      mimeType: 'image/jpeg',
      kind,
      bytesBase64: bytes.toString('base64')
    })
  });
  assert.equal(r.status, 201);
  return (await r.json()).attachment;
}

test('GET /api/provider-role-extras-schemas returns 4 wave-1 schemas', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/provider-role-extras-schemas`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.schemas['cab-driver']);
    assert.ok(body.schemas['household-help']);
  });
});

test('POST submit-role-extras happy path + ledger event (cab-driver)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity, provider } = await seedIdentityAndProvider(store, 'cab-driver');
    const dl = await uploadAttachment(baseUrl, identity.id, 'driving_licence');
    const rc = await uploadAttachment(baseUrl, identity.id, 'vehicle_registration');
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/submit-role-extras`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bharat-os-acting-identity': identity.id },
      body: JSON.stringify({
        answers: {
          drivingLicenceNumber: 'MH1420130012345',
          vehicleRegistrationNumber: 'MH12AB1234',
          commercialPermitNumber: 'CP-2025-7890'
        },
        attachments: {
          driving_licence: dl.attachmentId,
          vehicle_registration: rc.attachmentId
        }
      })
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.providerIdentity.roleExtrasSubmission.role, 'cab-driver');
    assert.equal(body.providerIdentity.roleExtrasSubmission.schemaVersion, 1);

    const events = await store.listLedger({ type: 'provider_identity.role_extras_submitted' });
    assert.equal(events.length, 1);
    const evt = events[0];
    // §15 binding: ledger event carries field NAMES + attachment
    // ID HANDLES only — never the verification numbers / employer
    // names.
    const evtJson = JSON.stringify(evt);
    assert.ok(!/MH1420130012345/.test(evtJson), 'DL number not on ledger');
    assert.ok(!/MH12AB1234/.test(evtJson), 'vehicle reg number not on ledger');
    assert.ok(!/CP-2025-7890/.test(evtJson), 'permit number not on ledger');
    assert.ok(evt.submittedAnswerFields.includes('drivingLicenceNumber'));
    assert.ok(evt.submittedAttachmentKinds.includes('driving_licence'));
    assert.ok(evt.attachmentIds.includes(dl.attachmentId));
  });
});

test('POST submit-role-extras cross-owner attachment → 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { identity: owner, provider } = await seedIdentityAndProvider(store, 'labourers');
    const otherId = createIdentity({ displayName: 'Other' });
    await store.saveIdentity(otherId);
    const stolenAttachment = await uploadAttachment(baseUrl, otherId.id, 'contractor_attestation');
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/submit-role-extras`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bharat-os-acting-identity': owner.id },
      body: JSON.stringify({
        answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
        attachments: { contractor_attestation: stolenAttachment.attachmentId }
      })
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error.code, 'contractor_attestation_attachment_not_owned');
  });
});

test('POST submit-role-extras missing acting identity → 401', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const { provider } = await seedIdentityAndProvider(store, 'labourers');
    const r = await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/submit-role-extras`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: {}, attachments: {} })
    });
    assert.equal(r.status, 401);
  });
});

test('POST attest-role-extras requires admin token', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { identity, provider } = await seedIdentityAndProvider(store, 'labourers');
      const att = await uploadAttachment(baseUrl, identity.id, 'contractor_attestation');
      // Submit first.
      await fetch(`${baseUrl}/api/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/submit-role-extras`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bharat-os-acting-identity': identity.id },
        body: JSON.stringify({
          answers: { contractorName: 'Sardar', contractorAttestationNumber: 'A1' },
          attachments: { contractor_attestation: att.attachmentId }
        })
      });
      // No bearer → 401.
      const r0 = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/attest-role-extras`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level: 'verified' })
      });
      assert.equal(r0.status, 401);
      // With bearer → 200.
      const r1 = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/attest-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'x-bharat-os-operator': 'bos:operator:reviewer'
        },
        body: JSON.stringify({ level: 'verified', notes: 'sardar verified' })
      });
      assert.equal(r1.status, 200);
      const events = await store.listLedger({ type: 'provider_identity.role_extras_attested' });
      assert.equal(events.length, 1);
      assert.equal(events[0].level, 'verified');
      assert.equal(events[0].operatorId, 'bos:operator:reviewer');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});

test('validateRoleExtras emits schema_version_stale when client sends old version (PII-Q6 fix)', async () => {
  await assert.rejects(
    validateRoleExtras('cab-driver', {
      schemaVersion: 99,
      answers: {
        drivingLicenceNumber: 'X',
        vehicleRegistrationNumber: 'Y',
        commercialPermitNumber: 'Z'
      },
      attachments: {
        driving_licence: `bos:att:${sha256Hex(TINY_JPEG).slice(0, 32)}`,
        vehicle_registration: `bos:att:${sha256Hex(Buffer.from([1, 2, 3])).slice(0, 32)}`
      }
    }),
    (e) => e.code === 'schema_version_stale'
  );
});

test('PROVIDER_ROLE_EXTRAS field specs are deep-frozen (PII-Q4 fix)', () => {
  const spec = PROVIDER_ROLE_EXTRAS['cab-driver'].required[0];
  assert.throws(() => { spec.maxLen = 99999; }, TypeError);
});

test('recordRoleExtrasSubmission now works on submitted (L2-1 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'cab-driver',
    displayName: 'Test',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  // Now status is 'submitted' — the citizen should still be able
  // to submit role extras.
  assert.equal(p.status, 'submitted');
  const r = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'cab-driver',
    answers: { drivingLicenceNumber: 'X', vehicleRegistrationNumber: 'Y', commercialPermitNumber: 'Z' },
    attachments: {}
  });
  assert.ok(r.roleExtrasSubmission);
});

test('recordRoleExtrasSubmission clears any prior attestation (L2-2 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test'
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
    attachments: {}
  });
  p = attestRoleExtras(p, { level: 'basic', operatorId: 'op:test' });
  assert.ok(p.roleExtrasAttestation);
  // Citizen re-submits with different answers.
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X-NEW', contractorAttestationNumber: 'Y-NEW' },
    attachments: {}
  });
  assert.equal(p.roleExtrasAttestation, null, 'prior attestation cleared');
});

test('attestRoleExtras pins attestedSubmittedAt (L2-2 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test'
  });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
    attachments: {}
  }, { at: '2026-06-01T10:00:00.000Z' });
  p = attestRoleExtras(p, { level: 'verified', operatorId: 'op:test' });
  assert.equal(p.roleExtrasAttestation.attestedSubmittedAt, '2026-06-01T10:00:00.000Z');
});

test('activation refuses when attestedSchemaVersion < submission.schemaVersion (L2-5 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
    attachments: {}
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  p = attestRoleExtras(p, { level: 'basic', operatorId: 'op' });
  // Simulate: citizen re-submitted against bumped schema v2,
  // attestation still at v1.
  p = { ...p, roleExtrasSubmission: { ...p.roleExtrasSubmission, schemaVersion: 2 } };
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op' }),
    (e) => e.code === 'role_extras_attestation_stale_schema'
  );
});

test('activation refuses when attestedSubmittedAt drifts from submission.submittedAt (L2-2 fix)', () => {
  let p = createProviderIdentity({
    rootIdentityId: 'bos:person:1',
    roleKind: 'labourers',
    displayName: 'Test',
    serviceArea: { kind: 'point-radius', center: { lat: 18.5, lng: 73.8 }, radiusMeters: 5000 }
  });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  p = recordRoleExtrasSubmission(p, {
    schemaVersion: 1, role: 'labourers',
    answers: { contractorName: 'X', contractorAttestationNumber: 'Y' },
    attachments: {}
  }, { at: '2026-06-01T10:00:00.000Z' });
  p = attestProviderKyc(p, { kycLevel: 'basic', operatorId: 'op' });
  p = attestRoleExtras(p, { level: 'basic', operatorId: 'op' });
  // Simulate out-of-band: submission timestamp moved without
  // clearing attestation (substrate normally clears it but
  // this guard is defense-in-depth).
  p = { ...p, roleExtrasSubmission: { ...p.roleExtrasSubmission, submittedAt: '2026-06-01T11:00:00.000Z' } };
  assert.throws(
    () => transitionProviderStatus(p, 'active', { operatorId: 'op' }),
    (e) => e.code === 'role_extras_attestation_stale_submission'
  );
});

test('attest-role-extras refuses missing submission', async () => {
  process.env.BHARAT_OS_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    await withApiServer(async ({ baseUrl, store }) => {
      const { provider } = await seedIdentityAndProvider(store, 'labourers');
      const r = await fetch(`${baseUrl}/api/admin/provider-identities/${encodeURIComponent(provider.providerIdentityId)}/attest-role-extras`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        },
        body: JSON.stringify({ level: 'basic' })
      });
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.equal(body.error.code, 'no_role_extras_submission');
    });
  } finally {
    delete process.env.BHARAT_OS_ADMIN_TOKEN;
  }
});
