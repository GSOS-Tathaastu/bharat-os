import { describe, expect, it } from 'vitest';
import {
  ELECTRICITY_BILL_EXPLAINER,
  ELECTRICITY_BILL_EXPLAINER_SKILL_ID,
  TARIFF_TIERS,
  DEVIATION_FLAGS
} from './electricity-bill-explainer';
import { SKILL_AGENT_PROTOCOL_VERSION } from '../skill-agent';

const FULL_GOOD = [
  'HEADLINE: Your May 2026 bill of ₹2,956 is within the expected mid-tier range.',
  'ASSESSMENT: 308 units puts you mid-band. The amount looks routine for a domestic_mid tier in this season.',
  'TARIFF_TIER: domestic_mid',
  'EXPECTED_RANGE_MIN_RUPEES: 1500',
  'EXPECTED_RANGE_MAX_RUPEES: 3200',
  'DEVIATION_FLAG: on_track',
  'CONFIDENCE: 0.88',
  'RISK_FLAG: none',
  'ACTIONS: pay_via_upi, archive_for_records'
].join('\n');

describe('ELECTRICITY_BILL_EXPLAINER definition', () => {
  it('skillId pinned + protocol version pinned', () => {
    expect(ELECTRICITY_BILL_EXPLAINER.skillId).toBe(ELECTRICITY_BILL_EXPLAINER_SKILL_ID);
    expect(ELECTRICITY_BILL_EXPLAINER_SKILL_ID).toBe(
      'bos:skill-agent-fe:electricity-bill-explainer.v1'
    );
  });

  it('category is utility_bill_explainer', () => {
    expect(ELECTRICITY_BILL_EXPLAINER.category).toBe('utility_bill_explainer');
  });

  it('supports only electricity_bill', () => {
    expect([...ELECTRICITY_BILL_EXPLAINER.supportedDocKinds]).toEqual(['electricity_bill']);
  });
});

describe('buildPrompt', () => {
  const sample = ELECTRICITY_BILL_EXPLAINER.sampleInput();

  it('emits a stable prompt for the sample input', () => {
    const a = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    const b = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    expect(a).toBe(b);
  });

  it('contains the citizen tier hint', () => {
    const out = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    expect(out).toMatch(/Citizen tier hint: domestic_mid/);
  });

  it('contains the fixed action vocabulary', () => {
    const out = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    for (const verb of [
      'file_dispute_consumer_forum',
      'request_meter_recheck',
      'switch_tariff_plan',
      'pay_via_upi'
    ]) {
      expect(out).toContain(verb);
    }
  });

  it('includes ALL bullets passed (up to 8)', () => {
    const out = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    for (const bullet of sample.docSummaryBullets) {
      expect(out).toContain(bullet);
    }
  });

  it('injects profile fragment above the role line when non-empty', () => {
    const out = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample, 'Prefer Hindi.');
    const fragIdx = out.indexOf('Prefer Hindi.');
    const roleIdx = out.indexOf('You are an on-device');
    expect(fragIdx).toBeGreaterThan(-1);
    expect(fragIdx).toBeLessThan(roleIdx);
  });

  it('byte-equal prompt when profileFragment is empty string (Phase 13.3 binding)', () => {
    const a = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample);
    const b = ELECTRICITY_BILL_EXPLAINER.buildPrompt(sample, '');
    expect(a).toBe(b);
  });

  it('falls back to domestic_mid when tier hint is missing', () => {
    const noHint = { ...sample, tierHint: undefined };
    const out = ELECTRICITY_BILL_EXPLAINER.buildPrompt(noHint);
    expect(out).toMatch(/Citizen tier hint: domestic_mid/);
  });
});

describe('parseCompletion', () => {
  it('parses the happy path', () => {
    const out = ELECTRICITY_BILL_EXPLAINER.parseCompletion(FULL_GOOD);
    expect(out).not.toBeNull();
    expect(out!.protocolVersion).toBe(SKILL_AGENT_PROTOCOL_VERSION);
    expect(out!.skillId).toBe(ELECTRICITY_BILL_EXPLAINER_SKILL_ID);
    expect(out!.fields.tariffTier).toBe('domestic_mid');
    expect(out!.fields.deviationFlag).toBe('on_track');
    expect(out!.fields.expectedRangeMinPaise).toBe(150000);
    expect(out!.fields.expectedRangeMaxPaise).toBe(320000);
    expect(out!.fields.actions).toEqual(['pay_via_upi', 'archive_for_records']);
  });

  it('returns null when HEADLINE is missing', () => {
    const drifted = FULL_GOOD.replace(/^HEADLINE:.*\n/, '');
    expect(ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted)).toBeNull();
  });

  it('coerces unknown TARIFF_TIER to "unknown"', () => {
    const drifted = FULL_GOOD.replace(/TARIFF_TIER: domestic_mid/, 'TARIFF_TIER: government_subsidy_extreme');
    expect(ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted)!.fields.tariffTier).toBe('unknown');
  });

  it('coerces unknown DEVIATION_FLAG to "on_track"', () => {
    const drifted = FULL_GOOD.replace(/DEVIATION_FLAG: on_track/, 'DEVIATION_FLAG: catastrophic');
    expect(ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted)!.fields.deviationFlag).toBe('on_track');
  });

  it('swaps min/max if SLM emits them inverted', () => {
    const drifted = FULL_GOOD
      .replace(/EXPECTED_RANGE_MIN_RUPEES: 1500/, 'EXPECTED_RANGE_MIN_RUPEES: 3200')
      .replace(/EXPECTED_RANGE_MAX_RUPEES: 3200/, 'EXPECTED_RANGE_MAX_RUPEES: 1500');
    const out = ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted);
    expect(out!.fields.expectedRangeMinPaise).toBe(150000);
    expect(out!.fields.expectedRangeMaxPaise).toBe(320000);
  });

  it('caps absurd EXPECTED_RANGE values at 100,000 rupees', () => {
    const drifted = FULL_GOOD.replace(
      /EXPECTED_RANGE_MAX_RUPEES: 3200/,
      'EXPECTED_RANGE_MAX_RUPEES: 99999999'
    );
    const out = ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted);
    expect(out!.fields.expectedRangeMaxPaise).toBeLessThanOrEqual(10_000_000);
  });

  it('treats negative ranges as 0', () => {
    const drifted = FULL_GOOD.replace(
      /EXPECTED_RANGE_MIN_RUPEES: 1500/,
      'EXPECTED_RANGE_MIN_RUPEES: -500'
    );
    const out = ELECTRICITY_BILL_EXPLAINER.parseCompletion(drifted);
    expect(out!.fields.expectedRangeMinPaise).toBe(0);
  });
});

describe('TARIFF_TIERS / DEVIATION_FLAGS', () => {
  it('TARIFF_TIERS includes domestic + commercial + industrial + unknown', () => {
    for (const expected of ['domestic_low', 'domestic_mid', 'domestic_high', 'commercial', 'industrial', 'unknown']) {
      expect(TARIFF_TIERS).toContain(expected);
    }
  });

  it('DEVIATION_FLAGS includes the 4 cardinal directions', () => {
    for (const expected of ['under_expected', 'on_track', 'over_expected', 'far_over_expected']) {
      expect(DEVIATION_FLAGS).toContain(expected);
    }
  });
});
