import { describe, expect, it } from 'vitest';
import {
  CONSUMER_COMPLAINT_DRAFTER,
  CONSUMER_COMPLAINT_DRAFTER_SKILL_ID,
  FORUM_LEVELS,
  RELIEF_KINDS
} from './consumer-complaint-drafter';
import { SKILL_AGENT_PROTOCOL_VERSION } from '../skill-agent';

const FULL_GOOD = [
  'HEADLINE: Refrigerator stopped cooling within warranty; retailer refused 3 service requests.',
  'ASSESSMENT: This is a clear CPA 2019 deficient-service claim with documented proof. Strong filing.',
  'DRAFT_SUBJECT: Deficiency in service and refusal to honour warranty — refrigerator purchase ₹38,000',
  'FORUM_LEVEL: district',
  'RELIEF_KIND: refund',
  'ESTIMATED_PROCESSING_DAYS: 120',
  'KEY_FACT_1: Refrigerator purchased on date X for ₹38,000 (invoice number on file)',
  'KEY_FACT_2: Unit stopped cooling 6 weeks after purchase, well within warranty',
  'KEY_FACT_3: Retailer logged 3 service requests but never inspected the unit',
  'CONFIDENCE: 0.85',
  'RISK_FLAG: attention',
  'ACTIONS: file_complaint_district_commission, escalate_to_consumer_helpline, send_legal_notice'
].join('\n');

describe('CONSUMER_COMPLAINT_DRAFTER definition', () => {
  it('skillId pinned + protocol version pinned', () => {
    expect(CONSUMER_COMPLAINT_DRAFTER.skillId).toBe(CONSUMER_COMPLAINT_DRAFTER_SKILL_ID);
    expect(CONSUMER_COMPLAINT_DRAFTER_SKILL_ID).toBe(
      'bos:skill-agent-fe:consumer-complaint-drafter.v1'
    );
  });

  it('category is consumer_complaint_drafter', () => {
    expect(CONSUMER_COMPLAINT_DRAFTER.category).toBe('consumer_complaint_drafter');
  });

  it('supportedDocKinds = [generic] (no doc-input requirement)', () => {
    expect([...CONSUMER_COMPLAINT_DRAFTER.supportedDocKinds]).toEqual(['generic']);
  });
});

describe('buildPrompt', () => {
  const sample = CONSUMER_COMPLAINT_DRAFTER.sampleInput();

  it('emits a stable prompt for the sample input', () => {
    const a = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    const b = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    expect(a).toBe(b);
  });

  it('contains the Consumer Protection Act 2019 forum-routing rules', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    expect(out).toMatch(/District Commission/);
    expect(out).toMatch(/State Commission/);
    expect(out).toMatch(/National Commission/);
    expect(out).toMatch(/₹50 lakh/);
    expect(out).toMatch(/₹2 crore/);
  });

  it('contains the complaint-specific action vocabulary', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    for (const verb of [
      'file_complaint_district_commission',
      'file_complaint_state_commission',
      'file_complaint_national_commission',
      'escalate_to_consumer_helpline',
      'send_legal_notice'
    ]) {
      expect(out).toContain(verb);
    }
  });

  it('includes the citizen complaint description verbatim', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    expect(out).toContain(sample.complaintText);
  });

  it('injects profile fragment above the role line when non-empty', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample, 'Prefer simple English.');
    const fragIdx = out.indexOf('Prefer simple English.');
    const roleIdx = out.indexOf('You are an on-device consumer-complaint');
    expect(fragIdx).toBeGreaterThan(-1);
    expect(fragIdx).toBeLessThan(roleIdx);
  });

  it('byte-equal prompt when profileFragment is empty string (Phase 13.3 binding)', () => {
    const a = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    const b = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample, '');
    expect(a).toBe(b);
  });

  // Phase 13.4.1 adversarial fix MF-1 — regression pin against the
  // earlier .filter(Boolean) bug that collapsed intentional blank
  // spacers between sections. Both spacers MUST survive.
  it('preserves blank-line spacers between profileFragment + role line, complaint + YOUR ANSWER', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample, 'Prefer simple English.');
    expect(out).toContain('Prefer simple English.\n\nYou are an on-device consumer-complaint');
    expect(out).toMatch(/COMPLAINT DESCRIPTION:[\s\S]+?\n\nYOUR ANSWER:/);
  });

  it('embeds related-doc context when provided', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt({
      ...sample,
      relatedDocTitle: 'Defective refrigerator invoice',
      relatedDocTldr: '₹38,000 paid on 14 Feb 2026; warranty active.'
    });
    expect(out).toContain('RELATED_DOC_TITLE: Defective refrigerator invoice');
    expect(out).toContain('RELATED_DOC_TLDR: ₹38,000 paid on 14 Feb 2026');
  });

  it('omits the related-doc block when both fields are undefined', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.buildPrompt(sample);
    expect(out).not.toContain('RELATED_DOC_TITLE:');
    expect(out).not.toContain('RELATED_DOC_TLDR:');
  });
});

describe('parseCompletion', () => {
  it('parses the happy path', () => {
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(FULL_GOOD);
    expect(out).not.toBeNull();
    expect(out!.protocolVersion).toBe(SKILL_AGENT_PROTOCOL_VERSION);
    expect(out!.skillId).toBe(CONSUMER_COMPLAINT_DRAFTER_SKILL_ID);
    expect(out!.fields.forumLevel).toBe('district');
    expect(out!.fields.reliefKind).toBe('refund');
    expect(out!.fields.estimatedProcessingDays).toBe(120);
    expect(out!.fields.draftSubject).toMatch(/Deficiency in service/);
    expect(out!.fields.keyFacts.length).toBe(3);
    expect(out!.fields.actions).toEqual([
      'file_complaint_district_commission',
      'escalate_to_consumer_helpline',
      'send_legal_notice'
    ]);
  });

  it('returns null when DRAFT_SUBJECT is missing', () => {
    const drifted = FULL_GOOD.replace(/^DRAFT_SUBJECT:.*\n/m, '');
    expect(CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted)).toBeNull();
  });

  it('returns null when no KEY_FACT_N resolves', () => {
    const drifted = FULL_GOOD
      .replace(/^KEY_FACT_1:.*\n/m, '')
      .replace(/^KEY_FACT_2:.*\n/m, '')
      .replace(/^KEY_FACT_3:.*$/m, '');
    expect(CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted)).toBeNull();
  });

  it('coerces unknown FORUM_LEVEL to "district" (safest default)', () => {
    const drifted = FULL_GOOD.replace(/FORUM_LEVEL: district/, 'FORUM_LEVEL: supreme_court');
    expect(CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted)!.fields.forumLevel).toBe('district');
  });

  it('coerces unknown RELIEF_KIND to "mixed"', () => {
    const drifted = FULL_GOOD.replace(/RELIEF_KIND: refund/, 'RELIEF_KIND: gold_bars');
    expect(CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted)!.fields.reliefKind).toBe('mixed');
  });

  it('clamps absurd ESTIMATED_PROCESSING_DAYS', () => {
    const drifted = FULL_GOOD.replace(
      /ESTIMATED_PROCESSING_DAYS: 120/,
      'ESTIMATED_PROCESSING_DAYS: 99999'
    );
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted);
    expect(out!.fields.estimatedProcessingDays).toBeLessThanOrEqual(720);
  });

  it('floors below-minimum ESTIMATED_PROCESSING_DAYS to 30', () => {
    const drifted = FULL_GOOD.replace(
      /ESTIMATED_PROCESSING_DAYS: 120/,
      'ESTIMATED_PROCESSING_DAYS: 5'
    );
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted);
    expect(out!.fields.estimatedProcessingDays).toBe(30);
  });

  it('treats negative ESTIMATED_PROCESSING_DAYS as the minimum', () => {
    const drifted = FULL_GOOD.replace(
      /ESTIMATED_PROCESSING_DAYS: 120/,
      'ESTIMATED_PROCESSING_DAYS: -90'
    );
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted);
    expect(out!.fields.estimatedProcessingDays).toBe(30);
  });

  it('dedupes identical KEY_FACT_N values', () => {
    const drifted = FULL_GOOD
      .replace(/KEY_FACT_2: .+/, 'KEY_FACT_2: Refrigerator purchased on date X for ₹38,000 (invoice number on file)');
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted);
    expect(out!.fields.keyFacts.length).toBe(2);
  });

  it('caps keyFacts to 5 entries even if 6+ provided', () => {
    const drifted = [
      ...FULL_GOOD.split('\n').filter((l) => !l.startsWith('KEY_FACT_')),
      'KEY_FACT_1: Fact A',
      'KEY_FACT_2: Fact B',
      'KEY_FACT_3: Fact C',
      'KEY_FACT_4: Fact D',
      'KEY_FACT_5: Fact E'
    ].join('\n');
    const out = CONSUMER_COMPLAINT_DRAFTER.parseCompletion(drifted);
    expect(out!.fields.keyFacts.length).toBe(5);
  });
});

describe('FORUM_LEVELS / RELIEF_KINDS', () => {
  it('FORUM_LEVELS covers the 3 CPA 2019 tiers', () => {
    expect([...FORUM_LEVELS]).toEqual(['district', 'state', 'national']);
  });

  it('RELIEF_KINDS includes the 6 cardinal relief categories', () => {
    for (const expected of ['refund', 'replacement', 'service_redo', 'compensation', 'apology', 'mixed']) {
      expect(RELIEF_KINDS).toContain(expected);
    }
  });
});
