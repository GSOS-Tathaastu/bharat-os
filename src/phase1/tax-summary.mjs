// Year-end tax helper — Phase 6.0c.
//
// Indian income-tax math for gig / service workers. Consumes the
// Phase 6.0a earnings-log entries and produces:
//
//   • Gross income for a financial year (April-March)
//   • New-regime tax (default since FY 2023-24)
//   • Old-regime tax (opt-in, for comparison)
//   • Section 44AD presumptive option (6% of turnover for ≥95%
//     digital receipts; 8% otherwise) — the right framing for
//     delivery riders, drivers, service trades
//   • Comparison: which regime + presumptive choice yields the
//     lowest tax burden, surfaced as a recommendation
//
// **THIS IS AN ESTIMATE.** Tax law in India is fact-specific
// (age, deductions, capital gains, foreign income, business
// expenses, GST registration). Every output carries a disclaimer
// urging the user to consult a CA. We NEVER auto-file. The
// helper produces a CA-ready summary PDF (rendered client-side);
// the worker hands it to their accountant.
//
// §15 bindings:
//
//   • Tax math is LOCAL. The server holds earnings entries (Phase
//     6.0a); the tax calculation is a pure function over them.
//     Could equally run in the browser — no network round-trip
//     leaks anything beyond what already left the device.
//
//   • PAN is NEVER stored. If a future client surface asks for the
//     user's PAN to format the ITR-3/ITR-4 hint output, it stays
//     in IndexedDB / the local SQLite store. The export bundle
//     masks the middle 5 digits the way `phoneMasked` works.
//
//   • The output is advisory, not authoritative. Every summary
//     object includes a `disclaimer` field that consuming UIs
//     MUST surface.

export const TAX_SUMMARY_PROTOCOL_VERSION = 'bos.phase1.tax-summary.v0';

const FY_PATTERN = /^(\d{4})-(\d{2})$/;

function isValidFinancialYear(value) {
  if (typeof value !== 'string') return false;
  const match = FY_PATTERN.exec(value);
  if (!match) return false;
  const startYear = Number(match[1]);
  const endYearShort = Number(match[2]);
  const expectedEnd = ((startYear + 1) % 100).toString().padStart(2, '0');
  if (match[2] !== expectedEnd) return false;
  return startYear >= 2017 && startYear <= 2099;
}

// FY 2025-26 = April 2025 to March 2026. Returns [fromIso, toIso] —
// inclusive on both ends in YYYY-MM-DD form.
function financialYearWindow(financialYear) {
  const startYear = Number(financialYear.slice(0, 4));
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`
  };
}

// ─── New regime — default since FY 2023-24 ────────────────────────────
//
// FY 2025-26 / AY 2026-27 slabs:
//   ₹0 – ₹3,00,000        : 0%
//   ₹3,00,001 – ₹7,00,000 : 5%
//   ₹7,00,001 – ₹10,00,000: 10%
//   ₹10,00,001 – ₹12,00,000: 15%
//   ₹12,00,001 – ₹15,00,000: 20%
//   Above ₹15,00,000      : 30%
//
// Standard deduction: ₹75,000 (applies if income source supports it
// — for salaried workers always; for business/profession income via
// 44AD it doesn't apply, but most gig workers can claim it on
// "other income" since aggregator payouts are typically treated as
// salary-equivalent for the salaried-rebate purpose).
//
// Rebate u/s 87A: full rebate up to ₹25,000 if taxable income ≤
// ₹7,00,000 — meaning effective tax is ZERO for incomes ≤ ₹7L.
//
// Cess: 4% Health & Education Cess on total tax (post-rebate).

const NEW_REGIME_SLABS_FY2025_26 = [
  { upTo: 3_00_000_00, ratePct: 0 },        // ₹3,00,000 in paise
  { upTo: 7_00_000_00, ratePct: 5 },        // ₹7,00,000
  { upTo: 10_00_000_00, ratePct: 10 },      // ₹10,00,000
  { upTo: 12_00_000_00, ratePct: 15 },      // ₹12,00,000
  { upTo: 15_00_000_00, ratePct: 20 },      // ₹15,00,000
  { upTo: Infinity, ratePct: 30 }
];

const STANDARD_DEDUCTION_PAISE = 75_000_00; // ₹75,000
const REBATE_87A_INCOME_CEILING_PAISE = 7_00_000_00; // ₹7L
const REBATE_87A_MAX_REBATE_PAISE = 25_000_00; // ₹25,000
const CESS_PCT = 4;

function applySlabsPaise(taxableIncomePaise, slabs) {
  let tax = 0;
  let lastBoundary = 0;
  for (const slab of slabs) {
    if (taxableIncomePaise <= lastBoundary) break;
    const slabCeiling = Math.min(slab.upTo, taxableIncomePaise);
    const slabIncome = slabCeiling - lastBoundary;
    if (slabIncome > 0) {
      tax += (slabIncome * slab.ratePct) / 100;
    }
    lastBoundary = slab.upTo;
  }
  return Math.round(tax);
}

export function computeTaxNewRegime(grossIncomePaise) {
  if (!Number.isFinite(grossIncomePaise) || grossIncomePaise < 0) {
    throw new Error('grossIncomePaise must be a non-negative number.');
  }
  const taxableIncome = Math.max(0, grossIncomePaise - STANDARD_DEDUCTION_PAISE);
  let baseTax = applySlabsPaise(taxableIncome, NEW_REGIME_SLABS_FY2025_26);

  // Rebate u/s 87A — wipes baseTax entirely when taxable ≤ ₹7L.
  let rebate = 0;
  if (taxableIncome <= REBATE_87A_INCOME_CEILING_PAISE) {
    rebate = Math.min(baseTax, REBATE_87A_MAX_REBATE_PAISE);
  }
  const postRebate = baseTax - rebate;
  const cess = Math.round((postRebate * CESS_PCT) / 100);
  const totalTax = postRebate + cess;

  return {
    regime: 'new',
    grossIncomePaise,
    standardDeductionPaise: STANDARD_DEDUCTION_PAISE,
    taxableIncomePaise: taxableIncome,
    baseTaxPaise: baseTax,
    rebate87APaise: rebate,
    cessPaise: cess,
    totalTaxPaise: totalTax,
    effectiveRatePct:
      grossIncomePaise > 0
        ? Number(((totalTax / grossIncomePaise) * 100).toFixed(2))
        : 0
  };
}

// ─── Old regime — opt-in, included for comparison ─────────────────────
//
// FY 2025-26 slabs (under-60):
//   ₹0 – ₹2,50,000       : 0%
//   ₹2,50,001 – ₹5,00,000: 5%
//   ₹5,00,001 – ₹10,00,000: 20%
//   Above ₹10,00,000     : 30%
//
// Rebate u/s 87A: full rebate up to ₹12,500 if taxable income ≤ ₹5L.
//
// Cess: 4%. Standard deduction ₹50,000 (lower than new regime's
// ₹75,000 — one of the reasons the new regime usually wins for
// gig workers without 80C/80D deductions to claim).

const OLD_REGIME_SLABS_FY2025_26 = [
  { upTo: 2_50_000_00, ratePct: 0 },
  { upTo: 5_00_000_00, ratePct: 5 },
  { upTo: 10_00_000_00, ratePct: 20 },
  { upTo: Infinity, ratePct: 30 }
];

const OLD_REGIME_STANDARD_DEDUCTION_PAISE = 50_000_00;
const OLD_REGIME_REBATE_87A_CEILING_PAISE = 5_00_000_00;
const OLD_REGIME_REBATE_87A_MAX_PAISE = 12_500_00;

export function computeTaxOldRegime(grossIncomePaise) {
  if (!Number.isFinite(grossIncomePaise) || grossIncomePaise < 0) {
    throw new Error('grossIncomePaise must be a non-negative number.');
  }
  const taxableIncome = Math.max(0, grossIncomePaise - OLD_REGIME_STANDARD_DEDUCTION_PAISE);
  const baseTax = applySlabsPaise(taxableIncome, OLD_REGIME_SLABS_FY2025_26);
  let rebate = 0;
  if (taxableIncome <= OLD_REGIME_REBATE_87A_CEILING_PAISE) {
    rebate = Math.min(baseTax, OLD_REGIME_REBATE_87A_MAX_PAISE);
  }
  const postRebate = baseTax - rebate;
  const cess = Math.round((postRebate * CESS_PCT) / 100);
  return {
    regime: 'old',
    grossIncomePaise,
    standardDeductionPaise: OLD_REGIME_STANDARD_DEDUCTION_PAISE,
    taxableIncomePaise: taxableIncome,
    baseTaxPaise: baseTax,
    rebate87APaise: rebate,
    cessPaise: cess,
    totalTaxPaise: postRebate + cess,
    effectiveRatePct:
      grossIncomePaise > 0
        ? Number(((postRebate + cess) / grossIncomePaise * 100).toFixed(2))
        : 0
  };
}

// ─── Section 44AD presumptive — for eligible-business gig workers ─────
//
// Section 44AD lets eligible businesses with turnover ≤ ₹3 crore
// (FY 2025-26, raised from ₹2 crore for businesses with ≥95%
// digital receipts) presume their taxable profit as:
//   • 6% of turnover if ≥95% receipts are non-cash
//   • 8% of turnover otherwise
//
// For most gig workers, payouts arrive via UPI / bank transfer
// from the aggregator → ≥95% digital is the default case. The
// presumed profit then flows to the slab tax calculation (new or
// old regime, user's choice).
//
// 44ADA (specified-profession presumptive at 50%) does NOT
// typically apply to blue-collar gig work — it's for doctors,
// lawyers, architects, etc. We expose it as a separate function
// so the (rare) ADR 0096-spec worker on the platform can use it.

const SECTION_44AD_TURNOVER_CEILING_PAISE = 3_00_00_000_00; // ₹3 crore
const SECTION_44ADA_TURNOVER_CEILING_PAISE = 75_00_000_00; // ₹75 lakh

export function computePresumptive44AD(turnoverPaise, { digitalReceiptShare = 0.95 } = {}) {
  if (!Number.isFinite(turnoverPaise) || turnoverPaise < 0) {
    throw new Error('turnoverPaise must be a non-negative number.');
  }
  if (turnoverPaise > SECTION_44AD_TURNOVER_CEILING_PAISE) {
    return {
      eligible: false,
      reason: 'Section 44AD turnover ceiling exceeded (>₹3 crore).',
      turnoverPaise
    };
  }
  const ratePct = digitalReceiptShare >= 0.95 ? 6 : 8;
  const presumedProfitPaise = Math.round((turnoverPaise * ratePct) / 100);
  return {
    eligible: true,
    section: '44AD',
    turnoverPaise,
    digitalReceiptShare,
    presumedProfitRatePct: ratePct,
    presumedProfitPaise
  };
}

export function computePresumptive44ADA(grossReceiptsPaise) {
  if (!Number.isFinite(grossReceiptsPaise) || grossReceiptsPaise < 0) {
    throw new Error('grossReceiptsPaise must be a non-negative number.');
  }
  if (grossReceiptsPaise > SECTION_44ADA_TURNOVER_CEILING_PAISE) {
    return {
      eligible: false,
      reason: 'Section 44ADA gross-receipts ceiling exceeded (>₹75 lakh).',
      grossReceiptsPaise
    };
  }
  return {
    eligible: true,
    section: '44ADA',
    grossReceiptsPaise,
    presumedProfitRatePct: 50,
    presumedProfitPaise: Math.round(grossReceiptsPaise / 2)
  };
}

// ─── GST threshold flag ──────────────────────────────────────────────
//
// As of FY 2025-26: GST registration mandatory if aggregate turnover
// exceeds:
//   • ₹20 lakh for service providers (most gig workers)
//   • ₹40 lakh for goods suppliers
//
// Special category states (NE + hill states) have lower thresholds.
// We surface a flag + the threshold so the user knows when to
// consult their CA about registration.

const GST_THRESHOLD_SERVICES_PAISE = 20_00_000_00; // ₹20 lakh
const GST_THRESHOLD_GOODS_PAISE = 40_00_000_00;   // ₹40 lakh

export function gstThresholdCheck(grossIncomePaise, { isGoodsSupplier = false } = {}) {
  const threshold = isGoodsSupplier
    ? GST_THRESHOLD_GOODS_PAISE
    : GST_THRESHOLD_SERVICES_PAISE;
  return {
    crossesThreshold: grossIncomePaise > threshold,
    thresholdPaise: threshold,
    overshootPaise: Math.max(0, grossIncomePaise - threshold),
    note: isGoodsSupplier
      ? 'GST registration is mandatory once aggregate turnover crosses ₹40 lakh for goods suppliers (lower in special-category states).'
      : 'GST registration is mandatory once aggregate turnover crosses ₹20 lakh for service providers (lower in special-category states).'
  };
}

// ─── End-to-end summary ──────────────────────────────────────────────

// Compute the full tax-year summary from raw earnings-log entries.
// Returns a comparable view across new regime, old regime, and the
// 44AD presumptive option — surfaces a recommendation but ALWAYS
// urges consulting a CA.
export function taxSummary({
  entries,
  financialYear,
  digitalReceiptShare = 0.95,
  isGoodsSupplier = false
}) {
  if (!isValidFinancialYear(financialYear)) {
    throw new Error('financialYear must be YYYY-YY (e.g., 2025-26).');
  }
  const window = financialYearWindow(financialYear);
  const inFy = (entries ?? []).filter(
    (e) =>
      typeof e.date === 'string' &&
      e.date >= window.from &&
      e.date <= window.to
  );
  const grossIncomePaise = inFy.reduce(
    (sum, e) => sum + (e.amountPaise ?? 0),
    0
  );

  const newRegime = computeTaxNewRegime(grossIncomePaise);
  const oldRegime = computeTaxOldRegime(grossIncomePaise);

  // 44AD presumptive: profit at 6% (digital) → that profit is
  // taxed under the regime. Compare against straight slab on
  // gross.
  const presumptive = computePresumptive44AD(grossIncomePaise, { digitalReceiptShare });
  let presumptiveTax = null;
  if (presumptive.eligible) {
    const presumptiveNew = computeTaxNewRegime(presumptive.presumedProfitPaise);
    const presumptiveOld = computeTaxOldRegime(presumptive.presumedProfitPaise);
    presumptiveTax = {
      ...presumptive,
      ifNewRegime: presumptiveNew,
      ifOldRegime: presumptiveOld,
      bestPaise: Math.min(presumptiveNew.totalTaxPaise, presumptiveOld.totalTaxPaise),
      bestRegime:
        presumptiveNew.totalTaxPaise <= presumptiveOld.totalTaxPaise
          ? 'new'
          : 'old'
    };
  }

  // Recommendation surface — what's the cheapest option?
  const options = [
    { label: 'new regime (no presumptive)', paise: newRegime.totalTaxPaise },
    { label: 'old regime (no presumptive)', paise: oldRegime.totalTaxPaise }
  ];
  if (presumptiveTax) {
    options.push({
      label: `44AD presumptive @ ${presumptiveTax.presumedProfitRatePct}% + ${presumptiveTax.bestRegime} regime`,
      paise: presumptiveTax.bestPaise
    });
  }
  options.sort((a, b) => a.paise - b.paise);

  const gst = gstThresholdCheck(grossIncomePaise, { isGoodsSupplier });

  return {
    protocolVersion: TAX_SUMMARY_PROTOCOL_VERSION,
    objectType: 'tax-summary',
    financialYear,
    window,
    entryCount: inFy.length,
    grossIncomePaise,
    grossIncomeRupees: Number((grossIncomePaise / 100).toFixed(2)),
    newRegime,
    oldRegime,
    presumptive44AD: presumptiveTax,
    gst,
    recommendation: {
      cheapestOption: options[0].label,
      cheapestTaxPaise: options[0].paise,
      allOptions: options
    },
    disclaimer:
      'This is an estimate generated from your logged Bharat OS earnings. ' +
      'Indian income tax depends on factors this tool does not know about: ' +
      '80C/80D/80G deductions, capital gains, foreign income, business expenses ' +
      'beyond presumptive limits, age (60+/80+), tax already deducted at source, ' +
      'professional tax, GST already paid, and more. ' +
      'CONSULT A CHARTERED ACCOUNTANT BEFORE FILING. Bharat OS does NOT file ' +
      'tax returns on your behalf and is not liable for the accuracy of this estimate.'
  };
}
