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

export const MESH_WORKLOAD_TYPES = ['inference', 'storage_serve', 'storage_store'];

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

function computePayoutPaise({ workloadType, tokens, bytes }) {
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
  at = nowIso()
}) {
  if (!operatorId) throw new Error('operatorId is required.');
  if (!MESH_WORKLOAD_TYPES.includes(workloadType)) {
    throw new Error(`workloadType must be one of: ${MESH_WORKLOAD_TYPES.join(', ')}`);
  }
  if (workloadType === 'inference' && !Number.isFinite(Number(tokens))) {
    throw new Error('inference events require a numeric tokens count.');
  }
  if (workloadType !== 'inference' && !Number.isFinite(Number(bytes))) {
    throw new Error('storage events require a numeric bytes count.');
  }

  const payoutPaise = computePayoutPaise({ workloadType, tokens, bytes });

  const core = {
    protocolVersion: MESH_CONTRIBUTION_PROTOCOL_VERSION,
    objectType: 'mesh-contribution-event',
    operatorId,
    nodeId: nodeId ?? null,
    workloadType,
    tokens: workloadType === 'inference' ? Number(tokens) : null,
    bytes: workloadType === 'inference' ? null : Number(bytes),
    peerId: peerId ?? null,
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
