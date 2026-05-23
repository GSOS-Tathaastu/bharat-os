import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity } from '../../src/phase0/core.mjs';
import { generateRecoveryPhrase } from '../../src/phase1/device-pairing.mjs';
import {
  createVaultBundle,
  decryptVaultBundle,
  VAULT_TRANSFER_PROTOCOL_VERSION
} from '../../src/phase1/vault-transfer.mjs';

test('createVaultBundle emits a self-describing envelope with no plaintext', async () => {
  const identity = createIdentity({ displayName: 'Vault round-trip actor' });
  const phrase = generateRecoveryPhrase(identity).phrase;
  const bundle = await createVaultBundle({
    identity,
    recoveryPhrase: phrase,
    memoryRecordRefs: [
      { recordId: 'bos:memory:r1', manifestId: 'bos:bundle:m1', label: 'Diabetes notes' }
    ]
  });
  assert.equal(bundle.protocolVersion, VAULT_TRANSFER_PROTOCOL_VERSION);
  assert.equal(bundle.objectType, 'encrypted-vault-bundle');
  assert.equal(bundle.kdf.algorithm, 'PBKDF2');
  assert.equal(bundle.kdf.hash, 'SHA-256');
  assert.equal(bundle.kdf.iterations, 200_000);
  assert.equal(bundle.cipher.algorithm, 'AES-GCM');
  assert.ok(bundle.kdf.saltBase64.length > 0);
  assert.ok(bundle.cipher.ivBase64.length > 0);
  assert.ok(bundle.ciphertextBase64.length > 0);

  const serialised = JSON.stringify(bundle);
  assert.equal(
    serialised.includes(identity.privateKeyPem),
    false,
    'private key must never appear in the encrypted envelope'
  );
  assert.equal(
    serialised.includes(identity.vaultKeyBase64),
    false,
    'vault key must never appear in the encrypted envelope'
  );
});

test('decryptVaultBundle round-trips the private key, vault key, and record refs', async () => {
  const identity = createIdentity({ displayName: 'Vault decrypt actor' });
  const phrase = generateRecoveryPhrase(identity).phrase;
  const refs = [
    { recordId: 'bos:memory:r1', manifestId: 'bos:bundle:m1', label: 'Card A' },
    { recordId: 'bos:memory:r2', manifestId: 'bos:bundle:m2', label: 'Card B' }
  ];
  const bundle = await createVaultBundle({
    identity,
    recoveryPhrase: phrase,
    memoryRecordRefs: refs
  });
  const decoded = await decryptVaultBundle(bundle, phrase);
  assert.equal(decoded.identityId, identity.id);
  assert.equal(decoded.privateKeyPem, identity.privateKeyPem);
  assert.equal(decoded.vaultKeyBase64, identity.vaultKeyBase64);
  assert.equal(decoded.memoryRecordRefs.length, 2);
  assert.equal(decoded.memoryRecordRefs[0].recordId, 'bos:memory:r1');
  assert.equal(decoded.memoryRecordRefs[1].label, 'Card B');
});

test('decryptVaultBundle rejects a wrong recovery phrase', async () => {
  const identity = createIdentity({ displayName: 'Wrong-phrase actor' });
  const phrase = generateRecoveryPhrase(identity).phrase;
  const bundle = await createVaultBundle({ identity, recoveryPhrase: phrase });

  await assert.rejects(
    () => decryptVaultBundle(bundle, 'apple beach cloud dance eagle flame glass honey india jewel knife lemon'),
    /wrong recovery phrase/
  );
});

test('decryptVaultBundle rejects a non-vault payload', async () => {
  await assert.rejects(
    () => decryptVaultBundle({ objectType: 'not-a-vault' }, 'irrelevant'),
    /not an encrypted vault bundle/
  );
});

test('decryptVaultBundle requires a recovery phrase', async () => {
  const identity = createIdentity({ displayName: 'No-phrase actor' });
  const phrase = generateRecoveryPhrase(identity).phrase;
  const bundle = await createVaultBundle({ identity, recoveryPhrase: phrase });
  await assert.rejects(
    () => decryptVaultBundle(bundle, ''),
    /recoveryPhrase is required/
  );
});

test('createVaultBundle requires a recovery phrase', async () => {
  const identity = createIdentity({ displayName: 'No-phrase create actor' });
  await assert.rejects(
    () => createVaultBundle({ identity }),
    /recoveryPhrase is required/
  );
});

test('createVaultBundle requires identity.privateKeyPem', async () => {
  await assert.rejects(
    () =>
      createVaultBundle({
        identity: { id: 'bos:person:no-key' },
        recoveryPhrase: 'apple beach cloud dance eagle flame glass honey india jewel knife lemon'
      }),
    /privateKeyPem is required/
  );
});

test('phrase normalization is tolerant of case + extra whitespace', async () => {
  const identity = createIdentity({ displayName: 'Phrase-normalise actor' });
  const phrase = generateRecoveryPhrase(identity).phrase;
  const bundle = await createVaultBundle({ identity, recoveryPhrase: phrase });
  // Same phrase with mixed case + extra spaces should still decrypt.
  const tampered = `   ${phrase.toUpperCase().replace(/ /g, '  ')}   `;
  const decoded = await decryptVaultBundle(bundle, tampered);
  assert.equal(decoded.identityId, identity.id);
});

test('two different identities produce two different recovery phrases and incompatible vaults', async () => {
  const a = createIdentity({ displayName: 'Identity A' });
  const b = createIdentity({ displayName: 'Identity B' });
  const phraseA = generateRecoveryPhrase(a).phrase;
  const phraseB = generateRecoveryPhrase(b).phrase;
  assert.notEqual(phraseA, phraseB);

  const bundleA = await createVaultBundle({ identity: a, recoveryPhrase: phraseA });
  await assert.rejects(
    () => decryptVaultBundle(bundleA, phraseB),
    /wrong recovery phrase/
  );
});
