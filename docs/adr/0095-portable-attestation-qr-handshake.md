# ADR 0095: Phase 5.9 — Portable Work-History Attestation via Worker-Initiated QR Handshake

## Status

**Accepted — shipped.** Phase 6.0 (ADR 0096) shipped first across
Phases 6.0a / 6.0b / 6.0c, giving workers single-player reasons to
install Bharat OS. Phase 5.9 then layered the two-sided attestation
flow on top, as planned. The full QR-handshake flow with three
signing tiers, additive-only attestations, anti-fraud detection,
and the no-install-required `/sign/<tokenId>` static page is live.

## Context

The post-launch arc Phases 5.0-5.8 closed the technical foundation
(recovery, SMS reliability, backups, ops). The next strategic
question is: **which user population does Bharat OS solve a real
problem for on day 1, without state-rail or partner integrations?**

The clearest beachhead is gig delivery / ride workers and
service-trade workers (electricians, plumbers, domestic workers,
construction labour). Their concrete pain point: **reputation is
locked inside each aggregator**. When they switch from Swiggy to
Zomato, or from Urban Company to JustDial, they start from zero.
The aggregator that owns the rating owns the worker.

Bharat OS is **not** an aggregator. It does not dispatch deliveries,
match passengers to rides, or insure jobs. It provides one layer
below: a portable, user-owned identity + signed reputation record
that aggregators consume. Same layering as Aadhaar (identity
primitive consumed by KYC platforms); the analogous primitive
here is reputation.

The operational problem this ADR addresses: **Bharat OS doesn't
know when a delivery happened or who the customer was.** No
aggregator data feed exists (and likely never will — the lock-in
is what they're protecting). So the question becomes: who initiates
the attestation, and how does the customer participate?

## Decision

### Worker-initiated, not Bharat-OS-initiated

The trigger inversion: Bharat OS does NOT try to detect when a
delivery happens. The worker initiates. They have the motivation
(it's their reputation capital). Customers don't (they got their
food and are scrolling Instagram).

After completing a delivery / job, the worker opens Bharat OS and
taps "Just delivered? Get a signed receipt." Bharat OS generates
an unsigned attestation envelope and displays a QR code to show
the customer. **Customer participation is optional** — the worker
walks away with a self-signed claim either way (which counts as
nothing on its own; the customer signature is what gives it
weight).

### The QR handshake

The QR encodes only `{ workerId, category, timestamp, nonce,
worker-GPS }`. No customer data. The customer can sign without
revealing anything about themselves.

The QR resolves to a public URL: `https://signs.bharat-os.in/<token>`.
The customer scans with any phone (no Bharat OS install required).
Page shows: worker name (masked), category (food delivery / ride /
service / etc.), timestamp. Customer picks one of three signing
tiers.

### Three signing tiers — honest about gameability

| Tier | What happened | Friction | Weight |
|---|---|---|---|
| **0 — Anonymous tap** | Random phone tapped 👍 | None | Volume-only; trust-score neutral |
| **1 — OTP-confirmed** | Real phone passed a Phase 4.3 OTP challenge | One SMS step | Moderate; proves "a human with a phone" |
| **2 — Bharat OS signed** | Customer signs with their own Ed25519 key | App install + sign | High; customer's own Trust Passport on the line |

The Trust Passport renders the breakdown honestly: *"500 deliveries
— 420 anonymous taps, 70 OTP-confirmed, 10 fully signed."* Consuming
aggregators decide which tiers to trust. We do NOT pretend Tier 0 is
identity-verified.

### Additive-only attestations

**Only positive attestations are signed.** The Trust Passport
accumulates "X did Y on date Z" claims. There is no "X was rude"
counter-attestation. A worker with low engagement simply has fewer
signed attestations than one with high engagement — never a
permanent negative stamp following them.

Rationale: portable negative reviews entrench class bias. A single
bad day, transcribed by an annoyed middle-class customer, would
permanently damage an informal worker's livelihood across every
aggregator that consumes the substrate. The substrate must be
additive-only to be ethically defensible.

### Anti-fraud surface — what we detect server-side

| Pattern | Signal |
|---|---|
| Same customer phone signing for same rider repeatedly | Collusion candidate; flagged on Trust Passport |
| Cluster of attestations from one IP | Soft-sybil signal |
| Attestation GPS far from worker's stated delivery zone | Suspicious; weight-discounted |
| Rider with 10× median attestation rate for their tier | Audit candidate |
| Tier 0 share > 95% for a high-volume rider | Quality concern surfaced to consumers |

**What we can't prevent:** a worker with 5 friends genuinely signing
5 fake attestations per day. The pattern surfaces over months (same
5 phones repeatedly); low-volume determined fraud stays invisible.
This is reputation, not authentication. Same caveat as LinkedIn
endorsements.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Customer's phone never appears on the worker's record | Tier 0 records IP only (for sybil-detection); Tier 1 records a HASH of the phone (sufficient to detect re-use, insufficient to identify); Tier 2 records the customer's identity ID (already public) |
| Worker's identity is portable, not extractable | Trust Passport rendering follows the existing §13A verifier protocol — the consuming aggregator gets a signed bundle they verify, not the worker's private key |
| Bharat OS takes no accountability for performance | The signing UI surfaces this explicitly: *"Bharat OS records what others have signed. We do not verify identity or guarantee performance."* Liability stays with the worker, the customer who signed, the platform that dispatched, and the legal system. |
| Additive-only — no portable bad reviews | Design constraint above |
| No PII in observability | Server-side fraud-detection logs use hashed phone + masked GPS only |

## Implementation outline

When greenlit, the implementation is:

- **`src/phase1/portable-attestation.mjs`** — new module: builds
  unsigned attestation envelopes, generates QR token, validates
  customer signatures across three tiers, emits ledger event on
  attach.
- **`src/phase0/api.mjs`** — new endpoints:
  - `POST /api/portable-attestation/init` (worker generates a QR)
  - `GET /sign/<token>` (HTML page rendered for the customer)
  - `POST /api/portable-attestation/:token/sign-tier0` (anonymous)
  - `POST /api/portable-attestation/:token/sign-tier1` (OTP — reuses Phase 4.3)
  - `POST /api/portable-attestation/:token/sign-tier2` (Bharat OS signed)
- **`public/signs/`** — new minimal static page; no app dependency.
- **`public/shell/`** — worker-side card on the Earn tab with the
  "Just delivered?" button + the receipts ledger.
- **Trust Passport renderer** — extended to surface the tier
  breakdown.
- **`/api/trust-passport/portable?worker=<id>&category=<cat>`** —
  consuming-aggregator-facing endpoint that returns the signed
  bundle for verification.

Estimated test surface: ~25 new tests. No SW change beyond cache
bump for the new static page.

## Consequences

- **Worker reputation becomes portable for the first time.** A
  rider switching from Swiggy to Zomato walks in with verifiable
  history instead of starting at zero.
- **No aggregator integration required for the substrate to
  function.** Bharat OS doesn't need Zomato to opt in; the worker
  triggers, the customer signs, the record stands. (Consuming
  aggregators come later — that's the natural network effect once
  the substrate exists.)
- **The QR friction is real and honest.** Most customers won't
  scan. Day-1 realistic conversion: ~5% Tier 0, ~0.5% Tier 1,
  ~0.1% Tier 2. A rider doing 30 deliveries/day accumulates
  ~50 signed attestations/month. Over a year, ~600 — meaningful
  even at miserable conversion rates.
- **Aggregator hostility is a known risk.** Mitigations: collective-
  union onboarding first (high-rated riders are hard to blacklist);
  worker scans the QR, not the app (nothing detectable inside
  Zomato's app); anti-circumvention TOS could threaten the rider's
  account, which is why union backing matters.

## Future polish (after MVP)

- Consuming-aggregator OAuth-style flow so an aggregator can
  request the worker's Trust Passport with explicit consent (the
  Phase 4.3 phone-OTP flow generalises).
- Cryptographic decay / freshness — older attestations weighted
  less than recent ones. Today every attestation counts equally.
- Cross-category reputation transfer rules — a 5-star delivery
  rating doesn't necessarily mean trustworthy electrician.
  Consuming aggregators should see category-restricted scores.
- Worker-initiated bulk re-issuance: a worker who lost their phone
  can prove ownership via Phase 5.0 recovery + re-anchor all prior
  attestations to the recovered identity.
