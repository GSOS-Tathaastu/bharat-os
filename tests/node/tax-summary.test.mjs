// Phase 6.0c — year-end tax helper tests.
//
// Indian income-tax math is fact-specific and high-stakes. These
// tests pin canonical examples that a tax professional can audit
// independently — slab boundaries, the 87A rebate cliff, the
// presumptive 44AD math, the cess calculation, and the
// regime-comparison recommendation.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  computePresumptive44AD,
  computePresumptive44ADA,
  computeTaxNewRegime,
  computeTaxOldRegime,
  gstThresholdCheck,
  TAX_SUMMARY_PROTOCOL_VERSION,
  taxSummary
} from '../../src/phase1/tax-summary.mjs';
import { createEarningsEntry } from '../../src/phase1/earnings-log.mjs';
import { createIdentity } from '../../src/phase0/core.mjs';
import { createPhase0ApiServer } from '../../src/phase0/api.mjs';
import { SqliteStore } from '../../src/phase0/sqlite-store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = path.join(repoRoot, '.tmp', 'tax-summary-tests');

// ─── New regime ──────────────────────────────────────────────────────

test('new regime: income up to ₹3L pays zero tax', () => {
  const result = computeTaxNewRegime(0);
  assert.equal(result.totalTaxPaise, 0);
  assert.equal(result.taxableIncomePaise, 0);
});

test('new regime: income ≤ ₹7L pays zero tax after 87A rebate (cliff verification)', () => {
  // Gross ₹7,75,000 → taxable ₹7,00,000 after standard deduction
  // → tax ₹20,000 → 87A rebate up to ₹25,000 wipes it.
  const result = computeTaxNewRegime(7_75_000_00);
  assert.equal(result.taxableIncomePaise, 7_00_000_00);
  assert.equal(result.totalTaxPaise, 0);
  assert.equal(result.rebate87APaise, result.baseTaxPaise);
});

test('new regime: cliff at ₹7,00,001 taxable income — rebate disappears', () => {
  // Gross ₹7,75,001 → taxable ₹7,00,001 → rebate gone, baseTax + cess.
  const result = computeTaxNewRegime(7_75_001_00);
  assert.equal(result.rebate87APaise, 0);
  assert.ok(result.totalTaxPaise > 0);
});

test('new regime: ₹10L gross gives the canonical slab result', () => {
  // Gross ₹10,00,000 → standard deduction ₹75,000 → taxable ₹9,25,000.
  // New regime slab tax (FY 2025-26):
  //   First ₹3L:        0       = ₹0
  //   ₹3L to ₹7L (₹4L): 5%      = ₹20,000
  //   ₹7L to ₹9.25L (₹2.25L): 10% = ₹22,500
  // Base tax = ₹42,500. No rebate (taxable > ₹7L).
  // Cess 4% on ₹42,500 = ₹1,700.
  // Total = ₹44,200.
  const result = computeTaxNewRegime(10_00_000_00);
  assert.equal(result.taxableIncomePaise, 9_25_000_00);
  assert.equal(result.baseTaxPaise, 42_500_00);
  assert.equal(result.cessPaise, 1_700_00);
  assert.equal(result.totalTaxPaise, 44_200_00);
});

test('new regime: ₹15L gross hits the 15% slab', () => {
  // Gross ₹15,00,000 → taxable ₹14,25,000.
  //   ₹0-₹3L:       0%   = ₹0
  //   ₹3L-₹7L:      5%   = ₹20,000
  //   ₹7L-₹10L:     10%  = ₹30,000
  //   ₹10L-₹12L:    15%  = ₹30,000
  //   ₹12L-₹14.25L: 20%  = ₹45,000
  // Base tax = ₹1,25,000. Cess 4% = ₹5,000. Total ₹1,30,000.
  const result = computeTaxNewRegime(15_00_000_00);
  assert.equal(result.taxableIncomePaise, 14_25_000_00);
  assert.equal(result.baseTaxPaise, 1_25_000_00);
  assert.equal(result.totalTaxPaise, 1_30_000_00);
});

test('new regime rejects negative or non-finite income', () => {
  assert.throws(() => computeTaxNewRegime(-1), /non-negative/);
  assert.throws(() => computeTaxNewRegime(NaN), /non-negative/);
  assert.throws(() => computeTaxNewRegime(Infinity), /non-negative/);
});

// ─── Old regime ──────────────────────────────────────────────────────

test('old regime: ₹6L gross with rebate wipes tax (cliff at ₹5L taxable)', () => {
  // Gross ₹5,50,000 → taxable ₹5,00,000 → slab tax ₹12,500
  // → 87A rebate ₹12,500 → 0. Cess 4% of 0 = 0.
  const result = computeTaxOldRegime(5_50_000_00);
  assert.equal(result.taxableIncomePaise, 5_00_000_00);
  assert.equal(result.totalTaxPaise, 0);
});

test('old regime: ₹10L gross gives the canonical slab result', () => {
  // Gross ₹10,00,000 → standard deduction ₹50,000 → taxable ₹9,50,000.
  //   First ₹2.5L:        0%    = ₹0
  //   ₹2.5L-₹5L (₹2.5L):  5%    = ₹12,500
  //   ₹5L-₹9.5L (₹4.5L):  20%   = ₹90,000
  // Base tax = ₹1,02,500. No rebate (taxable > ₹5L).
  // Cess 4% = ₹4,100. Total ₹1,06,600.
  const result = computeTaxOldRegime(10_00_000_00);
  assert.equal(result.taxableIncomePaise, 9_50_000_00);
  assert.equal(result.baseTaxPaise, 1_02_500_00);
  assert.equal(result.cessPaise, 4_100_00);
  assert.equal(result.totalTaxPaise, 1_06_600_00);
});

// ─── 44AD presumptive ────────────────────────────────────────────────

test('44AD: digital receipts (≥95%) presume 6% profit', () => {
  const result = computePresumptive44AD(10_00_000_00, { digitalReceiptShare: 0.99 });
  assert.equal(result.eligible, true);
  assert.equal(result.presumedProfitRatePct, 6);
  assert.equal(result.presumedProfitPaise, 60_000_00);
});

test('44AD: cash-heavy receipts presume 8% profit', () => {
  const result = computePresumptive44AD(10_00_000_00, { digitalReceiptShare: 0.5 });
  assert.equal(result.presumedProfitRatePct, 8);
  assert.equal(result.presumedProfitPaise, 80_000_00);
});

test('44AD: ineligible above ₹3 crore turnover ceiling', () => {
  const result = computePresumptive44AD(3_00_00_001_00);
  assert.equal(result.eligible, false);
  assert.match(result.reason, /Section 44AD/);
});

test('44ADA: 50% of receipts presumed profit', () => {
  const result = computePresumptive44ADA(10_00_000_00);
  assert.equal(result.eligible, true);
  assert.equal(result.presumedProfitRatePct, 50);
  assert.equal(result.presumedProfitPaise, 5_00_000_00);
});

test('44ADA: ineligible above ₹75 lakh ceiling', () => {
  const result = computePresumptive44ADA(75_00_001_00);
  assert.equal(result.eligible, false);
});

// ─── GST threshold ───────────────────────────────────────────────────

test('GST threshold: services threshold is ₹20 lakh', () => {
  const result = gstThresholdCheck(20_00_001_00);
  assert.equal(result.crossesThreshold, true);
  assert.equal(result.thresholdPaise, 20_00_000_00);
  assert.equal(result.overshootPaise, 1_00);
});

test('GST threshold: goods supplier threshold is ₹40 lakh', () => {
  const result = gstThresholdCheck(20_00_001_00, { isGoodsSupplier: true });
  assert.equal(result.crossesThreshold, false);
  assert.equal(result.thresholdPaise, 40_00_000_00);
});

// ─── End-to-end taxSummary ────────────────────────────────────────────

function entry({ date, amountPaise, category = 'delivery' }) {
  return createEarningsEntry({
    identityId: 'bos:person:x',
    date,
    category,
    amountPaise
  });
}

test('taxSummary returns a versioned envelope with disclaimer', () => {
  const summary = taxSummary({ entries: [], financialYear: '2025-26' });
  assert.equal(summary.protocolVersion, TAX_SUMMARY_PROTOCOL_VERSION);
  assert.equal(summary.objectType, 'tax-summary');
  assert.equal(summary.financialYear, '2025-26');
  assert.equal(summary.window.from, '2025-04-01');
  assert.equal(summary.window.to, '2026-03-31');
  assert.match(summary.disclaimer, /CONSULT A CHARTERED ACCOUNTANT/);
  assert.match(summary.disclaimer, /not liable for the accuracy/);
});

test('taxSummary filters earnings to the financial-year window (Apr-Mar)', () => {
  const entries = [
    // In FY 2025-26
    entry({ date: '2025-04-01', amountPaise: 1_00_000_00 }),
    entry({ date: '2025-12-31', amountPaise: 1_00_000_00 }),
    entry({ date: '2026-03-31', amountPaise: 1_00_000_00 }),
    // Out of FY 2025-26
    entry({ date: '2025-03-31', amountPaise: 5_00_00 }), // FY 2024-25
    entry({ date: '2026-04-01', amountPaise: 5_00_00 })  // FY 2026-27
  ];
  const summary = taxSummary({ entries, financialYear: '2025-26' });
  assert.equal(summary.entryCount, 3);
  assert.equal(summary.grossIncomePaise, 3_00_000_00);
});

test('taxSummary surfaces a recommendation cheaper-of (new / old / 44AD)', () => {
  // ₹10 lakh gross, all digital → 44AD presumes ₹60,000 profit
  // → tax on ₹60K (under-₹7L rebate ceiling) = ₹0.
  // Direct new regime on ₹10L: ₹44,200 (per earlier test).
  // Direct old regime: ₹1,06,600.
  // → recommendation should be the 44AD presumptive option.
  const entries = [entry({ date: '2025-05-01', amountPaise: 10_00_000_00 })];
  const summary = taxSummary({ entries, financialYear: '2025-26' });
  assert.equal(summary.newRegime.totalTaxPaise, 44_200_00);
  assert.equal(summary.oldRegime.totalTaxPaise, 1_06_600_00);
  assert.equal(summary.presumptive44AD.bestPaise, 0);
  assert.match(summary.recommendation.cheapestOption, /44AD/);
  assert.equal(summary.recommendation.cheapestTaxPaise, 0);
});

test('taxSummary flags GST threshold crossing', () => {
  const entries = [entry({ date: '2025-05-01', amountPaise: 25_00_000_00 })];
  const summary = taxSummary({ entries, financialYear: '2025-26' });
  assert.equal(summary.gst.crossesThreshold, true);
  assert.equal(summary.gst.overshootPaise, 5_00_000_00);
});

test('taxSummary rejects invalid financialYear formats', () => {
  assert.throws(
    () => taxSummary({ entries: [], financialYear: '2025-27' }), // wrong end year
    /YYYY-YY/
  );
  assert.throws(
    () => taxSummary({ entries: [], financialYear: '2025' }),
    /YYYY-YY/
  );
  assert.throws(
    () => taxSummary({ entries: [], financialYear: 'FY2025-26' }),
    /YYYY-YY/
  );
});

// ─── End-to-end API ──────────────────────────────────────────────────

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
    return await callback({ baseUrl, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof store.close === 'function') store.close();
  }
}

test('GET /api/identities/:id/tax/summary returns end-to-end summary', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'Earner' });
    await store.saveIdentity(identity);
    await store.saveEarningsEntry(
      createEarningsEntry({
        identityId: identity.id,
        date: '2025-05-01',
        category: 'delivery',
        amountPaise: 10_00_000_00
      })
    );
    const url = `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/tax/summary?financialYear=2025-26`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.grossIncomePaise, 10_00_000_00);
    assert.equal(body.summary.newRegime.totalTaxPaise, 44_200_00);
    assert.match(body.summary.disclaimer, /CONSULT A CHARTERED ACCOUNTANT/);
    // Cheapest option: 44AD presumptive at zero tax.
    assert.equal(body.summary.recommendation.cheapestTaxPaise, 0);
  });
});

test('GET tax/summary rejects missing financialYear (400)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'NoYear' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/tax/summary`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'financial_year_required');
  });
});

test('GET tax/summary rejects bad financialYear format (400)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'BadYear' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/tax/summary?financialYear=2025-27`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_tax_input');
  });
});

test('GET tax/summary rejects out-of-range digitalShare (400)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const identity = createIdentity({ displayName: 'BadDigital' });
    await store.saveIdentity(identity);
    const response = await fetch(
      `${baseUrl}/api/identities/${encodeURIComponent(identity.id)}/tax/summary?financialYear=2025-26&digitalShare=1.5`
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_digital_share');
  });
});

test('GET tax/summary scopes to identity (cross-user)', async () => {
  await withApiServer(async ({ baseUrl, store }) => {
    const alice = createIdentity({ displayName: 'Alice' });
    const bob = createIdentity({ displayName: 'Bob' });
    await store.saveIdentity(alice);
    await store.saveIdentity(bob);
    await store.saveEarningsEntry(
      createEarningsEntry({
        identityId: alice.id,
        date: '2025-05-01',
        category: 'delivery',
        amountPaise: 10_00_000_00
      })
    );
    const url = `${baseUrl}/api/identities/${encodeURIComponent(bob.id)}/tax/summary?financialYear=2025-26`;
    const response = await fetch(url);
    const body = await response.json();
    assert.equal(body.summary.grossIncomePaise, 0);
    assert.equal(body.summary.newRegime.totalTaxPaise, 0);
  });
});

test('GET tax/summary 404s for unknown identity', async () => {
  await withApiServer(async ({ baseUrl }) => {
    const response = await fetch(
      `${baseUrl}/api/identities/bos:person:nonexistent/tax/summary?financialYear=2025-26`
    );
    assert.equal(response.status, 404);
  });
});
