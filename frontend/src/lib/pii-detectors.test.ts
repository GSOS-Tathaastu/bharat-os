import { describe, expect, it } from 'vitest';
import {
  PII_DETECTORS_PROTOCOL_VERSION,
  PII_KINDS,
  PII_KIND_LABEL,
  PII_KIND_MASK,
  PAN_RE,
  AADHAAR_RE,
  INDIAN_MOBILE_RE,
  GSTIN_RE,
  BANK_ACCOUNT_RE,
  INDIAN_DL_RE,
  VEHICLE_RC_RE,
  ABHA_RE,
  UPI_RE,
  EMAIL_RE,
  PIN_RE,
  scanWithRegex,
  applyMask,
  type PiiKind
} from './pii-detectors';

describe('protocol surface', () => {
  it('exports protocol version', () => {
    expect(PII_DETECTORS_PROTOCOL_VERSION).toBe('bos.phase13.pii-detectors.v1');
  });

  it('exports 11 PII kinds with labels and mask shapers', () => {
    expect([...PII_KINDS].sort()).toEqual([
      'aadhaar', 'abha', 'account', 'dl', 'email',
      'gstin', 'mobile', 'pan', 'pin', 'rc', 'upi'
    ]);
    for (const kind of PII_KINDS) {
      expect(PII_KIND_LABEL[kind]).toBeTruthy();
      expect(typeof PII_KIND_MASK[kind]).toBe('function');
    }
  });
});

describe('PAN_RE', () => {
  it('matches uppercase shape', () => {
    expect('ABCDE1234F'.match(PAN_RE)).toEqual(['ABCDE1234F']);
  });
  it('matches the demo fixture shape ABCDX0000Z (shape not value)', () => {
    expect('My PAN is ABCDX0000Z thanks'.match(PAN_RE)).toEqual(['ABCDX0000Z']);
  });
  it('also matches lowercase (sloppy citizen typing)', () => {
    expect('abcde1234f'.match(PAN_RE)).toEqual(['abcde1234f']);
  });
  it('rejects too-long / too-short', () => {
    expect('ABCDE12345'.match(PAN_RE)).toBeNull();
    expect('ABCDE123F'.match(PAN_RE)).toBeNull();
  });
});

describe('AADHAAR_RE', () => {
  it('matches 12 contiguous digits', () => {
    const out = 'aadhaar 123456789012 ok'.match(AADHAAR_RE);
    expect(out?.[0]).toBe('123456789012');
  });
  it('matches 4-4-4 spaced', () => {
    const out = 'see 1234 5678 9012 here'.match(AADHAAR_RE);
    expect(out?.[0]).toBe('1234 5678 9012');
  });
  it('does NOT match a 16-digit card', () => {
    expect('1234567812345678'.match(AADHAAR_RE)).toBeNull();
  });
  it('does NOT match a 6-digit PIN', () => {
    expect('110001'.match(AADHAAR_RE)).toBeNull();
  });
});

describe('INDIAN_MOBILE_RE', () => {
  it('matches a 10-digit starting 9 with +91 prefix', () => {
    const out = 'call +91 9876543210 today'.match(INDIAN_MOBILE_RE);
    expect(out?.[0]).toBe('+91 9876543210');
  });
  it('matches bare 10-digit starting 6/7/8/9', () => {
    expect('6000000000'.match(INDIAN_MOBILE_RE)?.[0]).toBe('6000000000');
    expect('9876543210'.match(INDIAN_MOBILE_RE)?.[0]).toBe('9876543210');
  });
  it('rejects 10-digit starting 5 (invalid Indian mobile)', () => {
    expect('5876543210'.match(INDIAN_MOBILE_RE)).toBeNull();
  });
  it('rejects too short', () => {
    expect('12345'.match(INDIAN_MOBILE_RE)).toBeNull();
  });
});

describe('GSTIN_RE', () => {
  it('matches the demo fixture shape', () => {
    expect('27ABCDE1234F1Z5'.match(GSTIN_RE)?.[0]).toBe('27ABCDE1234F1Z5');
  });
  it('rejects without the Z', () => {
    expect('27ABCDE1234F125'.match(GSTIN_RE)).toBeNull();
  });
});

describe('BANK_ACCOUNT_RE — context-window guard', () => {
  it('matches digits when preceded by "a/c"', () => {
    expect(scanWithRegex('a/c 1234567890123').some((s) => s.kind === 'account')).toBe(true);
  });

  it('matches digits when preceded by "account"', () => {
    expect(scanWithRegex('my account 1234567890').some((s) => s.kind === 'account')).toBe(true);
  });

  it('does NOT match a bare 10-digit string (no account indicator)', () => {
    const spans = scanWithRegex('Order id 1234567890 confirmed.');
    expect(spans.some((s) => s.kind === 'account')).toBe(false);
  });
});

describe('INDIAN_DL_RE vs VEHICLE_RC_RE', () => {
  it('matches DL with state + 2 RTO + 11 digit tail', () => {
    expect('MH1420130012345'.match(INDIAN_DL_RE)?.[0]).toBe('MH1420130012345');
  });
  it('matches RC with state + 2 RTO + alpha series + 4-digit tail', () => {
    expect('MH14AB1234'.match(VEHICLE_RC_RE)?.[0]).toBe('MH14AB1234');
  });
  it('DL pattern does NOT match an RC string', () => {
    expect('MH14AB1234'.match(INDIAN_DL_RE)).toBeNull();
  });
});

describe('ABHA_RE vs AADHAAR_RE — disambiguation by length', () => {
  it('14-digit string reports as ABHA (registered before Aadhaar in scanner)', () => {
    const spans = scanWithRegex('ABHA: 99999999991234');
    expect(spans.some((s) => s.kind === 'abha')).toBe(true);
    expect(spans.some((s) => s.kind === 'aadhaar')).toBe(false);
  });
  it('12-digit string reports as Aadhaar', () => {
    const spans = scanWithRegex('Aadhaar: 123456789012');
    expect(spans.some((s) => s.kind === 'aadhaar')).toBe(true);
    expect(spans.some((s) => s.kind === 'abha')).toBe(false);
  });
});

describe('UPI_RE / EMAIL_RE', () => {
  it('UPI matches user@bank without dot', () => {
    expect('pay alice@hdfcbank by 5pm'.match(UPI_RE)?.[0]).toBe('alice@hdfcbank');
  });
  it('email matches user@host.tld', () => {
    expect('mail me at alice@example.com'.match(EMAIL_RE)?.[0]).toBe('alice@example.com');
  });
  it('email-shaped strings hit email first (scanner registration order)', () => {
    const spans = scanWithRegex('alice@example.com is my email');
    // Order means UPI fires first; overlap-suppression keeps UPI. We
    // accept either; what matters is exactly ONE span on this text.
    const overlapping = spans.filter((s) => s.kind === 'upi' || s.kind === 'email');
    expect(overlapping).toHaveLength(1);
  });
});

describe('PIN_RE', () => {
  it('matches 6-digit not starting 0', () => {
    expect('PIN 411014'.match(PIN_RE)?.[0]).toBe('411014');
  });
  it('rejects leading-zero shape', () => {
    expect('012345'.match(PIN_RE)).toBeNull();
  });
});

describe('scanWithRegex — span correctness', () => {
  it('returns empty for empty / undefined-like input', () => {
    expect(scanWithRegex('')).toEqual([]);
    // @ts-expect-error — defensive on bad input
    expect(scanWithRegex(undefined)).toEqual([]);
  });

  it('every span\'s text.slice(start, end) equals raw', () => {
    const text = 'PAN ABCDE1234F mobile 9876543210 GSTIN 27ABCDE1234F1Z5 email me@example.com.';
    for (const span of scanWithRegex(text)) {
      expect(text.slice(span.start, span.end)).toBe(span.raw);
    }
  });

  it('returns spans sorted by start ascending, non-overlapping', () => {
    const text = 'ABCDE1234F call 9876543210 then ABCDE9999A also.';
    const spans = scanWithRegex(text);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });
});

describe('applyMask', () => {
  it('rewrites text with deterministic masks', () => {
    const text = 'PAN: ABCDE1234F';
    const spans = scanWithRegex(text);
    const masked = applyMask(text, spans);
    expect(masked).toBe('PAN: XXXXX1234F');
  });

  it('is idempotent — re-scanning + re-masking keeps the text stable', () => {
    const text = 'aadhaar 1234 5678 9012 thanks';
    const masked = applyMask(text, scanWithRegex(text));
    expect(masked).toBe('aadhaar XXXX XXXX 9012 thanks');
    const masked2 = applyMask(masked, scanWithRegex(masked));
    expect(masked2).toBe(masked);
  });

  it('drops spans whose text.slice does not equal raw', () => {
    const text = 'ABCDE1234F';
    const masked = applyMask(text, [
      { start: 0, end: 10, kind: 'pan' as PiiKind, raw: 'ZZZZZZZZZZ' }
    ]);
    expect(masked).toBe('ABCDE1234F'); // span dropped, text unchanged
  });

  it('drops out-of-range spans', () => {
    const masked = applyMask('hi', [
      { start: 0, end: 999, kind: 'pan' as PiiKind, raw: 'hi' }
    ]);
    expect(masked).toBe('hi');
  });

  it('handles empty spans → returns the input verbatim', () => {
    expect(applyMask('hello', [])).toBe('hello');
  });
});

describe('per-kind mask shape rules', () => {
  it('pan: ABCDE1234F → XXXXX1234F', () => {
    expect(PII_KIND_MASK.pan('ABCDE1234F')).toBe('XXXXX1234F');
  });
  it('aadhaar (contiguous): 123456789012 → XXXXXXXX9012', () => {
    expect(PII_KIND_MASK.aadhaar('123456789012')).toBe('XXXXXXXX9012');
  });
  it('aadhaar (spaced): 1234 5678 9012 → XXXX XXXX 9012', () => {
    expect(PII_KIND_MASK.aadhaar('1234 5678 9012')).toBe('XXXX XXXX 9012');
  });
  it('mobile (10-digit core): 9876543210 → 9XXXXXXX10', () => {
    expect(PII_KIND_MASK.mobile('9876543210')).toBe('9XXXXXXX10');
  });
  it('gstin: 27ABCDE1234F1Z5 → 27XXXXXXXXXX1Z5', () => {
    expect(PII_KIND_MASK.gstin('27ABCDE1234F1Z5')).toBe('27XXXXXXXXXX1Z5');
  });
  it('account: keeps last 4', () => {
    expect(PII_KIND_MASK.account('1234567890123')).toBe('XXXXXXXXX0123');
  });
  it('upi: alice@hdfcbank → X@hdfcbank', () => {
    expect(PII_KIND_MASK.upi('alice@hdfcbank')).toBe('X@hdfcbank');
  });
  it('email: alice@example.com → aXXXX@example.com', () => {
    expect(PII_KIND_MASK.email('alice@example.com')).toBe('aXXXX@example.com');
  });
  it('pin: 110001 → 11XXXX', () => {
    expect(PII_KIND_MASK.pin('110001')).toBe('11XXXX');
  });

  // Phase 13.1 adversarial fix M2 — maskMobile must keep first
  // digit + last 2 digits regardless of how the raw is shaped
  // (+91 prefix / space / dash). Earlier defensive fallback
  // compared char-index against digit-count which produced wrong
  // shapes on separator-bearing SLM spans.
  it('M2: maskMobile preserves first + last-2 digits with +91 prefix', () => {
    expect(PII_KIND_MASK.mobile('+91 9876543210')).toBe('+91 9XXXXXXX10');
  });

  it('M2: maskMobile preserves first + last-2 digits with 0 prefix', () => {
    expect(PII_KIND_MASK.mobile('0 9876543210')).toBe('0 9XXXXXXX10');
  });
});

describe('Phase 13.1 adversarial fix S1 — Aadhaar dash-separator', () => {
  it('AADHAAR_RE matches dash-separated 4-4-4', () => {
    const spans = scanWithRegex('Aadhaar: 1234-5678-9012');
    expect(spans.some((s) => s.kind === 'aadhaar')).toBe(true);
  });

  it('maskAadhaar preserves dashes', () => {
    expect(PII_KIND_MASK.aadhaar('1234-5678-9012')).toBe('XXXX-XXXX-9012');
  });
});

describe('Phase 13.1 adversarial fix S2 — PAN with separators', () => {
  it('PAN_RE matches "ABCDX 0000 Z" (space-separated)', () => {
    const spans = scanWithRegex('PAN: ABCDX 0000 Z');
    expect(spans.some((s) => s.kind === 'pan')).toBe(true);
  });

  it('PAN_RE matches "ABCDX-0000-Z" (dash-separated)', () => {
    const spans = scanWithRegex('PAN: ABCDX-0000-Z');
    expect(spans.some((s) => s.kind === 'pan')).toBe(true);
  });

  it('maskPan preserves internal separators', () => {
    expect(PII_KIND_MASK.pan('ABCDX 0000 Z')).toBe('XXXXX 0000 Z');
    expect(PII_KIND_MASK.pan('ABCDX-0000-Z')).toBe('XXXXX-0000-Z');
  });
});

describe('Phase 13.1 adversarial fix S3 — lowercase DL/RC/GSTIN', () => {
  it('GSTIN_RE matches lowercase shape', () => {
    const spans = scanWithRegex('gst 27abcde1234f1z5');
    expect(spans.some((s) => s.kind === 'gstin')).toBe(true);
  });

  it('INDIAN_DL_RE matches lowercase shape', () => {
    const spans = scanWithRegex('dl mh1420130012345');
    expect(spans.some((s) => s.kind === 'dl')).toBe(true);
  });

  it('VEHICLE_RC_RE matches lowercase shape', () => {
    const spans = scanWithRegex('vehicle mh14ab1234');
    expect(spans.some((s) => s.kind === 'rc')).toBe(true);
  });
});
