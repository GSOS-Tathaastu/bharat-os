# ADR 0069: Phase 2a.20 — Trust Passport Visualization in the Shell

## Status

Accepted

## Context

The Trust Passport artifact (`src/phase1/trust-passport.mjs`) has
existed since Phase 1.x and was visible in the operator console
(`/console/`) but never in the user-facing shell (`/shell/`). The
user-facing question — *"what does a verifier see when I present my
Trust Passport?"* — had no answer in the demo. The §13A #7
Trust-as-a-service revenue line minted attestations (ADR 0067) but
the user couldn't preview what they were attesting to.

§15 selective disclosure is a hard binding. The shell needs to make
that binding *visible*: bands and booleans only, never raw values.

## Decision

### Shell card — *"🛡️ Trust Passport — what a verifier would see"*

A new card sits between the result section and the mesh ticker, so
it shares the *above-the-fold* tier with the most prominent
narrative moments. Four `trust-stat` tiles in a 2×2 grid:

| Tile | Source |
|---|---|
| Attestations | `passport.attestations.count` |
| Active consents | `passport.consents.active` + `verified` |
| NCS class | `passport.mesh.class` + `nodeCount` |
| §9A flags | `passport.flagReports.open` (NEW) |

A *"Show me what a landlord would see"* link reveals the selective-
disclosure preview directly under the tiles — the same band-and-
boolean envelope the `trust_passport_attestation` tool would mint,
inline, without actually minting:

```
identity_verified : true
income_band       : INR_50K_75K_MONTHLY
active_consents   : 3 (band: few)
mesh_class        : producer
no_open_flags     : true
issued_against    : <publicKeyFingerprint>
```

The same card carries the §15 binding statement and the §13A #7
revenue framing.

### Trust Passport artifact gains `flagReports` block

`createTrustPassport` now accepts `flagReports = []` and emits:

```js
flagReports: {
  total,
  open,                // pending + under_review
  openHighSeverity,    // open && severity === 'high'
  resolved,
  dismissed
}
```

The §9A safeguard escalation (ADR 0058) is now visible in the
Trust Passport — the same set of open high-severity reports that
auto-block sensitive actions at the L4 policy layer surfaces in
the passport for the user / verifier to see.

`canonicalTrustPassportPayload` (signed-snapshot payload) includes
the new block so verifier-side signature verification covers it.

### API change

`trustPassportContext(store)` now also reads `flagReports` from
the store and threads them into `createTrustPassport`. No new
endpoint; the existing `GET /api/trust-passports/:id` returns the
augmented passport.

### Shell wiring

- `loadTrustPassport()` fires on every `setActiveProfile()`, same
  cadence as `loadMeshSummary()` and `loadVoiceRuntimePlan()`.
- `renderTrustPassport()` populates the four tiles, sets tone
  colours on the assurance level chip and the flag count tile.
- `previewVerifierView()` renders the selective-disclosure preview
  inline; toggles a `<div class="trust-evidence">` block.
- Two buttons: *Refresh* and *Show me what a landlord would see*.

Service worker bumped `v15 → v16`.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Pointer, not payload | The preview shows bands (`INR_50K_75K_MONTHLY`) and booleans (`identity_verified: true`); the underlying salary, employer, account numbers are never exposed. |
| Identity is the person, not the device | Passport is keyed by the active profile's identity; same profile on a paired device produces the same passport. |
| Never sell user data | The card reads only what the passport endpoint already exposes; no separate telemetry. |
| Workers / users never pay | Passport surfacing is free; only the verifier-paid attestation minting carries a revenue line. |

## Tests

`tests/node/contribution.test.mjs` gains 2 new tests:

1. `createTrustPassport` surfaces a `flagReports` block with
   correct open / openHighSeverity / resolved / dismissed counts,
   ignoring reports against other subjects.
2. `flagReports` defaults to all-zeros when no reports are passed.

Full suite: **230 / 230 green** (was 228; +2 new).

## Consequences

- The §9C vignette 15 demo (Sneha → landlord) now has a *preview*
  step before the attestation mint. The user sees what they're
  about to share, then decides whether to issue.
- The §9A safeguard (ADR 0058) is no longer invisible to the user;
  open high-severity flags appear in their own Trust Passport. A
  user under review sees the warning immediately.
- The shell now has a clean Trust Passport surface that can be
  extended for the SSO / Verifiable Credentials direction (per the
  [SSO design exploration](../explorations/sso-bharat-id.md)) — the
  passport *is* the credential.

## Future polish

- Add a *Sign and share* action on the preview that mints a
  full attestation via the existing `trust_passport_attestation`
  tool, then renders a QR code / deep link the verifier can scan.
  Closes the §13A #7 round-trip in-shell.
- A verifier-side view at `/verify/:attestationId` that reads the
  attestation, verifies the signature against the subject's
  publicKey, and shows pass / fail. Demoable as a second-tab page.
- Locale-aware preview labels so a Tamil user sees Tamil
  attribute names. Templates already exist for the action types;
  reusing the pattern.
- Live updates when a new flag is filed or a consent expires (push
  / SSE) so the card refreshes without the user tapping *Refresh*.
