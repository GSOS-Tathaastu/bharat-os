# ADR 0076: Phase 3.2 — FedAvg + Privacy-Budget Accountant

## Status

Accepted

## Context

Phase 3.0 (ADR 0071) shipped the federated round substrate;
Phase 3.1 (ADR 0074) shipped real on-device gradient descent. Both
were *hash-only*: contributors trained locally, hashed the noisy
gradient, signed and submitted the hash. The server combined the
sorted hashes into a deterministic `aggregatedModelHash`, which is
a useful provenance receipt but **not a trainable signal**. A
researcher could not actually update the baseline model from a
completed round — they got a hash of hashes, not an averaged
gradient.

ADR 0074's *Consequences* section flagged this as a §15 trade-off:
*"If we want real FedAvg, contributors must ship encrypted
gradient bytes (not just hashes), which weakens pointer-not-
payload. We'd negotiate this via a separate 'explicit data
donation' round type."*

ADR 0071 also named the second gap: *"Privacy-budget accountant —
track cumulative ε per contributor across rounds, refuse
participation when the per-month budget is spent. Today the
per-update ε is enforced but the cumulative bound is not."*

Phase 3.2 ships both: FedAvg as an opt-in per-round mode with a
stricter consent purpose, plus a universal cumulative-ε
accountant.

## Decision

### Privacy-budget accountant — `src/phase1/privacy-budget.mjs`

Three pure functions:

- **`computeBudgetUsage(contributorId, updates, { windowHours })`**
  — sums ε from accepted updates in a rolling window. Returns
  `{ epsilonSpent, updateCount, windowStart, mostRecentAt }`.
- **`projectBudget(contributorId, updates, requestedEpsilon, opts)`**
  — predicts whether accepting a new update at `requestedEpsilon`
  would exceed the cap. Returns `{ wouldExceed, currentSpend,
  projectedSpend, ... }`.
- **`assertWithinBudget(...)`** — throws a structured error with
  `code: 'PRIVACY_BUDGET_EXHAUSTED'` and `projection` payload when
  the budget would be exceeded.

`DEFAULT_FEDERATED_BUDGET = { windowHours: 720, epsilonCap: 8.0 }`
— 30 days, ε=8. Mirrors the OWASP / Google differential-privacy
practitioner heuristic.

### Two aggregation modes on rounds

`createFederatedRound` gains:

- **`aggregationMode: 'hash_combiner' | 'fedavg'`** (default
  `'hash_combiner'` — backward-compatible). `fedavg` rounds
  require contributors to ship the gradient bytes alongside the
  hash.
- **`contributorBudget: { windowHours, epsilonCap }`** — per-round
  override of the global default. Defaults to the global cap if
  not set.

### Stricter consent purpose for bytes donation

```js
BYTES_DONATION_CONSENT_PURPOSE = 'federated_bytes_donation'
BYTES_DONATION_CONSENT_SCOPES  = [
  'training.donate',
  'training.donate_bytes',   // NEW
  'consent.record'
]
```

The existing `federated_donation` purpose continues to work for
`hash_combiner` rounds. A `federated_donation` consent does **NOT**
satisfy a `fedavg` round — the user must explicitly grant the
bytes-donation purpose, which the shell explains as *"BYTES-
donation consent (gradient bytes will travel)"* in the join flow.

### `submitGradientUpdate` enforces five new gates

On top of the Phase 3.0 set, Phase 3.2 adds:

1. **`fedavg` rounds require `gradientBytesBase64`** on the update.
2. **`fedavg` rounds require the bytes-donation consent.**
3. **`hash_combiner` rounds continue to accept the existing
   `federated_donation` consent.** No change for legacy callers.
4. **Cumulative privacy budget**: if `allUpdates` is passed,
   `assertWithinBudget` runs against the round's
   `contributorBudget`. Legacy callers that omit `allUpdates` skip
   the budget check (per-round `maxEpsilon` still applies, so they
   degrade safely).
5. **Canonical signed payload** excludes `gradientBytesBase64` —
   bytes are validated by the gradient hash they SHA-256 to (which
   IS in the payload), so signatures stay stable across mode
   switches and bytes don't bloat the signed text on hash-only
   rounds.

### `aggregateRoundFedAvg` — element-wise mean of gradient bytes

Decodes each accepted update's base64 bytes into `Float32Array`,
validates lengths match across all updates, computes the
element-wise mean, encodes the result back to base64. The
aggregated `Float32Array` is what a researcher feeds into a model
update: `baselineWeights -= learningRate * aggregatedGradient`.

The round's `aggregatedModelHash` becomes the SHA-256 of the
aggregated gradient bytes — verifier-checkable. Plus a new field
`aggregatedGradientBytesBase64` on the completed round carries the
actual bytes (Phase 3.2 — Phase 3.3+ could encrypt this so only
the researcher's key can decrypt).

`aggregateRound` dispatches to `aggregateRoundFedAvg` when the
round's mode is `fedavg`; backward compatible for `hash_combiner`.

### Important gotcha — Node `Buffer.slice` is a view

A first cut decoded base64 to `Buffer`, then did
`bytes.buffer.slice(...)`. Wrong — Node's `Buffer.slice` returns a
view into the shared 8KB pool, so a 16-byte gradient was decoded
as a 2048-float vector. Fix: copy into a fresh `ArrayBuffer`
before constructing the `Float32Array`. Documented inline.

### Server endpoint — `GET /api/federated/budget/:contributorId`

Returns `{ usage, projection }` so the shell can show *"ε X.X
spent / 8.0 (30-day)"* on the federated card without the user
having to attempt a join to find out they're over budget.
Optional `?requestedEpsilon=...&windowHours=...&epsilonCap=...`
query params control the projection.

The two existing `updates` routes now pass `allUpdates` to
`submitGradientUpdate` so the budget check fires in production.

### Shell updates

The federated card status line now reads
*"N active · ε X.XX / 8.0 (30-day)"* on profile load. Each round
row shows its mode badge: `FedAvg` (orange, "server averages
gradient bytes") or `hash-only` (green, "pointer-not-payload").
The join flow dispatches on mode — mints the correct consent
purpose and tells the user *"BYTES-donation consent (gradient
bytes will travel)"* before they tap through.

`composeFederatedUpdate({ includeBytes })` gains the option to
return the base64 gradient bytes alongside the hash; the shell
sets `includeBytes: true` only for `fedavg` rounds.

Service worker `v20 → v21`.

## §15 bindings — what changed, what didn't

| Binding | Hash-only mode | FedAvg mode |
|---|---|---|
| Pointer, not payload | Hash only — gradient bytes never leave the device. **Unchanged from Phase 3.0/3.1.** | Bytes travel, gated by explicit `federated_bytes_donation` consent. The user is told before granting that the gradient vector itself will be shipped. |
| Donation consent required per round | `federated_donation` purpose | `federated_bytes_donation` purpose (strictly more permissive) |
| Cumulative ε tracked | NEW — budget accountant universal across both modes |
| Per-round ε cap | Unchanged | Unchanged |
| Workers / users never pay | Unchanged | Unchanged |

The bytes-donation gate is the explicit §15 trade-off: we sacrifice
pointer-not-payload (in exchange for real FedAvg) only when the
user has explicitly granted a separate consent for that purpose.
A hash-only round and a fedavg round look the same in the round
list except for the mode badge; the consent prompt differs.

## Tests

### `tests/node/privacy-budget.test.mjs` — 9 tests

1. empty history → zero spend
2. sums only accepted updates from same contributor
3. excludes updates outside the window
4. projection reports cumulative spend correctly
5. flags exceeded budgets
6. structured error with `code: PRIVACY_BUDGET_EXHAUSTED`
7. returns projection when under cap
8. defaults match the ε=8 / 30-day heuristic
9. refuses non-positive `requestedEpsilon`

### `tests/node/federated-round.test.mjs` — 10 new (21 total)

1. `aggregationMode` defaults to `hash_combiner`; `fedavg` requires opt-in
2. `fedavg` round refuses update without bytes
3. `fedavg` round refuses hash-only-donation consent
4. `fedavg` round accepts bytes + bytes-donation consent
5. `aggregateRoundFedAvg` computes element-wise mean (verified by
   decoding back: (1+3)/2=2, (2+4)/2=3, etc.)
6. `aggregateRoundFedAvg` refuses to run on hash_combiner round
7. `aggregateRound` dispatches to fedavg when mode is `fedavg`
8. budget check enforced when `allUpdates` passed
9. budget check skipped when `allUpdates` omitted (legacy callers)
10. signature stays stable across hash_combiner ↔ fedavg
    (canonical payload is mode-agnostic)

Full suite: **280 / 280 green** (was 261; +19 new). SW cache to v21.

## Consequences

- **Phase 3 is now complete.** Hash-only rounds preserve §15
  strictest. FedAvg rounds produce a real averaged gradient a
  researcher can use to update a baseline model. Both gated by
  explicit consents the user can audit in the L4 ledger.
- **The privacy story extends from per-update to cumulative.** A
  contributor over budget cannot accidentally over-spend by
  joining many rounds. The shell shows the running tally so the
  user knows where they stand.
- **Backward compatibility holds.** Existing hash-only rounds work
  unchanged; legacy callers that don't pass `allUpdates` skip the
  budget check (per-round ε cap still binding). No migration
  required.
- **Demo posture**: an investor opening a fresh demo can pick a
  hash-only round (existing default) for the strict §15 story or
  open a fedavg round to show *"server averages gradients that
  the user explicitly granted bytes-donation consent for."*

## Future hardening (Phase 3.3+)

- **Secure aggregation** — encrypt the gradient bytes such that
  the server can compute the average without seeing any single
  update. Closes the residual §15 weakening in fedavg mode.
  Architecturally: SecAgg / Bonawitz et al. protocol or
  homomorphic encryption.
- **Per-contributor budget *across rounds across organisations*** —
  today the budget is tracked per Bharat OS instance. A
  multi-tenant federation needs cross-instance budget reconciliation.
- **DP accountant with composition** — current implementation
  sums ε naively; real accountants (RDP / zCDP) compose better
  and give tighter bounds.
- **Round-revocation** — let a contributor pull their gradient
  update before aggregation (would require keeping bytes encrypted
  with a per-contributor key until close, which dovetails with
  secure aggregation).
- **Verifier UI for aggregated gradients** — show a researcher the
  aggregated gradient stats (norm, max abs value, sample count
  weighted by sample count) so they can sanity-check before
  applying the update to the baseline.
- **Federated_round entries in the daily brief** — *"you joined
  Round X yesterday, earned ₹2, ε now 3.4/8 (30-day window)."*
