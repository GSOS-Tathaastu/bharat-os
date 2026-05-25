# ADR 0086: Phase 5.0 — Account Recovery via Phone OTP

## Status

Accepted

## Context

Phase 4.3 (ADR 0082) shipped the phone-OTP scaffold that lets a
user attach a verified phone number to their identity. Phase 4.6
(ADR 0085) closed the launch arc. But one critical flow was
documented as "future polish" rather than shipped: **account
recovery**.

Without it, a user who loses their 12-word phrase is locked out
forever. At population scale most users will eventually lose
their phrase (the Trust Wallet / MetaMask experience confirms
this — users lose seeds even when warned repeatedly). Phone OTP
is the recovery fallback, but until this phase the OTP only
*attached* a phone; nothing consumed an `account_recovery`-purpose
OTP to actually restore an account.

Phase 5.0 closes that loop: lost-phrase user → phone number →
6-digit OTP → identity restored.

## Decision

### New artifact — `src/phase1/account-recovery.mjs`

Three pure functions + one helper:

- **`findIdentityByPhone(identities, phone)`** — locates an
  identity whose `phone_verified` attestation's masked phone
  matches the given phone (normalised via the SMS provider's
  `normalisePhone`). Returns null on no match or invalid input.
  Sorts collisions by most-recent-verifiedAt (the most likely
  match for a recovery attempt).
- **`startAccountRecovery({ identity, phone, ttlSeconds, at })`**
  — generates an `account_recovery`-purpose OTP via
  `createPhoneOtp`, derives a `recoveryId` from the request
  (sha256 of `{ identityId, phone, at, salt }`). Returns the
  envelope including the plaintext OTP code for the API handler
  to send via SMS and then discard.
- **`verifyAccountRecovery(otp, providedCode, { at })`** — wraps
  `verifyPhoneOtp` but additionally requires the OTP's purpose
  to be exactly `account_recovery`. Returns the discriminated
  result.
- **`buildRecoveryBundle({ identity, recoveryPhrase, memoryRecordRefs })`**
  — composes the response the new device receives after
  verification: the full identity (incl. privateKey + vaultKey),
  the deterministic recovery phrase (saves the user from typing
  it), the memory-record refs the receiver can replay. Returns
  the bundle with an honest `warning` field flagging this as the
  Phase 2a server-side-keys design (Phase 2b replaces with
  device-generated keys + signed identity-transfer events).

### Two API endpoints

**`POST /api/recovery/start`** — body `{ phone }`. Five steps:

1. Normalise phone via `normalisePhone`.
2. `findIdentityByPhone(identities, phone)`. If no match, return
   a **no-match sentinel** response with the same shape as
   success (sentinel `recoveryId`, fake `phoneMasked`, generic
   note). This is intentional — §15: an attacker who knows a
   phone number must not be able to learn whether it's
   registered with Bharat OS just by probing the endpoint.
3. `startAccountRecovery({ identity, phone })`.
4. Strip plaintext code, `store.savePhoneOtp(persisted)`.
5. `sendSms({ phone, body: 'Bharat OS recovery code: …' })`.

Rate-limited under the `expensive` policy (10/5min) — sends real
SMS in production.

**`POST /api/recovery/verify`** — body `{ otpId, code }`. Three steps:

1. Read the OTP. Require `purpose === 'account_recovery'`
   (rejects misuse of phone-verify OTPs for recovery).
2. `verifyAccountRecovery(otp, code)`. Persist the updated OTP
   state. On non-verified statuses, return 400 with the OTP
   status.
3. On verified: read the identity, derive the recovery phrase,
   gather memory refs, build the bundle. Emit an
   `account_recovery.completed` ledger event with the masked
   phone + recoveryOtpId for after-the-fact SIM-swap detection.

### Welcome-screen UI

The first-run wizard's welcome step gains a dashed-border link
at the bottom:

> 🔁 I lost my recovery phrase (use phone instead)

Tapping it goes to a new `recover` step:

```
Recover your account

Enter the phone number you verified earlier. Bharat OS will
send a 6-digit code. If the phone matches a registered account,
you'll be back in.

[ 10-digit number or +91… ]

      [Send code]

(after send)
Code sent to +919****10. Valid for 5 minutes.

[ 6-digit code ]

      [Verify & restore]
```

On verify success, the new device persists the recovered
identity as device owner, the user is auto-marked as having
backed up their phrase (since it's literally on the bundle they
just received), and the wizard auto-dismisses after a 1.2-second
"Recovered ✓" confirmation.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Identity is the person, not the device | Recovery rebinds the same Ed25519 key pair to a new device. The user is unchanged; only the phone-as-host changes. |
| Pointer, not payload | The lookup happens against the masked-phone field on the identity's public record. The full phone never moves through the lookup path. |
| Phone numbers are PII | The recovery start endpoint NEVER reveals whether a phone is registered — no-match returns the same shape as success. Even a SIM-swap attacker probing for "is this number registered" gets the same response either way. |
| Audit trail of recovery | Every successful recovery emits an `account_recovery.completed` ledger event with the masked phone + the OTP ID. Ops can correlate to detect a wave of recoveries against a single phone range (a SIM-swap takeover indicator). |
| Phase 2a server-side-keys caveat | The bundle includes `privateKeyPem` because Phase 2a's identity store is server-side (ADR 0066 caveat). The bundle's `warning` field documents this honestly; Phase 2b moves the keys to the device hardware keystore and the recovery flow becomes a signed identity-transfer event from the old identity. |

## Tests

`tests/node/account-recovery.test.mjs` — 13 tests:

1. `findIdentityByPhone` matches the verified attestation
2. returns null on no-match
3. skips identities without a verified `phone_verified`
4. returns null for invalid phone input
5. prefers most-recently-verified on mask collision
6. `startAccountRecovery` returns a versioned envelope with an OTP
7. refuses without identity / phone / valid phone
8. `verifyAccountRecovery` rejects non-`account_recovery` OTPs
9. accepts the correct code on a valid recovery OTP
10. propagates mismatch/expired/spent statuses
11. `buildRecoveryBundle` returns the full bundle + warning
12. refuses identities without privateKeyPem
13. **end-to-end**: phone → identity lookup → recovery request →
    verify → bundle — full round-trip that mirrors what the API
    handler does in production

Full suite: **385 / 385 green** (was 372; +13 new). SW cache to v29.

Live sanity confirmed:
- `POST /api/phone-otp/send` issues an OTP (used to verify a
  phone)
- Dev-mode stdout prints the plaintext code (gated by
  `BHARAT_OS_LOG_OTP_BODIES=1`)
- The masked phone shows up in the structured `sms.outgoing` log
- Storage holds only the salted hash; the plaintext code is
  never persisted

## Consequences

- **The lost-phrase deadlock is solved.** A user who lost their
  12-word phrase but kept their phone can recover their account
  in ~90 seconds (phone OTP send + receive + type + verify).
- **The §15 binding around phone enumeration holds.** The
  no-match sentinel response means an attacker who knows a
  user's phone number cannot use the recovery endpoint to
  confirm they have a Bharat OS account.
- **SIM-swap detection is feasible.** Every recovery emits an
  audit event with the masked phone. Ops alerting can pick up a
  wave of recoveries against a single phone range and
  intervene.
- **Future Phase 2b transition is documented.** The
  `warning` field on the recovery bundle says exactly what
  changes when keys move to the device hardware keystore. The
  protocol layer is positioned for that swap.
- **385 / 385 tests**, SW cache to v29.

## Future polish

- **Cooldown after recovery** — once an identity has been
  recovered, gate sensitive actions (sending money, granting
  trust attestations) for 24h to absorb a SIM-swap attack
  window. The new device is the same identity but the recovery
  event creates a known-fresh-host signal.
- **Multi-factor recovery** — require BOTH phone OTP AND email
  OTP (when email is added) for high-value accounts. Today the
  phone alone is sufficient.
- **Trusted-device recovery** — let the user nominate one of
  their other paired devices (from §7c) as an authorisation
  source for the recovery, so SIM-swap alone isn't enough.
- **Recovery-attempt rate-limit per phone** — the current
  `expensive` rate-limit policy is per-IP; a SIM-swap attacker
  rotating IPs could still hit the endpoint. Per-phone limiting
  closes that gap (Phase 4.3 future-work item).
- **Webhook on recovery** — notify the user's other paired
  devices via push when a recovery succeeds, so they can
  rebind if it wasn't them.
- **Email OTP path** — when email is added as a verified
  attestation, recovery via email mirrors the phone flow.
