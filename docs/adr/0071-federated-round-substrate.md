# ADR 0071: Phase 3.0 — §7f Federated Learning Round Substrate

## Status

Accepted

## Context

§7f names a federated learning mesh as a Phase 3 commitment: *"the
model trains on-device using the user's own data; only encrypted
gradient updates (with differential privacy noise) leave the
device."* It also lists what stays explicitly forbidden — silent
harvesting, training on L5 memory, selling training-set access,
inferring opt-in from general consent.

The §7b mesh node daemon, the §7e router, the L4 consent ledger,
and the §13B fiat-credit settlement already exist as primitives.
§7f said: *"a federated training round is just another workload
class on the same substrate."*

Phase 3.0 is the substrate, not the training math. The artifact
ships the lifecycle, consent contract, signed-update protocol, and
aggregation determinism so Phase 3.1+ (TensorFlow.js / ONNX
Runtime Web on-device training) can plug in without redesigning
the protocol.

## Decision

### Artifact — `src/phase1/federated-round.mjs`

Pure functions, no I/O:

- **`createFederatedRound({ createdBy, modelName, baselineModelHash,
  maxParticipants, maxEpsilon, payoutPaisePerUpdate,
  deadlineSecondsFromNow })`** — researcher-issued. Returns a
  versioned round object in `created` state with a deterministic
  `roundId`.
- **`openRound(round)`** — `created → accepting_updates`.
- **`createGradientUpdate({ roundId, contributorId,
  baselineModelHash, gradientHash, differentialPrivacyEpsilon,
  sampleCount })`** + **`signGradientUpdate(update,
  contributorIdentity)`** — every update is Ed25519-signed by the
  contributor (same primitive as consents and worker
  authorizations).
- **`submitGradientUpdate({ round, update, consents, publicRecords })`**
  enforces six gates atomically:
  1. round is `accepting_updates`
  2. deadline hasn't passed
  3. `updateCount < maxParticipants`
  4. baselineModelHash matches the round
  5. `differentialPrivacyEpsilon <= maxEpsilon`
  6. update signature verifies against the contributor's public
     record
  7. an active **donation-purpose** consent exists for this
     contributor and round
- **`aggregateRound(round, updates)`** — `accepting_updates →
  completed`. Computes a deterministic `aggregatedModelHash` from
  the sorted gradient hashes (the real Phase 3.1+ aggregation will
  replace this with TF.js federated averaging; the contract — one
  hash out per round — stays the same).
- **`expireRound(round)`** — idempotent past-deadline transition
  to `expired`.

### Donation consent — distinct from workflow consent

§7f explicitly says *"each donation chunk needs its own L4 consent
artifact."* The substrate enforces this:

```js
DONATION_CONSENT_PURPOSE = 'federated_donation';
DONATION_CONSENT_SCOPES  = ['training.donate', 'consent.record'];
```

`submitGradientUpdate` refuses any consent whose `purpose` is not
exactly `federated_donation`, even if the scopes line up. A general
`tenant_verification` consent with the right scopes does **not**
satisfy the donation requirement. The consent can optionally be
scoped to a specific `roundId` via `constraints.roundId` so a user
can grant *"this one round only"*.

### Mesh workload class — `federated_round`

`MESH_WORKLOAD_TYPES` (mesh-contribution.mjs) gains
`'federated_round'`. The new class carries its payout from the
round (`payoutPaisePerUpdate`, default ₹2 = 200 paise) rather than
deriving from tokens/bytes, so the same `mesh-contribution-event`
shape works for federated participation. The shell mesh ticker
surfaces it the same way it surfaces inference / storage earnings.

### Server — three new routes + a demo-mode convenience

- `GET /api/federated/rounds` — list active rounds (describeRound
  shape only; no contributor PII).
- `POST /api/federated/rounds` — researcher-side create + open.
- `POST /api/federated/rounds/:id/updates` — contributor submits a
  pre-signed update (Phase 2b path once private keys live in the
  device hardware keystore).
- `POST /api/federated/rounds/:id/aggregate` — closes the round
  and emits `aggregatedModelHash`.

Plus a demo-mode convenience:

- `POST /api/federated/rounds/:id/updates/sign-and-submit` —
  server signs + submits in one call. Documented as Phase 2a
  scaffold; Phase 2b removes it once the contributor private key
  is no longer server-side (per ADR 0066's vault-snapshot
  warning).

### Store — `src/phase0/store.mjs`

Two new directories under the store root: `federated-rounds/` and
`federated-updates/`. Methods: `saveFederatedRound`,
`readFederatedRound`, `listFederatedRounds`, `saveFederatedUpdate`,
`listFederatedUpdates`. Every save also appends a ledger event
(`federated_round.saved` / `federated_update.saved`) for §17 audit.

### Shell card — *"🧪 Federated rounds — §7f opt-in training"*

Listed under the mesh node card (same row group as the §13B
ticker). Shows active rounds with model name, per-update payout,
ε cap, contributor count / max, and deadline. *Join round* button
mints a donation consent, computes a placeholder gradient hash on
the client (the Phase 3.1+ training math will replace this), then
calls the server demo-mode `/sign-and-submit` route. On accept,
refreshes the mesh ticker to show the federated earning.

Service worker cache `v17 → v18`.

## §15 bindings — how each is preserved

| §15 binding | Resolution |
|---|---|
| No training on user data without consent | Each update requires a `federated_donation` consent. Workflow consents don't qualify. The roundId constraint scopes the consent if the user wants per-round granularity. |
| Pointer, not payload | Server stores gradient *hashes*, never gradient vectors. The L4 ledger records hash + DP epsilon + payoutPaise, no plaintext. |
| Differential privacy enforced | Round declares `maxEpsilon`; the substrate refuses any update exceeding it. The running `epsilonSpent` total is on the round so a researcher can monitor cumulative privacy spend. |
| Workers / users never pay | Researchers fund rounds (`payoutPaisePerUpdate`); contributors earn UPI credits via the mesh ticker. Per-update default is ₹2 — orthogonal to inference/storage earnings, additive to the §13B ticker. |
| Identity is the person, not the device | Updates are signed by the contributor identity, valid on any of their paired devices. |
| Aadhaar optional, never mandatory | The substrate makes no Aadhaar reference. |
| Never sell user data | Contributor payment is in fiat UPI credits, not in training-set access or data-sharing arrangements. |

## Tests

`tests/node/federated-round.test.mjs` — 11 focused tests:

1. round id is deterministic, version-stamped, defaults set
2. lifecycle round-trip: created → accepting_updates → completed
3. donation-purpose consent is required (workflow consent rejected)
4. unsigned updates rejected
5. updates exceeding `maxEpsilon` rejected
6. updates with wrong `baselineModelHash` rejected
7. updates past the round deadline rejected
8. aggregation is order-independent (sorted gradient hashes)
9. `expireRound` only fires past the deadline
10. `mesh_contribution` accepts `federated_round` workload class with
    explicit `payoutPaise`
11. `maxParticipants` cap enforced

`mesh-contribution.test.mjs` updated for the new workload type in
the `MESH_WORKLOAD_TYPES` snapshot test.

Full suite: **241 / 241 green** (was 230; +11 new).

## Consequences

- §7f is now a real substrate, not just doc. A researcher can
  POST a round, contributors can submit updates, the round
  aggregates, and the audit trail is complete.
- The mesh ticker now shows three earning sources (inference,
  storage, federated) with the same UI — no shell change beyond
  the new card.
- The donation-consent gate is explicit and refuses to be smuggled
  through workflow consents. The §15 binding holds at the L4
  policy layer, not just in the doc.
- The substrate is small enough (one artifact + one new workload
  class + four routes + one shell card) that Phase 3.1+ training
  integration is purely additive — swap the placeholder client
  gradient hash for a real on-device TF.js gradient, and the rest
  of the substrate works unchanged.
- 241 / 241 tests, SW cache to v18.

## Future hardening (Phase 3.1+)

- **Real on-device training** via TensorFlow.js or ONNX Runtime
  Web. The placeholder client gradient hash becomes a real
  gradient vector hash computed after one local epoch on the
  user's data.
- **Aggregation algorithm**: replace the sorted-hashes
  deterministic combiner with federated averaging (FedAvg) or a
  variance-aware aggregator. The contract — one
  `aggregatedModelHash` out — stays the same.
- **DP noise injection** library on the client. Today the
  `differentialPrivacyEpsilon` is a claim; Phase 3.1 makes it a
  verifiable post-condition by emitting the noise from a known
  library and the server checks the claim against the gradient
  hash distribution.
- **Push notifications** when a new round opens that matches the
  user's interests / device class.
- **Secure aggregation** (cryptographic) so the server can compute
  the aggregate without seeing any single update — multi-party
  computation on top of the substrate.
- **Move `sign-and-submit` to client-only** once Phase 2b's
  hardware-keystore lands; the demo-mode shortcut goes away.
