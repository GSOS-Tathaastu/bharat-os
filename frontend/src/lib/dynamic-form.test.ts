// Phase 12.1b.3 — Dynamic-form contract + parity tests.
//
// Pure validators must match the phase0 substrate. Parity is
// asserted via a snapshot comparison of the field-kind set + the
// validator-name set. Field-by-field schema parity is checked at
// the role-form level.

import { describe, expect, it } from 'vitest';
import {
  FIELD_KINDS,
  VALIDATORS,
  validateAnswers,
  normaliseFieldValue,
  buildRoleAnswersEnvelope,
  DYNAMIC_FORM_PROTOCOL_VERSION,
  type FormSchema
} from './dynamic-form';
import { PROVIDER_ROLE_FORMS, getProviderRoleForm } from './provider-role-forms';

describe('parity with phase0', () => {
  it('FIELD_KINDS matches v0', () => {
    expect([...FIELD_KINDS].sort()).toEqual(['boolean', 'integer', 'longtext', 'multiselect', 'select', 'text']);
  });
  it('VALIDATORS registry matches v0', () => {
    expect(Object.keys(VALIDATORS).sort()).toEqual([
      'boolean-required-true',
      'int-range',
      'max-length',
      'non-empty',
      'one-of',
      'plate-region'
    ]);
  });
  it('protocol version pinned to bos.phase0.dynamic-form.v0', () => {
    expect(DYNAMIC_FORM_PROTOCOL_VERSION).toBe('bos.phase0.dynamic-form.v0');
  });
  it('PROVIDER_ROLE_FORMS exposes exactly the 4 wave-1 roles', () => {
    expect(Object.keys(PROVIDER_ROLE_FORMS).sort()).toEqual([
      'cab-driver',
      'household-help',
      'labourers',
      'personal-driver'
    ]);
  });
});

describe('plate-region validator', () => {
  it('accepts MH', () => {
    expect(VALIDATORS['plate-region']('MH', { field: { id: 'p', kind: 'text', label: 'p' } })).toBeNull();
  });
  it('rejects lowercase mh', () => {
    expect(VALIDATORS['plate-region']('mh', { field: { id: 'p', kind: 'text', label: 'p' } })).toBe('not_plate_region');
  });
});

describe('validateAnswers gates dependsOn', () => {
  const schema: FormSchema = {
    fields: [
      { id: 'canCook', kind: 'boolean', label: 'cook' },
      { id: 'canCookNonVeg', kind: 'boolean', label: 'non-veg', dependsOn: { fieldId: 'canCook', equals: true } }
    ]
  };
  it('rejects when gate is off + dependent is on', () => {
    const r = validateAnswers(schema, { canCook: false, canCookNonVeg: true });
    expect(r.ok).toBe(false);
    expect(r.errors.canCookNonVeg).toBe('gated_off_must_be_empty');
  });
  it('passes when gate is on + dependent is on', () => {
    const r = validateAnswers(schema, { canCook: true, canCookNonVeg: true });
    expect(r.ok).toBe(true);
    expect(r.normalized).toEqual({ canCook: true, canCookNonVeg: true });
  });
});

describe('normaliseFieldValue', () => {
  it('trims + truncates text', () => {
    expect(normaliseFieldValue({ id: 't', kind: 'text', maxLen: 5, label: 't' }, '  hello world  ')).toBe('hello');
  });
  it('dedupes + caps multiselect', () => {
    expect(
      normaliseFieldValue(
        { id: 'l', kind: 'multiselect', max: 3, label: 'l' },
        ['hi', 'en', 'hi', 'mr', 'ta']
      )
    ).toEqual(['hi', 'en', 'mr']);
  });
});

describe('buildRoleAnswersEnvelope', () => {
  it('wraps values with schemaVersion 1', () => {
    expect(buildRoleAnswersEnvelope({ a: 1 })).toEqual({ schemaVersion: 1, values: { a: 1 } });
  });
});

describe('per-role schema sanity', () => {
  it('cab-driver requires vehicleType', () => {
    const s = getProviderRoleForm('cab-driver')!;
    const required = s.fields.find((f) => f.id === 'vehicleType');
    expect(required?.required).toBe(true);
  });
  it('plate-region field carries the suggest prompt hint', () => {
    const s = getProviderRoleForm('cab-driver')!;
    const f = s.fields.find((fd) => fd.id === 'plateRegion');
    expect(f?.suggest?.promptHint).toMatch(/two-letter/i);
  });
});
