// §7c device pairing & phone migration — SCAFFOLD ONLY.
// This Phase 1.42 module is the runnable seam for the §7c "QR scan +
// recovery phrase" portability flow. It is NOT production cryptographic
// device pairing — that needs a real ephemeral-key handshake over local
// transport (WiFi/Bluetooth) and a proper BIP-39 wordlist. Hardening is a
// Phase 2b/2c commitment per §17.

import crypto from 'node:crypto';
import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const DEVICE_PAIRING_PROTOCOL_VERSION = 'bos.phase1.device-pairing.v0';

// Small embedded wordlist — 64 short English words = 6 bits per word.
// A 12-word phrase carries ~72 bits of entropy: enough for a demo and
// readable aloud over a phone call. Production must replace this with a
// full BIP-39 (2048-word) or equivalent multilingual wordlist (Indic
// languages too, per §7a) before any real-money flow.
export const SCAFFOLD_WORDLIST = [
  'apple', 'beach', 'cloud', 'dance', 'eagle', 'flame', 'glass', 'honey',
  'india', 'jewel', 'knife', 'lemon', 'magic', 'noble', 'ocean', 'piano',
  'quiet', 'river', 'storm', 'tiger', 'umbra', 'vivid', 'water', 'xenon',
  'yarn', 'zebra', 'amber', 'brave', 'coral', 'delta', 'ember', 'frost',
  'glove', 'haven', 'ivory', 'jolly', 'karma', 'lotus', 'maple', 'nova',
  'olive', 'pearl', 'quill', 'raven', 'sage', 'tango', 'unity', 'vibe',
  'whale', 'xylo', 'yield', 'zest', 'aroma', 'bloom', 'crisp', 'dawn',
  'echo', 'fern', 'grain', 'hive', 'iron', 'jade', 'kiwi', 'lake'
];

const WORDS_PER_PHRASE = 12;
const BITS_PER_WORD = 6; // log2(64)

function bytesToWords(buffer) {
  const words = [];
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  for (const byte of buffer) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= BITS_PER_WORD && words.length < WORDS_PER_PHRASE) {
      bitsInBuffer -= BITS_PER_WORD;
      const index = (bitBuffer >> bitsInBuffer) & 0b111111;
      words.push(SCAFFOLD_WORDLIST[index]);
    }
    if (words.length >= WORDS_PER_PHRASE) break;
  }
  return words;
}

function wordsToBytes(words) {
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  const bytes = [];
  for (const word of words) {
    const index = SCAFFOLD_WORDLIST.indexOf(word);
    if (index < 0) throw new Error(`Unknown recovery word: ${word}`);
    bitBuffer = (bitBuffer << BITS_PER_WORD) | index;
    bitsInBuffer += BITS_PER_WORD;
    while (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((bitBuffer >> bitsInBuffer) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

// Generate a 12-word recovery phrase deterministically from the identity's
// public key fingerprint. Two devices with the same identity produce the
// same phrase — that is what makes "lost phone" recovery meaningful here.
export function generateRecoveryPhrase(identity) {
  if (!identity?.publicKeyPem) throw new Error('identity with publicKeyPem is required.');
  const seed = sha256Hex(identity.publicKeyPem);
  const buffer = Buffer.from(seed, 'hex');
  const words = bytesToWords(buffer);
  return {
    protocolVersion: DEVICE_PAIRING_PROTOCOL_VERSION,
    phrase: words.join(' '),
    wordCount: words.length,
    entropyBits: WORDS_PER_PHRASE * BITS_PER_WORD,
    wordlistName: 'bos-scaffold-64',
    derivationHash: seed
  };
}

export function verifyRecoveryPhrase(identity, phrase) {
  const expected = generateRecoveryPhrase(identity);
  const provided = String(phrase ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/);
  if (provided.length !== expected.wordCount) {
    return { valid: false, reason: 'word count mismatch' };
  }
  try {
    wordsToBytes(provided); // throws on unknown words
  } catch (error) {
    return { valid: false, reason: error.message };
  }
  const valid = provided.join(' ') === expected.phrase;
  return { valid, reason: valid ? 'matches' : 'phrase does not match identity' };
}

// Pairing payload — what a new device scans from a QR shown by the old
// device. Carries the identity ID, public-key fingerprint, display name,
// and an expiry. The new device confirms with the user that the
// fingerprint matches and then completes the encrypted local transfer
// (the real transport is out of scope for this scaffold).
export function createPairingPayload(identity, { ttlSeconds = 300, at = new Date().toISOString() } = {}) {
  if (!identity?.id) throw new Error('identity with id is required.');
  const issuedAt = at;
  const expiresAt = new Date(new Date(issuedAt).getTime() + ttlSeconds * 1000).toISOString();
  const fingerprint = sha256Hex(identity.publicKeyPem).slice(0, 24);
  const nonce = crypto.randomBytes(16).toString('hex');
  const core = {
    protocolVersion: DEVICE_PAIRING_PROTOCOL_VERSION,
    objectType: 'pairing-payload',
    identityId: identity.id,
    displayName: identity.displayName,
    publicKeyFingerprint: fingerprint,
    nonce,
    issuedAt,
    expiresAt
  };

  return {
    pairingId: `bos:pairing:${sha256Hex(stableStringify(core)).slice(0, 32)}`,
    ...core
  };
}

export function verifyPairingPayload(payload, identity, { at = new Date().toISOString() } = {}) {
  const reasons = [];
  if (!payload || payload.objectType !== 'pairing-payload') {
    return { valid: false, reasons: ['invalid pairing payload'] };
  }
  if (payload.identityId !== identity.id) reasons.push('identity ID mismatch');
  const expectedFingerprint = sha256Hex(identity.publicKeyPem).slice(0, 24);
  if (payload.publicKeyFingerprint !== expectedFingerprint) {
    reasons.push('public key fingerprint mismatch');
  }
  const expiresAtMs = new Date(payload.expiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= new Date(at).getTime()) {
    reasons.push('pairing payload expired');
  }
  return {
    valid: reasons.length === 0,
    reasons,
    identityId: payload.identityId,
    publicKeyFingerprint: payload.publicKeyFingerprint
  };
}
