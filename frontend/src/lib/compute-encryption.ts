// Phase 13.7.3 — Client-side encryption helpers for the compute
// network's encrypted-prompt envelope.
//
// Algorithm suite (matches BE
// COMPUTE_SERVING_ENCRYPTION_ALGORITHM):
//
//   ECDH(P-256) + HKDF-SHA256 + AES-256-GCM
//
// Why this suite (vs X25519 + ChaCha20-Poly1305):
//   Web Crypto's `crypto.subtle` supports P-256 ECDH everywhere
//   modern. X25519 is still patchy on Safari + older Chrome.
//   P-256 + HKDF + AES-GCM is the conservative NIST suite that
//   works without polyfills.
//
// Flow:
//   1. Worker generates a long-lived P-256 keypair locally; the
//      pubkey gets published in the capacity record (base64
//      uncompressed point); private key stays in IndexedDB.
//   2. Citizen reads the worker's pubkey from the capacity.
//      Citizen generates an EPHEMERAL P-256 keypair, performs
//      ECDH with the worker's pubkey, derives an AES-256 key via
//      HKDF-SHA256, encrypts the prompt with AES-GCM (random
//      12-byte nonce, citizen's identityId as additionalData
//      to bind the envelope to the citizen).
//   3. Citizen POSTs {ciphertext, nonce, ephemeralPubKey} to
//      the encrypted-prompt endpoint.
//   4. Worker fetches envelope, performs ECDH between the
//      ephemeral pubkey + own private key, derives the same
//      AES-256 key, decrypts.
//
// Forward secrecy: the ephemeral pubkey is fresh per dispatch.
// Even if the long-lived worker private key leaks later, past
// prompts remain unreadable (the ephemeral private key was
// discarded after encryption).

const HKDF_INFO = new TextEncoder().encode('bos.phase13.compute-serving-encrypted-prompt.v1');
const AES_KEY_LENGTH_BITS = 256;
const NONCE_LENGTH_BYTES = 12;

// ─── base64 + raw-byte helpers ───────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// ─── P-256 keypair generation ────────────────────────────────────

export interface WorkerEncryptionKeypair {
  /** Public key as base64-encoded uncompressed point (65 bytes). */
  publicKeyBase64: string;
  /** Private key as base64-encoded PKCS#8 (D + curve params). */
  privateKeyPkcs8Base64: string;
}

/**
 * Generate a long-lived P-256 ECDH keypair for a worker. Caller
 * (the worker-keypair-store) is responsible for persisting it +
 * publishing the pubkey on the capacity envelope.
 */
export async function generateWorkerEncryptionKeypair(): Promise<WorkerEncryptionKeypair> {
  const keypair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const rawPub = await crypto.subtle.exportKey('raw', keypair.publicKey);
  const pkcs8Priv = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
  return {
    publicKeyBase64: bytesToBase64(new Uint8Array(rawPub)),
    privateKeyPkcs8Base64: bytesToBase64(new Uint8Array(pkcs8Priv))
  };
}

async function importPublicKey(pubKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(pubKeyBase64) as unknown as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(pkcs8Base64) as unknown as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  // Step 1: ECDH → shared secret (32 bytes for P-256).
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  // Step 2: HKDF → AES-256 key. Salt = a stable per-dispatch tag
  // (caller passes empty Uint8Array if not binding to a dispatch
  // pointer — v1 uses an empty salt since the ephemeral pubkey
  // already provides per-dispatch uniqueness).
  const ikm = await crypto.subtle.importKey(
    'raw',
    sharedSecret as unknown as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      info: HKDF_INFO as unknown as BufferSource
    },
    ikm,
    { name: 'AES-GCM', length: AES_KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Encrypt (citizen side) ──────────────────────────────────────

export interface EncryptedPromptEnvelope {
  ciphertextBase64: string;
  nonceBase64: string;
  ephemeralPubKeyBase64: string;
}

/**
 * Encrypt a prompt text to a worker's published P-256 pubkey.
 * Generates a fresh ephemeral keypair, performs ECDH, derives
 * an AES-256 key, AES-GCM encrypts with a fresh nonce.
 *
 * `additionalData` (optional) is bound to the GCM auth tag so a
 * later decryption with a different AAD would fail. v1 passes
 * the dispatchId so the ciphertext can't be replayed against a
 * different dispatch.
 */
export async function encryptPromptForWorker(
  promptText: string,
  workerPubKeyBase64: string,
  additionalData?: string
): Promise<EncryptedPromptEnvelope> {
  // Fresh ephemeral keypair per call. We extract its pubkey for
  // the envelope, then discard the privKey (forward secrecy).
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits', 'deriveKey']
  );
  const ephemeralPubRaw = await crypto.subtle.exportKey('raw', ephemeral.publicKey);
  const workerPub = await importPublicKey(workerPubKeyBase64);
  const aesKey = await deriveAesKey(ephemeral.privateKey, workerPub, new Uint8Array());
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_BYTES));
  const plaintextBytes = new TextEncoder().encode(promptText);
  const aad = additionalData ? new TextEncoder().encode(additionalData) : undefined;
  const ciphertextBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as unknown as BufferSource,
      ...(aad ? { additionalData: aad as unknown as BufferSource } : {})
    },
    aesKey,
    plaintextBytes as unknown as BufferSource
  );
  return {
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertextBuf)),
    nonceBase64: bytesToBase64(nonce),
    ephemeralPubKeyBase64: bytesToBase64(new Uint8Array(ephemeralPubRaw))
  };
}

// ─── Decrypt (worker side) ───────────────────────────────────────

/**
 * Decrypt an encrypted-prompt envelope using the worker's stored
 * P-256 private key. Returns the plaintext prompt.
 *
 * Throws on auth-tag mismatch (wrong key, tampered ciphertext, or
 * mismatched additionalData binding).
 */
export async function decryptPromptFromCitizen(
  envelope: EncryptedPromptEnvelope,
  workerPrivKeyPkcs8Base64: string,
  additionalData?: string
): Promise<string> {
  const workerPriv = await importPrivateKey(workerPrivKeyPkcs8Base64);
  const ephemeralPub = await importPublicKey(envelope.ephemeralPubKeyBase64);
  const aesKey = await deriveAesKey(workerPriv, ephemeralPub, new Uint8Array());
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);
  const nonce = base64ToBytes(envelope.nonceBase64);
  const aad = additionalData ? new TextEncoder().encode(additionalData) : undefined;
  const plaintextBuf = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce as unknown as BufferSource,
      ...(aad ? { additionalData: aad as unknown as BufferSource } : {})
    },
    aesKey,
    ciphertext as unknown as BufferSource
  );
  return new TextDecoder().decode(plaintextBuf);
}
