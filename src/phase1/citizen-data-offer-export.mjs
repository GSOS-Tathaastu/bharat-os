// Phase 13.5.2 — Signed citizen-data-offer-purchase audit export.
//
// What this is. A canonical, signed NDJSON bundle of every
// purchase a sponsor made against citizen data offers. The
// sponsor's downstream training stack pulls this file, verifies
// the signature against the Bharat OS audit-signer public key,
// and has a tamper-evident record of what they paid for + which
// citizens (rotated identity hashes) the data came from.
//
// What this is NOT. This is NOT the per-data-point delivery
// payload. The data point bytes themselves flow via a separate
// signed-delivery channel (deferred). This bundle is the
// provenance + accounting trail; it lets the sponsor prove
// "we bought N data points of kind X under purpose Y from
// the citizens identified by hash H1..Hn for ₹P each on date D".
//
// Mirrors the Phase 10.5 labeling-export pattern (ADR 0124):
//
//   • Pointer-not-payload — per-purchase line carries purchaseId,
//     offerId, dataPointKind, sponsorPurpose, pricePerSalePaise,
//     purchasedAt + a rotating identityHash; never the publisher's
//     identity, phone, or device.
//   • Cross-sponsor correlation prevented. identityHash =
//     sha256(sponsorId::publisherId) rotates per (sponsor,
//     publisher) — the same citizen on a different sponsor's
//     export hashes to a different value.
//   • Tamper-evident. Trailer line carries SHA-256 of all
//     preceding lines + an Ed25519 signature from the audit
//     signer. Mutating any line breaks verification.
//   • Server-anchored audit. The export endpoint emits a
//     `citizen_data_offer_export.signed` ledger event with the
//     content sha256, so the sponsor can't quietly downgrade a
//     verified bundle and claim it was the original.
//
// Bundle layout (NDJSON):
//
//   {type: 'header', protocolVersion, sponsorId, purchaseCount,
//    exportedAt, signerId}
//   {type: 'purchase', purchaseId, offerId, sponsorId,
//    dataPointKind, sponsorPurpose, pricePerSalePaise,
//    purchasedAt, identityHash}
//   ...
//   {type: 'trailer', contentSha256, signature: {algorithm,
//    signerId, signatureBase64}}

import { sha256Hex, signText, stableStringify, verifySignature } from '../phase0/core.mjs';

export const CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION = 'bos.phase13.citizen-data-offer-export.v0';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Per-(sponsor, publisher) rotating identity hash. Same scheme as
 * Phase 10.5 labeling-export but on the sponsor↔publisher axis
 * instead of job↔worker. Returned with a 'sha256:' prefix for
 * algorithmic agility.
 */
export function identityHashFor(sponsorId, publisherId) {
  return 'sha256:' + sha256Hex(`${String(sponsorId)}::${String(publisherId)}`);
}

/**
 * Body builder. Pure: same inputs → same lines. The caller is
 * responsible for filtering purchases to the sponsor — this
 * function does not re-filter by sponsorId, but does sort by
 * purchasedAt ASC for stable bundle ordering.
 */
export function buildCitizenDataOfferExportLines({
  sponsorId,
  purchases,
  signerIdentity,
  exportedAt = nowIso()
} = {}) {
  if (!sponsorId || typeof sponsorId !== 'string') {
    throw new Error('sponsorId is required.');
  }
  if (!Array.isArray(purchases)) {
    throw new Error('purchases must be an array.');
  }
  if (!signerIdentity || typeof signerIdentity !== 'object') {
    throw new Error('signerIdentity is required.');
  }
  if (!signerIdentity.privateKeyPem) {
    throw new Error('signerIdentity.privateKeyPem is required.');
  }

  // Sort by purchasedAt ASC; secondary by purchaseId so equal
  // timestamps still produce a stable bundle.
  const sorted = [...purchases].sort((a, b) => {
    const t = String(a.purchasedAt).localeCompare(String(b.purchasedAt));
    if (t !== 0) return t;
    return String(a.purchaseId).localeCompare(String(b.purchaseId));
  });

  const headerObj = {
    type: 'header',
    protocolVersion: CITIZEN_DATA_OFFER_EXPORT_PROTOCOL_VERSION,
    sponsorId,
    purchaseCount: sorted.length,
    exportedAt,
    signerId: signerIdentity.id
  };
  const headerLine = stableStringify(headerObj);

  const purchaseLines = sorted.map((p) => {
    const obj = {
      type: 'purchase',
      purchaseId: p.purchaseId,
      offerId: p.offerId,
      sponsorId,
      dataPointKind: p.dataPointKind ?? null,
      sponsorPurpose: p.sponsorPurpose,
      pricePerSalePaise: Number(p.pricePerSalePaise),
      purchasedAt: p.purchasedAt,
      identityHash: identityHashFor(sponsorId, p.publisherId)
    };
    return stableStringify(obj);
  });

  const bodyLines = [headerLine, ...purchaseLines];
  const bodyText = bodyLines.join('\n') + '\n';
  const contentSha256 = sha256Hex(bodyText);
  const signature = signText(signerIdentity, contentSha256);

  const trailerLine = stableStringify({
    type: 'trailer',
    contentSha256,
    signature
  });

  return [...bodyLines, trailerLine];
}

/** Helper used by both the endpoint and tests to flatten lines into
 *  the wire NDJSON body. Final newline included (NDJSON convention). */
export function bundleNdjson(lines) {
  return lines.join('\n') + '\n';
}

/**
 * Verify a previously-emitted bundle. Returns
 * {ok, reason?, contentSha256?, purchaseCount?}.
 *
 * Identical algorithm to verifyLabelingExportLines but checks the
 * citizen-data-offer header type + counts purchase rows in the
 * body.
 */
export function verifyCitizenDataOfferExportLines(lines, signerPublicRecord) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { ok: false, reason: 'too_few_lines' };
  }
  if (!signerPublicRecord || !signerPublicRecord.publicKeyPem) {
    return { ok: false, reason: 'missing_signer_public_key' };
  }

  let trailer;
  try {
    trailer = JSON.parse(lines[lines.length - 1]);
  } catch (_error) {
    return { ok: false, reason: 'trailer_not_json' };
  }
  if (!trailer || trailer.type !== 'trailer') {
    return { ok: false, reason: 'missing_trailer' };
  }
  if (typeof trailer.contentSha256 !== 'string' || !trailer.signature) {
    return { ok: false, reason: 'malformed_trailer' };
  }

  const bodyLines = lines.slice(0, -1);
  const bodyText = bodyLines.join('\n') + '\n';
  const recomputed = sha256Hex(bodyText);
  if (recomputed !== trailer.contentSha256) {
    return { ok: false, reason: 'content_hash_mismatch', contentSha256: recomputed };
  }

  let header;
  try {
    header = JSON.parse(bodyLines[0]);
  } catch (_error) {
    return { ok: false, reason: 'header_not_json' };
  }
  if (!header || header.type !== 'header') {
    return { ok: false, reason: 'missing_header' };
  }
  if (header.signerId && header.signerId !== signerPublicRecord.id) {
    return { ok: false, reason: 'header_signer_mismatch' };
  }
  if (
    trailer.signature.signerId &&
    trailer.signature.signerId !== signerPublicRecord.id
  ) {
    return { ok: false, reason: 'trailer_signer_mismatch' };
  }

  const sigOk = verifySignature(
    signerPublicRecord,
    trailer.contentSha256,
    trailer.signature
  );
  if (!sigOk) {
    return { ok: false, reason: 'signature_invalid' };
  }

  const purchaseCount = bodyLines.length - 1;
  return { ok: true, contentSha256: recomputed, purchaseCount };
}
