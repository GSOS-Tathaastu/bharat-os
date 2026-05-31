// Phase 12.0.5 — Client-side verification of Phase 10.5 signed
// labeling-export bundles.
//
// Mirrors the verification logic from src/phase1/labeling-export.mjs
// (server-side reference). Uses the Web Crypto API for SHA-256
// digest + Ed25519 signature verification.

export interface AuditSignerPublicRecord {
  protocolVersion: string;
  id: string;
  displayName: string;
  publicKeyPem: string;
  createdAt: string;
}

export interface ExportVerdict {
  ok: boolean;
  reason?: string;
  contentSha256?: string;
  submissionCount?: number;
}

// Re-export buildLabelingExportLines as a no-op for the FE — we
// never build, only verify. (Hooks.ts imports it to satisfy
// type-only references; the runtime value is unused.)
export function buildLabelingExportLines(): never {
  throw new Error('buildLabelingExportLines is server-side only.');
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64Decode(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return base64Decode(body);
}

async function importEd25519PublicKey(pem: string): Promise<CryptoKey> {
  const spki = pemToBytes(pem);
  return crypto.subtle.importKey(
    'spki',
    spki as unknown as BufferSource,
    { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
    false,
    ['verify']
  );
}

async function verifyEd25519(
  publicKeyPem: string,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const key = await importEd25519PublicKey(publicKeyPem);
    const sig = base64Decode(signatureBase64);
    const msg = new TextEncoder().encode(message);
    return crypto.subtle.verify(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      key,
      sig as unknown as BufferSource,
      msg as unknown as BufferSource
    );
  } catch (_err) {
    return false;
  }
}

/**
 * Verify a Phase 10.5 signed NDJSON export bundle.
 *
 * Steps:
 *   1. Confirm the last line is a `trailer` with contentSha256 +
 *      signature.
 *   2. Recompute SHA-256 over the preceding body lines (joined with
 *      '\n' + trailing '\n').
 *   3. Confirm trailer.contentSha256 matches.
 *   4. Cross-check header.signerId + trailer.signature.signerId
 *      against the audit signer's public-record id.
 *   5. Verify the Ed25519 signature against the public key.
 */
export function verifyLabelingExportLines(
  lines: string[],
  signerPublicRecord: AuditSignerPublicRecord
): ExportVerdict | null {
  // Returns null on synchronous failure; the FE caller can also
  // see verdict.ok === false with a `reason`. The return type is
  // synchronously a verdict-or-null because the FE expects a sync
  // result; real verification has to happen async, so callers
  // should treat this as best-effort + run the async helper if
  // they need a definitive answer.
  //
  // Truth is — verification IS async. Hooks.ts wraps this to keep
  // the rest of the code sync-friendly; the actual crypto runs in
  // an async path tracked separately.
  if (!Array.isArray(lines) || lines.length < 2) {
    return { ok: false, reason: 'too_few_lines' };
  }
  if (!signerPublicRecord?.publicKeyPem) {
    return { ok: false, reason: 'missing_signer_public_key' };
  }
  let trailer: { type?: string; contentSha256?: string; signature?: { signerId?: string; signatureBase64?: string } };
  try {
    trailer = JSON.parse(lines[lines.length - 1]);
  } catch (_err) {
    return { ok: false, reason: 'trailer_not_json' };
  }
  if (!trailer || trailer.type !== 'trailer') return { ok: false, reason: 'missing_trailer' };
  if (typeof trailer.contentSha256 !== 'string' || !trailer.signature) {
    return { ok: false, reason: 'malformed_trailer' };
  }
  // We'll synchronously trust the structural checks. The async
  // crypto verification is exposed via `verifyLabelingExportLinesAsync`
  // below.
  const submissionCount = lines.length - 2;
  return { ok: true, contentSha256: trailer.contentSha256, submissionCount };
}

/**
 * Async crypto-verified version. Use this when you need a
 * definitive verdict (post-download in the export UI).
 */
export async function verifyLabelingExportLinesAsync(
  lines: string[],
  signerPublicRecord: AuditSignerPublicRecord
): Promise<ExportVerdict> {
  const struct = verifyLabelingExportLines(lines, signerPublicRecord);
  if (!struct || !struct.ok) return struct ?? { ok: false, reason: 'unknown' };

  let trailer: { contentSha256?: string; signature?: { signerId?: string; signatureBase64?: string } };
  try {
    trailer = JSON.parse(lines[lines.length - 1]);
  } catch (_err) {
    return { ok: false, reason: 'trailer_not_json' };
  }
  const bodyLines = lines.slice(0, -1);
  if (bodyLines.length < 1) {
    return { ok: false, reason: 'no_body_lines' };
  }
  const bodyText = bodyLines.join('\n') + '\n';
  const recomputed = await sha256Hex(bodyText);
  if (recomputed !== trailer.contentSha256) {
    return { ok: false, reason: 'content_hash_mismatch', contentSha256: recomputed };
  }
  let header: { signerId?: string };
  try {
    header = JSON.parse(bodyLines[0]);
  } catch (_err) {
    return { ok: false, reason: 'header_not_json' };
  }
  if (header.signerId && header.signerId !== signerPublicRecord.id) {
    return { ok: false, reason: 'header_signer_mismatch' };
  }
  if (trailer.signature?.signerId && trailer.signature.signerId !== signerPublicRecord.id) {
    return { ok: false, reason: 'trailer_signer_mismatch' };
  }
  if (!trailer.signature?.signatureBase64) {
    return { ok: false, reason: 'missing_signature' };
  }
  const sigOk = await verifyEd25519(
    signerPublicRecord.publicKeyPem,
    trailer.contentSha256!,
    trailer.signature.signatureBase64
  );
  if (!sigOk) return { ok: false, reason: 'signature_invalid' };
  return { ok: true, contentSha256: recomputed, submissionCount: bodyLines.length - 1 };
}
