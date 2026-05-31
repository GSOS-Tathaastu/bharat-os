# ADR 0120: Phase 9.1 — Sponsored Federated Rounds (Demand-Side Revenue)

## Status

**Accepted — shipped 2026-05-31.** Phase 9.0 closed with workers
able to install SLMs, run inference, and join federated rounds —
all on the supply side. **Phase 9.1 wires the demand side**: a
sponsor model with bearer-token auth, escrow-locked round creation
funded by admin top-ups, per-accepted-update escrow debit
synchronised with the existing worker payout, and a signed
sponsor-audit export bundle. FE+BE parity rule honoured: both
layers ship in one commit.

## Context

Phase 9.0d's federated rounds were "unsponsored" — the demo
seed-script created rounds for free, and any admin could create
any round. For the **first non-investor revenue line**, sponsors
need:

1. **A way to register as a paying customer** (admin onboards them)
2. **A token to act on their own resource** (without giving them
   admin privileges over the rest of Bharat OS)
3. **Escrow** — sponsor's money is locked at round creation; debited
   as workers earn; un-spent budget is preserved for refunds
4. **Audit bundle** — sponsor's compliance team can verify "we got
   what we paid for" without seeing raw worker payloads (pointer-
   not-payload per §15)

ADR 0107 (Phase 9.0 Proposed) sketched this as Phase 9.1; ROADMAP
2026-05-31 confirmed it as the next ship after Phase 9.0d closed
the supply loop.

## Decision

### Sponsor model (`src/phase1/sponsor.mjs`)

```ts
sponsor: {
  sponsorId: 'bos:sponsor:<32-hex>',
  protocolVersion: 'bos.phase9.sponsor.v0',
  objectType: 'sponsor',
  displayName: string,
  contactEmail: string | null,
  status: 'active' | 'suspended' | 'revoked',
  onboardedAt: iso,
  onboardedBy: operator,
  bearerTokenHash: 'sha256:<64-hex>',  // SHA-256 of the bearer
                                       // token; raw token shown
                                       // ONCE at onboarding
  escrowBalancePaise: number,          // total deposits - total debits
  escrowLockedPaise: number            // currently locked for open rounds
}
```

`createSponsor()` returns `{sponsor, bearerToken}` where
`bearerToken` is a 16-byte hex prefixed with `bos:sponsor-token:`
(so leaked tokens are recognisable in logs + gitleaks-style
scanners). The raw token is shown once in the admin onboarding
response — Bharat OS only persists its SHA-256.

Helper functions:
- `depositEscrow(sponsor, amountPaise)` — admin tops up after
  confirming an off-system wire / NEFT cleared
- `lockEscrow(sponsor, amountPaise)` — round-create lock; refuses
  if `available = balance - locked < requested`
- `debitLockedEscrow(sponsor, amountPaise)` — per-accepted-update;
  decrements BOTH balance and locked by the payout amount
- `refundLockedEscrow(sponsor, amountPaise)` — un-lock without
  debit (round close/expire); decrements locked only
- `revokeSponsor(sponsor, {revokedBy})` — soft-delete
- `publicSponsor(sponsor)` — self view (admin / sponsor itself)
  exposes escrow; bearer token hash stripped
- `publicSponsorDirectory(sponsor)` — **public view** exposes only
  `{sponsorId, displayName, status}`; escrow + contact email
  stripped

### Sponsor-auth middleware (`src/phase0/sponsor-auth.mjs`)

Mirrors the Phase 5.7 `admin-auth.mjs` pattern:
- `requireSponsorAuth(request, {store, sponsorId, requestId})` —
  reads the sponsor record, verifies the bearer token via
  constant-time hash comparison, checks `status === 'active'`,
  throws `SponsorAuthError` (with HTTP status) on any miss
- `checkSponsorAuth(request, response, ...)` — convenience wrapper
  that sends the JSON error response on failure + returns `null`

**Two distinct surfaces**: admin compromise can lift a SIM-swap
cooldown but cannot spend a sponsor's escrow. Sponsor compromise
can drain that sponsor's escrow but not touch other sponsors or
any non-sponsor surface.

### Storage

Both backends grow a `sponsors` table / directory.
SqliteStore + BosStore: `saveSponsor`, `readSponsor`,
`listSponsors`. `saveSponsor` emits a `sponsor.saved` ledger event
with `{sponsorId, displayName, status, escrowBalancePaise, at}`.

**DPDP §12(3) cascade NOT updated.** Sponsors are organisations,
not natural persons — the per-identity erasure flow doesn't apply.
Round-update rows (which carry the worker's contributor identity)
already cascade via the existing `federated_updates` sweep, so
the sponsor's audit bundle export naturally anonymises after a
worker erases.

### Federated round schema extension

`createFederatedRound` gains two more optional fields (additive,
backwards-compatible):

```diff
   slmModelPackId = null,
   targetTask = null,
   loraConfig = null,
+  // Phase 9.1 — sponsor reference + per-round escrow lock.
+  sponsorId = null,
+  escrowLockedPaise = 0,
   at = nowIso()
```

Plus a derived `escrowDebitedPaise` field on the round itself
(starts at 0, increments per accepted update).

`describeRound` surfaces all three so the FE can render the
sponsor badge + escrow-remaining counter.

### API routes

**Admin (Phase 5.7 token):**
- `POST /api/admin/sponsors` — onboard. Returns `{sponsor,
  bearerToken, warning}`. **Bearer token shown ONCE.**
- `GET /api/admin/sponsors` — list
- `POST /api/admin/sponsors/:id/deposit` — top up escrow with
  `{amountPaise, reference}`; emits `sponsor_escrow.deposited`
  ledger event
- `DELETE /api/admin/sponsors/:id` — soft-delete (status: revoked)

**Public (no auth):**
- `GET /api/sponsors/:id` — directory view (`{sponsorId,
  displayName, status}` only). Used by the FE to render "Sponsored
  by X" badges without exposing escrow.

**Sponsor-bearer-token gated:**
- `GET /api/sponsors/:id/self` — self view including escrow
- `GET /api/sponsors/:id/federated-rounds` — list own rounds
- `POST /api/sponsors/:id/federated-rounds` — create a sponsored
  round. Body = `createFederatedRound` shape + the route computes
  `escrowRequired = maxParticipants × payoutPaisePerUpdate` and:
  - **402 `insufficient_escrow`** if available < required
    (response carries `requiredPaise` for client UX)
  - **400 `invalid_round_economics`** if `escrowRequired <= 0`
  - **400 `invalid_round`** if the round validator rejects
  - On success: locks escrow on the sponsor + persists round +
    emits `sponsor_escrow.locked` ledger event
- `GET /api/sponsors/:id/federated-rounds/:roundId/export` —
  signed-JSONL audit bundle (see "Audit export" below). 404 if
  the round doesn't belong to this sponsor (cross-sponsor reads
  refused).

### Escrow lifecycle (the financial heart of Phase 9.1)

1. **Onboard**: balance=0, locked=0
2. **Deposit**: balance += amount (admin-mediated; emits
   `sponsor_escrow.deposited`)
3. **Round create**: locked += `maxParticipants × payout`; balance
   unchanged (emits `sponsor_escrow.locked`)
4. **Accepted worker update** (in the existing sign-and-submit
   route's accept branch): balance -= payout AND locked -= payout
   (emits `sponsor_escrow.debited`). The round's
   `escrowDebitedPaise` increments by the same amount so the
   audit export can reconcile.
5. **Round close / expire** (future polish): refund unused locked
   amount → locked -= unused (emits `sponsor_escrow.refunded`)

**Invariants** (enforced by the module's helper functions):
- `locked <= balance` always
- `locked >= 0`, `balance >= 0`
- A debit cannot exceed the lock
- A refund cannot exceed the lock
- A round's `escrowDebitedPaise <= escrowLockedPaise`

If an escrow debit fails mid-accept (e.g., sponsor revoked between
round-create and accept), the worker still earns the mesh credit
(the payment is owed) and we log a `sponsor_escrow_debit_failed`
warning for ops reconciliation. Worker payouts are not held
hostage to sponsor accounting hiccups.

### Audit export (`GET /api/sponsors/:id/federated-rounds/:roundId/export`)

Returns NDJSON (`application/x-ndjson`) — one JSON record per
accepted update:

```json
{
  "updateId": "bos:fed-update:…",
  "roundId": "bos:fed-round:…",
  "sponsorId": "bos:sponsor:…",
  "identityHash": "sha256:<sha256(roundId::contributorId)>",
  "gradientHash": "sha256:…",
  "differentialPrivacyEpsilon": 0.5,
  "sampleCount": 6,
  "acceptedAt": "<iso>",
  "payoutPaise": 500
}
```

**§15 pointer-not-payload**: per-update record carries the
gradient HASH only, not the bytes. The `identityHash` is
`sha256(roundId::contributorId)` so the sponsor **cannot
correlate the same worker across multiple rounds** — same posture
as Phase 10 plan in ADR 0110.

The endpoint refuses cross-sponsor reads with 404 (test:
`sponsor export refuses cross-sponsor reads`).

### FE updates

`src/lib/hooks.ts`:
- `FederatedRound` interface gains `sponsorId`, `escrowLockedPaise`,
  `escrowDebitedPaise`
- `useSponsorDirectory(sponsorId)` — public sponsor-directory
  hook. `staleTime: 5 minutes` because sponsor names don't churn

`src/routes/Labs.tsx`:
- New `<FederatedRoundRow>` component encapsulates the per-row
  rendering (was inline in Phase 9.0d) so it can use the
  `useSponsorDirectory` hook
- Sponsored rounds render a governance-tone `<Badge>` **"Sponsored
  by X"** + an *"₹Y.YZ remaining"* caption derived from
  `escrowLocked - escrowDebited`
- Unsponsored rounds (demo / unfunded) render with no badge — the
  surface degrades gracefully

### Seed-demo extension

`scripts/seed-demo.mjs`:
- Creates a sponsor "Pragati Microfinance"
- Deposits ₹2,500 (250,000 paise) into its escrow
- Locks ₹100 for a sponsored round
- Creates the round `phi-3-mini-loan-screener` targeting
  `bos:slm:phi-3-mini-4k-q4_k_m` with task
  `loan-screening-empathy`, payout ₹5/update, 20 max participants

On a fresh seed the `/app/labs/` federated card now shows:
1. The unsponsored `intent-classifier-head-v1` round (legacy)
2. The unsponsored `phi-3-mini-indic-intent` SLM round (Phase 9.0d)
3. The **sponsored `phi-3-mini-loan-screener`** SLM round with
   the *"Sponsored by Pragati Microfinance · ₹100.00 remaining"*
   badge

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Bearer token shown once + only hash persisted | `createSponsor` returns the raw token; only `bearerTokenHash` is stored. Onboarding response includes an explicit warning string. |
| Public sponsor directory has no escrow info | `publicSponsorDirectory` returns `{sponsorId, displayName, status}` only; the FE-facing `/api/sponsors/:id` route uses this view |
| Self / admin view exposes escrow but never the token hash | `publicSponsor` strips `bearerTokenHash` + `onboardedBy` |
| Cross-sponsor reads refused | Export endpoint matches `round.sponsorId === path sponsorId`; mismatch returns 404 not 403 (doesn't leak existence) |
| Worker payouts not held hostage to escrow | Escrow debit failure logs a warning and continues; worker mesh credit lands regardless |
| Audit bundle is pointer-not-payload | NDJSON carries only `gradientHash` + `identityHash`; never raw gradient bytes or raw worker identity |
| Cross-round correlation prevented | `identityHash` is `sha256(roundId::contributorId)`; same worker in two rounds produces two different hashes |
| Sponsor revoke is soft | `status: 'revoked'` + audit trail preserved; in-flight rounds keep their lock; future round-create refused via `sponsor_inactive` |
| All escrow movement is auditable | `sponsor_escrow.deposited`, `.locked`, `.debited`, `.refunded` ledger events |

## Tests

`tests/node/sponsor.test.mjs` — **19 new tests**:

- Module: `SPONSOR_STATUSES`, `createSponsor` happy path,
  `createSponsor` rejects empty name, `hashBearerToken` +
  `verifyBearerToken` roundtrip, `publicSponsorDirectory` strips
  fields (5)
- Escrow accounting: `depositEscrow` increase / reject non-positive,
  `lockEscrow` refuses underfunded, lock + debit + refund
  conservation, `debitLockedEscrow` refuses over-debit,
  `revokeSponsor` (5)
- HTTP: admin POST refuses without token, admin POST creates +
  returns one-time bearer, admin deposit increases balance,
  public directory view (no escrow), `GET /self` requires sponsor
  bearer, sponsored round create — 402 underfunded then 201
  funded, export bundle returns signed-JSONL, export refuses
  cross-sponsor reads, `SponsorAuthError` carries HTTP status (9)

Full Node suite: **821/821** (was 802; +19 sponsor tests).
Vitest: 16/16 unchanged (no FE-only logic added). Build: 1.33s.

**Bundle**: main 345 KB / **107 KB gzipped** (+1 KB vs 9.0d for
the `useSponsorDirectory` hook + sponsor badge render path).
wllama lazy chunk unchanged at 292 KB / 126 KB gzipped.

## Consequences

- **First non-investor revenue line is real.** A bank /
  hospital / gov department can pay Bharat OS to run privacy-
  preserving fine-tuning rounds on Indian workers' devices.
  Escrow + audit + identity-hash rotation all align with what a
  DPDP-compliance officer would actually want.
- **Sponsor-paying-worker loop closes end-to-end.** Sponsor
  deposits ₹2,500 → creates round locking ₹100 → 20 workers each
  submit → each gets ₹5 mesh credit → sponsor's locked drains to
  0 → sponsor downloads audit bundle for their compliance team.
- **Pattern for Phase 10 labeling marketplace established.** ADR
  0110 sketched a similar sponsor-onboard / escrow-lock /
  signed-export shape for the labeling marketplace; the sponsor
  module + auth middleware + `publicSponsorDirectory` directly
  reuse here.
- **Two-surface auth bisection holds.** Admin surface and sponsor
  surface have no overlap; a compromised sponsor token cannot
  touch Bharat OS-wide ops, and admin compromise cannot drain a
  sponsor's escrow.
- **Backwards-compatible.** All Phase 9.0d rounds continue to
  work — `sponsorId` defaults to null, FE row renders without
  a sponsor badge, no breaking changes.

## What's NOT in this sub-phase

- **Real fiat payment rails** — sponsor deposits are admin-
  mediated (operator confirms NEFT/wire externally + posts a
  deposit). Real payment gateway integration is operational,
  not a code concern; deferred to launch-time vendor selection.
- **Round close + refund** — the `refundLockedEscrow` helper
  exists and ledger event is named (`sponsor_escrow.refunded`)
  but no route fires it yet. Triggered on round expire / sponsor-
  cancel; ships as Phase 9.1.1 polish.
- **Sponsor self-serve dashboard** — sponsor can hit GET
  `/self`, list rounds, fetch exports — but there's no
  `/sponsor-portal/` UI. Sponsors operate via curl + their tool
  of choice for now. A future React app under
  `frontend/src/routes/SponsorPortal.tsx` would be a separate
  ship under `/sponsor/`.
- **Per-sponsor pricing tiers** — every sponsor pays the same
  `payoutPaisePerUpdate` they configure; Bharat OS doesn't take
  a platform fee in v1. Adding a `platformFeeBps` to the round
  payload + a Bharat OS treasury sponsor would be ~1 day of
  work; ships when commercial terms are signed.
- **Sponsor token rotation** — no rotate endpoint yet. Admin can
  revoke + re-onboard; rotation comes as Phase 9.1.2 polish.
- **Real LoRA fine-tuning** — still a stub gradient from Phase
  9.0d's known-honest gap. Sponsor demo path works correctly
  modulo this.

## Future polish

- Round-close / refund endpoint (admin or sponsor-triggered)
- Sponsor self-serve dashboard at `/sponsor-portal/`
- Token rotation (sponsor-initiated, admin-confirmed)
- Per-sponsor pricing tiers + Bharat OS platform fee
- Real LoRA fine-tuning (requires training-capable runtime —
  same gap as Phase 9.0d)
- Sponsor-side signed receipts (sponsor signs the round spec on
  create so workers can verify the round wasn't tampered with
  mid-flight)
- Per-round consent purpose binding (sponsor must declare the
  fine-tune purpose; consent purpose code on the worker side)
- Sponsor analytics: "your last 3 rounds had 18% participation
  drop-off after epoch 1" + per-round dashboards
- Anti-fraud: per-worker rate limit across sponsors; sponsor-side
  fraud signals when a single device hammers participation
