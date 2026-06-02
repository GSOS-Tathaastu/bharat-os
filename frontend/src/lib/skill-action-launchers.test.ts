import { describe, expect, it } from 'vitest';
import {
  ACTION_LAUNCHER,
  ACTION_LABEL,
  ALLOWED_LAUNCHER_URL_PREFIXES,
  SKILL_ACTION_VERBS,
  type SkillActionVerb
} from './skill-agent';

describe('ACTION_LAUNCHER completeness', () => {
  it('every SKILL_ACTION_VERB has a launcher entry', () => {
    for (const verb of SKILL_ACTION_VERBS) {
      expect(ACTION_LAUNCHER[verb], `missing launcher for verb ${verb}`).toBeDefined();
    }
  });

  it('every launcher kind is one of the 4 permitted discriminator values', () => {
    const allowed = new Set(['url', 'tel', 'in_app', 'none']);
    for (const verb of SKILL_ACTION_VERBS) {
      expect(allowed.has(ACTION_LAUNCHER[verb].kind)).toBe(true);
    }
  });

  it('every label is non-empty', () => {
    for (const verb of SKILL_ACTION_VERBS) {
      expect(ACTION_LABEL[verb].length).toBeGreaterThan(0);
    }
  });
});

describe('ACTION_LAUNCHER URL allowlist', () => {
  it('every url launcher matches one of ALLOWED_LAUNCHER_URL_PREFIXES', () => {
    for (const verb of SKILL_ACTION_VERBS) {
      const launcher = ACTION_LAUNCHER[verb];
      if (launcher.kind !== 'url') continue;
      const matchesPrefix = ALLOWED_LAUNCHER_URL_PREFIXES.some((prefix) =>
        launcher.href.startsWith(prefix)
      );
      expect(matchesPrefix, `URL ${launcher.href} for ${verb} not in allowlist`).toBe(true);
    }
  });

  it('verifyPrefix matches the href prefix exactly', () => {
    for (const verb of SKILL_ACTION_VERBS) {
      const launcher = ACTION_LAUNCHER[verb];
      if (launcher.kind !== 'url') continue;
      expect(launcher.href.startsWith(launcher.verifyPrefix)).toBe(true);
    }
  });

  it('ALLOWED_LAUNCHER_URL_PREFIXES is frozen', () => {
    expect(Object.isFrozen(ALLOWED_LAUNCHER_URL_PREFIXES)).toBe(true);
  });

  it('every allowlisted prefix is HTTPS (no plain HTTP)', () => {
    for (const prefix of ALLOWED_LAUNCHER_URL_PREFIXES) {
      expect(prefix.startsWith('https://')).toBe(true);
    }
  });

  it('every allowlisted prefix targets a .gov.in or .nic.in domain', () => {
    for (const prefix of ALLOWED_LAUNCHER_URL_PREFIXES) {
      const url = new URL(prefix);
      expect(url.hostname.endsWith('.gov.in') || url.hostname.endsWith('.nic.in')).toBe(true);
    }
  });
});

describe('ACTION_LAUNCHER specific verb assertions', () => {
  it('file_dispute_consumer_forum → consumerhelpline.gov.in', () => {
    expect(ACTION_LAUNCHER.file_dispute_consumer_forum.kind).toBe('url');
    if (ACTION_LAUNCHER.file_dispute_consumer_forum.kind === 'url') {
      expect(ACTION_LAUNCHER.file_dispute_consumer_forum.href).toMatch(/consumerhelpline\.gov\.in/);
    }
  });

  it('all three commission filings → edaakhil.nic.in', () => {
    for (const verb of [
      'file_complaint_district_commission',
      'file_complaint_state_commission',
      'file_complaint_national_commission'
    ] as const) {
      const launcher = ACTION_LAUNCHER[verb];
      expect(launcher.kind).toBe('url');
      if (launcher.kind === 'url') {
        expect(launcher.href).toMatch(/edaakhil\.nic\.in/);
      }
    }
  });

  it('escalate_to_consumer_helpline → tel:1915', () => {
    expect(ACTION_LAUNCHER.escalate_to_consumer_helpline.kind).toBe('tel');
    if (ACTION_LAUNCHER.escalate_to_consumer_helpline.kind === 'tel') {
      expect(ACTION_LAUNCHER.escalate_to_consumer_helpline.number).toBe('1915');
    }
  });

  it('contact_pm_kisan_helpline → tel:155261', () => {
    expect(ACTION_LAUNCHER.contact_pm_kisan_helpline.kind).toBe('tel');
    if (ACTION_LAUNCHER.contact_pm_kisan_helpline.kind === 'tel') {
      expect(ACTION_LAUNCHER.contact_pm_kisan_helpline.number).toBe('155261');
    }
  });

  it('complete_pm_kisan_ekyc → pmkisan.gov.in', () => {
    expect(ACTION_LAUNCHER.complete_pm_kisan_ekyc.kind).toBe('url');
    if (ACTION_LAUNCHER.complete_pm_kisan_ekyc.kind === 'url') {
      expect(ACTION_LAUNCHER.complete_pm_kisan_ekyc.href).toMatch(/pmkisan\.gov\.in/);
    }
  });

  it('visit_csc_for_correction → findmycsc.nic.in', () => {
    expect(ACTION_LAUNCHER.visit_csc_for_correction.kind).toBe('url');
    if (ACTION_LAUNCHER.visit_csc_for_correction.kind === 'url') {
      expect(ACTION_LAUNCHER.visit_csc_for_correction.href).toMatch(/findmycsc\.nic\.in/);
    }
  });

  it('archive_for_records → in_app /citizen/notes', () => {
    expect(ACTION_LAUNCHER.archive_for_records.kind).toBe('in_app');
    if (ACTION_LAUNCHER.archive_for_records.kind === 'in_app') {
      expect(ACTION_LAUNCHER.archive_for_records.route).toBe('/citizen/notes');
    }
  });

  it('informational-only verbs land on kind=none', () => {
    const informationalOnly: SkillActionVerb[] = [
      'request_meter_recheck',
      'switch_tariff_plan',
      'pay_via_upi',
      'check_subsidy_eligibility',
      'compare_with_neighbours',
      'send_legal_notice',
      'check_aadhaar_bank_seeding',
      'verify_land_records',
      // SF-1 — flag_for_review is informational until the Sahayak
      // (Phase 14.x) flagging surface ships.
      'flag_for_review'
    ];
    for (const verb of informationalOnly) {
      expect(ACTION_LAUNCHER[verb].kind).toBe('none');
    }
  });
});
