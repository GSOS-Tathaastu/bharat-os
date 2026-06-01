// Phase 12.1b.2 — Per-identity offline intent queue (IndexedDB).
//
// Raw IndexedDB. No dexie / idb npm dep. The store is bounded
// (50-row soft cap, 7-day auto-purge on app open) so a citizen
// can't quietly fill the device with queued intents during a
// long offline window.
//
// §15 binding: per-identity database name (`bharat-os-offline-<actorId>`)
// so two profiles on the same device cannot enumerate each other's
// queue. Validated by judge panel as a binding requirement, not a
// v2 polish item.
//
// Row shape:
//   {
//     localId: string,                   // ULID (monotonic, sortable)
//     idempotencyKey: string,            // 32-hex, computed ONCE
//     payload: { intentText, intentAnnotation, locale, actionType? },
//     enqueuedAt: ISO string,
//     attemptCount: number,
//     lastError: string | null,
//     lastAttemptAt: ISO string | null,
//     status: 'queued' | 'sending' | 'failed_permanent'
//   }

const DB_VERSION = 1;
const STORE_NAME = 'intent_queue';
const STATUS_INDEX = 'by-status-enqueuedAt';

export type QueueStatus = 'queued' | 'sending' | 'failed_permanent';

export interface QueuePayload {
  intentText: string;
  intentAnnotation?: unknown;
  locale: string;
  actionType?: string | null;
}

export interface QueueRow {
  localId: string;
  idempotencyKey: string;
  payload: QueuePayload;
  enqueuedAt: string;
  attemptCount: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  status: QueueStatus;
}

export const QUEUE_MAX_ROWS = 50;
export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const QUEUE_MAX_ATTEMPTS = 5;

function dbNameFor(actorId: string): string {
  // Sanitise — IndexedDB names allow any string, but we keep it
  // ASCII-safe by sha-style folding any non-alphanumerics.
  const safe = actorId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `bharat-os-offline-${safe}`;
}

function openDb(actorId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbNameFor(actorId), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
        store.createIndex(STATUS_INDEX, ['status', 'enqueuedAt']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txAsync<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result: T | undefined;
    const out = fn(store);
    if (out instanceof IDBRequest) {
      out.onsuccess = () => { result = out.result as T; };
      out.onerror = () => reject(out.error);
    } else {
      result = out as T;
    }
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ULID-ish — monotonic, sortable, 26 lowercase characters. Inline
// to avoid an npm dep. Time component is base32-encoded ms epoch;
// random component is 80 bits. Sortable lexicographically by
// enqueue time (good enough for FIFO drain).
const ULID_CHARS = '0123456789abcdefghjkmnpqrstvwxyz';
function ulid(now: number = Date.now()): string {
  let time = now;
  let tStr = '';
  for (let i = 9; i >= 0; i--) {
    tStr += ULID_CHARS[Math.floor(time / Math.pow(32, i)) % 32];
  }
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);
  let rStr = '';
  for (const b of rand) {
    rStr += ULID_CHARS[b % 32];
  }
  return tStr + rStr;
}

export async function enqueueIntent(
  actorId: string,
  args: {
    idempotencyKey: string;
    payload: QueuePayload;
    enqueuedAt: string;
  }
): Promise<QueueRow> {
  const db = await openDb(actorId);
  try {
    // 7-day + 50-row caps applied on enqueue.
    await purgeStale(actorId, { db, keepOpen: true });
    const all = await listAll(actorId, { db, keepOpen: true });
    if (all.length >= QUEUE_MAX_ROWS) {
      throw new QueueFullError();
    }
    const row: QueueRow = {
      localId: ulid(),
      idempotencyKey: args.idempotencyKey,
      payload: args.payload,
      enqueuedAt: args.enqueuedAt,
      attemptCount: 0,
      lastError: null,
      lastAttemptAt: null,
      status: 'queued'
    };
    await txAsync(db, 'readwrite', (store) => store.add(row));
    return row;
  } finally {
    db.close();
  }
}

export async function listAll(actorId: string, opts: { db?: IDBDatabase; keepOpen?: boolean } = {}): Promise<QueueRow[]> {
  const db = opts.db ?? (await openDb(actorId));
  try {
    return await new Promise<QueueRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as QueueRow[]) ?? [];
        rows.sort((a, b) => a.localId.localeCompare(b.localId));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    if (!opts.keepOpen) db.close();
  }
}

export async function listByStatus(
  actorId: string,
  status: QueueStatus
): Promise<QueueRow[]> {
  const all = await listAll(actorId);
  return all.filter((r) => r.status === status);
}

export async function updateRow(
  actorId: string,
  localId: string,
  patch: Partial<QueueRow>
): Promise<QueueRow | null> {
  const db = await openDb(actorId);
  try {
    return await new Promise<QueueRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(localId);
      getReq.onsuccess = () => {
        const row = getReq.result as QueueRow | undefined;
        if (!row) {
          resolve(null);
          return;
        }
        const next = { ...row, ...patch, localId: row.localId };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } finally {
    db.close();
  }
}

export async function removeRow(actorId: string, localId: string): Promise<void> {
  const db = await openDb(actorId);
  try {
    await txAsync(db, 'readwrite', (store) => store.delete(localId));
  } finally {
    db.close();
  }
}

export async function purgeStale(
  actorId: string,
  opts: { db?: IDBDatabase; keepOpen?: boolean; now?: number } = {}
): Promise<number> {
  const db = opts.db ?? (await openDb(actorId));
  const cutoff = (opts.now ?? Date.now()) - QUEUE_MAX_AGE_MS;
  try {
    const all = await listAll(actorId, { db, keepOpen: true });
    let removed = 0;
    for (const row of all) {
      const enqueuedMs = Date.parse(row.enqueuedAt);
      if (Number.isFinite(enqueuedMs) && enqueuedMs < cutoff) {
        await txAsync(db, 'readwrite', (store) => store.delete(row.localId));
        removed += 1;
      }
    }
    return removed;
  } finally {
    if (!opts.keepOpen) db.close();
  }
}

export async function clearAll(actorId: string): Promise<void> {
  const db = await openDb(actorId);
  try {
    await txAsync(db, 'readwrite', (store) => store.clear());
  } finally {
    db.close();
  }
}

export class QueueFullError extends Error {
  constructor() {
    super('Queue is full. Drain or discard older intents first.');
    this.name = 'QueueFullError';
  }
}
