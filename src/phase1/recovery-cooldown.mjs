// Post-recovery cooldown — Phase 5.2.
//
// SIM-swap defense layer on top of Phase 5.0 account recovery.
//
// Threat model: an attacker who SIM-swaps a user's phone number can
// complete the Phase 5.0 recovery flow (phone → OTP → bundle) and
// receive the identity's privateKey + vaultKey. Phase 5.0 audits
// the recovery (`account_recovery.completed` ledger event) so an
// after-the-fact correlation across phone ranges can surface the
// attack — but that's detection, not prevention. Once the bundle
// is in the attacker's hands, an irreversible action (sending money,
// granting a trust attestation, deleting the identity) closes the
// window faster than ops can react.
//
// The cooldown reduces the blast radius. After a successful
// recovery, the identity carries `recoveryCooldownUntil` for the
// next 24 hours. Sensitive endpoints refuse during that window
// with HTTP 423 + the cooldown countdown. The legitimate user can
// still read their data, browse, and re-authenticate on other
// surfaces; only the irreversible actions are gated.
//
// §15 bindings:
//
//   • The cooldown flag is on the public identity record. It is
//     NOT PII — it's a boolean(+timestamp) about account state, not
//     about the user. Verifiers + paired devices can see it.
//
//   • Routing recovery/start to the no-match sentinel during an
//     active cooldown PRESERVES anti-enumeration: an attacker who
//     SIM-swapped a phone once cannot use a second recovery probe
//     to learn the account is in cooldown (which would itself
//     confirm the prior recovery succeeded). The sentinel response
//     stays identical.

export const RECOVERY_COOLDOWN_PROTOCOL_VERSION = 'bos.phase1.recovery-cooldown.v0';

// 24 hours. Long enough that an alerted user can rebind from a
// trusted device + ops can detect the SIM-swap pattern; short
// enough that a legitimate single-device recovery doesn't strand
// the user. Tunable later per identity tier if we add high-value
// accounts.
export const DEFAULT_RECOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Scopes — informational only, carried in the error so the API
// handler can return a specific message + the UI can explain WHAT
// is paused.
export const COOLDOWN_SCOPES = Object.freeze({
  IDENTITY_DELETION: 'identity_deletion',
  RECOVERY_RESTART: 'recovery_restart',
  TRUST_ATTESTATION_GRANT: 'trust_attestation_grant',
  SENSITIVE_ACTION: 'sensitive_action'
});

function toMs(at) {
  if (typeof at === 'number') return at;
  if (typeof at === 'string') {
    const parsed = Date.parse(at);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (at instanceof Date) return at.getTime();
  throw new Error('at must be a Date, number, or ISO string.');
}

// Apply a fresh cooldown to an identity. Returns a NEW identity
// object (pure function — caller persists via store.saveIdentity).
export function applyRecoveryCooldown(
  identity,
  { at = Date.now(), ttlMs = DEFAULT_RECOVERY_COOLDOWN_MS, reason = 'account_recovery' } = {}
) {
  if (!identity || typeof identity !== 'object' || !identity.id) {
    throw new Error('identity is required.');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('ttlMs must be a positive number.');
  }
  const atMs = toMs(at);
  const untilMs = atMs + ttlMs;
  return {
    ...identity,
    recoveryCooldown: {
      protocolVersion: RECOVERY_COOLDOWN_PROTOCOL_VERSION,
      reason,
      activatedAt: new Date(atMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      ttlMs
    }
  };
}

// Compute current cooldown state. Returns an object describing
// whether the cooldown is active + when it expires.
export function cooldownState(identity, { at = Date.now() } = {}) {
  const block = identity?.recoveryCooldown;
  if (!block || !block.until) {
    return { active: false, until: null, secondsRemaining: 0, reason: null };
  }
  let untilMs;
  try {
    untilMs = toMs(block.until);
  } catch {
    return { active: false, until: null, secondsRemaining: 0, reason: null };
  }
  const atMs = toMs(at);
  if (untilMs <= atMs) {
    return {
      active: false,
      until: block.until,
      secondsRemaining: 0,
      reason: block.reason ?? null
    };
  }
  return {
    active: true,
    until: block.until,
    secondsRemaining: Math.ceil((untilMs - atMs) / 1000),
    reason: block.reason ?? null
  };
}

// Throw with code 'RECOVERY_COOLDOWN_ACTIVE' if the identity is
// currently cooling down. Scope is informational — carried on the
// error so the API handler can format a specific message.
export function assertNoCooldown(
  identity,
  { at = Date.now(), scope = COOLDOWN_SCOPES.SENSITIVE_ACTION } = {}
) {
  const state = cooldownState(identity, { at });
  if (!state.active) return;
  const error = new Error(
    `Action blocked by recovery cooldown — ${state.secondsRemaining}s remaining ` +
      `until ${state.until}. Scope: ${scope}.`
  );
  error.code = 'RECOVERY_COOLDOWN_ACTIVE';
  error.scope = scope;
  error.until = state.until;
  error.secondsRemaining = state.secondsRemaining;
  error.reason = state.reason;
  throw error;
}

// Clear the cooldown (used by tests + ops tooling that needs to
// override the cooldown — e.g., the user proved identity via a
// secondary channel and ops manually clears).
export function clearRecoveryCooldown(identity) {
  if (!identity || typeof identity !== 'object') {
    throw new Error('identity is required.');
  }
  const { recoveryCooldown: _drop, ...rest } = identity;
  return rest;
}
