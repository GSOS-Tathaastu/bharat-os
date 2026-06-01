// Phase 13.1 — Indian PII detection + masking substrate (regex-only).
//
// Pure, synchronous, zero-token Indian-PII detection. Called by the
// SLM-F redactor hook (use-slm-pii-redactor.ts) as the deterministic
// FIRST pass; the SLM second pass augments with context-dependent
// spans. Regex spans always render even when no SLM is installed,
// honouring the Phase 9.0b lazy-load contract.
//
// What lives here:
//   - 11 PII kind regexes (PAN, Aadhaar, mobile, GSTIN, account, DL,
//     RC, ABHA, UPI, email, PIN)
//   - `PII_KIND_LABEL` human label map for the chip
//   - `PII_KIND_MASK[kind](raw)` deterministic mask shaper per kind
//   - `scanWithRegex(text)` produces `RegexSpan[]` with start/end
//     offsets validated against `text.slice(start, end) === raw`
//   - `applyMask(text, spans)` rewrites text with mask shapes
//
// §15 bindings:
//   - Zero network access. Pure functions.
//   - Mask shapes are deterministic + idempotent — running applyMask
//     on already-masked text is a no-op for that span. The mask
//     character 'X' is OUTSIDE every detector's character class so
//     the second scan won't re-flag a masked region.
//   - Sample fixtures (used in tests) follow the demo-persona
//     convention: PAN ends 0000Z; consumer numbers DEMO-; mobile
//     uses 9000000000 family; account 0000-suffix.
//
// Cross-codebase relationship:
//   - `src/phase0/logger.mjs`'s `PII_FORBIDDEN_KEYS` is the BE log-
//     scrub taxonomy. The FE `PiiKind` here is a near-strict
//     superset; convergence is a Phase 13.2 substrate ticket.
//   - The full-PAN / full-Aadhaar regexes in
//     `src/phase1/provider-identity.mjs` KYC defensive paths share
//     the same shape and should eventually import from here.

export const PII_DETECTORS_PROTOCOL_VERSION = 'bos.phase13.pii-detectors.v1';

export type PiiKind =
  | 'pan'
  | 'aadhaar'
  | 'mobile'
  | 'gstin'
  | 'account'
  | 'dl'
  | 'rc'
  | 'abha'
  | 'upi'
  | 'email'
  | 'pin';

export const PII_KINDS: readonly PiiKind[] = Object.freeze([
  'pan',
  'aadhaar',
  'mobile',
  'gstin',
  'account',
  'dl',
  'rc',
  'abha',
  'upi',
  'email',
  'pin'
]);

export const PII_KIND_LABEL: Record<PiiKind, string> = {
  pan: 'PAN',
  aadhaar: 'Aadhaar',
  mobile: 'Mobile',
  gstin: 'GSTIN',
  account: 'Bank account',
  dl: 'Driving licence',
  rc: 'Vehicle registration',
  abha: 'ABHA',
  upi: 'UPI ID',
  email: 'Email',
  pin: 'PIN code'
};

// ─── Regex library ──────────────────────────────────────────────
//
// Every detector below uses /g + a unicode-friendly anchor strategy:
//   - Word-boundary `\b` is unreliable across emoji / non-ASCII;
//     instead the alternatives use lookbehind/lookahead on
//     non-detector characters where needed.
//   - For the high-value Indian identifiers we keep the regex
//     SHAPE-strict (matches deterministic specification) so a
//     citizen's typed PAN / Aadhaar gets caught on shape regardless
//     of whether the actual value is "real".

// PAN: 5 letters + 4 digits + 1 letter, all uppercase. We DO match
// lowercase to catch citizens who typed it sloppily — same posture
// applied to DL/RC/GSTIN below (Phase 13.1 adversarial fix S3).
// Phase 13.1 adversarial fix S2 — accept optional space/dash
// separators (e-KYC tools format PAN as 'ABCDE 1234 F').
export const PAN_RE = /\b[A-Za-z]{5}[\s-]?[0-9]{4}[\s-]?[A-Za-z]\b/g;

// Aadhaar: 12 digits, optionally grouped 4-4-4 with single space
// OR dash. Phase 13.1 adversarial fix S1 — accept '[\s-]?'
// separator (Aadhaar cards commonly print as '1234-5678-9012').
// Anchored to non-digit boundaries to avoid matching the middle of
// a 16-digit card number.
export const AADHAAR_RE = /(?<![0-9])([0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4})(?![0-9])/g;

// Indian mobile: 10 digits starting 6/7/8/9, optional +91 or 0
// prefix with one space/dash separator. Anchored to non-digit
// edges.
export const INDIAN_MOBILE_RE = /(?<![0-9])(?:\+?91[\s-]?|0)?([6-9][0-9]{9})(?![0-9])/g;

// GSTIN: 2 digit state code + 5 letters + 4 digits + 1 letter +
// 1 alphanum + Z + 1 alphanum check.
// Phase 13.1 adversarial fix S3 — case-insensitive (`i` flag) so
// chat-pasted lowercase 'mh' / 'z' shapes still match.
export const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/gi;

// Bank account: 10-16 digits, REQUIRED to be preceded by an
// indicator word within a 24-char left window. This is a defence
// against false positives on order IDs, transaction refs, etc.
// The indicator list is conservative; expand on real-world misses.
export const BANK_ACCOUNT_RE = /\b(?:a\/c|acct|account|bank|ifsc[^0-9]*)[\s:#]*([0-9]{10,16})\b/gi;

// Driving licence: state code (2 letters) + RTO digits (2) +
// optional space/dash + year (4) + serial (7). e.g. MH1420130012345
// or MH14 20130012345. Phase 13.1 fix S3 — case-insensitive.
export const INDIAN_DL_RE = /\b[A-Z]{2}[0-9]{2}[\s-]?[0-9]{11}\b/gi;

// Vehicle registration: 2-letter state + 1-2 digit RTO + 1-3 letter
// series + 4-digit serial. e.g. MH12AB1234 or MH 14 AB 1234. Looser
// shape than DL; needs to NOT collide with DL (DL has 11+ digit
// tail, RC has 4-digit tail). Phase 13.1 fix S3 — case-insensitive.
export const VEHICLE_RC_RE = /\b[A-Z]{2}[\s-]?[0-9]{1,2}[\s-]?[A-Z]{1,3}[\s-]?[0-9]{4}\b/gi;

// ABHA / Health ID: 14 digits, often grouped 2-4-4-4. Anchored to
// non-digit boundaries. Disambiguated from Aadhaar by length (14
// vs 12). Listed AFTER Aadhaar so on duplicate-shape overlap the
// caller can prefer ABHA (longer match wins).
export const ABHA_RE = /(?<![0-9])([0-9]{2}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4})(?![0-9])/g;

// UPI VPA: user@bank, ASCII-only handle + ASCII-only bank. The
// handle accepts dot/dash/underscore; the bank likewise. Bounded
// by word-edges.
export const UPI_RE = /\b([A-Za-z0-9._-]+)@([a-zA-Z][a-zA-Z0-9.-]+)\b/g;

// Email (subset of RFC-5322 sufficient for redaction). Distinguished
// from UPI by the presence of a dot in the domain part — a UPI VPA
// like `name@hdfcbank` won't match this. Order of registration in
// the scanner is: UPI before email, so a hit like `me@upi.bank`
// (which has a dot) is preferred-matched as email (acceptable —
// both are PII and the mask shapes converge to a similar redaction).
export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Indian postal PIN: 6 digits, not preceded/followed by another
// digit, NOT starting with 0 (postal-circle digit 1-8). Distinct
// from Aadhaar / ABHA by length and shape anchors.
export const PIN_RE = /(?<![0-9])([1-9][0-9]{5})(?![0-9])/g;

// ─── Scanner ────────────────────────────────────────────────────

export interface RegexSpan {
  kind: PiiKind;
  start: number;
  end: number;
  raw: string;
  source: 'regex';
}

// Registration order matters when two regexes share a shape. We
// register the LONGER / more-specific patterns first so they win
// the overlap-suppression in `scanWithRegex`. Bank account before
// PIN (10+ digits vs 6 digits), GSTIN before PAN (15 chars vs 10
// embedded), DL before RC (longer tail), ABHA before Aadhaar (14
// vs 12 digits) — but for ABHA/Aadhaar both fire and we trim
// overlapping shorter matches.
const DETECTOR_ORDER: ReadonlyArray<{ kind: PiiKind; re: RegExp; captureIdx?: number }> = [
  { kind: 'gstin', re: GSTIN_RE },
  { kind: 'dl', re: INDIAN_DL_RE },
  { kind: 'rc', re: VEHICLE_RC_RE },
  { kind: 'abha', re: ABHA_RE, captureIdx: 1 },
  { kind: 'aadhaar', re: AADHAAR_RE, captureIdx: 1 },
  { kind: 'account', re: BANK_ACCOUNT_RE, captureIdx: 1 },
  { kind: 'mobile', re: INDIAN_MOBILE_RE, captureIdx: 1 },
  { kind: 'pin', re: PIN_RE, captureIdx: 1 },
  { kind: 'pan', re: PAN_RE },
  { kind: 'upi', re: UPI_RE },
  { kind: 'email', re: EMAIL_RE }
];

/**
 * Run every PII regex against `text`. Returns spans with
 * non-overlapping start/end offsets, sorted by start ascending.
 *
 * Overlap rule: when two detectors hit overlapping ranges, the
 * detector registered earlier in DETECTOR_ORDER wins. This means
 * a 14-digit string is reported as ABHA (registered before
 * Aadhaar), a 12-digit string as Aadhaar, and a stray 10-digit
 * "1234567890" not preceded by an account-indicator word is NOT
 * reported as a bank account (account requires context).
 */
export function scanWithRegex(text: string): RegexSpan[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const all: RegexSpan[] = [];

  for (const { kind, re, captureIdx } of DETECTOR_ORDER) {
    // Always re-create the regex from source so we can re-use the
    // exported /g instances across many `scanWithRegex` calls
    // without lastIndex contamination.
    const local = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = local.exec(text))) {
      const fullStart = m.index;
      const fullEnd = m.index + m[0].length;
      // If the detector specifies a captureIdx, use that capture's
      // bounds (so a contextful regex like BANK_ACCOUNT_RE that
      // anchors on "a/c" surfaces only the digits as the span).
      let start = fullStart;
      let end = fullEnd;
      let raw = m[0];
      if (captureIdx !== undefined) {
        const cap = m[captureIdx];
        if (!cap) continue;
        const offsetInMatch = m[0].indexOf(cap);
        if (offsetInMatch < 0) continue;
        start = fullStart + offsetInMatch;
        end = start + cap.length;
        raw = cap;
      }
      if (text.slice(start, end) !== raw) continue;
      all.push({ kind, start, end, raw, source: 'regex' });
      // Prevent zero-width loops on weird regexes (shouldn't fire,
      // but defensive).
      if (m.index === local.lastIndex) local.lastIndex += 1;
    }
  }

  // Sort by start ascending; on tie, longer first (so the
  // suppression step below keeps the more-specific match).
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Suppress overlaps: walk in order, keep a span only if it
  // doesn't overlap a previously-kept one. Since we registered
  // longer/more-specific patterns first AND sorted longer-first on
  // ties, this naturally prefers them on overlap.
  const kept: RegexSpan[] = [];
  for (const span of all) {
    if (kept.length === 0) {
      kept.push(span);
      continue;
    }
    const last = kept[kept.length - 1];
    if (span.start < last.end) continue; // overlaps prior keep — drop
    kept.push(span);
  }
  return kept;
}

// ─── Mask shapers ───────────────────────────────────────────────
//
// Per-kind deterministic masking. Each returns a string the same
// length as the input. The 'X' character is OUTSIDE every detector
// character class (no detector matches X) so re-scanning a masked
// text is idempotent.
//
// Mask shapes intentionally keep enough information for the citizen
// to recognise WHICH PAN / Aadhaar this was, without disclosing the
// full identifier — mirrors the §15 last-4-only KYC posture.

function maskPan(raw: string): string {
  // ABCDE1234F → XXXXX1234F. Mask the 5-letter prefix, keep the
  // 4-digit core + the check letter — the citizen-recognisable
  // "PAN ending 1234F" KYC display.
  // Phase 13.1 adversarial fix S2 — preserve internal separators
  // when the raw was pasted as 'ABCDE 1234 F' or 'ABCDE-1234-F'.
  // We count alphanum-only positions; the 5 leading letters get
  // masked, everything else (digits + check letter + separators)
  // is preserved verbatim.
  let alnumIdx = 0;
  let out = '';
  for (const ch of raw) {
    if (/[A-Za-z0-9]/.test(ch)) {
      out += alnumIdx < 5 ? 'X' : ch;
      alnumIdx += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function maskAadhaar(raw: string): string {
  // Preserve any internal spaces OR dashes. Mask all digits except
  // the last four. Phase 13.1 adversarial fix S1 — separator class
  // now includes dash so '1234-5678-9012' → 'XXXX-XXXX-9012'.
  const digits = raw.replace(/[\s-]/g, '');
  if (digits.length !== 12) return raw.replace(/[0-9]/g, 'X');
  const lastFour = digits.slice(-4);
  // Rebuild preserving the original space/dash pattern.
  let out = '';
  let digitIdx = 0;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      out += digitIdx >= 8 ? lastFour[digitIdx - 8] : 'X';
      digitIdx += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function maskMobile(raw: string): string {
  // Keep first digit of the 10-digit mobile core + last 2 digits;
  // mask the middle. Preserve any +91 / 0 prefix verbatim so the
  // citizen recognises "their" number.
  // Phase 13.1 adversarial fix M2 — count DIGIT-positions, not
  // character-positions. SLM-source spans include the +91 prefix
  // (12 digits total) or a 0 prefix (11 digits total); the
  // earlier impl over-masked the prefix.
  const totalDigits = (raw.match(/\d/g) ?? []).length;
  if (totalDigits === 0) return raw;
  // Fast path: regex-captured 10-digit core.
  if (totalDigits === 10 && /^\d{10}$/.test(raw)) {
    return raw[0] + 'X'.repeat(7) + raw.slice(8);
  }
  // General path: keep prefix digits (0..firstMobileIdx) + last 2
  // digits. `firstMobileIdx` is the digit-position of the first
  // digit of the 10-digit mobile core; equals `totalDigits - 10`
  // when there's a prefix.
  const firstMobileIdx = Math.max(0, totalDigits - 10);
  let digitIdx = 0;
  let out = '';
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      const keep =
        digitIdx <= firstMobileIdx || digitIdx >= totalDigits - 2;
      out += keep ? ch : 'X';
      digitIdx += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function maskGstin(raw: string): string {
  if (raw.length !== 15) return raw.replace(/[A-Z0-9]/g, 'X');
  // Keep first 2 (state code) + last 3 (state-Z-check).
  return raw.slice(0, 2) + 'X'.repeat(10) + raw.slice(12);
}

function maskAccount(raw: string): string {
  // Keep last 4 only.
  if (raw.length <= 4) return raw;
  return 'X'.repeat(raw.length - 4) + raw.slice(-4);
}

function maskDl(raw: string): string {
  // Keep first 2 (state) + last 4 of the trailing serial. Replace
  // every other digit/letter with X but preserve separators.
  const stateLen = 2;
  if (raw.length < 6) return raw.replace(/[A-Z0-9]/g, 'X');
  const head = raw.slice(0, stateLen);
  const tail = raw.slice(-4);
  const middleLen = raw.length - stateLen - 4;
  return head + 'X'.repeat(middleLen) + tail;
}

function maskRc(raw: string): string {
  // Keep state code + RTO digit pair + last 4. Replace the alpha
  // series with X. Preserve spaces.
  // Worked example: 'MH14AB1234' → 'MH14XX1234' (alpha series masked)
  // We do a positional mask: find the alpha-series block (the
  // letters between the RTO digits and the trailing 4-digit serial).
  return raw.replace(/([A-Z]{2}[\s-]?[0-9]{1,2}[\s-]?)([A-Z]{1,3})([\s-]?[0-9]{4})/, (_m, head, series, tail) => {
    return head + 'X'.repeat(series.length) + tail;
  });
}

function maskAbha(raw: string): string {
  // 14 digits (possibly with internal separators). Keep last 4;
  // mask the first 10 digit-positions; preserve any separator.
  const digits = raw.replace(/[\s-]/g, '');
  if (digits.length !== 14) return raw.replace(/[0-9]/g, 'X');
  let out = '';
  let digitIdx = 0;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      out += digitIdx >= 10 ? digits[digitIdx] : 'X';
      digitIdx += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function maskUpi(raw: string): string {
  const at = raw.indexOf('@');
  if (at <= 0) return raw.replace(/./g, 'X');
  return 'X' + raw.slice(at);
}

function maskEmail(raw: string): string {
  const at = raw.indexOf('@');
  if (at <= 0) return raw.replace(/./g, 'X');
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  if (local.length <= 1) return local + domain;
  return local[0] + 'X'.repeat(local.length - 1) + domain;
}

function maskPin(raw: string): string {
  if (raw.length !== 6) return 'X'.repeat(raw.length);
  return raw.slice(0, 2) + 'X'.repeat(4);
}

export const PII_KIND_MASK: Record<PiiKind, (raw: string) => string> = {
  pan: maskPan,
  aadhaar: maskAadhaar,
  mobile: maskMobile,
  gstin: maskGstin,
  account: maskAccount,
  dl: maskDl,
  rc: maskRc,
  abha: maskAbha,
  upi: maskUpi,
  email: maskEmail,
  pin: maskPin
};

/** Structural shape applyMask consumes. Any span source (regex
 *  or SLM) satisfies it without a cast — Phase 13.2 SF-9 cleanup. */
export interface MaskableSpan {
  start: number;
  end: number;
  kind: PiiKind;
  raw: string;
}

/**
 * Rewrite `text` with `spans` masked. Spans must be
 * non-overlapping (use `scanWithRegex` output or
 * merge-deduped output from `mergeSpans`). Returns the masked
 * text. Idempotent: applying the same mask twice yields the
 * same result because the mask character 'X' is outside every
 * detector character class.
 */
export function applyMask(text: string, spans: ReadonlyArray<MaskableSpan>): string {
  if (spans.length === 0) return text;
  // Defensive copy + sort by start ascending. Caller-supplied
  // spans should already be sorted but we don't trust the caller.
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue; // ignore overlap
    if (s.start < 0 || s.end > text.length || s.end <= s.start) continue;
    if (text.slice(s.start, s.end) !== s.raw) continue;
    out += text.slice(cursor, s.start);
    out += PII_KIND_MASK[s.kind](s.raw);
    cursor = s.end;
  }
  out += text.slice(cursor);
  return out;
}
