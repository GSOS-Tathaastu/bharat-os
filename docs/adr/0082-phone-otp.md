# ADR 0082: Phase 4.3 — Phone OTP Authentication Scaffold

## Status

Accepted

## Context

The §7c device-pairing flow (ADR 0063 + 0066 + 0070) gives users a
12-word recovery phrase as their account-recovery primary. Trust
Wallet / MetaMask normalised this pattern; crypto users accept the
*"we cannot recover this for you"* contract. But Bharat OS targets
hundreds of millions of users, many of whom will lose their phrase.

**Phone OTP is the recovery fallback** — when a user loses their
phrase, sending a code to a verified phone number is the only
practical re-entry path. Without it, a lost phrase = permanently
lost account, which is a hostile user experience at population
scale.

Phone OTP is also a *"verify your phone"* attestation that future
regulated workflows (UPI escrow, KYC onboarding) can use as
evidence the phone belongs to the user.

Real SMS providers (Gupshup, Karix, MSG91, Twilio) need vendor
contracts and onboarded sender IDs — Tier 1 partner work that's
outside this phase's scope. So Phase 4.3 ships the **protocol
abstraction + dev-mode logger provider**, leaving the production
SMS provider integration as a one-file swap once a contract
lands.

## Decision

### Two new artifacts

**`src/phase0/sms-provider.mjs`** — provider abstraction with
pluggable backends.

- `normalisePhone(input)` accepts 10-digit Indian numbers
  (auto-prepends `+91`), `+91XXXXXXXXXX`, `91XXXXXXXXXX`. Rejects
  anything not in E.164. Returns the canonicalised number or null.
- `getSmsProvider(name)` selects the provider. Default `'log'`
  (logs to stdout for dev testing); stubs for `gupshup`, `msg91`,
  `karix`, `twilio` that throw on `send` with a clear "configure
  env vars first" message.
- `sendSms({ phone, body })` is the only function call sites use —
  the rest is internal.

The `log` provider:
- Routes a structured `sms.outgoing` event through `logger.info`
  with `phoneMasked` (never the full number) and `bodyLength`
  (never the body — OTPs are sensitive).
- When `BHARAT_OS_LOG_OTP_BODIES=1` is set in dev, prints the
  plaintext OTP body to stdout (separate from the structured log)
  so ops can grep for it during testing. Production deploys leave
  this OFF.

When a real partner contract lands, swap the throwing stub with
the vendor SDK call — the API + database integration stays the
same.

**`src/phase1/phone-otp.mjs`** — generate / hash / verify.

- `createPhoneOtp({ identityId, phone, purpose, ttlSeconds })`
  generates a cryptographically random 6-digit code, salts + hashes
  it (SHA-256 over `stableStringify({ code, salt })` with a
  per-OTP `crypto.randomBytes(16)` salt). Returns
  `{ otpId, codeHash, salt, code, ... }`. **The plaintext `code`
  is returned for the API handler to hand to the SMS provider and
  then discard — it is NEVER persisted**.
- `verifyPhoneOtp(otp, providedCode)` returns a discriminated
  result: `'verified' | 'mismatch' | 'expired' | 'spent' |
  'too_many_attempts' | 'malformed'`. Increments attempts on
  mismatch. Uses `crypto.timingSafeEqual` to defeat timing
  attacks.
- Three purposes: `phone_verify` (attach a phone to an identity),
  `account_recovery` (the post-launch recovery path), and
  `sensitive_action` (step-up auth for regulated workflows).
- 5-minute TTL, 5 attempts max.

### Storage in both backends

`BosStore` gets `phone-otps/` directory + `savePhoneOtp` /
`readPhoneOtp` / `listPhoneOtps`. The ledger event records
`{ otpId, identityId, phoneMasked, purpose, status }` — never
the plaintext code, never the unmasked phone.

`SqliteStore` gets a `phone_otps` table with indexes on
`identity_id` and `status`. The DPDP erasure cascade includes the
table so a user's OTPs are erased atomically alongside everything
else.

### Two API endpoints

**`POST /api/phone-otp/send`** — body `{ identityId, phone,
purpose? }`. Validates phone via `normalisePhone`, validates
identity exists, validates purpose against the allowlist,
generates the OTP, persists the salted hash (NOT the plaintext),
hands the plaintext to the SMS provider, returns
`{ ok, otpId, expiresAt, phoneMasked, providerMessageId }`.

Classified as `expensive` policy (10/5min) by the rate-limiter —
real SMS is metered and we don't want abuse.

**`POST /api/phone-otp/verify`** — body `{ otpId, code }`. Reads
the persisted OTP, calls `verifyPhoneOtp`, persists the updated
state regardless of outcome (attempts counter, expiry, etc.).
**On success, attaches `phone_verified` to the identity's
attestations block** with only the masked form on the public
record — verifiers see `+919****10`, never the full number.

### Shell — *"📱 Phone (recovery)"* card on Profile tab

Two-step UI:
1. Enter phone → tap *Send code* → POST `/api/phone-otp/send`,
   shows masked phone + 5-minute validity hint.
2. Enter the 6-digit code → tap *Verify* → POST
   `/api/phone-otp/verify`. On success, status becomes
   *"Verified ✓"* with the masked phone visible; mismatch decrements
   attempt counter; expiry / too-many-attempts surface clear
   error messages.

The code-entry input is `inputmode="numeric"` + `autocomplete="one-time-code"`
so iOS / Android auto-fill the OTP when the SMS arrives.

`setActiveProfile` reflects the existing `phone_verified`
attestation onto the card so the status persists across profile
switches.

### Rate-limiter routing

`/api/phone-otp/send` joins the `expensive` policy (10/5min)
alongside identity creation, deletion, and DPDP export. Verify
stays in the cheaper `write` policy because legitimate users may
retry on typo.

### Service worker

`bharat-os-shell-v25 → v26`.

## §15 bindings — what changed, what didn't

| Binding | Resolution |
|---|---|
| Pointer, not payload | Plaintext OTP code is generated, sent via the provider, then discarded by the API handler. Storage holds only the salted hash. The identity's `phone_verified` attestation carries only the masked form. |
| Never sell user data | OTPs are operational data, not training material. No telemetry. |
| Aadhaar optional, never mandatory | Phone is similarly **optional** — the wizard never asks for it; the Profile-tab card is an opt-in surface. |
| Pii-safe logging | `sms.outgoing` log carries `phoneMasked` + `bodyLength`. Never the full number or the OTP body. The dev-mode plaintext-OTP stdout is gated by an explicit env var (off in production). |
| Cumulative privacy budget | Not directly applicable — OTPs aren't a training-data flow. But the rate-limiter cap (10 sends per 5 minutes per IP) gives us a per-IP abuse ceiling. |

## Tests

`tests/node/phone-otp.test.mjs` — 14 tests:

1. `normalisePhone` accepts 10-digit Indian + E.164 inputs
2. `normalisePhone` rejects obvious garbage
3. `createPhoneOtp` returns versioned envelope with hash + salt + plaintext code
4. `createPhoneOtp` generates distinct codes + salts across invocations
5. `verifyPhoneOtp` accepts the correct code
6. `verifyPhoneOtp` rejects wrong codes + increments attempts
7. `verifyPhoneOtp` rejects after `PHONE_OTP_MAX_ATTEMPTS` even with the correct code
8. `verifyPhoneOtp` reports expired separately from invalid
9. `verifyPhoneOtp` reports spent for already-verified OTPs
10. `createPhoneOtp` refuses unknown purpose
11. `maskPhone` masks middle digits, keeps country code + last 2
12. `PHONE_OTP_PURPOSES` has the three known purposes
13. `sendSms` via the log provider returns a providerMessageId
14. `sendSms` rejects invalid phone numbers

Full suite: **347 / 347 green** (was 333; +14 new). SW cache to v26.

Live sanity confirmed:
- `POST /api/phone-otp/send` returns the OTP envelope with masked
  phone, 5-min expiry, and a providerMessageId.
- Dev-mode stdout prints `[DEV OTP] to=+919****10: Bharat OS code:
  927838. Valid for 5 minutes. Never share this code.` for the
  test code.
- Structured `sms.outgoing` log captures `phoneMasked` +
  `bodyLength` only — no plaintext code, no full phone.
- Storage `phone_otps/...json` contains only `{ codeHash, salt,
  ... }` — `code` field is absent.

## Consequences

- **Recovery story is launchable.** When a real user loses their
  recovery phrase, phone OTP provides the fallback path that
  population-scale users actually need. (Phase 4.3 ships the
  *protocol* — actually enabling the recovery flow against a
  lost-phrase user is a future commit that consumes
  `account_recovery`-purpose OTPs to issue a new identity binding.)
- **The SMS partner integration is a one-file swap.** When the
  Gupshup / Karix contract lands, implementing the existing
  `notConfiguredProvider('gupshup')` stub is ~30 lines + env var
  config. The API surface and the database integration don't
  change.
- **§15 PII discipline holds end-to-end.** Plaintext OTP is in
  memory only between generation and provider dispatch. Logs and
  ledger see only the masked phone + the hash. The identity's
  public attestations carry only the mask, so verifiers cannot
  reverse-engineer the user's phone from a Trust Passport.
- **DPDP erasure covers OTP records.** The SqliteStore atomic
  cascade includes `phone_otps`. A user exercising right-to-
  erasure removes their pending OTPs alongside everything else.
- **347 / 347 tests**, SW cache to v26.

## Future polish

- **Real provider integration** — Gupshup (entity-registered
  sender IDs in India), Karix (RBI-recognised for financial
  workflows), MSG91 (cost-effective for high volume), Twilio
  (international fallback). One ADR per provider, each replacing
  the `notConfiguredProvider` stub.
- **Account-recovery flow** — accept an `account_recovery`-purpose
  OTP + a fresh device identity, atomically re-bind the household
  identity to the new device. Requires the §7c vault encryption
  pattern in reverse.
- **WhatsApp / RCS fallback** for users who don't receive SMS
  reliably (PoorNet rural).
- **Voice OTP** for low-literacy users — same `sendSms` interface,
  TTS-generated voice call dictating the digits.
- **OTP reuse prevention across phones** — currently a single
  identity can have multiple phones; if a phone is taken over
  via SIM-swap, all OTPs to the prior phone should be invalidated
  on rebind.
- **Rate-limit by phone number, not just by IP** — currently a
  malicious actor across IPs can still send OTPs to a target
  phone. Per-phone rate limit closes the gap.
- **Trusted-device passkey + phone-OTP combo** — for high-value
  actions, require both. Step-up auth via the existing
  `sensitive_action` purpose.
