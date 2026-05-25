# ADR 0099: Phase 6.2 — Worker-Collective Membership Substrate (Issue + Verify + Blessed Registry)

## Status

**Accepted — shipped.** Phase 6.2 of ADR 0096's growth-arc plan
("Worker collective distribution: SEWA, IFAT"). The partnership
work itself is out-of-tree (you can't ship "the SEWA integration"
without SEWA signing a partnership), but the code substrate the
collective consumes IS in scope and ships here.

## Context

ADR 0096 listed Phase 6.2 as worker-collective distribution:

> "SEWA (~2.5M members), IFAT (~25K app-based drivers), NDLF,
> Domestic Workers Union, building-worker boards. A single
> partnership with an affiliating org gets bulk Bharat OS
> onboarding."

Three concrete substrate gaps had to close before the partnership
conversation makes sense:

1. **Collectives need a way to sign attestations.** Bharat OS
   already has Ed25519 identities + `signText` — but no first-class
   "collective" pattern. We need a primitive that says "this
   collective vouches that this worker is a verified member."

2. **Workers need their memberships to travel.** A SEWA member who
   later asks an MFI for a loan should be able to surface "I'm a
   verified SEWA member" without re-onboarding into the MFI's
   universe.

3. **Consuming surfaces (MFI / aggregator / govt scheme) need a
   trust list.** Anyone can sign a "I'm a collective" attestation.
   Without curation, the credibility signal is worthless. We need
   a Bharat-OS-curated registry of blessed collectives.

Phase 6.2 ships all three.

## Decision

### Membership attestations — issued by the collective, signed with its Ed25519 key

`src/phase1/collective-membership.mjs`:

**`createMembershipAttestation({ collective, memberId, collectiveName,
memberRole?, region?, joinedAt?, ttlDays?, at })`** — produces a
versioned signed envelope:

```json
{
  "protocolVersion": "bos.phase1.collective-membership.v0",
  "objectType": "collective-membership-attestation",
  "membershipId": "bos:collective-membership:<sha256-prefix>",
  "collectiveId": "bos:person:sewa-tamilnadu",
  "collectiveName": "SEWA - Tamil Nadu",
  "memberId": "bos:person:lakshmi",
  "memberRole": "domestic_worker",
  "region": "Chennai",
  "joinedAt": "2018-06-01",
  "issuedAt": "2026-05-25T...",
  "expiresAt": "2027-05-25T...",
  "status": "active",
  "revokedAt": null,
  "revokedReason": null,
  "signature": "<ed25519-sig-by-collective>"
}
```

Member roles enumerated (`driver`, `delivery`, `domestic_worker`,
`construction`, `service`, `farm`, `general`). Region is at
city/district level only — same precision bound as Phase 5.9
portable-attestation GPS (~1km). Default TTL 365 days, capped at
5 years.

**`verifyMembershipAttestation(attestation, collectivePublicRecord, { at })`**
— signature + freshness check, returns `{ ok, status }` enum
(`valid` / `expired` / `revoked` / `signature_invalid` /
`unknown_collective` / `malformed`).

**`revokeMembershipAttestation(attestation, { reason, at })`** —
collective burns a membership (e.g. worker left the union). Pure;
caller persists. Reason ≥ 4 chars required.

### Blessed-collectives registry — admin-curated trust list

A separate primitive that completely decouples *who can issue
attestations* (anyone) from *which issued attestations are
trustworthy by default* (curated).

**`createBlessedCollectiveRecord({ collectiveId, collectiveName,
blessedBy, notes?, at })`** — admin-issued record marking a
collective as trustworthy.

**`filterBlessedMemberships(memberships, blessedRegistry, { at })`**
— given a list of memberships AND the blessed registry, returns
the subset that are (a) issued by a blessed collective AND (b)
currently valid (active + not expired + not revoked). This is
what consuming surfaces use to decide whose attestations to
honor.

### Storage

Two new SqliteStore tables:

- **`collective_memberships`** — indexed on `collective_id` +
  `member_id` + `status`. CRUD: `saveCollectiveMembership`,
  `readCollectiveMembership`,
  `listCollectiveMemberships({ collectiveId, memberId, status })`.
- **`blessed_collectives`** — indexed on `collective_id`. CRUD:
  `saveBlessedCollective`, `readBlessedCollective`,
  `listBlessedCollectives`, `deleteBlessedCollective`.

Both tables in the DPDP §12(3) erasure cascade. When an identity
erases itself, both their MEMBER attestations AND their issued
COLLECTIVE attestations clear — and if the identity was on the
blessed registry, that entry also clears.

### API endpoints

**Collective side:**

- **`POST /api/identities/:collectiveId/collective-memberships`** —
  body `{ memberId, collectiveName, memberRole?, region?, joinedAt?,
  ttlDays? }`. Collective signs + persists + emits
  `collective_membership.issued` ledger event.
- **`POST /api/identities/:collectiveId/collective-memberships/:membershipId/revoke`**
  — body `{ reason }`. Returns 404 for non-issuer attempts (no
  ownership-leak via differential status).

**Member side:**

- **`GET /api/identities/:memberId/collective-memberships`** — list
  with optional `?status=active|revoked`.

**Public + admin:**

- **`GET /api/blessed-collectives`** — public; the trust list
  consuming surfaces read.
- **`POST /api/admin/blessed-collectives`** — admin-auth (Phase
  5.7) gated. Verifies the collectiveId resolves to an existing
  identity (avoids blessing a typo'd ID). Emits
  `blessed_collective.added` ledger event.
- **`DELETE /api/admin/blessed-collectives/:collectiveId`** —
  admin-auth gated. Emits `blessed_collective.removed` ledger
  event.

### MFI income-verification bundle (ADR 0097) extension

`buildIncomeVerificationBundle` now accepts `collectiveMemberships`
and `blessedCollectives` inputs. The bundle's `credibility` section
gains a new field:

```json
{
  "credibility": {
    "portableAttestationsByTier": { "0": 320, "1": 70, "2": 10 },
    "totalSignedAttestations": 400,
    "verifiedCollectiveMemberships": [
      {
        "membershipId": "...",
        "collectiveId": "bos:person:sewa-tamilnadu",
        "collectiveName": "SEWA - Tamil Nadu",
        "memberRole": "domestic_worker",
        "region": "Chennai",
        "joinedAt": "2018-06-01",
        "issuedAt": "2026-05-25T...",
        "expiresAt": "2027-05-25T..."
      }
    ]
  }
}
```

Only memberships from BLESSED collectives that are CURRENTLY VALID
make it in. The MFI weights this in their underwriting model:
"verified 8-year SEWA member, Chennai, domestic worker" is a
strong signal independent of self-reported earnings.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Collective signs; member never coerced | The collective issues the attestation but the member can refuse to surface it (the data lives on the member's record; they can DPDP-export + delete). Future polish: member-side opt-in confirmation before persistence. |
| Region is neighbourhood, not address | City/district level only (≤ 80 chars). Matches Phase 5.9 GPS precision bound. |
| Protocol vs. trust policy separation | Anyone can sign a membership attestation; only blessed collectives surface in consuming flows. A rogue actor's attestations are not blocked at the issuance layer — they just don't carry weight. |
| Audit trail | Every membership issuance + revocation + blessing + unblessing emits a typed ledger event with operator/collective attribution. |
| Cross-issuer revoke leaks no ownership | 404 mirrors the existing income-verification revoke pattern — a non-issuer trying to revoke can't probe whether the membershipId exists. |
| DPDP erasure cascade | Both new tables in the §12(3) cascade. Erasing the WORKER removes their member-side records; erasing the COLLECTIVE removes its issuer-side records too. |
| MFI bundle surfaces only blessed memberships | The trust-list filter happens server-side; rogue attestations cannot bleed into a bundle. |

## Tests

`tests/node/collective-membership.test.mjs` — 26 tests:

**`createMembershipAttestation`** (3): versioned signed envelope
shape, input validation (bad role, bad joinedAt, ttl out of
range), self-membership refusal.

**`verifyMembershipAttestation`** (5): success on fresh, expired,
revoked, unknown_collective, signature_invalid on tamper.

**`revokeMembershipAttestation`** (1): reason ≥ 4 chars required.

**`filterBlessedMemberships`** (2): blessed-and-valid only;
empty-inputs tolerance.

**`createBlessedCollectiveRecord`** (1): bad-input validation.

**MFI bundle integration** (2): `verifiedCollectiveMemberships`
present when blessed; excluded when not blessed.

**SqliteStore + DPDP** (3): membership round-trip,
listCollectiveMemberships filtering, DPDP export + erasure cascade.

**End-to-end live HTTP** (8): POST issue + ledger; POST issue
unknown-member 400; GET list; POST revoke + cross-issuer 404;
POST admin blessed + public GET (auth required); admin bless
rejects unknown identity; DELETE admin unbless; **full
end-to-end** — bless SEWA, SEWA issues membership to worker,
worker issues MFI consent, MFI fetches bundle, bundle surfaces
the verified membership.

**Constants** (1): `MEMBER_ROLES` enum frozen + documented set.

Full suite: **673 / 673 green** (was 647; +26 new). No SW change
(server-side only).

## Consequences

- **SEWA partnership conversation has a code answer.** When SEWA
  asks "what does Bharat OS give us?", the answer is concrete:
  here's the endpoint your union office hits to issue
  verifiable membership credentials to your 2.5M members, and
  here's how those credentials surface in our MFI bundle, our
  consuming-aggregator API, and the workers' own Trust Passports.
- **Worker reputation now travels across institutional boundaries.**
  A verified SEWA member's portable attestation history (Phase 5.9)
  + income (Phase 6.0a) + tax-regime summary (Phase 6.0c) + MFI
  bundle (Phase 6.1) ALL benefit from the membership signal. The
  growth-arc primitives compose.
- **Rogue collectives are powerless by default.** Anyone can issue
  membership attestations; only blessed collectives surface in
  consuming flows. A bad actor can't game the system by
  self-blessing.
- **Blessing is auditable + reversible.** Every bless + unbless
  is in the typed ledger with admin operator attribution. A
  compromised admin token + rogue blessing is detectable
  post-hoc.
- **Backward-compatible.** No existing route changed. MFI bundle
  shape is additive (`verifiedCollectiveMemberships` defaults to
  `[]` when no memberships exist).

## Future polish

- **Member-side opt-in confirmation** — currently a collective can
  issue an attestation that lands on the worker's record without
  the worker explicitly accepting. A future flow could require
  the worker to POST `/accept` on the membership before it
  surfaces in bundles.
- **Federated collective registries** — instead of (or in addition
  to) a single Bharat-OS-blessed list, consuming surfaces could
  consume multiple independent trust lists (one from each
  state labor commissioner, one from each NBFC consortium).
  Today everyone reads `/api/blessed-collectives`.
- **Per-role weighting** — an MFI's underwriting model might
  weight `domestic_worker` (typically lower-cap loans) differently
  from `driver` (higher-cap, more verifiable income). The bundle
  surfaces `memberRole`; weighting is the consumer's job.
- **Bulk-import endpoint** — for collectives onboarding 100K+
  members via CSV. Today they must POST one-by-one. A CSV
  ingest with batched signing would close the partnership-
  velocity gap.
- **Membership signature delegation** — Phase 2a's
  private-key-on-server pattern means the server signs membership
  attestations on behalf of the collective. Phase 2b should move
  this client-side: the collective's office signs each membership
  locally in their app, server only verifies + stores.
- **Per-issued-membership reads telemetry** — surface
  "verifiedCollectiveMemberships[i] was read by N MFIs in the
  last 30 days" so collectives can demonstrate value to their
  members.
