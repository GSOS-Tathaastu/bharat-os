// Phase 6.0 — earnings tracker: module + store + end-to-end API tests.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  aggregateByMonth,
  createEarningsEntry,
  EARNINGS_CATEGORIES,
  EARNINGS_LOG_PROTOCOL_VERSION,
  effectiveHourlyRatePaise,
  monthlyStatement
} from '../../src/phase1/earnings-log.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';
import { collectUserData } from '../../src/phase1/dpdp-rights.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'earnings-tests');

const TODAY = new Date().toISOString().slice(0, 10);

// ─── createEarningsEntry unit ─────────────────────────────────────────

test('createEarningsEntry returns a valid versioned record', () => {
  const entry = createEarningsEntry({
    identityId: 'bos:person:abc',
    date: '2026-05-20',
    category: 'delivery',
    amountPaise: 46000, // Rs 460
    hoursWorked: 4.5,
    note: 'Swiggy lunch shift'
  });
  assert.equal(entry.protocolVersion, EARNINGS_LOG_PROTOCOL_VERSION);
  assert.equal(entry.objectType, 'earnings-entry');
  assert.equal(entry.identityId, 'bos:person:abc');
  assert.equal(entry.date, '2026-05-20');
  assert.equal(entry.category, 'delivery');
  assert.equal(entry.amountPaise, 46000);
  assert.equal(entry.hoursWorked, 4.5);
  assert.equal(entry.note, 'Swiggy lunch shift');
  assert.equal(entry.source, 'self');
  assert.match(entry.entryId, /^bos:earnings:[0-9a-f]{32}$/);
});

test('createEarningsEntry rejects missing identityId', () => {
  assert.throws(
    () => createEarningsEntry({ date: '2026-05-20', category: 'cash', amountPaise: 100 }),
    /identityId is required/
  );
});

test('createEarningsEntry rejects invalid dates', () => {
  const args = { identityId: 'x', category: 'cash', amountPaise: 100 };
  assert.throws(() => createEarningsEntry({ ...args, date: '2026-13-01' }), /valid YYYY-MM-DD/);
  assert.throws(() => createEarningsEntry({ ...args, date: '2026-02-30' }), /valid YYYY-MM-DD/);
  assert.throws(() => createEarningsEntry({ ...args, date: 'yesterday' }), /valid YYYY-MM-DD/);
  assert.throws(() => createEarningsEntry({ ...args, date: null }), /valid YYYY-MM-DD/);
});

test('createEarningsEntry rejects future dates', () => {
  const future = '2099-01-01';
  assert.throws(
    () =>
      createEarningsEntry({
        identityId: 'x',
        date: future,
        category: 'cash',
        amountPaise: 100
      }),
    /cannot be in the future/
  );
});

test('createEarningsEntry rejects unknown categories', () => {
  assert.throws(
    () =>
      createEarningsEntry({
        identityId: 'x',
        date: '2026-05-20',
        category: 'corporate-tax-evasion',
        amountPaise: 100
      }),
    /category must be one of/
  );
});

test('createEarningsEntry rejects non-integer amounts (no float paise)', () => {
  assert.throws(
    () =>
      createEarningsEntry({
        identityId: 'x',
        date: '2026-05-20',
        category: 'cash',
        amountPaise: 99.5
      }),
    /non-negative integer/
  );
});

test('createEarningsEntry rejects negative amounts', () => {
  assert.throws(
    () =>
      createEarningsEntry({
        identityId: 'x',
        date: '2026-05-20',
        category: 'cash',
        amountPaise: -1
      }),
    /non-negative integer/
  );
});

test('createEarningsEntry rejects per-day amounts > 1 crore (sanity ceiling)', () => {
  assert.throws(
    () =>
      createEarningsEntry({
        identityId: 'x',
        date: '2026-05-20',
        category: 'cash',
        amountPaise: 1_00_00_00_00_00 + 1
      }),
    /sanity ceiling/
  );
});

test('createEarningsEntry rejects hoursWorked out of range', () => {
  const args = { identityId: 'x', date: '2026-05-20', category: 'cash', amountPaise: 100 };
  assert.throws(() => createEarningsEntry({ ...args, hoursWorked: -1 }), /between 0 and 24/);
  assert.throws(() => createEarningsEntry({ ...args, hoursWorked: 25 }), /between 0 and 24/);
  assert.throws(() => createEarningsEntry({ ...args, hoursWorked: 'eight' }), /between 0 and 24/);
});

test('createEarningsEntry trims and limits note length', () => {
  const longNote = 'x'.repeat(500);
  const entry = createEarningsEntry({
    identityId: 'x',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100,
    note: `  ${longNote}  `
  });
  assert.equal(entry.note.length, 200);
});

test('createEarningsEntry treats empty/null note as null', () => {
  const a = createEarningsEntry({
    identityId: 'x',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100,
    note: '   '
  });
  assert.equal(a.note, null);
  const b = createEarningsEntry({
    identityId: 'x',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100
  });
  assert.equal(b.note, null);
});

test('entryId is deterministic for same canonical fields', () => {
  const a = createEarningsEntry({
    identityId: 'x',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100,
    createdAt: '2026-05-20T10:00:00Z'
  });
  const b = createEarningsEntry({
    identityId: 'x',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100,
    createdAt: '2026-05-20T10:00:00Z'
  });
  assert.equal(a.entryId, b.entryId);
});

// ─── aggregateByMonth ─────────────────────────────────────────────────

test('aggregateByMonth sums totals + per-category + hours + day count', () => {
  const entries = [
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-01',
      category: 'delivery',
      amountPaise: 30000,
      hoursWorked: 3
    }),
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-01',
      category: 'cash',
      amountPaise: 5000,
      hoursWorked: 1
    }),
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-02',
      category: 'ride',
      amountPaise: 25000,
      hoursWorked: 2
    }),
    // Out of month — should be excluded.
    createEarningsEntry({
      identityId: 'x',
      date: '2026-04-01',
      category: 'delivery',
      amountPaise: 100000
    })
  ];
  const summary = aggregateByMonth(entries, '2026-05');
  assert.equal(summary.objectType, 'earnings-monthly-summary');
  assert.equal(summary.month, '2026-05');
  assert.equal(summary.totalPaise, 60000);
  assert.equal(summary.byCategory.delivery, 30000);
  assert.equal(summary.byCategory.cash, 5000);
  assert.equal(summary.byCategory.ride, 25000);
  assert.equal(summary.byCategory.service, 0);
  assert.equal(summary.byCategory.other, 0);
  assert.equal(summary.hoursTotal, 6);
  assert.equal(summary.dayCount, 2);
  assert.equal(summary.entryCount, 3);
  assert.equal(summary.effectiveHourlyRatePaise, 10000); // 60000 / 6
});

test('aggregateByMonth returns null hourly rate when no hours logged', () => {
  const entries = [
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-01',
      category: 'cash',
      amountPaise: 30000
    })
  ];
  const summary = aggregateByMonth(entries, '2026-05');
  assert.equal(summary.hoursTotal, null);
  assert.equal(summary.effectiveHourlyRatePaise, null);
});

test('aggregateByMonth handles empty input', () => {
  const summary = aggregateByMonth([], '2026-05');
  assert.equal(summary.totalPaise, 0);
  assert.equal(summary.entryCount, 0);
  assert.equal(summary.dayCount, 0);
});

test('aggregateByMonth rejects bad month strings', () => {
  assert.throws(() => aggregateByMonth([], '2026'), /YYYY-MM/);
  assert.throws(() => aggregateByMonth([], '2026-13'), /YYYY-MM/);
  assert.throws(() => aggregateByMonth([], 'May 2026'), /YYYY-MM/);
});

test('monthlyStatement renders a human-readable summary', () => {
  const summary = aggregateByMonth(
    [
      createEarningsEntry({
        identityId: 'x',
        date: '2026-05-01',
        category: 'delivery',
        amountPaise: 30000,
        hoursWorked: 3
      })
    ],
    '2026-05'
  );
  const text = monthlyStatement(summary);
  assert.match(text, /Bharat OS earnings statement — 2026-05/);
  assert.match(text, /Total earnings: Rs\. 300\.00/);
  assert.match(text, /Working days:\s+1/);
  assert.match(text, /delivery\s+Rs\. 300\.00/);
});

test('effectiveHourlyRatePaise honours from/to date window', () => {
  const entries = [
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-01',
      category: 'delivery',
      amountPaise: 20000,
      hoursWorked: 2
    }),
    createEarningsEntry({
      identityId: 'x',
      date: '2026-05-15',
      category: 'delivery',
      amountPaise: 30000,
      hoursWorked: 3
    }),
    createEarningsEntry({
      identityId: 'x',
      date: '2026-04-01',
      category: 'delivery',
      amountPaise: 10000,
      hoursWorked: 1
    })
  ];
  // Window over May only.
  const may = effectiveHourlyRatePaise(entries, {
    fromDate: '2026-05-01',
    toDate: '2026-05-31'
  });
  assert.equal(may, 10000); // 50000 / 5 = 10000 paise/hr
});

// ─── SqliteStore round-trip ───────────────────────────────────────────

async function freshSqliteStore(name) {
  const root = path.join(tmpRoot, `sqlite-${Date.now()}-${process.pid}-${name}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  return { root, store };
}

test('SqliteStore round-trips an earnings entry', async () => {
  const { store } = await freshSqliteStore('roundtrip');
  const entry = createEarningsEntry({
    identityId: 'bos:person:abc',
    date: '2026-05-20',
    category: 'delivery',
    amountPaise: 46000,
    hoursWorked: 4,
    note: 'Swiggy lunch'
  });
  await store.saveEarningsEntry(entry);
  const read = await store.readEarningsEntry(entry.entryId);
  assert.equal(read.entryId, entry.entryId);
  assert.equal(read.amountPaise, 46000);
  assert.equal(read.hoursWorked, 4);
  assert.equal(read.note, 'Swiggy lunch');
  store.close();
});

test('SqliteStore lists entries filtered by identity + date + category', async () => {
  const { store } = await freshSqliteStore('filtered');
  for (const date of ['2026-05-01', '2026-05-02', '2026-04-01']) {
    await store.saveEarningsEntry(
      createEarningsEntry({
        identityId: 'bos:person:a',
        date,
        category: 'delivery',
        amountPaise: 30000
      })
    );
  }
  await store.saveEarningsEntry(
    createEarningsEntry({
      identityId: 'bos:person:a',
      date: '2026-05-01',
      category: 'cash',
      amountPaise: 5000
    })
  );
  await store.saveEarningsEntry(
    createEarningsEntry({
      identityId: 'bos:person:b',
      date: '2026-05-01',
      category: 'delivery',
      amountPaise: 99999
    })
  );

  // Cross-user isolation.
  const a = await store.listEarningsEntries({ identityId: 'bos:person:a' });
  assert.equal(a.length, 4);

  // Date window.
  const may = await store.listEarningsEntries({
    identityId: 'bos:person:a',
    fromDate: '2026-05-01',
    toDate: '2026-05-31'
  });
  assert.equal(may.length, 3);

  // Category filter.
  const deliveries = await store.listEarningsEntries({
    identityId: 'bos:person:a',
    category: 'delivery'
  });
  assert.equal(deliveries.length, 3);

  store.close();
});

test('SqliteStore.deleteEarningsEntry removes the entry', async () => {
  const { store } = await freshSqliteStore('delete');
  const entry = createEarningsEntry({
    identityId: 'bos:person:a',
    date: '2026-05-20',
    category: 'cash',
    amountPaise: 100
  });
  await store.saveEarningsEntry(entry);
  const ok = await store.deleteEarningsEntry(entry.entryId);
  assert.equal(ok, true);
  const re = await store.readEarningsEntry(entry.entryId);
  assert.equal(re, null);
  store.close();
});

// ─── DPDP integration ─────────────────────────────────────────────────

test('collectUserData includes earnings entries in the export', async () => {
  const { store } = await freshSqliteStore('dpdp-export');
  const identity = createIdentity({ displayName: 'Earner' });
  await store.saveIdentity(identity);
  await store.saveEarningsEntry(
    createEarningsEntry({
      identityId: identity.id,
      date: '2026-05-01',
      category: 'delivery',
      amountPaise: 30000
    })
  );
  const data = await collectUserData(store, identity.id);
  assert.equal(data.sections.earningsLog.count, 1);
  assert.equal(data.sections.earningsLog.records[0].amountPaise, 30000);
  store.close();
});

test('eraseUserData removes earnings entries in the cascade', async () => {
  const { store } = await freshSqliteStore('dpdp-erase');
  const identity = createIdentity({ displayName: 'EraseMe' });
  await store.saveIdentity(identity);
  await store.saveEarningsEntry(
    createEarningsEntry({
      identityId: identity.id,
      date: '2026-05-01',
      category: 'delivery',
      amountPaise: 30000
    })
  );
  await store.eraseUserData(identity.id, { redactLedgerEntry: (e) => e });
  const remaining = await store.listEarningsEntries({ identityId: identity.id });
  assert.equal(remaining.length, 0);
  store.close();
});

// ─── End-to-end API ───────────────────────────────────────────────────

async function withApiServer(callback) {
  const root = path.join(tmpRoot, `srv-${Date.now()}-${process.pid}`);
  await fs.rm(root, { recursive: true, force: true });
  const store = new SqliteStore(root);
  await store.init();
  const server = createPhase0ApiServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, store, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('POST /api/identities/:id/earnings creates an entry', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'PostTest' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: '2026-05-20',
          category: 'delivery',
          amountPaise: 46000,
          hoursWorked: 4.5,
          note: 'Swiggy lunch'
        })
      }
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.entry.amountPaise, 46000);
    assert.equal(body.entry.identityId, identity.id);
  });
});

test('POST earnings rejects invalid input with 400', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Invalid' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: '2099-12-31', category: 'cash', amountPaise: 100 })
      }
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_earnings_entry');
  });
});

test('GET earnings lists user entries with date + category filters', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Lister' });
    await store.saveIdentity(identity);
    for (const date of ['2026-05-01', '2026-05-02', '2026-04-01']) {
      await store.saveEarningsEntry(
        createEarningsEntry({
          identityId: identity.id,
          date,
          category: 'delivery',
          amountPaise: 30000
        })
      );
    }
    const url = new URL(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings`
    );
    url.searchParams.set('from', '2026-05-01');
    url.searchParams.set('to', '2026-05-31');
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.entries.length, 2);
  });
});

test('GET earnings/summary returns aggregated monthly summary + statement', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Summarizer' });
    await store.saveIdentity(identity);
    await store.saveEarningsEntry(
      createEarningsEntry({
        identityId: identity.id,
        date: '2026-05-01',
        category: 'delivery',
        amountPaise: 30000,
        hoursWorked: 3
      })
    );
    const url = `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings/summary?month=2026-05`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.totalPaise, 30000);
    assert.equal(body.summary.month, '2026-05');
    assert.match(body.statement, /Bharat OS earnings statement/);
  });
});

test('GET earnings/summary rejects missing month', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'NoMonth' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings/summary`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'month_required');
  });
});

test('DELETE earnings entry removes it (DPDP correction surface)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Deleter' });
    await store.saveIdentity(identity);
    const entry = createEarningsEntry({
      identityId: identity.id,
      date: '2026-05-01',
      category: 'cash',
      amountPaise: 100
    });
    await store.saveEarningsEntry(entry);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/earnings/${encodeURIComponent(entry.entryId)}`,
      { method: 'DELETE' }
    );
    assert.equal(response.status, 200);
    const stillThere = await store.readEarningsEntry(entry.entryId);
    assert.equal(stillThere, null);
  });
});

test('DELETE earnings refuses to delete another user entry', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const a = createIdentity({ displayName: 'A' });
    const b = createIdentity({ displayName: 'B' });
    await store.saveIdentity(a);
    await store.saveIdentity(b);
    const entry = createEarningsEntry({
      identityId: a.id,
      date: '2026-05-01',
      category: 'cash',
      amountPaise: 100
    });
    await store.saveEarningsEntry(entry);
    // B tries to delete A's entry.
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(b.id)}/earnings/${encodeURIComponent(entry.entryId)}`,
      { method: 'DELETE' }
    );
    assert.equal(response.status, 404);
    const stillThere = await store.readEarningsEntry(entry.entryId);
    assert.ok(stillThere);
  });
});

// Sanity: ensure the categories enum is exposed correctly.
test('EARNINGS_CATEGORIES is frozen and contains the documented set', () => {
  assert.deepEqual(
    [...EARNINGS_CATEGORIES],
    ['delivery', 'ride', 'service', 'cash', 'other']
  );
  assert.ok(Object.isFrozen(EARNINGS_CATEGORIES));
});
