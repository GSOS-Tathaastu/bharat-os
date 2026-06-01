import { describe, expect, it } from 'vitest';
import {
  ROLE_EXTRAS_SCHEMAS,
  getRoleExtrasSchema,
  roleRequiresExtras,
  validateRoleExtrasClientSide
} from './role-extras-schema';

describe('role-extras schema', () => {
  it('exports all 4 wave-1 schemas', () => {
    expect(Object.keys(ROLE_EXTRAS_SCHEMAS).sort()).toEqual([
      'cab-driver', 'household-help', 'labourers', 'personal-driver'
    ]);
  });

  it('roleRequiresExtras true for wave-1', () => {
    expect(roleRequiresExtras('cab-driver')).toBe(true);
    expect(roleRequiresExtras('household-help')).toBe(true);
    expect(roleRequiresExtras('kirana')).toBe(false);
    expect(roleRequiresExtras(null)).toBe(false);
  });

  it('each schema has required + attachments', () => {
    for (const role of Object.keys(ROLE_EXTRAS_SCHEMAS)) {
      const s = getRoleExtrasSchema(role)!;
      expect(s.required.length).toBeGreaterThan(0);
      expect(s.requiredAttachments.length).toBeGreaterThan(0);
    }
  });
});

describe('validateRoleExtrasClientSide', () => {
  const labourers = ROLE_EXTRAS_SCHEMAS['labourers'];
  const cab = ROLE_EXTRAS_SCHEMAS['cab-driver'];

  it('happy path labourers', () => {
    const r = validateRoleExtrasClientSide(labourers, {
      contractorName: 'Sardar Singh',
      contractorAttestationNumber: 'A-001'
    });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.fieldErrors)).toEqual([]);
  });

  it('reports missing required field', () => {
    const r = validateRoleExtrasClientSide(labourers, { contractorName: 'X' });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.contractorAttestationNumber).toBe('contractorAttestationNumber_required');
  });

  it('reports ALL failing fields, not just the first (UX-1 fix)', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['household-help'], {
      policeVerificationNumber: '',
      priorEmployerName: '',
      priorEmployerContact: '123'
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.policeVerificationNumber).toBe('policeVerificationNumber_required');
    expect(r.fieldErrors.priorEmployerName).toBe('priorEmployerName_required');
    expect(r.fieldErrors.priorEmployerContact).toBe('priorEmployerContact_phone_invalid');
  });

  it('rejects bad date', () => {
    const r = validateRoleExtrasClientSide(cab, {
      drivingLicenceNumber: 'MH123',
      vehicleRegistrationNumber: 'MH12AB1234',
      commercialPermitNumber: 'CP1',
      insuranceExpiryDate: '31/12/2026'
    });
    expect(r.ok).toBe(false);
    expect(r.firstFieldError?.code).toBe('insuranceExpiryDate_date_invalid');
  });

  it('rejects bad phone', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['household-help'], {
      policeVerificationNumber: 'PCC1',
      priorEmployerName: 'X',
      priorEmployerContact: '123'
    });
    expect(r.ok).toBe(false);
    expect(r.firstFieldError?.code).toBe('priorEmployerContact_phone_invalid');
  });

  it('rejects integer out of range', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['personal-driver'], {
      drivingLicenceNumber: 'X',
      policeVerificationNumber: 'Y',
      priorEmployerName: 'Z',
      yearsAtPriorEmployer: 200
    });
    expect(r.ok).toBe(false);
    expect(r.firstFieldError?.code).toBe('yearsAtPriorEmployer_out_of_range');
  });
});
