import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_MIME_ALLOWLIST,
  ATTACHMENT_MAX_BYTES_PER_BLOB
} from './use-attachment-upload';

describe('attachment substrate constants (FE)', () => {
  it('mime allowlist matches the BE list verbatim', () => {
    expect(ATTACHMENT_MIME_ALLOWLIST).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]);
  });
  it('kinds include KYC L1 + per-role wave-1', () => {
    expect(ATTACHMENT_KINDS).toContain('kyc_l1_selfie');
    expect(ATTACHMENT_KINDS).toContain('kyc_l1_id_proof');
    expect(ATTACHMENT_KINDS).toContain('vehicle_registration');
    expect(ATTACHMENT_KINDS).toContain('police_verification');
  });
  it('per-blob cap is 5 MiB', () => {
    expect(ATTACHMENT_MAX_BYTES_PER_BLOB).toBe(5 * 1024 * 1024);
  });
});
