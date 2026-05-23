# ADR 0073: Phase 2a.23 — Operator Console Catch-Up

## Status

Accepted

## Context

The operator console (`/console/`) drifted behind the user-facing
shell over Phase 2a.13 through 3.0. Five substantive substrates
shipped in the shell with no console surface:

| Phase | What | Console gap |
|---|---|---|
| 2a.13 | Mesh contribution loop | none — covered indirectly via Audit |
| 2a.17 | §7c encrypted vault transfer | none — covered indirectly via Audit |
| 2a.18 | Trust attestation tool | **missing** — no list, no verify action |
| 3.0 | §7f federated round substrate | **missing** — no list, no aggregate action |
| 2a.22 | Verifier round-trip | **missing** — no console-side verify trigger |

An operator opening the console couldn't see federated rounds in
flight or attestations issued, much less drive aggregation or run a
verification check. Investors touring the *"this is how Bharat OS
runs at scale"* view saw a Phase 1 console for a Phase 3 substrate.

## Decision

Add two panels to the console with sidebar nav entries between
Trust and Flags.

### Panel — *"§7f Federated Rounds — Phase 3.0"*

Reads `GET /api/federated/rounds`, filters by status (default:
`accepting_updates`). Table columns:

- Round ID (short)
- Model name
- Status pill (color-coded: green for active/completed, red for
  expired, amber for created-but-not-opened)
- Contributors `updateCount/maxParticipants`
- ε spent `epsilonSpent / maxEpsilon`
- Payout per update
- Deadline
- Action: *Aggregate* button when `status === 'accepting_updates'
  && updateCount > 0`; otherwise shows the truncated
  `aggregatedModelHash` once completed

The *Aggregate* button posts to
`/api/federated/rounds/:id/aggregate` and prints the resulting
round into the existing `decisionOutput` panel. Operator can also
filter by status via the dropdown.

### Panel — *"§13A #7 Trust Attestations — Phase 2a.22"*

Reads `GET /api/attestations` (the claim-body-free index). Table
columns:

- Attestation ID (short)
- Subject ID (short)
- Verifier name
- Purpose
- Issued / Expires (with red `EXPIRED` pill once past)
- Claim count
- Actions: *Verify* (calls `POST /api/attestations/:id/verify` and
  prints the discriminated result into `decisionOutput`) and *Open*
  (opens `/verify/?attestationId=…` in a new tab, exactly like a
  third-party verifier would)

### Sidebar nav additions

New entries between *Trust* and *Flags*:

```
Trust → Federated → Attestations → Flags
```

Mirrors the §17 mental model — Trust Passport, then the
attestations and rounds the user mints from it, then the §9A
flags that gate sensitive actions.

### CSS — minimal status-pill primitive

New `.status-pill` utility with color variants
(`status-accepting_updates`, `status-completed`,
`status-expired`, `status-created`). Reused in both panels and
available for future ones.

### Service worker

`bharat-os-console-v2 → v3`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Pointer, not payload | `GET /api/attestations` returns the index *without* the claims body — only `attestationId`, `subjectId`, `verifierName`, `purpose`, dates, and `claimCount`. The operator must explicitly *Verify* to see the disclosed bands/booleans, and even then only what the subject chose to disclose. |
| Identity is the person, not the device | Console reads through the same identity registry as the verify endpoint. |
| Never sell user data | The new panels surface only what already exists in the audit ledger + the user's signed envelopes. No new data captured. |
| Workers / users never pay | Aggregation and verification actions are operator-side and free. |

## Tests

No new tests — the new panels are UI consumers of existing API
routes (`/api/federated/rounds*` and `/api/attestations*`), both
already covered by Phase 3.0 (ADR 0071) and Phase 2a.22 (ADR
0072) test suites.

Full suite: **249 / 249 green** (unchanged from 2a.22). Console SW
to v3.

## Consequences

- The operator console now mirrors the user-facing shell's
  Phase 2a.18 / Phase 3.0 surfaces. An ops tour can demonstrate
  *"here's a user minting attestations, here's the verifier
  flow, here's a federated round closing"* in one window.
- The *Aggregate* action gives operators a one-click way to close
  a federated round at the end of its window. Useful for the demo
  ("watch me close this round and produce a new model hash") and
  for real ops once Phase 3.1+ ships actual training.
- The console *Open* link goes to `/verify/?attestationId=…` — same
  URL a real third-party verifier would use. Makes the two
  surfaces interchangeable in demos.
- The `status-pill` primitive is reusable for the next phase
  panels (when we add federated workload to the mesh panel, the
  vault transfer history, etc.).

## Future polish

- A *Create round* form so operators can mint demo federated
  rounds without leaving the console.
- A *Verify history* table that records every prior verify call
  so investors can see the audit trail.
- Real-time updates (SSE / WebSocket) instead of *Refresh*
  buttons, so a round filling up in real time animates in the
  console as contributors join.
- Mesh contribution panel — federated `payoutPaise` events are
  there but live alongside inference / storage in the audit
  ledger; a dedicated panel would surface them as a separate
  earning column.
- Daily brief signals dashboard — operator view of what users see
  in their morning brief (aggregate metrics, not per-user
  bodies).
