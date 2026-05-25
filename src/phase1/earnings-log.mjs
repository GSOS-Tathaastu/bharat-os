// Cross-platform earnings tracker — Phase 6.0.
//
// The single-player worker tool: a gig / service worker types their
// daily earnings (across Swiggy, Zomato, Rapido, cash gigs, etc.)
// into Bharat OS. We produce monthly statements, hourly-rate
// estimates, and (later) tax-summary inputs.
//
// §15 bindings:
//
//   • Data is USER-SUPPLIED. We never scrape aggregator apps; we
//     never OAuth into Swiggy. The worker types numbers. This
//     sidesteps every aggregator Terms-of-Service issue and stays
//     fully on-device-controlled.
//
//   • Amounts stored as paise (INTEGER), not rupees-with-decimals.
//     Float arithmetic on currency is an old footgun; integer paise
//     means a Rs. 1.00 lakh sum is exactly that, not 99999.99….
//
//   • Each entry is signed by ownership (`identityId`) but the
//     amount + category never leaves the user's identity scope.
//     The DPDP export includes earnings; nothing else does.
//
//   • Categories are coarse: delivery / ride / service / cash /
//     other. Fine-grained "which platform exactly" would be a
//     fingerprintable signal; the coarseness keeps the future
//     percentile-peer-comparison anonymization tractable.

import { sha256Hex, stableStringify } from '../phase0/core.mjs';

export const EARNINGS_LOG_PROTOCOL_VERSION = 'bos.phase1.earnings-log.v0';

export const EARNINGS_CATEGORIES = Object.freeze([
  'delivery', // Swiggy / Zomato / Dunzo / Blinkit etc.
  'ride',     // Ola / Uber / Rapido / BluSmart etc.
  'service',  // Urban Company / direct service trades
  'cash',     // direct cash gigs, no aggregator
  'other'     // catch-all
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function nowIso() {
  return new Date().toISOString();
}

function isValidDate(value) {
  if (typeof value !== 'string') return false;
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip: rejects dates like "2026-02-30" that Date() coerces.
  return parsed.toISOString().slice(0, 10) === value;
}

function isValidMonth(value) {
  if (typeof value !== 'string') return false;
  if (!MONTH_PATTERN.test(value)) return false;
  const [yyyy, mm] = value.split('-').map(Number);
  return mm >= 1 && mm <= 12 && yyyy >= 1970 && yyyy <= 2100;
}

// Build a stable entry ID from the canonical fields. Same identity
// + same date + same category + same amount → same ID, so duplicate
// posts upsert instead of accumulating.
function deriveEntryId({ identityId, date, category, amountPaise, createdAt }) {
  const fingerprint = sha256Hex(
    stableStringify({ identityId, date, category, amountPaise, createdAt })
  );
  return `bos:earnings:${fingerprint.slice(0, 32)}`;
}

// Pure constructor — validates + returns a record. Caller persists
// via `store.saveEarningsEntry(entry)`.
export function createEarningsEntry({
  identityId,
  date,
  category,
  amountPaise,
  hoursWorked = null,
  note = null,
  createdAt = nowIso()
} = {}) {
  if (!identityId || typeof identityId !== 'string') {
    throw new Error('identityId is required.');
  }
  if (!isValidDate(date)) {
    throw new Error('date must be a valid YYYY-MM-DD ISO date.');
  }
  // Reject future dates — earnings tracker is past-only.
  if (date > nowIso().slice(0, 10)) {
    throw new Error('date cannot be in the future.');
  }
  if (!EARNINGS_CATEGORIES.includes(category)) {
    throw new Error(
      `category must be one of: ${EARNINGS_CATEGORIES.join(', ')}.`
    );
  }
  if (!Number.isInteger(amountPaise) || amountPaise < 0) {
    throw new Error('amountPaise must be a non-negative integer.');
  }
  if (amountPaise > 1_00_00_00_00_00) {
    // 1 crore rupees in paise — sanity ceiling for a single day's gig
    // earnings. Anything bigger is almost certainly a typo. Reject so
    // we don't silently corrupt the running totals.
    throw new Error('amountPaise exceeds the per-day sanity ceiling.');
  }
  if (hoursWorked !== null && hoursWorked !== undefined) {
    if (!Number.isFinite(hoursWorked) || hoursWorked < 0 || hoursWorked > 24) {
      throw new Error('hoursWorked must be a number between 0 and 24.');
    }
  } else {
    hoursWorked = null;
  }
  if (note !== null && note !== undefined) {
    if (typeof note !== 'string') throw new Error('note must be a string.');
    note = note.trim().slice(0, 200);
    if (!note) note = null;
  } else {
    note = null;
  }

  const entry = {
    protocolVersion: EARNINGS_LOG_PROTOCOL_VERSION,
    objectType: 'earnings-entry',
    identityId,
    date,
    category,
    amountPaise,
    hoursWorked,
    note,
    source: 'self',
    createdAt
  };
  entry.entryId = deriveEntryId(entry);
  return entry;
}

// Aggregate a flat list of entries into a month-scoped summary.
// `month` is 'YYYY-MM' (e.g. '2026-05'). Returns:
//   {
//     month,
//     totalPaise,
//     byCategory: { delivery: paise, ride: paise, … },
//     hoursTotal,         // null if no entries declared hours
//     dayCount,           // distinct working days in the month
//     entryCount,         // total entries in the month
//     effectiveHourlyRatePaise  // null when hoursTotal === null or 0
//   }
export function aggregateByMonth(entries, month) {
  if (!isValidMonth(month)) {
    throw new Error('month must be YYYY-MM.');
  }
  const inMonth = (entries ?? []).filter(
    (e) => typeof e.date === 'string' && e.date.startsWith(`${month}-`)
  );
  const byCategory = Object.fromEntries(
    EARNINGS_CATEGORIES.map((c) => [c, 0])
  );
  let totalPaise = 0;
  let hoursTotal = null;
  const days = new Set();
  for (const entry of inMonth) {
    totalPaise += entry.amountPaise ?? 0;
    if (EARNINGS_CATEGORIES.includes(entry.category)) {
      byCategory[entry.category] += entry.amountPaise ?? 0;
    }
    days.add(entry.date);
    if (entry.hoursWorked !== null && entry.hoursWorked !== undefined) {
      hoursTotal = (hoursTotal ?? 0) + entry.hoursWorked;
    }
  }
  const effectiveHourlyRatePaise =
    hoursTotal && hoursTotal > 0 ? Math.round(totalPaise / hoursTotal) : null;
  return {
    protocolVersion: EARNINGS_LOG_PROTOCOL_VERSION,
    objectType: 'earnings-monthly-summary',
    month,
    totalPaise,
    byCategory,
    hoursTotal,
    dayCount: days.size,
    entryCount: inMonth.length,
    effectiveHourlyRatePaise
  };
}

// Format an aggregated summary as a single-paragraph statement
// suitable for sharing with a landlord / MFI / accountant. Returns
// plain text — the shell formats further as needed.
export function monthlyStatement(summary, { rupeeFormatter } = {}) {
  if (!summary || summary.objectType !== 'earnings-monthly-summary') {
    throw new Error('summary must be an earnings-monthly-summary.');
  }
  const fmt =
    rupeeFormatter ??
    ((paise) =>
      `Rs. ${(paise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`);
  const lines = [
    `Bharat OS earnings statement — ${summary.month}`,
    ``,
    `Total earnings: ${fmt(summary.totalPaise)}`,
    `Working days:   ${summary.dayCount}`,
    `Entries logged: ${summary.entryCount}`
  ];
  if (summary.hoursTotal) {
    lines.push(
      `Hours worked:   ${summary.hoursTotal.toFixed(1)} hours`
    );
    lines.push(
      `Effective rate: ${fmt(summary.effectiveHourlyRatePaise)} per hour`
    );
  }
  lines.push(``, `Breakdown by category:`);
  for (const [category, paise] of Object.entries(summary.byCategory)) {
    if (paise > 0) {
      lines.push(`  ${category.padEnd(10)} ${fmt(paise)}`);
    }
  }
  return lines.join('\n');
}

// Compute an effective hourly rate across a date window. Returns
// integer paise/hour, or `null` when no hours were logged.
export function effectiveHourlyRatePaise(entries, { fromDate, toDate } = {}) {
  if (fromDate !== undefined && !isValidDate(fromDate)) {
    throw new Error('fromDate must be a valid YYYY-MM-DD ISO date.');
  }
  if (toDate !== undefined && !isValidDate(toDate)) {
    throw new Error('toDate must be a valid YYYY-MM-DD ISO date.');
  }
  let totalPaise = 0;
  let hoursTotal = 0;
  for (const entry of entries ?? []) {
    if (fromDate && entry.date < fromDate) continue;
    if (toDate && entry.date > toDate) continue;
    totalPaise += entry.amountPaise ?? 0;
    if (entry.hoursWorked !== null && entry.hoursWorked !== undefined) {
      hoursTotal += entry.hoursWorked;
    }
  }
  return hoursTotal > 0 ? Math.round(totalPaise / hoursTotal) : null;
}
