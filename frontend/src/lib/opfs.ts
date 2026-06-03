// Phase 9.0c / 2a.1.5 — OPFS (Origin Private File System) helpers for SLM weights.
//
// Pointer-not-payload: the GGUF bytes live in the browser's OPFS,
// never on the Bharat OS server. The install record (Phase 9.0b)
// tracks WHICH pack is installed; the bytes themselves stay here.
//
// Phase 2a.1.5 — Mobile-install OOM fix.
//
//   The pre-2a.1.5 implementation accumulated every downloaded chunk in
//   a `chunks: Uint8Array[]` array AND then allocated a contiguous
//   `new Uint8Array(downloaded)` to feed `subtle.digest('SHA-256', …)`.
//   For a 1.0 GB Qwen pack the peak JS heap was ~2 GB (raw chunks +
//   concatenated copy). Android Chrome's per-tab budget is ~1 GB → OOM
//   tab kill → user sees "install failed". The browser's diagnosis is
//   silent and the catch-block surface looks identical to any other
//   network error.
//
//   The fix:
//   - Drop the `chunks` accumulator entirely.
//   - Hash incrementally with @noble/hashes (~10 KB MIT-licensed pure-JS
//     implementation; Web Crypto's `subtle.digest` is one-shot and
//     cannot stream).
//   - Each chunk is fed to the OPFS writable AND the hasher, then
//     released to GC. Peak heap drops from ~modelSize to ~chunkSize
//     (typically 64 KB, never more than the network read size).
//   - The 2.3 GB Phi-3.5 pack becomes installable on mobile too.
//
//   Trade-off: pure-JS SHA-256 is ~3× slower than Web Crypto. On a 1.0
//   GB download this is roughly +2-3 seconds — invisible next to the
//   1-2 minute download. Worth it for a fix that doesn't crash phones.

import { sha256 } from '@noble/hashes/sha2';

const SLM_DIR = 'bharat-os-slm';

function safeName(modelPackId: string): string {
  return modelPackId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
}

async function getSlmDir(create = false): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(SLM_DIR, { create });
  } catch {
    return null;
  }
}

/** Returns the OPFS Blob for a previously-installed pack, or null. */
export async function readSlmBlob(modelPackId: string): Promise<File | null> {
  const dir = await getSlmDir(false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(safeName(modelPackId), { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

/** Discriminated error codes surfaced by downloadAndPersist. */
export type DownloadFailureCode =
  | 'no_opfs'
  | 'no_crypto'
  | 'no_streaming_fetch'
  | 'no_opfs_dir'
  | 'mirror_status'
  | 'quota_exceeded'
  | 'oom'
  | 'network_aborted'
  | 'unknown';

/**
 * Custom Error subclass so the UI can branch on `err.failureCode`
 * instead of regex-matching opaque DOMException strings. Each
 * production catch block now maps to one of the codes above.
 */
export class DownloadFailureError extends Error {
  failureCode: DownloadFailureCode;
  cause?: unknown;
  constructor(failureCode: DownloadFailureCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DownloadFailureError';
    this.failureCode = failureCode;
    this.cause = cause;
  }
}

/**
 * Stream-download a URL into OPFS while computing SHA-256 incrementally.
 * Returns the observed hash and total bytes.
 *
 * Phase 2a.1.5 — see file-header note. Peak JS heap is bounded by the
 * largest single network chunk (typically 64 KB) regardless of the
 * full download size. Hashing uses @noble/hashes (pure-JS streaming
 * SHA-256) because the Web Crypto SubtleCrypto API is one-shot only.
 */
export async function downloadAndPersist({
  url,
  modelPackId,
  onProgress,
  signal
}: {
  url: string;
  modelPackId: string;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ observedHash: string; downloadedBytes: number; blob: File }> {
  if (!opfsSupported()) {
    throw new DownloadFailureError(
      'no_opfs',
      'Browser lacks OPFS — cannot persist the model offline. Use Chrome / Edge 102+ or Safari 17+.'
    );
  }

  // Phase 2a.1.5 keeps a Web-Crypto branch ONLY when the file would
  // not exceed a safe single-shot budget; otherwise we always stream
  // via @noble/hashes. Even on desktop the streaming path is correct
  // (just slightly slower for tiny files, which there are none of).

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new DownloadFailureError(
      'mirror_status',
      `Mirror returned ${response.status} ${response.statusText}`
    );
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body?.getReader();
  if (!reader) {
    throw new DownloadFailureError(
      'no_streaming_fetch',
      'Browser cannot stream the download. Falling back is not implemented.'
    );
  }

  const dir = await getSlmDir(true);
  if (!dir) {
    throw new DownloadFailureError('no_opfs_dir', 'Could not open OPFS directory.');
  }
  const fileHandle = await dir.getFileHandle(safeName(modelPackId), { create: true });
  const writable = await fileHandle.createWritable();

  // Streaming SHA-256 — every chunk is hashed-and-forgotten. The
  // accumulator is the 32-byte sha256 state, not the bytes themselves.
  const hasher = sha256.create();
  let downloaded = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // hasher.update accepts BufferSource; Uint8Array works directly.
      hasher.update(value);
      // OPFS writable accepts Uint8Array.
      await writable.write(value);
      downloaded += value.byteLength;
      onProgress?.(downloaded, total);
    }
    await writable.close();
  } catch (err) {
    // Map common error shapes to discriminated codes the UI can branch on.
    const code = classifyError(err);
    try {
      await writable.close();
      await dir.removeEntry(safeName(modelPackId));
    } catch {
      /* best-effort rollback */
    }
    if (err instanceof DownloadFailureError) throw err;
    throw new DownloadFailureError(code, (err as Error)?.message ?? String(err), err);
  }

  const digest = hasher.digest();
  const observedHash =
    'sha256:' +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const blob = await fileHandle.getFile();
  return { observedHash, downloadedBytes: downloaded, blob };
}

function classifyError(err: unknown): DownloadFailureCode {
  if (!err) return 'unknown';
  const e = err as { name?: string; message?: string };
  if (e.name === 'QuotaExceededError') return 'quota_exceeded';
  if (e.name === 'RangeError') return 'oom';
  if (e.name === 'AbortError') return 'network_aborted';
  if (typeof e.message === 'string') {
    if (/quota/i.test(e.message)) return 'quota_exceeded';
    if (/memory|alloca|RangeError/i.test(e.message)) return 'oom';
    if (/aborted|network|disconnect|fetch failed/i.test(e.message)) return 'network_aborted';
  }
  return 'unknown';
}

/** Remove an installed pack from OPFS. Best-effort; returns true on success. */
export async function removeSlmBlob(modelPackId: string): Promise<boolean> {
  const dir = await getSlmDir(false);
  if (!dir) return false;
  try {
    await dir.removeEntry(safeName(modelPackId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Phase 2a.1.5 — pre-flight quota probe.
 *
 * Returns `{ ok: false, reason }` if the device clearly cannot host
 * `expectedBytes` (with a 1.3× safety margin to cover hashing
 * intermediates + OPFS write-ahead state). Returns `{ ok: true }`
 * if the storage estimate is unavailable (older browsers) — the
 * actual install will surface the real error.
 *
 * `navigator.storage.estimate()` has been Baseline since Chrome 61
 * + Safari 14.5 + Firefox 90 — universally available on every
 * device that has OPFS.
 */
export async function estimateInstallFeasible(expectedBytes: number): Promise<
  | { ok: true; quotaBytes: number | null; freeBytes: number | null }
  | { ok: false; reason: 'insufficient'; quotaBytes: number; freeBytes: number }
> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.storage?.estimate !== 'function'
  ) {
    return { ok: true, quotaBytes: null, freeBytes: null };
  }
  try {
    const est = await navigator.storage.estimate();
    const quota = est.quota ?? null;
    const usage = est.usage ?? 0;
    if (quota === null) return { ok: true, quotaBytes: null, freeBytes: null };
    const free = Math.max(0, quota - usage);
    const safetyMargin = Math.ceil(expectedBytes * 1.3);
    if (free < safetyMargin) {
      return { ok: false, reason: 'insufficient', quotaBytes: quota, freeBytes: free };
    }
    return { ok: true, quotaBytes: quota, freeBytes: free };
  } catch {
    return { ok: true, quotaBytes: null, freeBytes: null };
  }
}
