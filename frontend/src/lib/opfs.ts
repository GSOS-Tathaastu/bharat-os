// Phase 9.0c — OPFS (Origin Private File System) helpers for SLM weights.
//
// Pointer-not-payload: the GGUF bytes live in the browser's OPFS,
// never on the Bharat OS server. The install record (Phase 9.0b)
// tracks WHICH pack is installed; the bytes themselves stay here.

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

/**
 * Stream-download a URL into OPFS while computing SHA-256 incrementally.
 * Returns the observed hash and total bytes. Aborts gracefully if the
 * client lacks SubtleCrypto, OPFS, or streaming-fetch support.
 */
export async function downloadAndPersist({
  url,
  modelPackId,
  onProgress
}: {
  url: string;
  modelPackId: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<{ observedHash: string; downloadedBytes: number; blob: File }> {
  if (!opfsSupported()) {
    throw new Error('Browser lacks OPFS support — cannot persist the model offline.');
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Browser lacks SubtleCrypto — cannot verify SHA-256.');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mirror returned ${response.status} ${response.statusText}`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Browser cannot stream the download.');

  const dir = await getSlmDir(true);
  if (!dir) throw new Error('Could not open OPFS directory.');
  const fileHandle = await dir.getFileHandle(safeName(modelPackId), { create: true });
  const writable = await fileHandle.createWritable();

  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.byteLength;
      await writable.write(value);
      onProgress?.(downloaded, total);
    }
    await writable.close();
  } catch (err) {
    try {
      await writable.close();
      await dir.removeEntry(safeName(modelPackId));
    } catch {
      /* best-effort */
    }
    throw err;
  }

  // SHA-256 over the concatenated bytes.
  const concatenated = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    concatenated.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', concatenated);
  const observedHash =
    'sha256:' +
    Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const blob = await fileHandle.getFile();
  return { observedHash, downloadedBytes: downloaded, blob };
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
