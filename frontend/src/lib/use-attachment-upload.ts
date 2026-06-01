// Phase 12.2.3 — useAttachmentUpload hook.
//
// Wraps POST /api/attachments. The hook accepts a File or Blob,
// converts to base64 client-side, and posts. Returns the
// public attachment meta (attachmentId + sha256 + byteLength).
//
// Per-blob 5 MiB cap matches the BE. The hook pre-checks size
// + MIME so a bad capture surfaces an honest error before the
// network round-trip.

import { useMutation } from '@tanstack/react-query';
import { api } from './api';

export const ATTACHMENT_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
] as const;

export const ATTACHMENT_KINDS = [
  'kyc_l1_selfie',
  'kyc_l1_id_proof',
  'vehicle_registration',
  'driving_licence',
  'police_verification',
  'employer_reference',
  'contractor_attestation',
  'misc'
] as const;

export type AttachmentMime = (typeof ATTACHMENT_MIME_ALLOWLIST)[number];
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_MAX_BYTES_PER_BLOB = 5 * 1024 * 1024;

export interface AttachmentMeta {
  attachmentId: string;
  protocolVersion: string;
  objectType: 'attachment';
  rootIdentityId: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  kind: string;
  createdAt: string;
}

export interface UploadInput {
  actingRootIdentityId: string;
  file: Blob;
  kind: AttachmentKind;
}

function isAllowedMime(s: string): s is AttachmentMime {
  return (ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(s);
}

async function blobToBase64(blob: Blob): Promise<string> {
  // FileReader.readAsDataURL gives "data:<mime>;base64,<payload>".
  // Faster than chunked Array.from(Uint8Array) in browsers.
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('failed to read file'));
    fr.onload = () => {
      const result = fr.result as string;
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    fr.readAsDataURL(blob);
  });
}

export function useAttachmentUpload() {
  return useMutation({
    mutationFn: async ({ actingRootIdentityId, file, kind }: UploadInput) => {
      if (!file) throw new Error('file is required.');
      if (file.size > ATTACHMENT_MAX_BYTES_PER_BLOB) {
        throw new Error(`file exceeds the ${Math.round(ATTACHMENT_MAX_BYTES_PER_BLOB / (1024 * 1024))} MiB cap.`);
      }
      const mimeType = file.type || 'application/octet-stream';
      if (!isAllowedMime(mimeType)) {
        throw new Error(`MIME ${mimeType} not allowed. Use JPEG, PNG, WebP or PDF.`);
      }
      const bytesBase64 = await blobToBase64(file);
      const { attachment } = await api<{ attachment: AttachmentMeta }>(
        '/api/attachments',
        {
          method: 'POST',
          headers: { 'X-Bharat-OS-Acting-Identity': actingRootIdentityId },
          body: JSON.stringify({
            actingRootIdentityId,
            mimeType,
            kind,
            bytesBase64
          })
        }
      );
      return attachment;
    }
  });
}
