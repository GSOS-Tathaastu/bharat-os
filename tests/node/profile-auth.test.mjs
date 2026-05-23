import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { BosStore } from '../../src/phase0/store.mjs';
import {
  createProfileAuthChallenge,
  createProfileCredentialRecord,
  verifyProfileAuthChallengeEvidence,
  verifyProfileCredentialAssertion
} from '../../src/phase1/profile-auth.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'node-tests');

async function freshStore(name) {
  const root = path.join(tmpRoot, `${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new BosStore(root);
  await store.init();
  return { store };
}

test('profile auth challenge carries verifiable challenge evidence', () => {
  const identity = createIdentity({ displayName: 'Passkey actor' });
  const challenge = createProfileAuthChallenge({
    identityId: identity.id,
    ceremony: 'register',
    issuedAt: '2026-05-23T10:00:00.000Z',
    challengeBytes: Buffer.alloc(32, 7)
  });

  assert.match(challenge.challengeId, /^bos:profile-auth-challenge:/);
  assert.match(challenge.challengeHash, /^[a-f0-9]{64}$/);
  assert.equal(challenge.expiresAt, '2026-05-23T10:05:00.000Z');
  assert.equal(verifyProfileAuthChallengeEvidence(challenge).valid, true);

  const tampered = { ...challenge, ceremony: 'verify' };
  const verification = verifyProfileAuthChallengeEvidence(tampered);
  assert.equal(verification.valid, false);
  assert.ok(verification.reasons.includes('challenge evidence tampered'));
});

test('profile credential record stores passkey metadata and challenge linkage', () => {
  const identity = createIdentity({ displayName: 'Credential actor' });
  const challenge = createProfileAuthChallenge({
    identityId: identity.id,
    ceremony: 'register',
    issuedAt: '2026-05-23T10:00:00.000Z',
    challengeBytes: Buffer.alloc(32, 3)
  });

  const credential = createProfileCredentialRecord({
    identityId: identity.id,
    credentialId: 'cred-base64url-id',
    challenge,
    transports: ['usb', 'internal', 'usb'],
    userVerified: true,
    createdAt: '2026-05-23T10:00:10.000Z'
  });

  assert.match(credential.profileCredentialId, /^bos:profile-credential:/);
  assert.equal(credential.challengeId, challenge.challengeId);
  assert.equal(credential.credentialIdHash.length, 64);
  assert.deepEqual(credential.transports, ['internal', 'usb']);
  assert.equal(credential.userVerified, true);
  assert.equal(JSON.stringify(credential).includes('privateKey'), false);
  assert.equal(JSON.stringify(credential).includes('clientDataJSON'), false);
});

test('profile credential assertion accepts matching verify challenge and rejects stale or wrong evidence', () => {
  const identity = createIdentity({ displayName: 'Assertion actor' });
  const registerChallenge = createProfileAuthChallenge({
    identityId: identity.id,
    ceremony: 'register',
    issuedAt: '2026-05-23T10:00:00.000Z',
    challengeBytes: Buffer.alloc(32, 5)
  });
  const credential = createProfileCredentialRecord({
    identityId: identity.id,
    credentialId: 'cred-assertion-id',
    challenge: registerChallenge,
    createdAt: '2026-05-23T10:00:10.000Z'
  });
  const verifyChallenge = createProfileAuthChallenge({
    identityId: identity.id,
    ceremony: 'verify',
    issuedAt: '2026-05-23T10:01:00.000Z',
    challengeBytes: Buffer.alloc(32, 6)
  });

  assert.equal(
    verifyProfileCredentialAssertion({
      credential,
      credentialId: 'cred-assertion-id',
      challenge: verifyChallenge,
      at: '2026-05-23T10:01:10.000Z'
    }).valid,
    true
  );

  const wrongCredential = verifyProfileCredentialAssertion({
    credential,
    credentialId: 'other-credential',
    challenge: verifyChallenge,
    at: '2026-05-23T10:01:10.000Z'
  });
  assert.equal(wrongCredential.valid, false);
  assert.ok(wrongCredential.reasons.includes('credential id mismatch'));

  const expired = verifyProfileCredentialAssertion({
    credential,
    credentialId: 'cred-assertion-id',
    challenge: verifyChallenge,
    at: '2026-05-23T10:10:00.000Z'
  });
  assert.equal(expired.valid, false);
  assert.ok(expired.reasons.includes('challenge expired'));
});

test('store persists profile credentials and ledger evidence', async () => {
  const { store } = await freshStore('profile-auth-store');
  const identity = createIdentity({ displayName: 'Stored passkey actor' });
  const challenge = createProfileAuthChallenge({ identityId: identity.id, ceremony: 'register' });
  const credential = createProfileCredentialRecord({
    identityId: identity.id,
    credentialId: 'stored-passkey-id',
    challenge
  });

  await store.saveProfileCredential(credential);

  assert.equal((await store.readProfileCredential(credential.profileCredentialId)).credentialId, 'stored-passkey-id');
  assert.equal((await store.listProfileCredentials()).length, 1);
  const events = await store.listLedger({ type: 'profile_credential.saved' });
  assert.equal(events.length, 1);
  assert.equal(events[0].profileCredentialId, credential.profileCredentialId);
  assert.equal(events[0].credentialIdHash, credential.credentialIdHash);
});
