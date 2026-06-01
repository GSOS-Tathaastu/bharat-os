import { describe, expect, it } from 'vitest';
import { deriveIdempotencyKey, newClientNonce } from './idempotency-key';

describe('deriveIdempotencyKey', () => {
  it('returns exactly 32 lowercase hex characters', async () => {
    const key = await deriveIdempotencyKey({
      actorId: 'bos:person:abc',
      intentText: 'Book a cab',
      intentAnnotation: null,
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'nonce-1'
    });
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await deriveIdempotencyKey({
      actorId: 'bos:person:abc',
      intentText: 'Book a cab',
      intentAnnotation: { actionType: 'service_booking', confidence: 0.9 },
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'nonce-1'
    });
    const b = await deriveIdempotencyKey({
      actorId: 'bos:person:abc',
      intentText: 'Book a cab',
      intentAnnotation: { actionType: 'service_booking', confidence: 0.9 },
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'nonce-1'
    });
    expect(a).toBe(b);
  });

  it('differs when actorId differs', async () => {
    const a = await deriveIdempotencyKey({
      actorId: 'bos:person:alice',
      intentText: 'Book a cab',
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'n'
    });
    const b = await deriveIdempotencyKey({
      actorId: 'bos:person:bob',
      intentText: 'Book a cab',
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'n'
    });
    expect(a).not.toBe(b);
  });

  it('differs when intentText differs', async () => {
    const base = {
      actorId: 'bos:person:c',
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'n'
    };
    const a = await deriveIdempotencyKey({ ...base, intentText: 'Book a cab' });
    const b = await deriveIdempotencyKey({ ...base, intentText: 'Pay my bill' });
    expect(a).not.toBe(b);
  });

  it('differs when the client nonce differs', async () => {
    const base = {
      actorId: 'bos:person:c',
      intentText: 'Book a cab',
      enqueuedAtIso: '2026-06-01T10:00:00.000Z'
    };
    const a = await deriveIdempotencyKey({ ...base, clientNonce: 'n1' });
    const b = await deriveIdempotencyKey({ ...base, clientNonce: 'n2' });
    expect(a).not.toBe(b);
  });

  it('treats annotation key order as canonical (stable across reordering)', async () => {
    const base = {
      actorId: 'bos:person:c',
      intentText: 'Book a cab',
      enqueuedAtIso: '2026-06-01T10:00:00.000Z',
      clientNonce: 'n'
    };
    const a = await deriveIdempotencyKey({
      ...base,
      intentAnnotation: { actionType: 'service_booking', confidence: 0.9 }
    });
    const b = await deriveIdempotencyKey({
      ...base,
      intentAnnotation: { confidence: 0.9, actionType: 'service_booking' }
    });
    expect(a).toBe(b);
  });
});

describe('newClientNonce', () => {
  it('returns a non-empty string each call', () => {
    const a = newClientNonce();
    const b = newClientNonce();
    expect(a.length).toBeGreaterThan(8);
    expect(b.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });
});

// MF-1 (adversarial fix) — pin the typed-error contract so a future
// refactor cannot silently regress to TypeError.
describe('crypto-unavailable guards', () => {
  it('sha256 / deriveIdempotencyKey throws a typed error when SubtleCrypto is missing', async () => {
    const originalSubtle = (crypto as Crypto & { subtle?: unknown }).subtle;
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
    try {
      await expect(
        deriveIdempotencyKey({
          actorId: 'a',
          intentText: 'x',
          enqueuedAtIso: '2026-06-01T10:00:00.000Z',
          clientNonce: 'n'
        })
      ).rejects.toThrow(/SubtleCrypto unavailable/);
    } finally {
      Object.defineProperty(crypto, 'subtle', { value: originalSubtle, configurable: true });
    }
  });
});
