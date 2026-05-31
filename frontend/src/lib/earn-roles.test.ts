// Phase 11.9 / 12.0 — earn-role catalog invariants.

import { describe, expect, test } from 'vitest';
import { EARN_ROLES, isComingSoonRole } from './earn-roles';

describe('EARN_ROLES catalog', () => {
  test('every role has a unique id', () => {
    const ids = EARN_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('live roles MUST carry a targetPath; coming-soon roles MUST NOT', () => {
    for (const role of EARN_ROLES) {
      if (isComingSoonRole(role)) {
        expect(
          role.targetPath,
          `coming-soon role ${role.id} should not have targetPath`
        ).toBeUndefined();
      } else {
        expect(role.targetPath, `live role ${role.id} needs targetPath`).toBeTruthy();
        expect(role.targetPath!.startsWith('/'), 'targetPath should be absolute').toBe(true);
      }
    }
  });

  test('every role has icon, label, description', () => {
    for (const role of EARN_ROLES) {
      expect(role.icon.length).toBeGreaterThan(0);
      expect(role.label.length).toBeGreaterThan(0);
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  test('catalog includes both a micro-task live role (label-data) and a provider live role (drive-cab)', () => {
    expect(EARN_ROLES.some((r) => r.id === 'label-data' && !isComingSoonRole(r))).toBe(true);
    expect(
      EARN_ROLES.some(
        (r) => r.id === 'drive-cab' && !isComingSoonRole(r) && r.providerRoleKind === 'cab-driver'
      )
    ).toBe(true);
  });

  test('coming-soon roles all target Phase 12.x', () => {
    for (const role of EARN_ROLES.filter(isComingSoonRole)) {
      expect(role.comingSoonPhase, role.id).toMatch(/^12\./);
    }
  });

  test('Phase 12.0 wave-1 provider roles are LIVE — direction memo requires cab-driver, personal-driver, labourers, household-help', () => {
    const wave1 = ['cab-driver', 'personal-driver', 'labourers', 'household-help'];
    for (const kind of wave1) {
      const role = EARN_ROLES.find((r) => r.providerRoleKind === kind);
      expect(role, `wave-1 role ${kind} missing`).toBeTruthy();
      expect(
        isComingSoonRole(role!),
        `wave-1 role ${kind} should be LIVE after Phase 12.0`
      ).toBe(false);
      expect(role!.targetPath).toMatch(/\/earn\/provider-onboarding\?role=/);
    }
  });

  test('Phase 12.3 wave-2 roles (kirana, skilled-trades) remain coming-soon', () => {
    for (const id of ['kirana', 'skilled-trades']) {
      const role = EARN_ROLES.find((r) => r.id === id);
      expect(role).toBeTruthy();
      expect(isComingSoonRole(role!)).toBe(true);
      expect(role!.comingSoonPhase).toBe('12.3');
    }
  });

  test('every LIVE provider role embeds its providerRoleKind for the onboarding flow', () => {
    for (const role of EARN_ROLES) {
      if (role.targetPath?.includes('/earn/provider-onboarding')) {
        expect(role.providerRoleKind, `${role.id} provider link needs providerRoleKind`).toBeTruthy();
        expect(role.targetPath).toContain(`role=${role.providerRoleKind}`);
      }
    }
  });
});
