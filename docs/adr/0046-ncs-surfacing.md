# ADR 0046: Surface Net Contribution Score through API, CLI, and Trust Passport

## Status

Accepted

## Context

§13B makes the Net Contribution Score (NCS) load-bearing — it is the fair-
use lever that lets *"free for the masses"* be sustainable, the signal that
turns producers into earners and consumers into payers, and the centerpiece
of the investor unit-economics story. §17 (Phase 1 tie-off list) flagged
that NCS was computed by the Phase 0 simulator but exposed nowhere: no
API, no CLI, no Trust Passport field, no operator-console view. The
investor-demo argument did not exist beyond the doc.

## Decision

Phase 1.40 surfaces NCS for any identity through the existing primitives:

1. **`BosStore.computeContribution(identityId)`** — aggregates
   `node.storageBytes` across nodes the identity operates and
   `memoryRecord.plaintextBytes` across records the identity owns;
   delegates to the existing `netContributionScore()` in `phase0/core.mjs`
   to compute `scoreBytes` and the `producer | consumer` class.

2. **`GET /api/identities/:identityId/contribution`** — returns the
   contribution block for a single identity.

3. **`bos contribution show --identity-id ID`** — CLI surface for the
   same data.

4. **Trust Passport `mesh` block** — the existing `createTrustPassport`
   now accepts either `contribution` (pre-computed) or `nodes` + the
   existing `memoryRecords` context, computing the mesh block inline.
   The canonical Trust Passport payload includes `mesh`, so signed
   snapshots carry the NCS evidence by construction.

## Consequences

- An investor demo can now read `passport.mesh.{contributedBytes,
  consumedBytes, scoreBytes, class, nodeCount}` directly from a Trust
  Passport, no special endpoint needed.
- The contribution model is intentionally simple at Phase 1: consumed
  bytes = owned memory records' plaintext bytes. Future iterations can
  extend to: mesh storage placement (file chunks placed on others'
  nodes by the identity), inference token consumption (§13B Product 2),
  and any other dimension §13B introduces.
- The Trust Passport audit hash and snapshot signature now cover the
  mesh block — tamper-evident NCS evidence is automatic.
- §17 NCS gap closed; remaining Phase 1 tie-offs: worker authorization
  receipts, operator console updates, CLI for service booking, device-
  pairing scaffold.
