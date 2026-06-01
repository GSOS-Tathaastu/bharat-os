// Phase 12.2.3 — Attachment CORE substrate.
//
// What this module is.
//
//   Pure helpers + constants for binary blob attachments owned
//   by a root identity. Used by KYC L1 (selfie + ID proof), and
//   reused without modification by Phase 12.2.4 per-role extras
//   (vehicle docs, police verification), Phase 12.x dispute
//   evidence, and any future surface that needs a citizen-owned
//   blob.
//
// What it is NOT.
//
//   Storage (sqlite-store.mjs + store.mjs own that). HTTP
//   handling (api.mjs owns that). Camera capture (frontend
//   `<PhotoCapture/>` owns that).
//
// §15 bindings:
//
//   • Pointer-not-payload on the ledger. `attachment.saved` /
//     `attachment.erased` events carry ONLY `{attachmentId,
//     actorId, sha256, byteLength, mimeType}` — NEVER the
//     bytes. The bytes live on the record; an event consumer
//     answers "this blob existed" without reading it.
//
//   • Content-addressed IDs. `attachmentId = 'bos:att:' +
//     sha256(bytes).slice(0,32)`. Two citizens uploading the
//     same JPEG share the same hash (but NOT the same row —
//     the row is keyed by (sha256, rootIdentityId), so each
//     citizen owns their copy and DPDP cascade erases it
//     independently).
//
//   • MIME allowlist. Only image/jpeg + image/png + image/webp
//     + application/pdf. Anything else gets a 415 at the API
//     layer. Operators reviewing KYC can rely on a fixed set of
//     renderers; no SVG/HTML smuggling.
//
//   • Size caps. 5 MiB per blob, 50 MiB aggregate per root
//     identity. The aggregate cap is checked at upload time;
//     the per-blob cap is checked twice (Content-Length pre-
//     check + actual byte count post-decode).

import { sha256Hex } from '../phase0/core.mjs';

export const ATTACHMENT_PROTOCOL_VERSION = 'bos.phase12.attachment.v0';

// §15 — fixed allowlist. New MIME types require a deliberate
// substrate update + an operator-side renderer.
export const ATTACHMENT_MIME_ALLOWLIST = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

// Per-blob hard cap. 5 MiB fits a high-quality 1600px JPEG
// (typical: 200-700 KB) with plenty of margin for IDs photographed
// indoors under low light, and PDF scans of multi-page proofs.
export const ATTACHMENT_MAX_BYTES_PER_BLOB = 5 * 1024 * 1024;

// Per-actor aggregate cap. 50 MiB ≈ 10 blobs at full size. Real
// MVP usage will be 2-4 blobs per citizen (selfie + ID + maybe
// one role-specific doc).
export const ATTACHMENT_MAX_BYTES_PER_ACTOR = 50 * 1024 * 1024;

// Canonical attachment "kinds" — small set the substrate
// enforces to keep the operator review queue legible. Each
// consumer registers its kinds before posting; an unknown kind
// is rejected with 400.
export const ATTACHMENT_KINDS = Object.freeze([
  // KYC L1 wizard.
  'kyc_l1_selfie',
  'kyc_l1_id_proof',
  // Per-role extras (Phase 12.2.4 wave-1).
  'vehicle_registration',
  'driving_licence',
  'police_verification',
  'employer_reference',
  'contractor_attestation',
  // Per-role extras (Phase 12.3 wave-2). kirana shop owners
  // upload shop_license (mandatory) + optional gst_certificate;
  // skilled-trades upload iti_certificate (mandatory) + optional
  // trade_portfolio.
  'shop_license',
  'gst_certificate',
  'iti_certificate',
  'trade_portfolio',
  // Generic — composable into any future surface without a
  // substrate update. Operator review should treat 'misc' as
  // un-typed evidence and prompt the citizen to re-categorise
  // when possible.
  'misc'
]);

export class AttachmentValidationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AttachmentValidationError';
    this.code = code;
    this.status = status;
  }
}

export function isAllowedMime(mimeType) {
  return typeof mimeType === 'string' && ATTACHMENT_MIME_ALLOWLIST.includes(mimeType.toLowerCase());
}

export function isAllowedKind(kind) {
  return typeof kind === 'string' && ATTACHMENT_KINDS.includes(kind);
}

// Derive the substrate-stable attachmentId from the raw bytes.
// Half the sha256 is plenty for global collision-resistance at
// MVP scale (32 hex chars ≈ 128 bits); the BLOB column stores
// the full sha256 too so accidental ID re-use would surface as
// a hash mismatch on read.
export function deriveAttachmentId(sha256) {
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new AttachmentValidationError('sha256_invalid', 'sha256 must be 64 lowercase hex chars.');
  }
  return `bos:att:${sha256.slice(0, 32)}`;
}

// Decode + validate a base64-encoded upload. Returns
// {bytes: Buffer, sha256, byteLength}. Throws
// AttachmentValidationError on any of: malformed base64, byte
// length zero, byte length > ATTACHMENT_MAX_BYTES_PER_BLOB.
export function decodeAttachmentBytes(base64) {
  if (typeof base64 !== 'string' || !base64.trim()) {
    throw new AttachmentValidationError('bytes_required', 'bytesBase64 is required.');
  }
  // Buffer.from is lenient; if the input contains non-base64
  // chars, decoded length differs from naive math. Compare
  // round-trip to catch the trash.
  let bytes;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch (err) {
    throw new AttachmentValidationError('bytes_invalid', 'bytesBase64 is not valid base64.');
  }
  if (bytes.length === 0) {
    throw new AttachmentValidationError('bytes_empty', 'bytesBase64 decoded to zero bytes.');
  }
  if (bytes.length > ATTACHMENT_MAX_BYTES_PER_BLOB) {
    throw new AttachmentValidationError(
      'bytes_too_large',
      `attachment exceeds the ${ATTACHMENT_MAX_BYTES_PER_BLOB}-byte per-blob cap.`,
      413
    );
  }
  // Round-trip check: re-encode and compare length. Catches
  // base64 strings padded with junk that would otherwise decode
  // to a smaller-than-expected blob.
  const roundTrip = bytes.toString('base64');
  if (roundTrip.length > base64.trim().length + 4) {
    throw new AttachmentValidationError('bytes_invalid', 'bytesBase64 is malformed.');
  }
  return {
    bytes,
    sha256: sha256Hex(bytes),
    byteLength: bytes.length
  };
}

// Phase 12.2.3 — MIME types that commonly carry EXIF metadata
// (citizen GPS / camera serial / capture time). The substrate
// does NOT strip EXIF in v1 — that requires a re-encode (canvas
// in browser or `sharp` in node) which is non-trivial without
// the npm dependency. Instead, every JPEG / WebP record carries
// a `mayContainExif: true` flag so the operator console can warn
// reviewers AND a future Phase 12.x EXIF stripper can sweep
// existing rows. PNG / PDF don't carry GPS by default.
export const EXIF_BEARING_MIMES = new Set(['image/jpeg', 'image/webp']);

// Pure constructor for the attachment record. The storage layer
// persists {sha256, rootIdentityId, mimeType, byteLength,
// createdAt, kind, bytes}; the JSON payload echoes everything
// except bytes so the listing endpoint can render thumbnails by
// hitting GET /api/attachments/:id but doesn't need a second
// metadata read.
export function buildAttachmentRecord({
  bytes,
  sha256,
  byteLength,
  rootIdentityId,
  mimeType,
  kind,
  createdAt
}) {
  if (!rootIdentityId || typeof rootIdentityId !== 'string') {
    throw new AttachmentValidationError('root_identity_required', 'rootIdentityId is required.');
  }
  if (!isAllowedMime(mimeType)) {
    throw new AttachmentValidationError(
      'mime_not_allowed',
      `mimeType must be one of: ${ATTACHMENT_MIME_ALLOWLIST.join(', ')}.`,
      415
    );
  }
  if (!isAllowedKind(kind)) {
    throw new AttachmentValidationError(
      'kind_not_allowed',
      `kind must be one of: ${ATTACHMENT_KINDS.join(', ')}.`
    );
  }
  if (!createdAt) {
    throw new AttachmentValidationError('created_at_required', 'createdAt is required.');
  }
  const attachmentId = deriveAttachmentId(sha256);
  const mimeLower = mimeType.toLowerCase();
  return {
    attachmentId,
    protocolVersion: ATTACHMENT_PROTOCOL_VERSION,
    objectType: 'attachment',
    rootIdentityId,
    sha256,
    byteLength,
    mimeType: mimeLower,
    // Phase 12.2.3 fix PII-4 — flag for the operator console
    // so reviewers know the bytes may carry EXIF GPS / camera
    // metadata. v1 does NOT strip EXIF; this is a known
    // §15 minimization gap (substrate doesn't depend on
    // sharp / npm yet). A future Phase 12.x EXIF stripper
    // will flip the flag false after re-encoding.
    mayContainExif: EXIF_BEARING_MIMES.has(mimeLower),
    kind,
    createdAt,
    bytes
  };
}

// Public projection (no bytes) — used by GET /api/attachments
// listing endpoints AND by the operator queue when it shows
// "this provider has 2 KYC attachments" without hauling the
// blob through the wire.
export function publicAttachmentMeta(record) {
  return {
    attachmentId: record.attachmentId,
    protocolVersion: record.protocolVersion,
    objectType: record.objectType,
    rootIdentityId: record.rootIdentityId,
    sha256: record.sha256,
    byteLength: record.byteLength,
    mimeType: record.mimeType,
    mayContainExif: Boolean(record.mayContainExif),
    kind: record.kind,
    createdAt: record.createdAt
  };
}
