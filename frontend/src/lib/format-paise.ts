// Phase 12.1a.2 — Shared paise → ₹ formatter.
//
// Zero-dep, Intl.NumberFormat-based. Used by booking, escrow,
// provider earnings displays. Reusable across modules per the
// "common features as core substrates" binding.

const INDIAN_RUPEE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const INDIAN_DECIMAL = new Intl.NumberFormat('en-IN', {
  style: 'decimal',
  maximumFractionDigits: 2
});

// "₹ 1,23,456" — full Indian-numbering string. Use for headline
// amounts. Paise rounded to nearest rupee.
export function formatRupees(paise: number | null | undefined): string {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '₹ 0';
  return INDIAN_RUPEE.format(Math.round(n / 100));
}

// "1,23,456.50" — used inside cards where the ₹ is already in
// the label.
export function formatRupeesDecimal(paise: number | null | undefined): string {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '0';
  return INDIAN_DECIMAL.format(n / 100);
}

// "₹1,23,456 / hr" or "₹500 / service" — short rate label.
export function formatRateBasis(paise: number | null | undefined, basis: 'per-hour' | 'per-service'): string {
  return basis === 'per-hour'
    ? `${formatRupees(paise)} / hr`
    : `${formatRupees(paise)} / service`;
}
