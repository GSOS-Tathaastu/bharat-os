import { describe, expect, it } from 'vitest';
import {
  parseSkillBaseFields,
  SKILL_AGENT_PROTOCOL_VERSION,
  SKILL_AGENT_CATEGORIES,
  SKILL_ACTION_VERBS,
  ACTION_LABEL,
  MAX_ACTIONS,
  MIN_ACTIONS,
  MAX_HEADLINE_CHARS,
  MAX_ASSESSMENT_CHARS
} from './skill-agent';

describe('constants', () => {
  it('protocol version pinned', () => {
    expect(SKILL_AGENT_PROTOCOL_VERSION).toBe('bos.phase13.skill-agent.v1');
  });

  it('every action verb has a citizen-readable label', () => {
    for (const verb of SKILL_ACTION_VERBS) {
      expect(ACTION_LABEL[verb], `missing ACTION_LABEL for ${verb}`).toBeTruthy();
      expect(ACTION_LABEL[verb].length).toBeGreaterThan(8);
    }
  });

  it('categories list is frozen', () => {
    expect(Object.isFrozen(SKILL_AGENT_CATEGORIES)).toBe(true);
  });
});

describe('parseSkillBaseFields', () => {
  const good = [
    'HEADLINE: Your bill looks higher than usual.',
    'ASSESSMENT: 308 units in May puts you above the mid-tier band; check the meter reading.',
    'CONFIDENCE: 0.82',
    'RISK_FLAG: attention',
    'ACTIONS: request_meter_recheck, compare_with_neighbours, pay_via_upi'
  ].join('\n');

  it('parses the happy path', () => {
    const out = parseSkillBaseFields(good);
    expect(out).not.toBeNull();
    expect(out!.headline).toMatch(/Your bill looks higher/);
    expect(out!.assessment).toMatch(/mid-tier band/);
    expect(out!.confidence).toBeCloseTo(0.82, 2);
    expect(out!.riskFlag).toBe('attention');
    expect(out!.actions).toEqual([
      'request_meter_recheck',
      'compare_with_neighbours',
      'pay_via_upi'
    ]);
  });

  it('returns null when HEADLINE is missing', () => {
    const noHeadline = good.replace(/^HEADLINE:.*\n/, '');
    expect(parseSkillBaseFields(noHeadline)).toBeNull();
  });

  it(`returns null when fewer than ${MIN_ACTIONS} valid actions resolve`, () => {
    const noActions = good.replace(/^ACTIONS:.*$/m, 'ACTIONS: alchemy, mind_reading');
    expect(parseSkillBaseFields(noActions)).toBeNull();
  });

  it('coerces unknown RISK_FLAG to "none" (defence-in-depth)', () => {
    const drifted = good.replace(/RISK_FLAG: attention/, 'RISK_FLAG: catastrophic');
    const out = parseSkillBaseFields(drifted);
    expect(out!.riskFlag).toBe('none');
  });

  it('strips unknown action verbs and dedupes', () => {
    const drifted = good.replace(
      /^ACTIONS:.*$/m,
      'ACTIONS: pay_via_upi, alchemy, pay_via_upi, request_meter_recheck'
    );
    const out = parseSkillBaseFields(drifted);
    expect(out!.actions).toEqual(['pay_via_upi', 'request_meter_recheck']);
  });

  it(`caps actions to ${MAX_ACTIONS} entries`, () => {
    const verbs = [
      'pay_via_upi',
      'request_meter_recheck',
      'compare_with_neighbours',
      'switch_tariff_plan',
      'archive_for_records',
      'flag_for_review',
      'check_subsidy_eligibility'
    ];
    const drifted = good.replace(/^ACTIONS:.*$/m, `ACTIONS: ${verbs.join(', ')}`);
    const out = parseSkillBaseFields(drifted);
    expect(out!.actions.length).toBe(MAX_ACTIONS);
  });

  it('clips HEADLINE / ASSESSMENT to caps', () => {
    const longHeadline = 'X'.repeat(MAX_HEADLINE_CHARS + 50);
    const longAssessment = 'Y'.repeat(MAX_ASSESSMENT_CHARS + 50);
    const text = [
      `HEADLINE: ${longHeadline}`,
      `ASSESSMENT: ${longAssessment}`,
      'CONFIDENCE: 0.5',
      'RISK_FLAG: none',
      'ACTIONS: archive_for_records'
    ].join('\n');
    const out = parseSkillBaseFields(text);
    expect(out!.headline.length).toBeLessThanOrEqual(MAX_HEADLINE_CHARS);
    expect(out!.assessment.length).toBeLessThanOrEqual(MAX_ASSESSMENT_CHARS);
  });

  it('coerces out-of-range CONFIDENCE through shared clampConfidence', () => {
    // clampConfidence rescales >1 by /100 (treating "82" as 0.82)
    // and pins negatives at 0. We only assert it lands in [0,1].
    const over = good.replace(/CONFIDENCE: 0\.82/, 'CONFIDENCE: 1.7');
    const under = good.replace(/CONFIDENCE: 0\.82/, 'CONFIDENCE: -0.3');
    const overOut = parseSkillBaseFields(over)!.confidence;
    const underOut = parseSkillBaseFields(under)!.confidence;
    expect(overOut).toBeGreaterThanOrEqual(0);
    expect(overOut).toBeLessThanOrEqual(1);
    expect(underOut).toBe(0);
  });

  it('accepts CRLF line endings', () => {
    const crlf = good.replace(/\n/g, '\r\n');
    expect(parseSkillBaseFields(crlf)).not.toBeNull();
  });
});
