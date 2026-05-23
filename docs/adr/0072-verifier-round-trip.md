# ADR 0072: Phase 2a.22 — §13A #7 Verifier Round-Trip

## Status

Accepted

## Context

ADR 0067 added the `trust_passport_attestation` tool — the
subject's side of the §13A #7 *"Trust-as-a-service"* flow. ADR
0069 added the *"what a verifier would see"* preview card in the
shell. Both were valuable, but neither completed the loop: an
attestation could be minted, but there was no way for the actual
verifier (a landlord, NBFC, HR portal) to *check* it.

ADR 0067's future-work list named this gap: *"Add a
/api/attestations/verify endpoint for the verifier side — pass an
attestationId + the subject's publicKeyPem, get back pass / fail +
the claims. This closes the round-trip on the verifier-paid
revenue line."*

§13A #7 only works if the verifier-pays loop closes end-to-end.
Phase 2a.22 ships both halves: the *sign + share* action on the
subject's device and the *verify* page the verifier opens.

## Decision

### New artifact — `src/phase1/trust-attestation.mjs`

Two pure functions, no I/O:

- **`signTrustAttestation(envelope, signerIdentity)`** — Ed25519
  signature over the canonical payload (excludes transient
  framing like `revenueLine` so the signature stays stable across
  receipt-shape additions). Refuses to sign if the signer is not
  the subject.
- **`verifyTrustAttestation(envelope, publicRecords, { at })`** —
  returns a discriminated result:
  - `{ status: 'valid', subject, payload }` — signature verified,
    not expired
  - `{ status: 'expired', payload }` — signature valid but past
    `expiresAt`
  - `{ status: 'signature_invalid', payload }` — signature didn't
    verify; attestation may have been tampered with
  - `{ status: 'unknown_subject' }` — subject identity not in the
    registry
  - `{ status: 'malformed' }` — envelope shape is wrong

Same Ed25519 primitive as consents, worker authorizations, flag
reports, and federated gradient updates. The canonical-payload
helper guarantees that downstream framing fields (which the §17
honesty board may extend over time) don't break verification.

### Auto-sign + persist in the orchestration API

The `POST /api/orchestrations` handler now detects
`actionType === 'trust_attestation'` with a completed tool
execution and, before responding, calls
`signTrustAttestation(toolReceipt, actorIdentity)` and persists
to a new `attestations/` store. The response carries
`{ ok, orchestration, attestation }` so the shell gets the signed
envelope directly without an extra round-trip.

Demo-mode note carried from ADR 0066: the server signs because
the subject's privateKey is server-stored in Phase 2a. Phase 2b
moves the signature step to the device hardware keystore; the
verify endpoint shape stays the same.

### Three new API routes

- `GET /api/attestations` — index (id, subject, verifier,
  purpose, dates, claim count). No claims body, so it's safe to
  list without selective-disclosure leakage.
- `GET /api/attestations/:id` — full signed envelope.
- `GET|POST /api/attestations/:id/verify` — runs
  `verifyTrustAttestation` against the active identity registry
  and returns `{ attestationId, status, reason, payload, subject }`.
  Both GET and POST accepted so the verifier page can be linked
  directly or fetched programmatically.

### `BosStore` gains `attestations/`

`saveAttestation` / `readAttestation` / `listAttestations` mirror
the consent / flag-report / federated-round pattern, with a
`attestation.saved` ledger event on every save for §17 audit.

### Shell — *"Sign &amp; share"* on the Trust Passport card

A third button alongside *Refresh* and *Show me what a landlord
would see*. On click:

1. Prompts for verifier name + share days (1-90).
2. Mints a fresh `trust.attest + consent.record` consent.
3. POSTs the orchestration; the server auto-signs and returns
   the attestation.
4. Renders the verify URL (`/verify/?attestationId=...`) with a
   *Copy* button and a QR code (the existing
   `renderQrInto` helper from ADR 0070).

The verifier link is plain HTTPS — works in any browser, no
Bharat OS install required. The QR is the same shape as the §7c
pairing QR; consistent UI primitive.

### New page — `/verify/` (HTML + CSS + JS)

A standalone three-file mini-page served from `public/verify/`.
Reads `?attestationId=...` from the URL, POSTs
`/api/attestations/:id/verify`, renders one of five states:

| Badge | When |
|---|---|
| `VERIFIED ✓` (green) | Signature valid, not expired |
| `EXPIRED` (amber) | Signature valid, past share window |
| `SIGNATURE INVALID` (red) | Signature didn't verify |
| `UNKNOWN SUBJECT` (red) | Subject identity not in registry |
| `NOT FOUND` (red) | No attestation with this ID |

Each state surfaces the canonical payload (verifier name, purpose,
issued/expires, claims list) so even a stale attestation tells a
story. The page footer carries the §15 selective-disclosure
framing and links back to the shell.

The new `/verify/` route is added to the API server's static
handler alongside `/shell/` and `/console/`. `GET /verify` 302s
to `/verify/`.

### Service worker

`CACHE_NAME` bumped `v18 → v19`. The verify page is intentionally
*not* added to the shell's pre-cache list — it's a verifier
surface, not a subject surface, and lives at a different origin
namespace in the user's mental model.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Pointer, not payload | Verify response surfaces only the signed `claims` (bands and booleans). Raw underlying values (income, employer, address) are never in the attestation envelope and so never in the verify response. |
| Identity is the person, not the device | Verification needs only the subject's public record. The same attestation verifies the same regardless of which device the subject minted it on (post §7c pairing). |
| Aadhaar optional, never mandatory | Verifier flow makes no Aadhaar reference. |
| Never sell user data | The `GET /api/attestations` index returns no claims bodies and no contact info. The verify endpoint is public-read but returns only what the subject chose to disclose at mint time. |
| Workers / users never pay | Subjects mint and share for free. The verifier-side endpoint is also free in Phase 2a; Phase 2b can wire a per-verify fee charged to the relying-party app per §13A #7. |

## Tests

`tests/node/trust-attestation.test.mjs` — 8 focused tests
(7 unit + 1 end-to-end):

1. signer must match subject
2. round-trip: subject signs → verifier validates
3. expired reported separately from invalid
4. tampered claims rejected
5. unknown subject reported distinctly
6. malformed envelopes rejected
7. canonical payload stays stable across transient framing
   additions
8. **end-to-end**: `orchestrateIntent` mints → caller signs →
   verifier validates against public record (mirrors what the
   API does in production)

Full suite: **249 / 249 green** (was 241; +8 new). SW cache to v19.

## Consequences

- §13A #7 Trust-as-a-service now closes end-to-end in the demo.
  Mint on phone → copy verify URL → open on laptop → see the
  signed bands. ~60 seconds from intent to verifier-side proof.
- The verifier surface is just a static HTML page that calls one
  API. A future relying-party app (rental portal, NBFC onboarder,
  HR system) can embed the same verify call directly — no SDK,
  no Bharat OS install dependency.
- The `verifyTrustAttestation` discriminated result is the
  natural shape for SSO Tier 2 (Verifiable Credentials) per the
  [SSO design exploration](../explorations/sso-bharat-id.md). The
  protocol layer is now in place to extend it that direction
  without a redesign.
- 249 / 249 tests, SW cache to v19.

## Future polish

- **Per-verify revenue line** — charge the relying-party app a
  per-verify fee. Mirrors §13A #4 B2B verified-workflow fees.
  Phase 2b commits and wires the metering.
- **Verifier-side QR scan** — `/verify/` could accept a QR scan
  (BarcodeDetector API, same as ADR 0070) so the verifier opens
  the page once and scans many attestations.
- **Revocation list** — a signed `revoked_at` field on the
  attestation envelope, populated when the subject taps *Revoke*
  in the shell. Verifier checks the revocation status alongside
  the signature.
- **Locale-aware verifier page** — Hindi / Tamil / Bengali
  renderings for verifiers in those languages.
- **Per-record sub-signatures** — for multi-claim attestations,
  let the subject sign each claim separately so they can revoke
  one without invalidating others.
- **Move signing client-side** in Phase 2b once the device
  hardware keystore lands; the demo-mode auto-sign in the
  orchestration API goes away.
