import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import {
  createPairingPayload,
  generateRecoveryPhrase,
  SCAFFOLD_WORDLIST,
  verifyPairingPayload,
  verifyRecoveryPhrase
} from '../../src/phase1/device-pairing.mjs';

test('generateRecoveryPhrase yields a 12-word phrase from the embedded wordlist', () => {
  const identity = createIdentity({ displayName: 'Phrase actor' });
  const recovery = generateRecoveryPhrase(identity);
  assert.equal(recovery.wordCount, 12);
  assert.equal(recovery.phrase.split(' ').length, 12);
  for (const word of recovery.phrase.split(' ')) {
    assert.ok(SCAFFOLD_WORDLIST.includes(word), `word "${word}" not in wordlist`);
  }
  assert.equal(recovery.wordlistName, 'bos-scaffold-64');
});

test('recovery phrase is deterministic for the same identity public key', () => {
  const identity = createIdentity({ displayName: 'Deterministic actor' });
  const first = generateRecoveryPhrase(identity);
  const second = generateRecoveryPhrase(identity);
  assert.equal(first.phrase, second.phrase);
  assert.equal(first.derivationHash, second.derivationHash);
});

test('recovery phrases differ across distinct identities', () => {
  const a = createIdentity({ displayName: 'Actor A' });
  const b = createIdentity({ displayName: 'Actor B' });
  const phraseA = generateRecoveryPhrase(a);
  const phraseB = generateRecoveryPhrase(b);
  assert.notEqual(phraseA.phrase, phraseB.phrase);
});

test('verifyRecoveryPhrase accepts the correct phrase and rejects a wrong one', () => {
  const identity = createIdentity({ displayName: 'Verify actor' });
  const recovery = generateRecoveryPhrase(identity);
  assert.equal(verifyRecoveryPhrase(identity, recovery.phrase).valid, true);
  assert.equal(
    verifyRecoveryPhrase(identity, 'apple beach cloud dance eagle flame glass honey india jewel knife lemon').valid,
    false
  );
});

test('verifyRecoveryPhrase rejects malformed input', () => {
  const identity = createIdentity({ displayName: 'Malformed actor' });
  assert.equal(verifyRecoveryPhrase(identity, '').valid, false);
  assert.equal(verifyRecoveryPhrase(identity, 'too few words').valid, false);
  const result = verifyRecoveryPhrase(
    identity,
    'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll'
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /Unknown recovery word/);
});

test('createPairingPayload yields a JSON-safe envelope for the QR transfer', () => {
  const identity = createIdentity({ displayName: 'Pair actor' });
  const payload = createPairingPayload(identity);
  assert.equal(payload.objectType, 'pairing-payload');
  assert.equal(payload.identityId, identity.id);
  assert.equal(payload.displayName, 'Pair actor');
  assert.match(payload.pairingId, /^bos:pairing:/);
  assert.ok(payload.expiresAt > payload.issuedAt);
  assert.equal(payload.publicKeyFingerprint.length, 24);
});

test('verifyPairingPayload accepts a matching identity', () => {
  const identity = createIdentity({ displayName: 'Verify-pair actor' });
  const payload = createPairingPayload(identity);
  const result = verifyPairingPayload(payload, identity);
  assert.equal(result.valid, true);
  assert.equal(result.identityId, identity.id);
});

test('verifyPairingPayload rejects a mismatched identity', () => {
  const a = createIdentity({ displayName: 'Pair A' });
  const b = createIdentity({ displayName: 'Pair B' });
  const payload = createPairingPayload(a);
  const result = verifyPairingPayload(payload, b);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('identity ID mismatch'));
});

test('verifyPairingPayload rejects an expired payload', () => {
  const identity = createIdentity({ displayName: 'Expired pair actor' });
  const payload = createPairingPayload(identity, {
    ttlSeconds: 60,
    at: '2024-01-01T00:00:00.000Z'
  });
  const result = verifyPairingPayload(payload, identity, { at: '2026-05-23T00:00:00.000Z' });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('pairing payload expired'));
});
