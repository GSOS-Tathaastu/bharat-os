import { describe, expect, it } from 'vitest';
import {
  PM_KISAN_STATUS_CHECKER,
  PM_KISAN_STATUS_CHECKER_SKILL_ID,
  SCHEME_STATUSES,
  LIKELY_BLOCKERS
} from './pm-kisan-status-checker';
import { SKILL_AGENT_PROTOCOL_VERSION } from '../skill-agent';

const FULL_GOOD = [
  'HEADLINE: 3rd installment likely held back due to pending eKYC.',
  'ASSESSMENT: Missing December installment with previous two received fits the eKYC-renewal blocker pattern.',
  'SCHEME_STATUS: likely_active',
  'LIKELY_BLOCKER: ekyc_pending',
  'NEXT_INSTALLMENT_WINDOW: Aug-Nov 2026 (assuming eKYC is completed first)',
  'KEY_CHECK_1: Confirm whether your eKYC was renewed at pmkisan.gov.in (Aadhaar OTP)',
  'KEY_CHECK_2: Verify your SBI account is Aadhaar-seeded via NPCI mapper',
  'KEY_CHECK_3: Check land records on Maharashtra Bhulekh match your PM-KISAN registration',
  'CONFIDENCE: 0.78',
  'RISK_FLAG: attention',
  'ACTIONS: complete_pm_kisan_ekyc, check_aadhaar_bank_seeding, contact_pm_kisan_helpline'
].join('\n');

describe('PM_KISAN_STATUS_CHECKER definition', () => {
  it('skillId pinned + protocol version pinned', () => {
    expect(PM_KISAN_STATUS_CHECKER.skillId).toBe(PM_KISAN_STATUS_CHECKER_SKILL_ID);
    expect(PM_KISAN_STATUS_CHECKER_SKILL_ID).toBe(
      'bos:skill-agent-fe:pm-kisan-status-checker.v1'
    );
  });

  it('category is government_scheme_status', () => {
    expect(PM_KISAN_STATUS_CHECKER.category).toBe('government_scheme_status');
  });

  it('supportedDocKinds = [generic]', () => {
    expect([...PM_KISAN_STATUS_CHECKER.supportedDocKinds]).toEqual(['generic']);
  });
});

describe('buildPrompt', () => {
  const sample = PM_KISAN_STATUS_CHECKER.sampleInput();

  it('emits a stable prompt for the sample input', () => {
    const a = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    const b = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    expect(a).toBe(b);
  });

  it('embeds the citizen-supplied date verbatim', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt({
      ...sample,
      currentDateIso: '2026-06-02'
    });
    expect(out).toContain("Today's date: 2026-06-02.");
  });

  it('rejects non-ISO date strings', () => {
    expect(() =>
      PM_KISAN_STATUS_CHECKER.buildPrompt({ ...sample, currentDateIso: '2 June 2026' })
    ).toThrow(/currentDateIso must be a YYYY-MM-DD/);
  });

  it('rejects calendar-invalid dates (e.g. month 13)', () => {
    expect(() =>
      PM_KISAN_STATUS_CHECKER.buildPrompt({ ...sample, currentDateIso: '2026-13-01' })
    ).toThrow(/currentDateIso must be a calendar-valid date/);
  });

  it('lists the three PM-KISAN installment windows', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    expect(out).toMatch(/April to July/);
    expect(out).toMatch(/August to November/);
    expect(out).toMatch(/December to March/);
  });

  it('lists the four canonical blockers', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    for (const blocker of [
      'ekyc_pending',
      'bank_aadhaar_unseeded',
      'land_record_mismatch',
      'ineligible_landholding'
    ]) {
      expect(out).toContain(blocker);
    }
  });

  it('contains the PM-KISAN-specific action vocabulary', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    for (const verb of [
      'complete_pm_kisan_ekyc',
      'check_aadhaar_bank_seeding',
      'verify_land_records',
      'contact_pm_kisan_helpline',
      'visit_csc_for_correction'
    ]) {
      expect(out).toContain(verb);
    }
  });

  it('embeds the concern description verbatim', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    expect(out).toContain(sample.concernText);
  });

  it('injects profile fragment above the role line when non-empty', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample, 'Prefer Hindi.');
    const fragIdx = out.indexOf('Prefer Hindi.');
    const roleIdx = out.indexOf('You are an on-device PM-KISAN');
    expect(fragIdx).toBeGreaterThan(-1);
    expect(fragIdx).toBeLessThan(roleIdx);
  });

  it('byte-equal prompt when profileFragment is empty string (Phase 13.3 binding)', () => {
    const a = PM_KISAN_STATUS_CHECKER.buildPrompt(sample);
    const b = PM_KISAN_STATUS_CHECKER.buildPrompt(sample, '');
    expect(a).toBe(b);
  });

  // MF-1 regression — same posture as ConsumerComplaintPanel:
  // intentional blank-line spacers MUST survive (no .filter(Boolean)
  // collapsing them).
  it('preserves blank-line spacers between profile fragment / role line and concern / YOUR ANSWER', () => {
    const out = PM_KISAN_STATUS_CHECKER.buildPrompt(sample, 'Prefer Hindi.');
    expect(out).toContain('Prefer Hindi.\n\nYou are an on-device PM-KISAN');
    expect(out).toMatch(/CONCERN DESCRIPTION:[\s\S]+?\n\nYOUR ANSWER:/);
  });
});

describe('parseCompletion', () => {
  it('parses the happy path', () => {
    const out = PM_KISAN_STATUS_CHECKER.parseCompletion(FULL_GOOD);
    expect(out).not.toBeNull();
    expect(out!.protocolVersion).toBe(SKILL_AGENT_PROTOCOL_VERSION);
    expect(out!.skillId).toBe(PM_KISAN_STATUS_CHECKER_SKILL_ID);
    expect(out!.fields.schemeStatus).toBe('likely_active');
    expect(out!.fields.likelyBlocker).toBe('ekyc_pending');
    expect(out!.fields.nextInstallmentWindow).toMatch(/Aug-Nov 2026/);
    expect(out!.fields.keyChecks.length).toBe(3);
    expect(out!.fields.actions).toEqual([
      'complete_pm_kisan_ekyc',
      'check_aadhaar_bank_seeding',
      'contact_pm_kisan_helpline'
    ]);
  });

  it('returns null when NEXT_INSTALLMENT_WINDOW is missing', () => {
    const drifted = FULL_GOOD.replace(/^NEXT_INSTALLMENT_WINDOW:.*\n/m, '');
    expect(PM_KISAN_STATUS_CHECKER.parseCompletion(drifted)).toBeNull();
  });

  it('returns null when no KEY_CHECK_N resolves', () => {
    const drifted = FULL_GOOD
      .replace(/^KEY_CHECK_1:.*\n/m, '')
      .replace(/^KEY_CHECK_2:.*\n/m, '')
      .replace(/^KEY_CHECK_3:.*$/m, '');
    expect(PM_KISAN_STATUS_CHECKER.parseCompletion(drifted)).toBeNull();
  });

  it('coerces unknown SCHEME_STATUS to "unknown"', () => {
    const drifted = FULL_GOOD.replace(/SCHEME_STATUS: likely_active/, 'SCHEME_STATUS: schrodinger');
    expect(PM_KISAN_STATUS_CHECKER.parseCompletion(drifted)!.fields.schemeStatus).toBe('unknown');
  });

  it('coerces unknown LIKELY_BLOCKER to "unknown"', () => {
    const drifted = FULL_GOOD.replace(
      /LIKELY_BLOCKER: ekyc_pending/,
      'LIKELY_BLOCKER: government_apathy'
    );
    expect(PM_KISAN_STATUS_CHECKER.parseCompletion(drifted)!.fields.likelyBlocker).toBe('unknown');
  });

  it('dedupes identical KEY_CHECK_N values', () => {
    const drifted = FULL_GOOD.replace(
      /KEY_CHECK_2: .+/,
      'KEY_CHECK_2: Confirm whether your eKYC was renewed at pmkisan.gov.in (Aadhaar OTP)'
    );
    const out = PM_KISAN_STATUS_CHECKER.parseCompletion(drifted);
    expect(out!.fields.keyChecks.length).toBe(2);
  });

  it('caps keyChecks to 5 entries', () => {
    const baseLines = FULL_GOOD.split('\n').filter((l) => !l.startsWith('KEY_CHECK_'));
    const drifted = [
      ...baseLines,
      'KEY_CHECK_1: Check A',
      'KEY_CHECK_2: Check B',
      'KEY_CHECK_3: Check C',
      'KEY_CHECK_4: Check D',
      'KEY_CHECK_5: Check E'
    ].join('\n');
    const out = PM_KISAN_STATUS_CHECKER.parseCompletion(drifted);
    expect(out!.fields.keyChecks.length).toBe(5);
  });

  it('clips NEXT_INSTALLMENT_WINDOW to 120 chars', () => {
    const longWindow = 'X'.repeat(200);
    const drifted = FULL_GOOD.replace(
      /NEXT_INSTALLMENT_WINDOW:.*$/m,
      `NEXT_INSTALLMENT_WINDOW: ${longWindow}`
    );
    const out = PM_KISAN_STATUS_CHECKER.parseCompletion(drifted);
    expect(out!.fields.nextInstallmentWindow.length).toBeLessThanOrEqual(120);
  });
});

describe('SCHEME_STATUSES / LIKELY_BLOCKERS', () => {
  it('SCHEME_STATUSES covers the 4 cardinal states', () => {
    for (const expected of ['likely_active', 'likely_inactive', 'eligibility_uncertain', 'unknown']) {
      expect(SCHEME_STATUSES).toContain(expected);
    }
  });

  it('LIKELY_BLOCKERS includes all 4 canonical causes + none + unknown', () => {
    expect([...LIKELY_BLOCKERS]).toEqual([
      'ekyc_pending',
      'bank_aadhaar_unseeded',
      'land_record_mismatch',
      'ineligible_landholding',
      'none',
      'unknown'
    ]);
  });
});
