# ADR 0129 — Phase 12.0: providerIdentity substrate

Status: Accepted (2026-05-31).
Phase: 12.0 (provider-side §13B value loop foundation;
follows ADR 0128 hero rebrand).
Depends on: Phase 0 identity primitives (`src/phase0/core.mjs`),
Phase 1.3 consent substrate (Phase 11.8 already uses it),
direction memos `provider-vs-worker-identity-split.md`,
`phase-12-13-sequencing-set.md`,
`service-booking-native-not-ola-uber.md`.

## Context

Phase 11.9 hero rebrand surfaced all 7 earner motions on `/app/`,
of which 5 provider roles were "Coming Phase 12.0" placeholders.
The direction-set conversation locked Phase 12.0 as the
`providerIdentity` substrate — separate from `workerIdentity`,
KYC-heavy, bound to a root, with §15 honesty about operator
attestation.

Without 12.0 the wave-1 tiles can't lead anywhere; with it they
become real onboarding entry points (per-role wizard still ships
in Phase 12.2). The substrate also unblocks Phase 12.1a
marketplace (citizen search needs `providerIdentities` to rank +
display) and Phase 12.1b SLM features (dynamic onboarding form
needs the schema to fill).

## Decision

Pure BE + light FE per the parity rule. Substrate is honest
about what it does + what's deferred.

### BE substrate

1. **New module `src/phase1/provider-identity.mjs`** (pure
   validation; no I/O):
   - `PROVIDER_ROLE_KINDS_WAVE_1` — `['cab-driver', 'personal-driver',
     'labourers', 'household-help']`. These are the four roles
     the founder picked for "minimum onboarding load, maximum
     coverage" — all physical-service work, sharing one
     common onboarding flow + role-specific extras.
   - `PROVIDER_ROLE_KINDS_WAVE_2` — `['kirana', 'skilled-trades']`.
     Substrate accepts these today; per-role wizard ships in
     Phase 12.3+.
   - `PROVIDER_KYC_LEVELS` — `['none', 'basic', 'verified']`.
     **Server-attested only**; the substrate refuses any
     attestation call that doesn't carry an `operatorId`. A
     citizen can never self-attest their own KYC.
   - `PROVIDER_IDENTITY_STATUSES` — `['draft', 'submitted',
     'active', 'suspended', 'revoked']`. State machine enforced
     by `VALID_TRANSITIONS`; `revoked` is terminal.
   - `createProviderIdentity({rootIdentityId, roleKind,
     displayName, serviceArea?, ratePaisePerHour?,
     ratePaisePerService?, description?})` — returns a `draft`
     record with `kycLevel: 'none'`, computed `roleWave` (1 or
     2 from the role).
   - `attestProviderKyc(provider, {kycLevel, operatorId,
     evidenceRefs, notes})` — moves `draft → submitted` if not
     already, records the attestation envelope. Refuses
     `kycLevel: 'none'` (use revoke instead).
   - `transitionProviderStatus(provider, nextStatus, {
     operatorId, reason})` — enforces `VALID_TRANSITIONS` and a
     §15 invariant: **cannot transition to `active` without
     KYC**. Throws `"cannot activate provider without KYC
     attestation."` if attempted.
   - `updateProviderProfile(provider, {…fields})` — root-owner
     edits. Cannot change role, status, KYC, or audit
     timestamps. Substrate validates field lengths only; the
     route handler is responsible for caller authorization.
   - `publicProviderRecord(provider)` — strips
     `rootIdentityId`, `kycAttestation`, `lastTransition`,
     `submittedAt`, `suspendedAt`, `revokedAt`, `updatedAt`,
     `createdAt`. Citizens see only what they need to book.

2. **Both stores grow `provider_identities`:**
   - **SqliteStore** — new table `provider_identities` with
     `provider_identity_id` PK + indexes on `root_identity_id`,
     `role_kind`, `status`. Methods: `saveProviderIdentity`,
     `readProviderIdentity`, `listProviderIdentities({
     rootIdentityId?, roleKind?, status?})`. `save` emits
     `provider_identity.saved` ledger event.
   - **BosStore** — new `providerIdentitiesPath` directory +
     per-record JSON files. Same CRUD signature.

3. **DPDP §12(3) cascade extended on BOTH stores.**
   `provider_identities` rows are erased by `root_identity_id`
   when their root identity is erased. §15: no orphaned
   providers in the marketplace after a citizen exercises their
   right to be forgotten.

4. **HTTP endpoints** in `src/phase0/api.mjs`:
   - `POST /api/identities/:rootId/provider-identities` — create
     a draft. Validates root exists; refuses with 404
     `unknown_root_identity` otherwise. Returns 201 with the
     full record (caller is the owner).
   - `GET /api/identities/:rootId/provider-identities` — list
     owned by that root.
   - `GET /api/provider-identities/:id` — **public**. Returns
     `publicProviderRecord` only. Citizens browsing the
     marketplace use this.
   - `POST /api/provider-identities/:id/profile` — root-owner
     edit. Body MUST carry `rootIdentityId`; substrate refuses
     with 403 `not_owner` if it doesn't match the stored
     provider's root. **Authorization is by signed identity
     ownership, not by a session cookie.**
   - `POST /api/admin/provider-identities/:id/kyc-attest` —
     **admin-token-gated**. Operator attests KYC level. Emits
     `provider_identity.kyc_attested` ledger event.
   - `POST /api/admin/provider-identities/:id/transition` —
     **admin-token-gated**. Operator transitions status.
     Emits `provider_identity.transitioned` event. Substrate
     enforces the no-active-without-KYC invariant.

### FE substrate

1. **Three new hooks in `frontend/src/lib/hooks.ts`:**
   - `useProviderIdentities(rootIdentityId)` — lists owned.
   - `useCreateProviderIdentity()` — creates a draft. Invalidates
     the list query on success.
   - `useUpdateProviderProfile()` — root-owner edit. The mutation
     input REQUIRES `rootIdentityId`, which the test pins so a
     refactor cannot drop the authorization gate.

2. **`frontend/src/lib/earn-roles.ts` updated:**
   - Wave-1 roles (`cab-driver`, `personal-driver`, `labourers`,
     `household-help`) flip from `comingSoonPhase: '12.0'` to
     LIVE with `targetPath: '/earn/provider-onboarding?role=…'`
     and a new `providerRoleKind` field (canonicalizes the role
     id used by the BE).
   - Wave-2 roles (`kirana`, `skilled-trades`) remain
     coming-soon but now flagged as `Phase 12.3`.
   - Catalog rework dropped the separate `cook` + `home-help`
     tiles, replaced with one `household-help` tile that
     describes maid + cook + cleaner together (matches the
     direction memo).

3. **New `/earn/provider-onboarding` route**
   (`frontend/src/routes/ProviderOnboarding.tsx`) — a generic
   onboarding form usable for all wave-1 roles. Collects
   display name + free-text service area + hourly rate +
   per-service rate + description. Creates a `draft`
   providerIdentity; tells the citizen honestly that operator
   KYC review is required before activation and per-role
   wizard ships in Phase 12.2.

4. **WorkerHome rewritten** to surface two ledger cards
   (per the direction memo):
   - **Micro-task earnings** — labeling + federated + mesh
     inference + storage. Live since Phase 10.x. Routes to
     `/labels` and `/labs`.
   - **Marketplace earnings** — currently `₹0` everywhere;
     shows draft provider profiles when they exist. CTA to
     onboarding (via the hero) when none. Honest that
     bookings flow in Phase 12.1a.
   - Combined "Total earned this month" card stays at the
     bottom — the underlying ledger is one stream; the cards
     above split the framing.

### Why this shape

**Separate identity, not a workerIdentity extension.** The
direction memo locks this. A `workerIdentity` can label data
with no KYC; a `providerIdentity` has real-world liability
(driver no-show, food poisoning, maid theft) and demands
operator attestation. Bundling them would mean either bumping
every labeler to verified KYC (signup friction kills micro-task
volume) or letting providers run with phone-OTP-only identities
(unacceptable liability shape). Two identities, one root,
distinct attestation tracks.

**Substrate accepts all 6 roles; only 4 are LIVE on /app/.**
The wave-2 roles (`kirana`, `skilled-trades`) are recognized in
the BE today so a future Phase 12.3 release can flip the FE
catalog without a BE migration. Activation still gates on KYC
no matter the role.

**Authorization by rootIdentityId match, not by session.** Phase
13+ Bharat ID / SSO will harden this with signed requests; for
v1 the FE includes `rootIdentityId` in mutating bodies and the
server validates that it matches the stored provider's
`rootIdentityId`. Adequate for the citizen-trust posture the
direction memo specifies; not Fort Knox.

### §15 bindings

- **No commission.** The substrate has NO field for a platform
  commission rate. Citizens pay providers in full; Bharat OS
  earns from Trust Passport attestation fees, sponsor escrow,
  not from booking volume.
- **Public record strips sensitive fields.** Citizens browsing
  the marketplace cannot see `rootIdentityId`, KYC envelopes,
  or operator transition history — only what they need to book
  (role, name, area, rate, KYC level, status).
- **Server-attested KYC only.** Self-attestation paths refuse.
  Activation requires an admin-token call.
- **DPDP §12(3) cascade verified by tests on both stores.** A
  citizen erasing their root identity wipes every bound
  provider profile, no orphans.
- **Audit trail per state change.** `provider_identity.saved`,
  `provider_identity.kyc_attested`, `provider_identity.transitioned`
  ledger events anchor every meaningful operation.

## Tests

19 new Node tests in
[`tests/node/provider-identity.test.mjs`](../../tests/node/provider-identity.test.mjs):

- **Pure module (9)** — validation; defaults; wave assignment;
  KYC attestation moves draft→submitted; refuses kycLevel:none;
  state machine transitions (draft→active blocked; submitted→
  active needs KYC; active→revoked allowed; revoked is
  terminal); `publicProviderRecord` strips sensitive fields;
  `updateProviderProfile` rejects display name >120 chars.
- **SqliteStore (2)** — round-trip + list filters; DPDP cascade
  by rootIdentityId.
- **BosStore (1)** — round-trip + DPDP cascade.
- **HTTP (7)** — create draft; 404 on unknown root; list owned;
  public read strips sensitive fields; profile edit gates on
  rootIdentityId (403 on mismatch); admin KYC attest + transition
  full lifecycle; admin transition refuses skipping KYC.

Full Node suite: 865 → 884 (+19). FE Vitest: 41 → 45 (+4 — 2
hook contract pins, 2 added in earn-roles for wave-1 live and
wave-2 coming-soon invariants). Bundle: main 384 → **392 KB /
119 KB gzipped** (+8 KB for the new route + hooks + WorkerHome
rewrite + earn-roles catalog expansion). wllama lazy chunk
unchanged. Build 1.60s.

End-to-end smoke test via curl on the running server confirmed:
create draft → 201 + status `draft`; public read → no
`rootIdentityId` or `kycAttestation` leak; admin endpoints
correctly reject when `BHARAT_OS_ADMIN_TOKEN` unset (substrate
refuses to serve admin ops without a configured secret).

## Consequences

- Provider tiles on the Earn role chooser are NO longer
  placeholders for `cab-driver`, `personal-driver`, `labourers`,
  `household-help`. Tap → persona picker → generic onboarding
  → draft profile saved. The full path is real except for the
  operator KYC step (Phase 12.2 wizard).
- WorkerHome reads the two-motion reality: micro-task earnings
  on the left (live), marketplace earnings on the right (₹0
  pending Phase 12.1a). Demo investors immediately see the
  expansion path.
- `providerIdentity` schema is now stable foundation for
  Phase 12.1a marketplace ranking, Phase 12.1b SLM dynamic
  forms, and Phase 12.2 per-role wizards.
- DPDP cascade extended to a new resource type without any
  regression in the rest of the cascade — same sweep pattern as
  every prior addition.

## What's NOT in this sub-phase

- **Per-role onboarding wizard** with KYC document upload,
  Aadhaar e-KYC, SLM dynamic form generation. Phase 12.2 wave 1.
- **Operator console UI for KYC review.** Operators today hit
  the admin endpoint via curl. A real review surface ships
  later (likely part of the future `/app/sponsor/` work).
- **Service-area polygon schema.** Today's `serviceArea` is an
  opaque object the substrate stores as-is. Phase 12.1a
  marketplace pins the geo schema (lat/lng + radius OR polygon)
  before citizens can search by location.
- **Trust Passport feedback loop on providers.** Substrate
  already has the verified-attestation field on root identity;
  Phase 12.2 wires per-booking ratings to provider Trust score.
- **Marketplace earnings ledger.** Currently the WorkerHome
  marketplace card hard-codes ₹0. Real earnings flow when
  Phase 12.1a citizen-booking escrow ships.
- **Multi-role provider profile.** A citizen with both cab and
  household-help can create two profiles today, each separate.
  Cross-profile shared KYC + scheduling is post-MVP.
- **Provider suspension self-service.** Today operators
  suspend; provider can revoke their own profile but not pause
  it. Polish.

ADR 0129.
