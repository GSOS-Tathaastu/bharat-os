// Phase 5.0 — account recovery flow tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publicIdentity } from '../../src/phase0/core.mjs';
import {
  ACCOUNT_RECOVERY_PROTOCOL_VERSION,
  buildRecoveryBundle,
  findIdentityByPhone,
  startAccountRecovery,
  verifyAccountRecovery
} from '../../src/phase1/account-recovery.mjs';
import { createPhoneOtp } from '../../src/phase1/phone-otp.mjs';

function identityWithPhone(displayName, maskedPhone) {
  const id = createIdentity({
    displayName,
    attestations: {
      phone_verified: {
        status: 'verified',
        issuer: 'phone_otp',
        verifiedAt: new Date().toISOString(),
        phoneMasked: maskedPhone
      }
    }
  });
  return id;
}

test('findIdentityByPhone matches the verified attestation on phoneMasked', () => {
  const alice = identityWithPhone('Alice', '+919****10');
  const bob = identityWithPhone('Bob', '+918****10');
  const matched = findIdentityByPhone([alice, bob], '9876543210');
  assert.equal(matched?.id, alice.id);
});

test('findIdentityByPhone returns null when no identity has a matching phone', () => {
  const alice = identityWithPhone('Alice', '+919****10');
  const matched = findIdentityByPhone([alice], '8765432109');
  assert.equal(matched, null);
});

test('findIdentityByPhone skips identities without a verified phone attestation', () => {
  const unverified = createIdentity({
    displayName: 'Unverified',
    attestations: {
      phone_verified: { status: 'pending', phoneMasked: '+919****10' }
    }
  });
  const verified = identityWithPhone('Verified', '+919****10');
  const matched = findIdentityByPhone([unverified, verified], '9876543210');
  assert.equal(matched?.id, verified.id);
});

test('findIdentityByPhone returns null for invalid phone input', () => {
  const alice = identityWithPhone('Alice', '+919****10');
  assert.equal(findIdentityByPhone([alice], 'not-a-phone'), null);
  assert.equal(findIdentityByPhone([alice], ''), null);
});

test('findIdentityByPhone prefers most recently verified on mask collision', () => {
  const earlier = createIdentity({
    displayName: 'Earlier',
    attestations: {
      phone_verified: {
        status: 'verified',
        verifiedAt: '2026-01-01T00:00:00.000Z',
        phoneMasked: '+919****10'
      }
    }
  });
  const later = createIdentity({
    displayName: 'Later',
    attestations: {
      phone_verified: {
        status: 'verified',
        verifiedAt: '2026-05-01T00:00:00.000Z',
        phoneMasked: '+919****10'
      }
    }
  });
  const matched = findIdentityByPhone([earlier, later], '9876543210');
  assert.equal(matched?.id, later.id);
});

test('startAccountRecovery returns a versioned recovery request envelope with an OTP', () => {
  const identity = identityWithPhone('Recovery subject', '+919****10');
  const request = startAccountRecovery({ identity, phone: '9876543210' });
  assert.equal(request.protocolVersion, ACCOUNT_RECOVERY_PROTOCOL_VERSION);
  assert.equal(request.objectType, 'account-recovery-request');
  assert.equal(request.identityId, identity.id);
  assert.ok(request.recoveryId.startsWith('bos:account-recovery:'));
  assert.equal(request.otp.purpose, 'account_recovery');
  assert.equal(request.otp.identityId, identity.id);
  assert.match(request.otp.code, /^\d{6}$/);
});

test('startAccountRecovery refuses without identity or phone', () => {
  const identity = identityWithPhone('x', '+91****');
  assert.throws(() => startAccountRecovery({ phone: '9876543210' }), /identity is required/);
  assert.throws(() => startAccountRecovery({ identity }), /phone is required/);
  assert.throws(
    () => startAccountRecovery({ identity, phone: 'garbage' }),
    /phone must be a valid number/
  );
});

test('verifyAccountRecovery rejects an OTP whose purpose is not account_recovery', () => {
  const otp = createPhoneOtp({
    identityId: 'bos:person:x',
    phone: '+919876543210',
    purpose: 'phone_verify' // wrong purpose
  });
  const stored = { ...otp };
  delete stored.code;
  const result = verifyAccountRecovery(stored, otp.code);
  assert.equal(result.status, 'malformed');
  assert.match(result.reason, /not an account_recovery OTP/);
});

test('verifyAccountRecovery accepts the correct code on a valid recovery OTP', () => {
  const otp = createPhoneOtp({
    identityId: 'bos:person:x',
    phone: '+919876543210',
    purpose: 'account_recovery'
  });
  const stored = { ...otp };
  delete stored.code;
  const result = verifyAccountRecovery(stored, otp.code);
  assert.equal(result.status, 'verified');
  assert.equal(result.objectType, 'account-recovery-verification');
  assert.ok(result.verifiedAt);
});

test('verifyAccountRecovery propagates mismatch/expired/spent statuses', () => {
  const otp = createPhoneOtp({
    identityId: 'bos:person:x',
    phone: '+919876543210',
    purpose: 'account_recovery'
  });
  const stored = { ...otp };
  delete stored.code;
  // Wrong code → mismatch.
  const wrong = verifyAccountRecovery(stored, '000000');
  assert.equal(wrong.status, 'mismatch');

  // Already-verified → spent.
  const used = { ...stored, status: 'verified', verifiedAt: new Date().toISOString() };
  const spent = verifyAccountRecovery(used, otp.code);
  assert.equal(spent.status, 'spent');
});

test('buildRecoveryBundle returns the full identity bundle + recovery phrase + memory refs', () => {
  const identity = identityWithPhone('Bundle subject', '+919****10');
  const recoveryPhrase = 'apple beach cloud dance eagle flame glass honey india jewel knife lemon';
  const memoryRecordRefs = [
    { recordId: 'bos:memory:r1', manifestId: 'bos:bundle:m1', label: 'note', createdAt: '2026-05-01' }
  ];
  const bundle = buildRecoveryBundle({ identity, recoveryPhrase, memoryRecordRefs });
  assert.equal(bundle.protocolVersion, ACCOUNT_RECOVERY_PROTOCOL_VERSION);
  assert.equal(bundle.objectType, 'account-recovery-bundle');
  assert.equal(bundle.identity.id, identity.id);
  assert.equal(bundle.identity.privateKeyPem, identity.privateKeyPem);
  assert.equal(bundle.identity.vaultKeyBase64, identity.vaultKeyBase64);
  assert.equal(bundle.recoveryPhrase, recoveryPhrase);
  assert.equal(bundle.memoryRecordRefs.length, 1);
  // Honest warning about Phase 2b future.
  assert.match(bundle.warning, /Phase 2b/);
});

test('buildRecoveryBundle refuses identities without privateKeyPem', () => {
  assert.throws(
    () =>
      buildRecoveryBundle({
        identity: { id: 'bos:person:no-key', publicKeyPem: 'public' },
        recoveryPhrase: 'phrase'
      }),
    /privateKeyPem/
  );
});

test('end-to-end: phone → identity → recovery request → verify → bundle', () => {
  // Alice verified her phone earlier (Phase 4.3 phone_verify flow).
  const alice = identityWithPhone('Alice', '+919****10');

  // Now Alice has lost her phrase and opens Bharat OS on a new
  // device. Server has Alice's identity in its store.
  const identities = [alice];

  // Step 1: lookup by phone.
  const matched = findIdentityByPhone(identities, '9876543210');
  assert.equal(matched?.id, alice.id);

  // Step 2: start recovery — generates the OTP.
  const request = startAccountRecovery({ identity: matched, phone: '9876543210' });
  const storedOtp = { ...request.otp };
  delete storedOtp.code;
  // Server saves storedOtp (no plaintext); hands request.otp.code to SMS provider.

  // Step 3: user receives the code and types it on the new device.
  const verification = verifyAccountRecovery(storedOtp, request.otp.code);
  assert.equal(verification.status, 'verified');

  // Step 4: server hands back the recovery bundle (privateKey + vault key + phrase).
  const bundle = buildRecoveryBundle({
    identity: matched,
    recoveryPhrase: 'apple beach cloud dance eagle flame glass honey india jewel knife lemon',
    memoryRecordRefs: []
  });
  assert.equal(bundle.identity.id, alice.id);
  assert.equal(bundle.identity.privateKeyPem, alice.privateKeyPem);
  // The new device can now sign on Alice's behalf — recovery complete.
});
