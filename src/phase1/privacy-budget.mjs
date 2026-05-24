// §7f privacy-budget accountant — Phase 3.2.
//
// Phase 3.1 (ADR 0074) makes per-update DP epsilon real; the round
// declares `maxEpsilon` and `submitGradientUpdate` refuses anything
// over it. But §7f's binding is *cumulative* — a contributor who
// joins twenty rounds at ε=0.5 each has spent ε=10 in privacy
// budget, well past the single-round cap.
//
// This module is the substrate for tracking that cumulative spend
// per contributor across a rolling window, and refusing
// participation when the budget would be exceeded.
//
// §15 bindings:
//
//   • The accountant only reads the protocol-level metadata
//     (`contributorId`, `differentialPrivacyEpsilon`, `submittedAt`,
//     `accepted`). It does not touch the gradient hash or bytes —
//     no payload visibility.
//   • The default budget caps mirror the OWASP / privacy-research
//     community's *"reasonable monthly cap"* heuristic: ε = 8 over
//     30 days. Same defaults Google's Differential Privacy team
//     uses for Firefly accountants. Configurable via
//     `policy.privacy_budget.federated`.
//   • The refusal is local to the round (per-update veto) — no
//     external sanctions. A contributor over budget can wait for
//     the window to roll forward.

export const PRIVACY_BUDGET_PROTOCOL_VERSION = 'bos.phase1.privacy-budget.v0';

// Sensible defaults; the federated round substrate will pass these
// into `assertWithinBudget` unless callers override.
export const DEFAULT_FEDERATED_BUDGET = {
  windowHours: 720, // 30 days rolling
  epsilonCap: 8.0
};

function hoursAgoIso(hours, at = new Date().toISOString()) {
  return new Date(new Date(at).getTime() - hours * 60 * 60 * 1000).toISOString();
}

// Compute a contributor's running ε spend across `updates` in the
// last `windowHours`. Only accepted updates count — a rejected
// submission cost the user nothing. Returns `{ epsilonSpent,
// windowStart, updateCount, mostRecentAt }`.
export function computeBudgetUsage(
  contributorId,
  updates = [],
  { windowHours = DEFAULT_FEDERATED_BUDGET.windowHours, at = new Date().toISOString() } = {}
) {
  if (!contributorId) throw new Error('contributorId is required.');
  const windowStart = hoursAgoIso(windowHours, at);
  const windowStartMs = Date.parse(windowStart);
  const own = updates.filter(
    (u) =>
      u.contributorId === contributorId &&
      u.accepted === true &&
      Number.isFinite(Number(u.differentialPrivacyEpsilon)) &&
      Date.parse(u.submittedAt ?? '') >= windowStartMs
  );
  const epsilonSpent = own.reduce(
    (sum, u) => sum + Number(u.differentialPrivacyEpsilon),
    0
  );
  const mostRecentAt = own
    .map((u) => u.submittedAt)
    .sort()
    .pop() ?? null;
  return {
    protocolVersion: PRIVACY_BUDGET_PROTOCOL_VERSION,
    contributorId,
    windowHours,
    windowStart,
    epsilonSpent,
    updateCount: own.length,
    mostRecentAt
  };
}

// Predicate: would accepting an update at `requestedEpsilon` push
// this contributor over `epsilonCap`? Returns
// `{ wouldExceed, currentSpend, requestedEpsilon, projectedSpend,
//   epsilonCap, windowHours }`.
export function projectBudget(
  contributorId,
  updates,
  requestedEpsilon,
  {
    windowHours = DEFAULT_FEDERATED_BUDGET.windowHours,
    epsilonCap = DEFAULT_FEDERATED_BUDGET.epsilonCap,
    at = new Date().toISOString()
  } = {}
) {
  if (!Number.isFinite(Number(requestedEpsilon)) || Number(requestedEpsilon) <= 0) {
    throw new Error('requestedEpsilon must be a positive finite number.');
  }
  const usage = computeBudgetUsage(contributorId, updates, { windowHours, at });
  const projectedSpend = usage.epsilonSpent + Number(requestedEpsilon);
  return {
    wouldExceed: projectedSpend > epsilonCap,
    currentSpend: usage.epsilonSpent,
    requestedEpsilon: Number(requestedEpsilon),
    projectedSpend,
    epsilonCap,
    windowHours,
    updateCount: usage.updateCount,
    mostRecentAt: usage.mostRecentAt
  };
}

// Throws if the projected spend would exceed the cap. Used inside
// `submitGradientUpdate` to enforce the budget at submission time.
export function assertWithinBudget(contributorId, updates, requestedEpsilon, options = {}) {
  const projection = projectBudget(contributorId, updates, requestedEpsilon, options);
  if (projection.wouldExceed) {
    const error = new Error(
      `privacy budget exhausted: contributor would spend ε=${projection.projectedSpend.toFixed(3)} ` +
        `(cap ${projection.epsilonCap}) over the last ${projection.windowHours}h. ` +
        `Currently spent ε=${projection.currentSpend.toFixed(3)} across ${projection.updateCount} update(s).`
    );
    error.code = 'PRIVACY_BUDGET_EXHAUSTED';
    error.projection = projection;
    throw error;
  }
  return projection;
}
