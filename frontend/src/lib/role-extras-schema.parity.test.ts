// Phase 12.2.4 fix UX-4 — snapshot the FE schema mirror against
// the BE source-of-truth so a maxLen drift, kind drift, or
// required-attachment-kind drift ships LOUD.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — JS module without .d.ts; imported only to
// snapshot the BE substrate against the FE mirror.
import { PROVIDER_ROLE_EXTRAS } from '../../../src/phase1/provider-role-extras.mjs';
import { ROLE_EXTRAS_SCHEMAS } from './role-extras-schema';

function projectFE(schema: typeof ROLE_EXTRAS_SCHEMAS[string]) {
  return {
    schemaVersion: schema.schemaVersion,
    required: schema.required.map((s) => ({
      id: s.id, kind: s.kind, maxLen: s.maxLen ?? null, min: s.min ?? null, max: s.max ?? null
    })),
    optional: schema.optional.map((s) => ({
      id: s.id, kind: s.kind, maxLen: s.maxLen ?? null, min: s.min ?? null, max: s.max ?? null
    })),
    requiredAttachmentKinds: schema.requiredAttachments.map((a) => a.kind).sort()
  };
}

interface BeFieldSpec {
  id: string;
  kind: string;
  maxLen?: number;
  min?: number;
  max?: number;
}

interface BeSchema {
  schemaVersion: number;
  required: readonly BeFieldSpec[];
  optional: readonly BeFieldSpec[];
  requiredAttachmentKinds: readonly string[];
}

function projectBE(schema: BeSchema) {
  return {
    schemaVersion: schema.schemaVersion,
    required: schema.required.map((s) => ({
      id: s.id, kind: s.kind, maxLen: s.maxLen ?? null, min: s.min ?? null, max: s.max ?? null
    })),
    optional: schema.optional.map((s) => ({
      id: s.id, kind: s.kind, maxLen: s.maxLen ?? null, min: s.min ?? null, max: s.max ?? null
    })),
    requiredAttachmentKinds: [...schema.requiredAttachmentKinds].sort()
  };
}

describe('FE/BE role-extras schema parity', () => {
  const be = PROVIDER_ROLE_EXTRAS as Record<string, BeSchema>;
  const beRoles = Object.keys(be).sort();
  const feRoles = Object.keys(ROLE_EXTRAS_SCHEMAS).sort();

  it('same role set on both sides', () => {
    expect(feRoles).toEqual(beRoles);
  });

  for (const role of beRoles) {
    it(`schema for ${role} matches BE field shape exactly`, () => {
      const feSchema = ROLE_EXTRAS_SCHEMAS[role];
      expect(feSchema).toBeDefined();
      expect(projectFE(feSchema)).toEqual(projectBE(be[role]));
    });
  }
});
