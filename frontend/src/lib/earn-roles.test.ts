// Phase 11.9 — earn-role catalog invariants.

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

  test('catalog includes both live (label-data) and coming-soon (drive-cab) roles', () => {
    expect(EARN_ROLES.some((r) => r.id === 'label-data' && !isComingSoonRole(r))).toBe(true);
    expect(EARN_ROLES.some((r) => r.id === 'drive-cab' && isComingSoonRole(r))).toBe(true);
  });

  test('coming-soon roles all target Phase 12.x', () => {
    for (const role of EARN_ROLES.filter(isComingSoonRole)) {
      expect(role.comingSoonPhase, role.id).toMatch(/^12\./);
    }
  });

  test('catalog contains all five provider roles called out in the direction memo', () => {
    const required = ['drive-cab', 'cook', 'kirana', 'home-help', 'skilled-trades'];
    const present = new Set(EARN_ROLES.map((r) => r.id));
    for (const id of required) {
      expect(present.has(id), `provider role ${id} missing`).toBe(true);
    }
  });
});
