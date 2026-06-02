// Phase 13.7.3 — Compute-encryption helper tests.
//
// We run the actual Web Crypto path (jsdom polyfill via node
// crypto in the vitest env) to verify the encrypt → decrypt
// roundtrip works and produces the expected envelope shape.

import { describe, expect, it } from 'vitest';
import {
  generateWorkerEncryptionKeypair,
  encryptPromptForWorker,
  decryptPromptFromCitizen
} from './compute-encryption';

describe('generateWorkerEncryptionKeypair', () => {
  it('produces base64-encoded P-256 raw pubkey + PKCS#8 privkey', async () => {
    const kp = await generateWorkerEncryptionKeypair();
    expect(kp.publicKeyBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(kp.privateKeyPkcs8Base64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // P-256 raw pubkey = 65 bytes uncompressed → 88 base64 chars.
    // Allow some tolerance because of padding edge cases.
    const decodedPub = Buffer.from(kp.publicKeyBase64, 'base64');
    expect(decodedPub.length).toBe(65);
  });

  it('generates a distinct keypair on each call', async () => {
    const a = await generateWorkerEncryptionKeypair();
    const b = await generateWorkerEncryptionKeypair();
    expect(a.publicKeyBase64).not.toBe(b.publicKeyBase64);
    expect(a.privateKeyPkcs8Base64).not.toBe(b.privateKeyPkcs8Base64);
  });
});

describe('encrypt → decrypt roundtrip', () => {
  it('citizen encrypts to worker pubkey → worker decrypts with own privkey', async () => {
    const worker = await generateWorkerEncryptionKeypair();
    const promptText = 'Summarise this electricity bill: ₹2,956 due 24 May 2026 (308 units).';
    const envelope = await encryptPromptForWorker(promptText, worker.publicKeyBase64);
    expect(envelope.ciphertextBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(envelope.nonceBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(envelope.ephemeralPubKeyBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // Nonce is 12 bytes.
    expect(Buffer.from(envelope.nonceBase64, 'base64').length).toBe(12);
    // Ephemeral pubkey is 65 bytes (uncompressed P-256).
    expect(Buffer.from(envelope.ephemeralPubKeyBase64, 'base64').length).toBe(65);
    const decrypted = await decryptPromptFromCitizen(envelope, worker.privateKeyPkcs8Base64);
    expect(decrypted).toBe(promptText);
  });

  it('different ephemeral keypair per call (forward secrecy)', async () => {
    const worker = await generateWorkerEncryptionKeypair();
    const a = await encryptPromptForWorker('same input', worker.publicKeyBase64);
    const b = await encryptPromptForWorker('same input', worker.publicKeyBase64);
    expect(a.ephemeralPubKeyBase64).not.toBe(b.ephemeralPubKeyBase64);
    expect(a.ciphertextBase64).not.toBe(b.ciphertextBase64);
    expect(a.nonceBase64).not.toBe(b.nonceBase64);
  });

  it('decrypt fails with wrong worker privkey', async () => {
    const correctWorker = await generateWorkerEncryptionKeypair();
    const wrongWorker = await generateWorkerEncryptionKeypair();
    const envelope = await encryptPromptForWorker('secret', correctWorker.publicKeyBase64);
    await expect(
      decryptPromptFromCitizen(envelope, wrongWorker.privateKeyPkcs8Base64)
    ).rejects.toThrow();
  });

  it('decrypt fails with tampered ciphertext', async () => {
    const worker = await generateWorkerEncryptionKeypair();
    const envelope = await encryptPromptForWorker('secret', worker.publicKeyBase64);
    // Flip a bit in the ciphertext.
    const bytes = Buffer.from(envelope.ciphertextBase64, 'base64');
    bytes[0] ^= 0x01;
    const tampered = {
      ...envelope,
      ciphertextBase64: bytes.toString('base64')
    };
    await expect(
      decryptPromptFromCitizen(tampered, worker.privateKeyPkcs8Base64)
    ).rejects.toThrow();
  });

  it('roundtrips multi-line + multi-byte UTF-8', async () => {
    const worker = await generateWorkerEncryptionKeypair();
    const promptText =
      'टेस्ट प्रॉम्प्ट 🌾\n' +
      'Line two with emoji: 🇮🇳\n' +
      'Devanagari + Tamil + Bengali: मेरा नाम राम है · என் பெயர் ராம் · আমার নাম রাম';
    const envelope = await encryptPromptForWorker(promptText, worker.publicKeyBase64);
    const decrypted = await decryptPromptFromCitizen(envelope, worker.privateKeyPkcs8Base64);
    expect(decrypted).toBe(promptText);
  });
});
