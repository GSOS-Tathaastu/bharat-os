// Phase 9.0b — Per-identity Tier-4 SLM install records.
//
// Pointer-not-payload: the server tracks installed status + download
// metadata only. The actual model bytes live in client-side
// IndexedDB/OPFS (Origin Private File System). When the identity is
// erased (DPDP §12(3)), both the server record AND the client-side
// blob are removed — the latter via Phase 4.0's identity-scoped wipe.
//
// State machine (terminal-at-creation):
//   installed → removed  (user uninstall, hard-delete the record)
//   failed    →          (terminal; download or SHA verify failed,
//                          retained so the user sees "last install
//                          attempt failed" until they retry)
//
// A new POST creates a record with status `installed` (when the
// client's SHA-256 verify succeeded against the registry's
// `sourceHash`) or `failed` (when the verify mismatched). DELETE
// hard-removes the record + emits an `installed_slm.removed` ledger
// event. No mid-flight `pending` / `verifying` state needs to leave
// the client — the server only learns about terminal outcomes.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const INSTALLED_SLM_PROTOCOL_VERSION = 'bos.phase9.installed-slm.v0';

export const INSTALLED_SLM_STATUSES = ['installed', 'failed'];

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label, max = 200) {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return trimmed;
}

function assertNonNegativeInteger(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

export function createInstalledSlmRecord({
  identityId,
  modelPackId,
  runtimeBackend,
  downloadedBytes,
  status = 'installed',
  failureReason = null,
  installedAt = nowIso(),
  storageLocation = 'opfs',
  expectedHash = null,
  observedHash = null
}) {
  const identity = assertNonEmptyString(identityId, 'identityId', 160);
  const packId = assertNonEmptyString(modelPackId, 'modelPackId', 160);
  const runtime = assertNonEmptyString(runtimeBackend, 'runtimeBackend', 64);
  const bytes = assertNonNegativeInteger(downloadedBytes, 'downloadedBytes');
  if (!INSTALLED_SLM_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${INSTALLED_SLM_STATUSES.join(', ')}.`);
  }
  if (status === 'failed' && !failureReason) {
    throw new Error('failureReason is required when status is "failed".');
  }
  const storage = assertNonEmptyString(storageLocation, 'storageLocation', 32);
  const failureTrim = failureReason == null ? null : String(failureReason).slice(0, 400);
  const expectedTrim = expectedHash == null ? null : assertNonEmptyString(expectedHash, 'expectedHash', 128);
  const observedTrim = observedHash == null ? null : assertNonEmptyString(observedHash, 'observedHash', 128);

  // When status is installed but the client passed both hashes, the
  // server defends the invariant: they must match. (The client
  // already verified before POSTing — this is belt-and-suspenders so
  // a buggy client can't silently misreport.)
  if (status === 'installed' && expectedTrim && observedTrim && expectedTrim !== observedTrim) {
    throw new Error('expectedHash and observedHash mismatch — refusing to record as installed.');
  }

  const core = {
    protocolVersion: INSTALLED_SLM_PROTOCOL_VERSION,
    objectType: 'installed-slm',
    identityId: identity,
    modelPackId: packId,
    runtimeBackend: runtime,
    downloadedBytes: bytes,
    status,
    failureReason: failureTrim,
    expectedHash: expectedTrim,
    observedHash: observedTrim,
    storageLocation: storage,
    installedAt
  };

  return {
    installId: idFrom('bos:installed-slm', { ...core, t: installedAt }),
    ...core
  };
}
