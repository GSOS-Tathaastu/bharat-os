import { describe, expect, it } from 'vitest';
import {
  ROLE_EXTRAS_SCHEMAS,
  getRoleExtrasSchema,
  roleRequiresExtras,
  validateRoleExtrasClientSide
} from './role-extras-schema';

describe('role-extras schema', () => {
  it('exports wave-1 + wave-2 schemas (6 total)', () => {
    expect(Object.keys(ROLE_EXTRAS_SCHEMAS).sort()).toEqual([
      'cab-driver', 'household-help', 'kirana', 'labourers', 'personal-driver', 'skilled-trades'
    ]);
  });

  it('roleRequiresExtras true for wave-1 + wave-2', () => {
    expect(roleRequiresExtras('cab-driver')).toBe(true);
    expect(roleRequiresExtras('household-help')).toBe(true);
    expect(roleRequiresExtras('kirana')).toBe(true);
    expect(roleRequiresExtras('skilled-trades')).toBe(true);
    expect(roleRequiresExtras('made-up-role')).toBe(false);
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

  // Phase 12.3 adversarial fix — GSTIN + FSSAI shape regex.
  it('rejects malformed GSTIN on kirana (Phase 12.3 fix)', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['kirana'], {
      shopName: 'Sharma Provision Store',
      shopLicenseNumber: 'SHOP-001',
      gstinNumber: 'notarealgstin12'
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.gstinNumber).toBe('gstinNumber_pattern_invalid');
  });

  it('accepts a valid GSTIN (case-tolerant, normalised to upper)', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['kirana'], {
      shopName: 'Sharma Provision Store',
      shopLicenseNumber: 'SHOP-001',
      gstinNumber: '27aapfu0939f1zv'
    });
    expect(r.ok).toBe(true);
  });

  it('rejects malformed FSSAI (must be 14 digits)', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['kirana'], {
      shopName: 'Sharma Provision Store',
      shopLicenseNumber: 'SHOP-001',
      fssaiLicenseNumber: '12345'
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors.fssaiLicenseNumber).toBe('fssaiLicenseNumber_pattern_invalid');
  });

  it('accepts valid 14-digit FSSAI', () => {
    const r = validateRoleExtrasClientSide(ROLE_EXTRAS_SCHEMAS['kirana'], {
      shopName: 'Sharma Provision Store',
      shopLicenseNumber: 'SHOP-001',
      fssaiLicenseNumber: '12345678901234'
    });
    expect(r.ok).toBe(true);
  });
});
