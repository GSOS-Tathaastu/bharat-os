// §7c encrypted vault transfer — Phase 2a.17.
//
// The §7c "move my Bharat OS profile to a new phone" flow has two
// legs:
//
//   1. Public identity record — already shipped in Phase 2a.14 via
//      the WebRTC data channel as the `publicIdentity` field of the
//      pairing bundle.
//
//   2. **Encrypted vault** — this module. The secret material
//      (Ed25519 privateKey, the L5 vault symmetric key, and the
//      memory-record references) is wrapped under a key derived from
//      the user's 12-word recovery phrase (`device-pairing.mjs`).
//      Only someone who knows the phrase can decrypt the vault on
//      the receiver side.
//
// §15 bindings preserved:
//
//   • Identity is the person, not the device — the same phrase
//     produces the same key, so an identity that ends up on a
//     second phone is the *same* identity (same key material), not a
//     copy. The WebRTC signaling server only relays SDP, never the
//     vault bundle (§15 pointer-not-payload).
//   • The pairing protocol never sends the recovery phrase across
//     the wire. It only sends the *salt* + the AES-GCM ciphertext.
//     The receiver must re-enter the phrase locally to decrypt.
//   • A wrong phrase fails decryption with the GCM authentication
//     tag — there is no oracle, no partial success.
//
// Cryptographic choices:
//
//   • PBKDF2-HMAC-SHA-256 with 200,000 iterations, 16-byte random
//     salt — a standard mobile-friendly default in 2026 that the
//     Web Crypto API supports natively in every modern browser.
//   • AES-GCM-256 with a 12-byte random IV per envelope. GCM gives
//     us both confidentiality and the auth tag that catches wrong
//     phrases.
//   • The Ed25519 privateKey is transported as the PKCS8 PEM
//     emitted by `createIdentity` — same format the L4 signer
//     expects, so the receiver can sign without any conversion.
//
// Forward-compatibility:
//
//   • `algorithm`, `kdfIterations`, and `protocolVersion` are
//     explicit on the envelope so future rotations don't break
//     receivers.
//   • The plaintext is a JSON document; new fields (memory
//     ciphertexts inline, profile credentials, worker
//     authorizations) can be added without breaking older readers
//     because the consumer reads named keys.

export const VAULT_TRANSFER_PROTOCOL_VERSION = 'bos.phase1.vault-transfer.v0';

const KDF_ALGORITHM = 'PBKDF2';
const KDF_HASH = 'SHA-256';
const KDF_ITERATIONS = 200_000;
const KDF_SALT_BYTES = 16;
const CIPHER_ALGORITHM = 'AES-GCM';
const CIPHER_KEY_BITS = 256;
const CIPHER_IV_BYTES = 12;

function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto SubtleCrypto is required (Node 18+ or any modern browser).'
    );
  }
  return subtle;
}

function getRandomValues(byteLength) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues is required.');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(byteLength));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizePhrase(phrase) {
  return String(phrase ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function deriveAesKey(phrase, salt) {
  const subtle = getSubtle();
  const phraseBytes = new TextEncoder().encode(normalizePhrase(phrase));
  const baseKey = await subtle.importKey(
    'raw',
    phraseBytes,
    { name: KDF_ALGORITHM },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: KDF_ALGORITHM,
      hash: KDF_HASH,
      iterations: KDF_ITERATIONS,
      salt
    },
    baseKey,
    { name: CIPHER_ALGORITHM, length: CIPHER_KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

function buildVaultPlaintext({
  identity,
  memoryRecordRefs = [],
  household = []
}) {
  if (!identity?.id) throw new Error('identity is required.');
  if (!identity?.privateKeyPem) {
    throw new Error(
      'identity.privateKeyPem is required to build a vault bundle.'
    );
  }
  return {
    protocolVersion: VAULT_TRANSFER_PROTOCOL_VERSION,
    issuedAt: new Date().toISOString(),
    identityId: identity.id,
    privateKeyPem: identity.privateKeyPem,
    vaultKeyBase64: identity.vaultKeyBase64 ?? null,
    memoryRecordRefs: memoryRecordRefs.map((ref) => ({
      recordId: ref.recordId,
      manifestId: ref.manifestId ?? null,
      label: ref.label ?? null,
      createdAt: ref.createdAt ?? null
    })),
    household: household.map((member) => ({
      identityId: member.identityId ?? member.id,
      displayName: member.displayName ?? null
    }))
  };
}

// Public API — initiator side.
//
// Returns an envelope safe to send across the §7c WebRTC data
// channel. The recovery phrase is consumed locally; only the
// (salt, iv, ciphertext) tuple leaves the device.
export async function createVaultBundle({
  identity,
  recoveryPhrase,
  memoryRecordRefs = [],
  household = []
}) {
  if (!recoveryPhrase) {
    throw new Error('recoveryPhrase is required.');
  }
  const plaintext = buildVaultPlaintext({ identity, memoryRecordRefs, household });
  const salt = getRandomValues(KDF_SALT_BYTES);
  const iv = getRandomValues(CIPHER_IV_BYTES);
  const key = await deriveAesKey(recoveryPhrase, salt);
  const subtle = getSubtle();
  const ciphertext = await subtle.encrypt(
    { name: CIPHER_ALGORITHM, iv },
    key,
    new TextEncoder().encode(JSON.stringify(plaintext))
  );
  return {
    protocolVersion: VAULT_TRANSFER_PROTOCOL_VERSION,
    objectType: 'encrypted-vault-bundle',
    kdf: {
      algorithm: KDF_ALGORITHM,
      hash: KDF_HASH,
      iterations: KDF_ITERATIONS,
      saltBase64: bytesToBase64(salt)
    },
    cipher: {
      algorithm: CIPHER_ALGORITHM,
      ivBase64: bytesToBase64(iv)
    },
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
    plaintextBytes: JSON.stringify(plaintext).length,
    recordCount: memoryRecordRefs.length
  };
}

// Public API — receiver side.
//
// Throws on a wrong phrase (AES-GCM auth-tag failure) or on a
// malformed bundle. On success returns the decoded plaintext (with
// `privateKeyPem`, `vaultKeyBase64`, `memoryRecordRefs`, etc.).
export async function decryptVaultBundle(bundle, recoveryPhrase) {
  if (!bundle || bundle.objectType !== 'encrypted-vault-bundle') {
    throw new Error('not an encrypted vault bundle.');
  }
  if (!recoveryPhrase) {
    throw new Error('recoveryPhrase is required to decrypt the vault.');
  }
  if (bundle.kdf?.algorithm !== KDF_ALGORITHM || bundle.kdf?.hash !== KDF_HASH) {
    throw new Error('unsupported KDF — bundle may be from a newer protocol.');
  }
  if (bundle.cipher?.algorithm !== CIPHER_ALGORITHM) {
    throw new Error('unsupported cipher — bundle may be from a newer protocol.');
  }
  const salt = base64ToBytes(bundle.kdf.saltBase64);
  const iv = base64ToBytes(bundle.cipher.ivBase64);
  const ciphertext = base64ToBytes(bundle.ciphertextBase64);

  // Honour the bundle's declared iteration count so receivers
  // tolerate cost rotations.
  const baseKey = await getSubtle().importKey(
    'raw',
    new TextEncoder().encode(normalizePhrase(recoveryPhrase)),
    { name: KDF_ALGORITHM },
    false,
    ['deriveKey']
  );
  const key = await getSubtle().deriveKey(
    {
      name: KDF_ALGORITHM,
      hash: KDF_HASH,
      iterations: bundle.kdf.iterations ?? KDF_ITERATIONS,
      salt
    },
    baseKey,
    { name: CIPHER_ALGORITHM, length: CIPHER_KEY_BITS },
    false,
    ['decrypt']
  );

  let plaintextBytes;
  try {
    plaintextBytes = await getSubtle().decrypt(
      { name: CIPHER_ALGORITHM, iv },
      key,
      ciphertext
    );
  } catch (_error) {
    throw new Error('Vault decryption failed — wrong recovery phrase?');
  }
  const text = new TextDecoder().decode(plaintextBytes);
  return JSON.parse(text);
}
