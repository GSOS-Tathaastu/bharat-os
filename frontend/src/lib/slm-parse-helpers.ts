// Phase 13.1 — shared SLM parser + cache-key helpers.
//
// Lifted from doc-summariser.ts + use-slm-doc-summariser.ts so SLM-F
// (PII redactor) + future SLM-G/H consumers can compose them without
// duplicating. The doc-summariser re-exports clipLine and
// clampConfidence so its existing public API stays stable. Phase 13.0
// vitest pins for the protocol version + parser regression cases
// remain untouched.

/**
 * Strip leading/trailing quote/backtick/whitespace, take first line
 * only, and clip to `max` chars. Returns `null` on empty input so
 * callers can honestly hide the chip instead of rendering an empty
 * structured envelope.
 *
 * Used by every SLM completion parser to coerce KEY: value lines
 * to a safe display string regardless of how chatty the model is.
 */
export function clipLine(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const trimmed = s.replace(/^["'`\s]+/, '').replace(/["'`\s]+$/, '').split('\n')[0].trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Coerce a raw SLM CONFIDENCE token into a finite number in [0, 1].
 *  - undefined / NaN / empty → 0.5 (honest "uncertain")
 *  - n < 0 → 0
 *  - n > 1 → treat as percentage; n / 100, clipped to 1
 *  - else passthrough
 *
 * Mirrors the booking-advisor + intent-parser + doc-summariser
 * behaviour exactly so all SLM consumers carry the same confidence
 * semantics on the chip.
 */
export function clampConfidence(s: string | undefined): number {
  if (!s) return 0.5;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return Math.min(1, n / 100);
  return n;
}

/**
 * Stable, small, deterministic 32-bit djb2 hash for rate-limit /
 * inflight bucket keys. NOT cryptographic — collisions are harmless
 * (the cost is "two similar-looking pastes share a rate-limit
 * bucket", which is acceptable for the rate-limit intent).
 *
 * Used by use-slm-doc-summariser (per-doc rate limit) and Phase
 * 13.1 use-slm-pii-redactor (per-text rate limit).
 */
export function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
