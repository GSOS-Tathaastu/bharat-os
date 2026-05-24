# ADR 0075: Phase 2a.24 — Seed-Demo Refresh for Post-2a.18 Surfaces

## Status

Accepted

## Context

`scripts/seed-demo.mjs` was written for the Phase 1.37-1.42
surfaces and last meaningfully extended in Phase 2a.7. Across
Phase 2a.13 through 3.1 the substrate grew five new persisted
artifact types:

| Phase | Artifact | First-run shell shows |
|---|---|---|
| 2a.13 | mesh contribution events | mesh ticker stuck at ₹0.00 |
| 2a.22 | signed trust attestations | empty Attestations panel in console |
| 3.0 | federated rounds + updates | "No active rounds" on the federated card |
| 3.1 | (uses federated round artifacts) | nothing to train against, no payout history |

An investor running `node scripts/seed-demo.mjs` then
`node bin/bos-api.mjs --store .demo-bharat-os` saw the §1
narrative everywhere except the *new* surfaces — which read as
empty, even though the substrate behind them was working. The
first 60 seconds of the demo were misleading: cards that would
*actually* be the punch line in a real deployment opened blank.

## Decision

Extend `seed-demo.mjs` with three new sections, mirroring the
Phase 2a.13 / 2a.22 / 3.0 substrates. Idempotency preserved
(the script still `rm -rf`s the store first); seed totals
extended from 6 orchestrations + 0 attestations + 0 mesh events
+ 0 rounds to 6 + 2 + 8 + 1.

### §13A #7 attestations — two seeded

- **Sita → Kothrud Landlord** (Pune, 14 days, tenant verification,
  income band `INR_50K_75K_MONTHLY`).
- **Lakshmi → Apollo Clinic** (Coimbatore, 30 days, employer
  onboarding).

Both flow through the real orchestration path (mint consent →
orchestrateIntent → `trust_passport_attestation` tool →
`signTrustAttestation`), so the operator console *Verify* button
exercises the actual signature verifier against the actual public
record. The /verify/ page works against either attestation
immediately on first run.

### §13B mesh contribution events — eight seeded

A day's worth of cross-workload events across the three operator
identities:

- **Priya** — 4 events spanning 2-11h ago (inference + 2 GB
  storage_serve), so the mesh ticker shows non-zero ₹ on her
  profile load.
- **Rajesh** — 3 events (large storage_serve, storage_store
  proration, light inference).
- **Suresh** — 1 event (light inference; he's primarily a cab
  driver).

Backdating via `at: <hoursAgo>` so the daily brief's horizon
window catches recent contributions and the *"your phone earned
₹X overnight"* line renders rich text on Priya's profile.

### §7f federated round — one active + one update seeded

- Round `intent-classifier-head-v1`, created by Sita (acting as
  researcher for demo purposes; production rounds would be
  Bharat OS Core-issued), 50 max participants, ε ≤ 0.5, ₹2 per
  update, 7-day deadline.
- **Priya** auto-donates one signed gradient update at ε=0.3
  with `gradientHash: sha256:seeded-priya-update-2026-05-23`.
  The matching `federated_round` mesh contribution event mints
  the ₹2 payout into her ticker.

The shell *Federated rounds* card now shows the active round on
first load; an investor can tap *Join round* on a different
profile (e.g. Rajesh) to trigger the real Phase 3.1 on-device
training math and add a second update.

## §15 bindings preserved

The seed runs every artifact through its real signing /
verification path. No artifacts are written with shortcut data:

- Attestations go through `signTrustAttestation` and are saved
  via `store.saveAttestation`, hitting the same code path as the
  orchestration API.
- Federated updates go through `signGradientUpdate` +
  `submitGradientUpdate`, which enforces all six gates (donation
  consent, signature, ε cap, baseline match, deadline,
  max-participants).
- Mesh contribution events use `createMeshContributionEvent` with
  the actual workload class — no manual receipt construction.

The ledger sees every event the same way it would in production
(`attestation.saved`, `federated_round.saved`,
`federated_update.saved`, `mesh_contribution.recorded`), so the
§17 audit panel reads as a normal session.

## Tests

No new tests — `seed-demo.mjs` is a shell script around already-
tested artifact functions. The full suite still passes:

**261 / 261 green** (unchanged from 3.1).

## Consequences

- **First 60 seconds of the demo opens populated.** The Trust
  Passport card shows non-zero attestations, the mesh ticker
  shows ₹ history, the federated card shows an active round.
  Every Phase 2a.18-3.1 surface has something visible.
- **`/verify/?attestationId=…` works on first run.** An investor
  can grab one of the two seeded attestation IDs from the
  operator console and open the verifier page in a second
  browser, no extra setup.
- **Real Phase 3.1 training has labeled samples.** Joining the
  federated round from a different profile triggers
  `gatherLocalTrainingSamples`, which now finds 6+ historical
  orchestrations to train against — the gradient is real, not a
  warm-up corpus.
- **Daily brief renders rich text on every profile.** The mesh
  contribution events fall inside the brief's 24h horizon, so
  Priya's brief reads *"Your mesh node earned ₹X across 4
  contributions"* instead of *"idle in the last window."*
- **Backward-compatible.** Existing stores still load; the new
  seeds only fire on `rm -rf` + re-run. No migration needed.

## Future polish

- Generate a *richer per-profile orchestration backlog* (10-20
  per profile across action types) so the Phase 3.1 federated
  training converges meaningfully across users, not just the
  warm-up corpus.
- Seed a few **expired attestations** so the verifier page's
  `EXPIRED` badge state is reachable in the demo without waiting
  14 days.
- Seed a **completed federated round** with an
  `aggregatedModelHash` so the console *Aggregate* button isn't
  the only path to seeing one.
- Seed **§9A flag reports** with mixed statuses (open,
  under_review, resolved, dismissed) so the operator console
  flag panel exercises every status pill.
- Seed **vault transfer history** (signed pairing-session
  completion events) once Phase 2b moves keys to the hardware
  keystore.
