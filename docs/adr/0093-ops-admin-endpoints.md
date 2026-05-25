# ADR 0093: Phase 5.7 — Ops Admin Endpoints (Circuit Reset, Cooldown Override, Manual Snapshot)

## Status

Accepted

## Context

Phases 5.2, 5.4, and 5.5 each introduced helpers that were exported
from their modules but never wired to HTTP. Specifically:

- `resetCircuit(name?)` — Phase 5.4 — clears a provider's circuit
  breaker state so the operator can lift a cooldown after the
  vendor confirms recovery without waiting 30s for the natural
  half-open probe.
- `clearRecoveryCooldown(identity)` — Phase 5.2 — drops the 24h
  post-recovery cooldown after the operator verifies the user's
  identity via a secondary channel.
- `store.snapshotTo(targetPath)` — Phase 5.5 — produces a
  point-in-time backup. Only callable by the cron job today.

For all three, the only path to invoke them in production was to
ssh into the host and run a one-off Node script. This is
operationally awful for incident response: by the time an SRE
gets shell access, the SIM-swap window has progressed; by the
time they ssh in before a planned migration, the maintenance
window is half-burned.

Phase 5.7 ships three thin HTTP wrappers around the existing
helpers + a shared auth gate. Now ops can react via a curl from
a jumphost.

## Decision

### `BHARAT_OS_ADMIN_TOKEN` shared-secret gate

New module `src/phase0/admin-auth.mjs`. Authenticates admin
endpoint requests via `Authorization: Bearer <token>` against
`process.env.BHARAT_OS_ADMIN_TOKEN`. Implementation details:

- **Constant-time string compare** in `constantTimeEquals` to
  resist timing-attack token discovery. Always compares the full
  string; differential-timing analysis can't learn anything from
  request latency.
- **Minimum 16-character token** enforced at the gate. Anything
  shorter triggers 503 `admin_disabled` so a typo in the env
  doesn't accidentally degrade security.
- **Unset token → 503 `admin_disabled`.** The safe default. A
  deploy that forgets to set `BHARAT_OS_ADMIN_TOKEN` can't
  accidentally expose admin endpoints — they're off until
  explicitly configured.
- **Operator attribution via `X-Bharat-Os-Operator: <name>`
  header.** Defaults to `unattributed-operator` when missing.
  Truncated to 80 chars. Recorded in every audited ledger event
  so the audit trail names the human.

Why shared-secret rather than mTLS or signed JWT:

- The admin endpoints are operational — they're called from a
  known IP space (an ops jumphost or a CI runner) during
  incident response, not by user traffic.
- Compromise of the token means an attacker can lift a SIM-swap
  cooldown or reset a circuit. Both are AUDITED via typed ledger
  events. An unauthorised override is *visible* after the fact —
  the security model is "defense in depth: audited, rate-limited,
  rotatable" rather than "uncompromisable."
- Rotation is a deploy-time env-var update. Documented as
  quarterly + after any suspected leak.

### Three admin endpoints

**`POST /api/admin/sms/circuit/reset`** — body
`{ provider?: string }`. With `provider`, resets that one
breaker; without, resets all. Emits `sms.circuit.reset` ledger
event:

```json
{
  "type": "sms.circuit.reset",
  "provider": "gupshup",
  "operator": "sre-on-call",
  "at": "2026-05-25T11:00:00.000Z"
}
```

**`POST /api/admin/identities/:id/recovery-cooldown/clear`** —
body `{ reason: string }` (>= 8 chars). Verifies the identity
exists, calls `clearRecoveryCooldown`, persists, and emits
`cooldown_override.applied`:

```json
{
  "type": "cooldown_override.applied",
  "identityId": "bos:person:abc…",
  "operator": "sim-swap-incident-ops",
  "reason": "user confirmed identity via secondary channel call",
  "priorCooldownUntil": "2026-05-26T11:00:00.000Z",
  "at": "2026-05-25T11:00:00.000Z"
}
```

The 8-character reason minimum is a friction-by-design choice —
an empty `reason` lifts a security-relevant gate; making the
operator articulate it improves the audit trail and reduces
mistakes.

**`POST /api/admin/backup/snapshot`** — body `{ keep?: number }`
(default 7). Triggers an immediate snapshot (instead of waiting
for the cron). Uses the same `snapshotTo` → `verifyIntegrity` →
`applyRetention` pipeline as the CLI. On integrity failure,
discards the corrupt snapshot and preserves prior good ones (same
behaviour as the cron). Emits `backup.snapshot.created`:

```json
{
  "type": "backup.snapshot.created",
  "kind": "sqlite",
  "bytes": 376832,
  "targetPath": "/data/backups/bos-store-…sqlite",
  "operator": "pre-migration-check",
  "trigger": "admin_endpoint",
  "at": "2026-05-25T11:00:00.000Z"
}
```

### Rate-limit policy

All three admin endpoints fall under the existing `write`
rate-limit policy (30/min) via the default `policyFor` dispatch —
no new policy needed. Incident response makes a few calls per
minute, not hundreds. The shared-secret token + audit trail are
the primary controls; rate-limiting is belt-and-braces against
a token leak.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Every admin action is audited | Three typed ledger events: `sms.circuit.reset`, `cooldown_override.applied`, `backup.snapshot.created`. Each names the operator + carries the why. A compromised token is detectable post-hoc; the audit doesn't depend on the token being uncompromised. |
| No PII in admin responses | Responses include identity IDs (already a stable public reference), file paths, timestamps — never displayName / phone / email. The cooldown-clear response surfaces `priorCooldown` state but not user-personal data. |
| Identity-resolution via existing readIdentity | Phase 5.7 doesn't introduce a new lookup path. Same `store.readIdentity` used by every other identity-touching endpoint, so the same §15 PII-discipline rules apply. |
| Safe-by-default | Token unset → 503. A deploy that doesn't configure admin auth simply doesn't have admin endpoints. The endpoints don't accidentally activate. |

## Tests

`tests/node/admin-auth.test.mjs` — 17 tests:

**`requireAdminToken` unit** (8 tests):
1. Refuses when `BHARAT_OS_ADMIN_TOKEN` is unset (503
   `admin_disabled`)
2. Refuses when token < 16 chars
3. Refuses without `Authorization` header (401
   `missing_authorization`)
4. Refuses with wrong token (401 `invalid_token`)
5. Returns operator label on success
6. Returns `unattributed-operator` when header missing
7. Truncates operator label to 80 chars
8. Accepts case-insensitive `bearer` prefix

**`checkAdminAuth` wrapper** (3 tests):
9. Writes 503 + returns null when token unset
10. Writes 401 + returns null when token wrong
11. Returns auth object on success

**End-to-end via real HTTP** (6 tests):
12. Admin endpoints respond 503 `admin_disabled` when token unset
13. Admin endpoints respond 401 with wrong token
14. `POST /api/admin/sms/circuit/reset` resets + emits ledger event
15. `POST /api/admin/identities/:id/recovery-cooldown/clear`
    requires reason >= 8 chars
16. `POST recovery-cooldown/clear` clears cooldown + audits the
    override with operator + reason
17. `POST /api/admin/backup/snapshot` produces a verified-integrity
    snapshot on disk + emits ledger event

The 6 end-to-end tests boot the real `createPhase0ApiServer`
against a fresh `SqliteStore` on a random port and make real
`fetch` calls — the first API-server boot tests in this codebase,
which is itself a small infrastructure step.

Full suite: **484 / 484 green** (was 467; +17 new). No SW change
(server-side only).

## Consequences

- **SIM-swap incident response is now a 1-minute SRE flow.** Curl
  from the jumphost: `POST /api/admin/identities/<id>/recovery-
  cooldown/clear` with the verified-via-phone-call reason in the
  body. The legitimate user is back in immediately; the override
  is in the audit ledger.
- **Vendor outage recovery is one curl.** When MSG91 confirms
  they're back up, `POST /api/admin/sms/circuit/reset` with
  `{ provider: "msg91" }` clears the breaker. The next OTP send
  goes via MSG91 instead of falling through to Twilio.
- **Planned-migration snapshots are operator-initiated.** Before
  any maintenance window, the SRE hits `POST /api/admin/backup/
  snapshot` to capture a known-good state. Integrity check runs
  inline; ledger event records who took it and when.
- **Compromise of `BHARAT_OS_ADMIN_TOKEN` is detectable.** Every
  admin action is in the ledger with an operator label. Even if
  the label is forged, the action itself + its timestamp creates
  forensic evidence. An attacker can't silently override the
  defenses; they leave a trail.
- **Backward-compatible.** No existing route changed. Deploys
  without `BHARAT_OS_ADMIN_TOKEN` simply get 503s on the new
  paths.

## Future polish

- **Signed JWT auth** — replace the shared secret with an
  asymmetric scheme: ops carries a private key, server validates
  via the public key. Compromise of the server's stored key set
  doesn't leak the credentials. Requires ops-key management
  infrastructure.
- **Per-endpoint policy** — currently any valid token can hit any
  admin endpoint. A scoped policy (e.g.
  `cooldown:clear`, `backup:snapshot`, `sms:reset`) would let ops
  hand out narrower credentials to junior responders.
- **mTLS** — replace bearer-token with client-cert auth on a
  separate listener bound to the jumphost VLAN. Highest-bar
  option; adds deploy complexity (cert lifecycle, rotation
  tooling).
- **Slack-bot integration** — wrap the curl with a slash command
  that posts the audit-ledger summary to an ops channel. Useful
  when incident response is multi-person.
- **Cooldown-clear push notification to the user** — when ops
  lifts a cooldown, push to the user's other paired devices
  ("operator-overridden recovery cooldown — was this you?"). Ties
  into the paired-device push work scheduled for a later phase.
- **Per-operator audit dashboard** — `/api/admin/audit?operator=…`
  returns the ledger events that operator authored across the
  three event types. Useful for periodic operator-action reviews.
