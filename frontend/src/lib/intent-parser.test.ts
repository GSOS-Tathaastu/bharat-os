// Phase 12.1b.1 — Intent parser vitest contracts.

import { describe, expect, it } from 'vitest';
import {
  INTENT_ACTION_TYPES,
  buildIntentParsePrompt,
  parseIntentCompletion,
  actionTypeFriendlyLabel
} from './intent-parser';

describe('INTENT_ACTION_TYPES taxonomy', () => {
  it('matches the orchestrator canonical set', () => {
    expect(INTENT_ACTION_TYPES).toContain('service_booking');
    expect(INTENT_ACTION_TYPES).toContain('scheme_delivery');
    expect(INTENT_ACTION_TYPES).toContain('regulated_onboarding');
    expect(INTENT_ACTION_TYPES).toContain('health_record_read');
    expect(INTENT_ACTION_TYPES).toContain('labor_match_post');
    expect(INTENT_ACTION_TYPES).toContain('mesh_storage');
    expect(INTENT_ACTION_TYPES).toContain('trust_attestation');
    expect(INTENT_ACTION_TYPES).toContain('daily_brief');
    expect(INTENT_ACTION_TYPES.length).toBe(8);
  });
});

describe('buildIntentParsePrompt', () => {
  it('includes the action-type list verbatim', () => {
    const prompt = buildIntentParsePrompt('मुझे कैब चाहिए');
    for (const t of INTENT_ACTION_TYPES) {
      expect(prompt).toContain(`- ${t}:`);
    }
  });
  it('embeds the user intent below YOUR ANSWER markers', () => {
    const prompt = buildIntentParsePrompt('Book a cab');
    expect(prompt).toContain('USER INTENT:');
    expect(prompt).toContain('Book a cab');
    expect(prompt).toContain('YOUR ANSWER:');
  });
  it('clips long intent text + strips CRLF', () => {
    const long = 'a\r\n'.repeat(400);
    const prompt = buildIntentParsePrompt(long);
    expect(prompt.length).toBeLessThan(8000);
    expect(prompt).not.toMatch(/\r/);
  });
});

describe('parseIntentCompletion', () => {
  it('parses well-formed completion', () => {
    const c = `ACTION: service_booking
LANGUAGE: hi-IN
CONFIDENCE: 0.92
RATIONALE: User asks to book a cab in Hindi.`;
    const parsed = parseIntentCompletion(c);
    expect(parsed).not.toBeNull();
    expect(parsed!.actionType).toBe('service_booking');
    expect(parsed!.detectedLanguage).toBe('hi-IN');
    expect(parsed!.confidence).toBeCloseTo(0.92, 2);
    expect(parsed!.rationale).toContain('Hindi');
  });
  it('returns null when no action type can be extracted', () => {
    const c = `I do not understand the question.`;
    expect(parseIntentCompletion(c)).toBeNull();
  });
  it('rejects unknown action type values', () => {
    const c = `ACTION: rocket_launch
LANGUAGE: en-IN
CONFIDENCE: 0.99`;
    expect(parseIntentCompletion(c)).toBeNull();
  });
  it('normalises action token with dashes / spaces', () => {
    const c = `ACTION: Service-Booking
CONFIDENCE: 0.7`;
    expect(parseIntentCompletion(c)?.actionType).toBe('service_booking');
  });
  it('clamps out-of-range confidence', () => {
    const c1 = `ACTION: service_booking
CONFIDENCE: 99`;
    const c2 = `ACTION: service_booking
CONFIDENCE: -0.4`;
    expect(parseIntentCompletion(c1)?.confidence).toBeLessThanOrEqual(1);
    expect(parseIntentCompletion(c2)?.confidence).toBeGreaterThanOrEqual(0);
  });
  it('handles missing rationale + language gracefully', () => {
    const c = `ACTION: mesh_storage
CONFIDENCE: 0.6`;
    const parsed = parseIntentCompletion(c);
    expect(parsed?.actionType).toBe('mesh_storage');
    expect(parsed?.detectedLanguage).toBeNull();
    expect(parsed?.rationale).toBeNull();
  });
  it('null / empty completion → null', () => {
    expect(parseIntentCompletion('')).toBeNull();
    expect(parseIntentCompletion('   ')).toBeNull();
  });
  // SF-5 (adversarial fix) — pin the defensive behavior on
  // markdown-wrapped / multi-word action values so a future regex
  // change doesn't accidentally accept malformed lines.
  it('rejects ACTION value wrapped in backticks', () => {
    expect(parseIntentCompletion('ACTION: `service_booking`\nCONFIDENCE: 0.8')).toBeNull();
  });
  it('rejects ACTION value wrapped in markdown bold', () => {
    expect(parseIntentCompletion('ACTION: **service_booking**\nCONFIDENCE: 0.8')).toBeNull();
  });
  it('rejects ACTION line with no canonical match (case differs after lowercasing)', () => {
    expect(parseIntentCompletion('ACTION: rocket-launch\nCONFIDENCE: 0.7')).toBeNull();
  });
});

describe('actionTypeFriendlyLabel', () => {
  it('returns a non-empty label for every canonical type', () => {
    for (const t of INTENT_ACTION_TYPES) {
      const label = actionTypeFriendlyLabel(t);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// Phase 13.3 — backward-compat regression pin. The optional
// profileFragment parameter MUST NOT change the prompt bytes when
// callers omit it OR pass empty string. Existing intent-parser
// behaviour is protected.
describe('Phase 13.3 — profileFragment backward-compat pin', () => {
  const intent = 'mujhe kal subah ek cook chahiye';
  it('omitted profileFragment === empty profileFragment === undefined', () => {
    const a = buildIntentParsePrompt(intent);
    const b = buildIntentParsePrompt(intent, '');
    const c = buildIntentParsePrompt(intent, undefined);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('non-empty profileFragment is placed ABOVE the role line, exactly once', () => {
    const fragment =
      'Citizen preferences (stay on-device; respect when relevant):\n- Respond in Hindi.\n- Use a terse and brief tone.';
    const out = buildIntentParsePrompt(intent, fragment);
    const fragIdx = out.indexOf(fragment);
    const roleIdx = out.indexOf('You are an intent classifier');
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(fragIdx).toBeLessThan(roleIdx);
    // Substring count = 1.
    expect(out.split(fragment).length - 1).toBe(1);
    // The USER INTENT body must come AFTER the preamble.
    const userIdx = out.indexOf('USER INTENT:');
    expect(fragIdx).toBeLessThan(userIdx);
  });
});
