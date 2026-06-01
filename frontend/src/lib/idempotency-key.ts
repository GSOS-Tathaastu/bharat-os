// Phase 12.1b.2 — Idempotency key derivation (FE side).
//
// 32-hex sha256 over a canonical join of:
//   actorId + ':' + intentText + ':' + annotationCanonical +
//   ':' + enqueuedAtIso + ':' + clientNonce
//
// Computed ONCE at enqueue time and reused across every drain
// attempt of that queue row. The judge-panel synthesis emphasised
// that recomputing the key per-attempt would defeat the very case
// idempotency exists for — mid-drain reconnect flicker — so we
// store the computed key on the row itself.
//
// SubtleCrypto is required (secure context: HTTPS or localhost).
// The PWA shell guarantees a secure context; the Vite dev server
// serves http://localhost which is also secure-context per the
// browser whitelist.

function canonicalize(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

async function sha256Hex(input: string): Promise<string> {
  // MF-1 (adversarial fix) — explicit guard. In an insecure context
  // (http:// non-localhost) SubtleCrypto is undefined and the
  // implicit access would throw a confusing TypeError. The wrapper
  // surfaces it as a typed Error the caller can render honestly.
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
    throw new Error('SubtleCrypto unavailable (insecure context).');
  }
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DeriveIdempotencyKeyInput {
  actorId: string;
  intentText: string;
  intentAnnotation?: unknown;
  enqueuedAtIso: string;
  clientNonce: string;
}

// Returns 32 lowercase hex. The server-side validator
// (src/phase0/idempotency.mjs::isValidIdempotencyKey) accepts
// EXACTLY this shape and rejects anything else.
export async function deriveIdempotencyKey(input: DeriveIdempotencyKeyInput): Promise<string> {
  const composed =
    String(input.actorId) +
    ':' +
    String(input.intentText) +
    ':' +
    canonicalize(input.intentAnnotation ?? null) +
    ':' +
    String(input.enqueuedAtIso) +
    ':' +
    String(input.clientNonce);
  const hex = await sha256Hex(composed);
  return hex.slice(0, 32);
}

// Browser-friendly nonce. crypto.randomUUID is in all modern
// browsers; falls back to a 16-byte random hex when undefined
// (e.g. in some vitest jsdom setups).
export function newClientNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // MF-1 (adversarial fix) — explicit guard before the fallback
  // path. The previous version silently assumed crypto.getRandomValues
  // existed, which throws in an insecure context.
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues unavailable (insecure context).');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
