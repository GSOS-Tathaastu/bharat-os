// §13B mesh contribution events.
//
// Each event records a single tick of work the operator's node served —
// inference tokens, storage chunk reads, or storage placements. Earnings
// are computed from §13B pricing (₹15–25 / M tokens sell, ₹6–10 / M
// operator payout; ₹150–200 / TB-month sell, ₹60–80 operator payout).
// We track the *operator payout*, in paise, on each event so the shell
// can show a live earnings ticker without needing a price-list call.
//
// Phase 2a.13 (ADR 0062). The store and policy layers consume these
// events alongside the static node.storageBytes baseline so the Net
// Contribution Score (§13B fair-use lever) is *dynamic* — it grows as
// the user serves real work, not just because they advertised capacity.

import {
  sha256Hex,
  stableStringify
} from '../phase0/core.mjs';

export const MESH_CONTRIBUTION_PROTOCOL_VERSION = 'bos.phase2a.mesh-contribution.v0';

export const MESH_WORKLOAD_TYPES = [
  'inference',
  'storage_serve',
  'storage_store',
  // §7f Phase 3.0 — federated training participation. Per-update
  // payout is set by the round (see `federated-round.mjs`), so this
  // workload type carries an explicit `payoutPaise` rather than
  // deriving one from tokens/bytes.
  'federated_round',
  // Phase 10.1 — labeling marketplace submissions. Per-label payout
  // is set by the job; like federated_round, this workload type
  // carries `payoutPaise` explicitly + a `jobId` (reusing `roundId`
  // slot would have been wrong because the event is for a labeling
  // job not a round; we add `jobId` below).
  'labeling'
];

// §13B midpoint operator payouts. Stored in paise (1 INR = 100 paise) so
// arithmetic stays integer and the shell ticker can show ₹X.YZ without
// floating-point drift on long-running sessions.
const PAYOUT_PAISE_PER_MILLION_TOKENS = 800;        // ₹8/M tokens
const PAYOUT_PAISE_PER_GIGABYTE_SERVED = 200;       // ₹2/GB egress-equivalent
const PAYOUT_PAISE_PER_TERABYTE_STORED_MONTH = 7000; // ₹70/TB/month (§13B midpoint)

function idFrom(prefix, payload) {
  return `${prefix}:${sha256Hex(stableStringify(payload)).slice(0, 32)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function computePayoutPaise({ workloadType, tokens, bytes, payoutPaise }) {
  if (workloadType === 'inference') {
    const t = Math.max(0, Number(tokens ?? 0));
    return Math.round((t / 1_000_000) * PAYOUT_PAISE_PER_MILLION_TOKENS);
  }
  if (workloadType === 'storage_serve') {
    const b = Math.max(0, Number(bytes ?? 0));
    return Math.round((b / (1024 ** 3)) * PAYOUT_PAISE_PER_GIGABYTE_SERVED);
  }
  if (workloadType === 'storage_store') {
    // §13B Product 1: prorate the per-TB-month payout to a per-minute tick.
    // Single-tick payouts are deliberately tiny — operators earn through
    // sustained capacity availability, not big per-tick bursts.
    const b = Math.max(0, Number(bytes ?? 0));
    return Math.round((b / (1024 ** 4)) * (PAYOUT_PAISE_PER_TERABYTE_STORED_MONTH / (30 * 24 * 60)));
  }
  if (workloadType === 'federated_round') {
    // Payout is set by the round (caller passes explicit `payoutPaise`).
    return Math.max(0, Number(payoutPaise ?? 0));
  }
  if (workloadType === 'labeling') {
    // Phase 10.1 — payout set by the labeling job (caller passes
    // explicit `payoutPaise`). Phase 10.4 — negative payouts are
    // allowed here for sponsor-rejection clawbacks; the per-event
    // amount is bounded by the job's `perLabelPaise` so a clawback
    // can never exceed what the worker originally earned for the
    // same submission.
    return Math.round(Number(payoutPaise ?? 0));
  }
  return 0;
}

export function createMeshContributionEvent({
  operatorId,
  nodeId,
  workloadType,
  tokens,
  bytes,
  peerId,
  charging = true,
  wifi = true,
  batteryPercent = 100,
  // §7f federated rounds carry their per-update payout from the
  // round, not from tokens/bytes; the caller passes it explicitly.
  payoutPaise: explicitPayoutPaise,
  roundId,
  // Phase 10.1 — labeling-marketplace job ref. Like roundId, only
  // set for the matching workload type.
  jobId,
  itemId,
  at = nowIso()
}) {
  if (!operatorId) throw new Error('operatorId is required.');
  if (!MESH_WORKLOAD_TYPES.includes(workloadType)) {
    throw new Error(`workloadType must be one of: ${MESH_WORKLOAD_TYPES.join(', ')}`);
  }
  if (workloadType === 'inference' && !Number.isFinite(Number(tokens))) {
    throw new Error('inference events require a numeric tokens count.');
  }
  if (
    workloadType !== 'inference' &&
    workloadType !== 'federated_round' &&
    workloadType !== 'labeling' &&
    !Number.isFinite(Number(bytes))
  ) {
    throw new Error('storage events require a numeric bytes count.');
  }

  const payoutPaise = computePayoutPaise({
    workloadType,
    tokens,
    bytes,
    payoutPaise: explicitPayoutPaise
  });

  const core = {
    protocolVersion: MESH_CONTRIBUTION_PROTOCOL_VERSION,
    objectType: 'mesh-contribution-event',
    operatorId,
    nodeId: nodeId ?? null,
    workloadType,
    tokens: workloadType === 'inference' ? Number(tokens) : null,
    bytes:
      workloadType === 'inference' ||
      workloadType === 'federated_round' ||
      workloadType === 'labeling'
        ? null
        : Number(bytes),
    peerId: peerId ?? null,
    roundId: workloadType === 'federated_round' ? (roundId ?? null) : null,
    jobId: workloadType === 'labeling' ? (jobId ?? null) : null,
    itemId: workloadType === 'labeling' ? (itemId ?? null) : null,
    deviceState: {
      charging: Boolean(charging),
      wifi: Boolean(wifi),
      batteryPercent: Math.max(0, Math.min(100, Number(batteryPercent ?? 100)))
    },
    payoutPaise,
    settlementCurrency: 'INR',
    at
  };

  return {
    contributionEventId: idFrom('bos:mesh-event', core),
    ...core
  };
}

// Aggregate the operator's recent contribution events into a summary the
// Trust Passport / shell can render. Counts events by workload type, sums
// payouts, and surfaces the last-event timestamp so the ticker stays live.
export function meshContributionSummary(operatorId, events = []) {
  const own = events.filter((event) => event.operatorId === operatorId);
  const inference = own.filter((event) => event.workloadType === 'inference');
  const serve = own.filter((event) => event.workloadType === 'storage_serve');
  const store = own.filter((event) => event.workloadType === 'storage_store');

  const totalPaise = own.reduce((sum, event) => sum + (event.payoutPaise ?? 0), 0);
  const totalTokens = inference.reduce((sum, event) => sum + (event.tokens ?? 0), 0);
  const totalBytesServed = serve.reduce((sum, event) => sum + (event.bytes ?? 0), 0);
  const totalBytesStored = store.reduce((sum, event) => sum + (event.bytes ?? 0), 0);

  return {
    operatorId,
    eventCount: own.length,
    inferenceCount: inference.length,
    storageServeCount: serve.length,
    storageStoreCount: store.length,
    totalTokensServed: totalTokens,
    totalBytesServed,
    totalBytesStored,
    totalPaise,
    totalRupees: Number((totalPaise / 100).toFixed(2)),
    lastEventAt: own.reduce((latest, event) =>
      !latest || event.at > latest ? event.at : latest, null)
  };
}

export const MESH_PAYOUT_RATES = {
  payoutPaisePerMillionTokens: PAYOUT_PAISE_PER_MILLION_TOKENS,
  payoutPaisePerGigabyteServed: PAYOUT_PAISE_PER_GIGABYTE_SERVED,
  payoutPaisePerTerabyteStoredMonth: PAYOUT_PAISE_PER_TERABYTE_STORED_MONTH
};

// ─── Phase 6.0b — mesh dashboard aggregation ─────────────────────────
//
// `meshContributionSummary` (above) returns an all-time totals object
// suitable for the Trust Passport block. The dashboard needs more:
// monthly aggregation + a per-day timeline so the worker can see
// "what did I earn each day this month?" without re-fetching events.
//
// Both functions are pure — they take the event list and a month
// scope, return a summary object. The store list does the I/O; this
// layer does the math.

const MESH_DASHBOARD_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function meshDashboardIsValidMonth(value) {
  if (typeof value !== 'string') return false;
  if (!MESH_DASHBOARD_MONTH_PATTERN.test(value)) return false;
  const [yyyy, mm] = value.split('-').map(Number);
  return mm >= 1 && mm <= 12 && yyyy >= 1970 && yyyy <= 2100;
}

// Aggregate one operator's events into a month-scoped summary +
// per-day timeline. `month` is 'YYYY-MM'.
//
// Returns:
//   {
//     operatorId, month,
//     totalPaise,
//     totalRupees,             // convenience, totalPaise / 100
//     eventCount,
//     byWorkload: {
//       inference: paise,
//       storage_serve: paise,
//       storage_store: paise,
//       federated_round: paise
//     },
//     dailyTimeline: [
//       { date: 'YYYY-MM-DD', paise, eventCount },
//       …
//     ],                       // sorted ascending by date
//     firstEventAt, lastEventAt
//   }
export function aggregateMeshByMonth(events, month, { operatorId } = {}) {
  if (!meshDashboardIsValidMonth(month)) {
    throw new Error('month must be YYYY-MM.');
  }
  const scoped = (events ?? []).filter((event) => {
    if (operatorId && event.operatorId !== operatorId) return false;
    if (!event.at || typeof event.at !== 'string') return false;
    return event.at.slice(0, 7) === month;
  });

  const byWorkload = {
    inference: 0,
    storage_serve: 0,
    storage_store: 0,
    federated_round: 0
  };
  const dailyMap = new Map(); // date → { paise, eventCount }
  let totalPaise = 0;
  let firstEventAt = null;
  let lastEventAt = null;

  for (const event of scoped) {
    const paise = Number(event.payoutPaise ?? 0);
    totalPaise += paise;
    if (event.workloadType in byWorkload) {
      byWorkload[event.workloadType] += paise;
    }
    const date = event.at.slice(0, 10);
    const day = dailyMap.get(date) ?? { paise: 0, eventCount: 0 };
    day.paise += paise;
    day.eventCount += 1;
    dailyMap.set(date, day);
    if (!firstEventAt || event.at < firstEventAt) firstEventAt = event.at;
    if (!lastEventAt || event.at > lastEventAt) lastEventAt = event.at;
  }

  const dailyTimeline = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, paise: v.paise, eventCount: v.eventCount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    protocolVersion: MESH_CONTRIBUTION_PROTOCOL_VERSION,
    objectType: 'mesh-monthly-summary',
    operatorId: operatorId ?? null,
    month,
    totalPaise,
    totalRupees: Number((totalPaise / 100).toFixed(2)),
    eventCount: scoped.length,
    byWorkload,
    dailyTimeline,
    firstEventAt,
    lastEventAt
  };
}

// Compose a printable statement for the operator. Mirrors the
// earnings-log `monthlyStatement` shape so shell rendering can
// treat the two outputs uniformly.
export function meshMonthlyStatement(summary, { rupeeFormatter } = {}) {
  if (!summary || summary.objectType !== 'mesh-monthly-summary') {
    throw new Error('summary must be a mesh-monthly-summary.');
  }
  const fmt =
    rupeeFormatter ??
    ((paise) =>
      `Rs. ${(paise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`);
  const lines = [
    `Bharat OS mesh-contribution statement — ${summary.month}`,
    ``,
    `Total payout:    ${fmt(summary.totalPaise)}`,
    `Working days:    ${summary.dailyTimeline.length}`,
    `Events recorded: ${summary.eventCount}`
  ];
  const wlEntries = Object.entries(summary.byWorkload).filter(([, p]) => p > 0);
  if (wlEntries.length > 0) {
    lines.push(``, `Breakdown by workload:`);
    for (const [type, paise] of wlEntries) {
      lines.push(`  ${type.padEnd(18)} ${fmt(paise)}`);
    }
  }
  return lines.join('\n');
}
