# ADR 0130 — Phase 12.0.1: real sign-up + sign-in on /app/

Status: Accepted (2026-06-01).
Phase: 12.0.1 (auth follow-up to Phase 12.0).
Depends on: Phase 0 identity primitives, Phase 4.3 phone-OTP
substrate, Phase 5.0 account recovery, Phase 11 /app/ scaffold,
Phase 11.9 Earn/Use hero.

## Context

The user flagged on 2026-06-01 (post Phase 12.0 ship) that
even for the demo, `/app/` should have real sign-up / sign-in
alongside the seeded-persona picker. Sub-second observation —
the founder is right that "Pick a demo persona" reads as
"toy app" to investors; a real account flow reads as a
shippable product.

The substrate was already complete:
- `POST /api/identities` creates an Ed25519-backed identity
  with a display name.
- `POST /api/phone-otp/send` issues a 6-digit OTP, stores the
  salted hash, hands the plaintext to the SMS provider, returns
  `{otpId, expiresAt, phoneMasked}`.
- `POST /api/phone-otp/verify` verifies the code, attaches the
  phone as a `phone_verified` attestation to the identity.
- `POST /api/recovery/start` finds an identity by verified phone
  number and issues an `account_recovery` OTP. §15 anti-
  enumeration sentinel returns the same response shape whether
  the phone matched or not.
- `POST /api/recovery/verify` verifies the recovery OTP and
  returns the full identity bundle (including a deterministic
  recovery phrase).

So this ADR adds the user-facing flow on top of that substrate
plus one small BE addition: a dev-only OTP reveal so the demo
doesn't require anyone to read the server console for the code.

## Decision

Three changes; no schema migrations.

1. **Dev-only OTP reveal** in `src/phase0/api.mjs`:
   - `POST /api/phone-otp/send` response now includes
     `_devOtpCode: <plaintext>` **ONLY when the configured SMS
     provider is `log`** (`BHARAT_OS_SMS_PROVIDER` unset or
     `=log`). Production providers (`gupshup` / `twilio` /
     `msg91`) never see this field.
   - `POST /api/recovery/start` does the same — but only on the
     real-match branch. The §15 anti-enumeration sentinel branch
     (returned when phone doesn't match any identity) MUST NOT
     include the field; otherwise its presence would leak the
     match signal. A dedicated test pins this.
   - Justification: the `log` SMS provider already prints the
     plaintext code to stdout when `BHARAT_OS_LOG_OTP_BODIES=1`.
     The reveal field exposes the same information in a more
     demo-friendly place (the JSON response) so investors don't
     need a terminal. Production providers never reach this
     branch.

2. **Four new FE hooks** in `frontend/src/lib/hooks.ts`:
   - `useSignUpStart()` — `mutationFn` chains
     `POST /api/identities` + `POST /api/phone-otp/send` so the
     caller hands `{displayName, phone}` and gets back the
     created identity + an `OtpSendResponse` (including
     `_devOtpCode` in dev).
   - `useSignUpVerify()` — wraps `POST /api/phone-otp/verify`;
     invalidates the `identities` query on success so the
     newly-created identity shows up in the persona list.
   - `useSignInStart()` — wraps `POST /api/recovery/start`.
   - `useSignInVerify()` — wraps `POST /api/recovery/verify`;
     returns the `recoveryBundle` which carries the full
     identity record so the FE can set it active.

3. **New `<AuthSheet>` component** at
   `frontend/src/components/AuthSheet.tsx` — a sheet with a
   sign-up / sign-in toggle, three steps (phone → OTP → done),
   tied to the four hooks above. Surfaces:
   - On sign-up: display name + phone + role choice
     (Earn / Use) → "Send me a code" → step 'otp'.
   - On sign-in: phone only → "Send me a code" → step 'otp'.
   - On step 'otp': dev-OTP callout in warning tone with the
     code rendered in a display-size monospace block + honest
     copy "This is only shown because the server is using the
     `log` SMS provider. Production SMS providers will never
     carry this field." Then a 6-digit input + verify action.
   - On verify success: `setActive(identity.id)` via the
     Zustand `identityStore`, toast, navigate to `/worker` or
     `/citizen`, close sheet.

   Onboarding hero footer rewritten to surface the auth CTAs
   as the primary path, with the demo personas above still
   reachable in their original position. Copy: "Or pick a demo
   persona above to explore without signing up."

## Why surface the dev OTP in the response and not just toast it

The simpler alternative was to keep the OTP server-side only
and require the demo user to read the server console. Two
reasons not to:

- The investor demo is the actual point of the MVP per
  `bharat-os-mvp-for-investment.md`. A demo that requires
  "look at this other window for the code" reads as
  half-baked.
- The OTP body is already in the structured log stream when
  `BHARAT_OS_LOG_OTP_BODIES=1`. The dev-only response field is
  the same data in a more demo-friendly place. Any production
  deployment that sets a real SMS provider gets zero leak
  because the response branch is gated by provider name.

The §15-significant property — the anti-enumeration sentinel
branch in `/api/recovery/start` must NOT include the field —
is pinned by a dedicated test.

## §15 bindings

- **Anti-enumeration preserved.** Sentinel branch of
  `/api/recovery/start` (when phone matches no identity)
  returns the exact same shape as the matched branch BUT
  WITHOUT `_devOtpCode`. Including the field on the sentinel
  would let an attacker probe whether a phone is registered
  by checking for the field's presence. A test pins this.
- **Production never gets the field.** Conditional is on
  `process.env.BHARAT_OS_SMS_PROVIDER === 'log'` (or unset,
  defaults to log). Setting any real provider name disables
  the reveal in the same response branch.
- **Phone never leaves identity record verbatim.** Substrate
  unchanged — only `phoneMasked` lives on the public identity;
  the OTP store holds the full number until it expires.
- **Sign-in does not expose private keys to attacker.** The
  recovery bundle returned by `/api/recovery/verify` includes
  the identity record (which carries `privateKeyPem` server-
  side since signing is still server-side per ADR 0066). FE
  uses only the `id` — does not store the private key in
  localStorage. Phase 13+ Bharat ID moves signing to device
  hardware keystore.
- **Recovery cooldown still applied.** The 24-hour post-
  recovery cooldown (Phase 5.2) on the recovered identity is
  unchanged; a SIM-swap attacker who signs in still cannot
  immediately delete the account or chain another recovery.

## Tests

6 new Node tests in
[`tests/node/auth-dev-otp-reveal.test.mjs`](../../tests/node/auth-dev-otp-reveal.test.mjs):

- `phone-otp/send` includes `_devOtpCode` when SMS provider is
  `log` (default).
- `phone-otp/send` MUST NOT include `_devOtpCode` when SMS
  provider is `gupshup`.
- `recovery/start` includes `_devOtpCode` when SMS provider is
  `log` AND identity matched.
- **§15 critical** — `recovery/start` anti-enumeration sentinel
  MUST NOT include `_devOtpCode` for unknown phone. Without
  this test, the dev-reveal would leak the match signal.
- Full sign-up flow round-trip: create identity → send OTP →
  verify → identity has `phone_verified` attestation.
- Full sign-in flow round-trip: signed-up user can recover via
  `recovery/start` + `recovery/verify`, returns the original
  identity ID.

Full Node suite: 884 → **890** (+6). FE Vitest unchanged at
45/45. Bundle: main 392 → **399 KB / 120 KB gzipped** (+7 KB
for `<AuthSheet>` + 4 hooks + Onboarding hero rework). wllama
lazy chunk unchanged 292 KB / 126 KB gzipped. Build 2.02s.

End-to-end verified on the running server:
```
POST /api/identities {displayName} → 201 + new id
POST /api/phone-otp/send {identityId, phone, purpose} →
  _devOtpCode: 493041, phoneMasked: +919****00
```

## Consequences

- `/app/` onboarding has a real account flow for the first
  time. Investors see "create account" / "sign in" CTAs on the
  hero; tap → name + phone + role → 6-digit code (revealed in
  the sheet for the demo) → land on `/worker` or `/citizen`
  with a persisted identity.
- Demo persona picker stays for investors who want to skip
  past auth and inspect specific pre-seeded scenarios
  (Priya the cab driver, Sneha the citizen, etc.). Both paths
  set the same `activeIdentityId` in the Zustand store; the
  rest of `/app/` doesn't care which path got the user there.
- Sign-in via the existing Phase 5.0 account-recovery
  substrate is honest about the §15 binding — recovery
  cooldown applies post-sign-in, anti-enumeration sentinel
  preserved.
- Pattern reuse for Phase 12.2 wave-1 per-role onboarding —
  the per-role wizard will use the same OTP-via-phone path
  before collecting role-specific KYC.

## What's NOT in this sub-phase

- **WebAuthn / passkey sign-in.** Phone OTP is the v1 path.
  Passkeys land in Phase 13+ alongside Bharat ID.
- **Bound device keys.** Sign-in returns the recovery bundle
  but the FE only uses the id. A future Phase 2a Android-app
  ship will bind a device-keystore key to the identity so
  re-sign-in isn't needed on the same device.
- **Phone change flow.** Once a citizen sets a phone, changing
  it requires a separate "change phone" flow which doesn't
  exist. Polish.
- **Multi-device sync.** Sign-in on a second device works (the
  recovery bundle is portable) but the second device starts
  with no local state. A real multi-device story needs
  device-pairing UI (Phase 1.x has the substrate; FE not
  surfaced).
- **OAuth / social.** No Google / Apple sign-in. Bharat OS is
  the trust anchor, not the relying party.
- **Email recovery.** Phone-only. Email is not an Indic-first
  identity vector.
- **i18n.** Sheet copy is English. Hindi + Marathi + Tamil etc.
  is Phase 12+ polish via the SLM-A vernacular layer
  ([[phase-12-13-sequencing-set]]).

ADR 0130.
