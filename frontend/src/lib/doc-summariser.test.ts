import { describe, expect, it } from 'vitest';
import {
  buildDocSummaryPrompt,
  parseDocSummaryCompletion,
  DOC_SUMMARISER_PROTOCOL_VERSION,
  DOC_KINDS,
  DOC_KIND_LABEL,
  SAMPLE_FIXTURES,
  DOC_INPUT_CHAR_CAP,
  type DocKind
} from './doc-summariser';

describe('DOC_SUMMARISER_PROTOCOL_VERSION', () => {
  it('is pinned to bos.phase13.doc-summariser.v1', () => {
    expect(DOC_SUMMARISER_PROTOCOL_VERSION).toBe('bos.phase13.doc-summariser.v1');
  });

  it('lists all 6 doc kinds including generic', () => {
    expect([...DOC_KINDS].sort()).toEqual([
      'electricity_bill',
      'form_16',
      'generic',
      'insurance',
      'lender_doc',
      'tncs'
    ]);
  });
});

describe('buildDocSummaryPrompt — per-kind bias hints', () => {
  it('electricity_bill prompt names due amount + consumer number', () => {
    const p = buildDocSummaryPrompt('electricity_bill', 'sample text');
    expect(p).toMatch(/Electricity bill/);
    expect(p).toMatch(/due/i);
    expect(p).toMatch(/consumer number/i);
  });

  it('form_16 prompt names gross salary + TDS + asks for PAN last 4 ONLY', () => {
    const p = buildDocSummaryPrompt('form_16', 'sample');
    expect(p).toMatch(/gross salary/i);
    expect(p).toMatch(/TDS/);
    expect(p).toMatch(/last 4 digits ONLY/);
  });

  it('tncs prompt names cancellation + fees + auto-renewal', () => {
    const p = buildDocSummaryPrompt('tncs', 'sample');
    expect(p).toMatch(/cancellation/i);
    expect(p).toMatch(/fees/i);
    expect(p).toMatch(/auto-renewal/i);
  });

  it('insurance prompt names premium + sum insured + renewal date', () => {
    const p = buildDocSummaryPrompt('insurance', 'sample');
    expect(p).toMatch(/premium/i);
    expect(p).toMatch(/sum insured/i);
    expect(p).toMatch(/renewal date/i);
  });

  it('lender_doc prompt names interest rate + tenure + processing fee', () => {
    const p = buildDocSummaryPrompt('lender_doc', 'sample');
    expect(p).toMatch(/interest rate/i);
    expect(p).toMatch(/tenure/i);
    expect(p).toMatch(/processing fee/i);
  });

  it('generic prompt enumerates all 5 named doc kinds as exemplars', () => {
    const p = buildDocSummaryPrompt('generic', 'sample');
    expect(p).toMatch(/electricity bill/i);
    expect(p).toMatch(/Form 16/);
    expect(p).toMatch(/insurance/i);
    expect(p).toMatch(/lender/i);
  });
});

describe('buildDocSummaryPrompt — input sanitisation', () => {
  it('clamps input >6000 chars', () => {
    const long = 'A'.repeat(8000);
    const p = buildDocSummaryPrompt('electricity_bill', long);
    // 6000 chars of A inside the DOCUMENT: block — but not 8000.
    expect(p).toMatch(/A{6000}/);
    expect(p).not.toMatch(/A{6001}/);
    expect(p.length).toBeLessThan(8000 + 2000);
  });

  it('normalises CRLF and standalone CR to LF', () => {
    const mixed = 'line one\r\nline two\rline three';
    const p = buildDocSummaryPrompt('generic', mixed);
    expect(p).not.toMatch(/\r/);
  });

  it('always emits the YOUR ANSWER: terminator + KEY: skeleton', () => {
    const p = buildDocSummaryPrompt('electricity_bill', 'sample');
    expect(p).toMatch(/TITLE:/);
    expect(p).toMatch(/TLDR:/);
    expect(p).toMatch(/BULLET_1:/);
    expect(p).toMatch(/BULLET_2:/);
    expect(p).toMatch(/BULLET_3:/);
    expect(p).toMatch(/LANGUAGE:/);
    expect(p).toMatch(/CONFIDENCE:/);
    expect(p).toMatch(/RISK_FLAG:/);
    expect(p).toMatch(/DOC_KIND:/);
    expect(p).toMatch(/YOUR ANSWER:\s*$/);
  });

  it('coerces unknown docKind input to generic in the prompt label', () => {
    // @ts-expect-error — exercising defence-in-depth on invalid input.
    const p = buildDocSummaryPrompt('made-up-kind', 'sample');
    expect(p).toMatch(/Document kind: Other document/);
  });
});

describe('parseDocSummaryCompletion — happy path', () => {
  const cannedElectricity = [
    'TITLE: Mahadiscom electricity bill - May 2026',
    'TLDR: ₹2,956 due on 24 May 2026 — 308 units consumed for consumer DEMO-7782.',
    'BULLET_1: Amount due: Rs 2,956',
    'BULLET_2: Due date: 24 May 2026',
    'BULLET_3: Consumer number: DEMO-7782-9145-2',
    'LANGUAGE: English',
    'CONFIDENCE: 0.92',
    'RISK_FLAG: attention',
    'DOC_KIND: electricity_bill'
  ].join('\n');

  it('returns ParsedDocSummary with protocol version stamped', () => {
    const out = parseDocSummaryCompletion(cannedElectricity, 'electricity_bill');
    expect(out?.protocolVersion).toBe('bos.phase13.doc-summariser.v1');
  });

  it('extracts title + tldr + 3 bullets + language + confidence + riskFlag + docKind', () => {
    const out = parseDocSummaryCompletion(cannedElectricity, 'electricity_bill');
    expect(out?.fields.title).toMatch(/Mahadiscom/);
    expect(out?.fields.tldr).toMatch(/₹2,956/);
    expect(out?.fields.bullets).toHaveLength(3);
    expect(out?.fields.language).toBe('English');
    expect(out?.fields.confidence).toBeCloseTo(0.92, 2);
    expect(out?.fields.riskFlag).toBe('attention');
    expect(out?.fields.docKind).toBe('electricity_bill');
  });
});

describe('parseDocSummaryCompletion — honest-hide bindings', () => {
  it('returns null when TITLE missing', () => {
    const out = parseDocSummaryCompletion(
      'TLDR: just a tldr line\nBULLET_1: x\nLANGUAGE: English',
      'generic'
    );
    expect(out).toBeNull();
  });

  it('returns null when TLDR missing', () => {
    const out = parseDocSummaryCompletion(
      'TITLE: just a title\nBULLET_1: x\nLANGUAGE: English',
      'generic'
    );
    expect(out).toBeNull();
  });

  it('returns null on empty / whitespace input', () => {
    expect(parseDocSummaryCompletion('', 'generic')).toBeNull();
    expect(parseDocSummaryCompletion('   \n\t', 'generic')).toBeNull();
  });

  it('returns ParsedDocSummary with bullets:[] when only TITLE + TLDR present', () => {
    const out = parseDocSummaryCompletion(
      'TITLE: A doc\nTLDR: A summary.',
      'generic'
    );
    expect(out).not.toBeNull();
    expect(out?.fields.bullets).toEqual([]);
  });
});

describe('parseDocSummaryCompletion — defence-in-depth coercions', () => {
  it('coerces non-allowlist RISK_FLAG to none', () => {
    const out = parseDocSummaryCompletion(
      'TITLE: x\nTLDR: y\nRISK_FLAG: SCAM',
      'generic'
    );
    expect(out?.fields.riskFlag).toBe('none');
  });

  it('coerces DOC_KIND mismatch to expectedDocKind (echo guardrail)', () => {
    const out = parseDocSummaryCompletion(
      'TITLE: x\nTLDR: y\nDOC_KIND: tncs',
      'electricity_bill'
    );
    // SLM claimed tncs but caller expected electricity_bill — coerce.
    expect(out?.fields.docKind).toBe('electricity_bill');
  });

  it('coerces unknown LANGUAGE to Other; title-cases lowercase known languages', () => {
    const lower = parseDocSummaryCompletion(
      'TITLE: x\nTLDR: y\nLANGUAGE: hindi',
      'generic'
    );
    expect(lower?.fields.language).toBe('Hindi');
    const garbage = parseDocSummaryCompletion(
      'TITLE: x\nTLDR: y\nLANGUAGE: Klingon',
      'generic'
    );
    expect(garbage?.fields.language).toBe('Other');
  });

  it('clamps confidence: raw "85" → 0.85, raw "-0.3" → 0, raw "0.42" → 0.42, NaN → 0.5', () => {
    const c1 = parseDocSummaryCompletion('TITLE: x\nTLDR: y\nCONFIDENCE: 85', 'generic');
    expect(c1?.fields.confidence).toBeCloseTo(0.85, 2);
    const c2 = parseDocSummaryCompletion('TITLE: x\nTLDR: y\nCONFIDENCE: -0.3', 'generic');
    expect(c2?.fields.confidence).toBe(0);
    const c3 = parseDocSummaryCompletion('TITLE: x\nTLDR: y\nCONFIDENCE: 0.42', 'generic');
    expect(c3?.fields.confidence).toBeCloseTo(0.42, 2);
    const c4 = parseDocSummaryCompletion('TITLE: x\nTLDR: y', 'generic');
    expect(c4?.fields.confidence).toBe(0.5);
  });

  it('strips quotes / backticks / leading-trailing whitespace on TITLE + TLDR (clipLine)', () => {
    const out = parseDocSummaryCompletion(
      'TITLE:   "Some Title"\nTLDR: `   one-line  `',
      'generic'
    );
    expect(out?.fields.title).toBe('Some Title');
    expect(out?.fields.tldr).toBe('one-line');
  });

  it('tolerates both "KEY: value" and "KEY = value" shapes', () => {
    const out = parseDocSummaryCompletion(
      'TITLE = first\nTLDR: second',
      'generic'
    );
    expect(out?.fields.title).toBe('first');
    expect(out?.fields.tldr).toBe('second');
  });

  it('clips oversized TITLE/TLDR/bullet to their caps', () => {
    const giant = 'A'.repeat(200);
    const out = parseDocSummaryCompletion(
      `TITLE: ${giant}\nTLDR: ${giant}\nBULLET_1: ${giant}`,
      'generic'
    );
    expect(out?.fields.title.length).toBe(80);
    expect(out?.fields.tldr.length).toBe(140);
    expect(out?.fields.bullets[0].length).toBe(100);
  });
});

describe('SAMPLE_FIXTURES — PII hygiene', () => {
  // Real PAN format: 5 letters + 4 digits + 1 letter, total 10 chars,
  // word-boundary-anchored. Demo fixtures must NOT contain a plausible
  // real PAN that isn't ending in 0000 / 000Z.
  const REAL_PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
  // Aadhaar: 12 digits in 4-4-4 groups OR contiguous.
  const REAL_AADHAAR_RE = /\b\d{4}\s?\d{4}\s?\d{4}\b/;

  for (const kind of DOC_KINDS) {
    it(`fixture for ${kind} contains no real-shaped Aadhaar`, () => {
      expect(SAMPLE_FIXTURES[kind]).not.toMatch(REAL_AADHAAR_RE);
    });

    it(`fixture for ${kind} contains no PAN ending in non-demo chars`, () => {
      const fixture = SAMPLE_FIXTURES[kind];
      const pans = fixture.match(REAL_PAN_RE) ?? [];
      for (const pan of pans) {
        // Every PAN-shaped string in a fixture MUST end in '0000Q' /
        // '0000Z' / '0000' so it can't be a real human PAN.
        expect(pan).toMatch(/0000[A-Z]?$/);
      }
    });

    it(`fixture for ${kind} round-trips through buildDocSummaryPrompt without throwing`, () => {
      const p = buildDocSummaryPrompt(kind as DocKind, SAMPLE_FIXTURES[kind]);
      expect(p.length).toBeGreaterThan(0);
      expect(p).toMatch(/YOUR ANSWER:/);
    });
  }
});

describe('DOC_KIND_LABEL', () => {
  it('exposes a human label per kind', () => {
    for (const kind of DOC_KINDS) {
      expect(DOC_KIND_LABEL[kind].length).toBeGreaterThan(0);
    }
  });
});

describe('DOC_INPUT_CHAR_CAP', () => {
  it('is 6000', () => {
    expect(DOC_INPUT_CHAR_CAP).toBe(6000);
  });
});

describe('Phase 13.0 adversarial fix SF-6 — unknown docKind warning', () => {
  it('coerces unknown docKind to generic AND warns in DEV via console.warn', () => {
    const originalWarn = console.warn;
    let warnMessage = '';
    let warnArg: unknown = null;
    console.warn = (msg: string, arg?: unknown) => {
      warnMessage = msg;
      warnArg = arg;
    };
    try {
      // @ts-expect-error — passing unknown kind on purpose.
      const p = buildDocSummaryPrompt('whatever-fake-kind', 'sample');
      // DEV mode is on under vitest (Vite dev-server context).
      expect(warnMessage).toMatch(/unknown docKind/);
      expect(warnArg).toBe('whatever-fake-kind');
      // Still produces a valid prompt with the generic label.
      expect(p).toMatch(/Document kind: Other document/);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('does NOT warn for a known docKind', () => {
    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      buildDocSummaryPrompt('electricity_bill', 'sample');
      expect(warned).toBe(false);
    } finally {
      console.warn = originalWarn;
    }
  });
});

// Phase 13.3 — backward-compat regression pin. profileFragment is
// optional; omitting it OR passing empty string must produce bytes
// identical to the pre-13.3 baseline.
describe('Phase 13.3 — profileFragment backward-compat pin', () => {
  it('omitted profileFragment === empty profileFragment === undefined', () => {
    const text = 'sample electricity bill body';
    const a = buildDocSummaryPrompt('electricity_bill', text);
    const b = buildDocSummaryPrompt('electricity_bill', text, '');
    const c = buildDocSummaryPrompt('electricity_bill', text, undefined);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('non-empty profileFragment is placed ABOVE the role line, exactly once', () => {
    const fragment =
      'Citizen preferences (stay on-device; respect when relevant):\n- Respond in Hindi.';
    const out = buildDocSummaryPrompt('electricity_bill', 'sample body', fragment);
    const fragIdx = out.indexOf(fragment);
    const roleIdx = out.indexOf('You are an on-device document summariser');
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(fragIdx).toBeLessThan(roleIdx);
    expect(out.split(fragment).length - 1).toBe(1);
    const docIdx = out.indexOf('DOCUMENT:');
    expect(fragIdx).toBeLessThan(docIdx);
  });
});
