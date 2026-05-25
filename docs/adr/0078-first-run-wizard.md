# ADR 0078: Phase 2a.26 — First-Run Wizard (Sign-Up / Sign-In / Migrate)

## Status

Accepted

## Context

Through Phase 2a.25 the shell had no front door. `loadIdentities`
silently auto-bound to the first non-bootstrap identity from the
server's identity store, which worked for the demo (where
`seed-demo.mjs` pre-populates 8 personas) but had no analogue for
a real user opening the app for the first time. There was no
sign-up flow, no sign-in challenge, no way to recover from a lost
phone except via the §7c pairing flow buried in the Profile tab.

A real user opening Bharat OS needs three things on first launch:

1. A clear *"who are you?"* moment — am I new, am I returning, am
   I just looking around?
2. If new: identity creation, including the **recovery phrase
   handoff** that crypto wallets normalised (Trust Wallet,
   MetaMask) — *"we generated this for you, write it down."*
3. If returning on a fresh device: a clear path to the §7c
   migration flow, surfaced as a first-class option, not as a
   buried setting.

The founder asked specifically: *"In case user doesn't want to
generate a 12 word phrase, app should do it and ask user to save
it. Like we do for crypto wallets, Trust Wallet or MetaMask."*

## Decision

Ship a full-screen first-run wizard that fires when localStorage's
`deviceOwnerId` is absent. Three paths from the welcome screen:

```
                    ┌─ Set up a new identity (primary, ✨)
Welcome  ──────────┼─ Move from another phone   (secondary, 📲)
                    └─ Try a demo persona       (tertiary, 🎬)
```

### Path 1 — Set up a new identity

Four steps:

1. **Choose language** — 6-card grid (Hindi / Marathi / Bhojpuri /
   Tamil / Bengali / English). Each card shows the language in its
   own script + the English label.
2. **Enter display name** — single text input. No last name
   required, no Aadhaar prompt, no phone number forced.
3. **Identity created** — POST `/api/identities` with `displayName`,
   server returns the new Ed25519 identity. Then GET
   `/api/identities/:id/recovery-phrase` for the deterministic
   12-word phrase.
4. **Save your recovery phrase** — Trust-Wallet / MetaMask
   pattern. Phrase rendered as a 12-cell numbered grid (matches
   the standard mnemonic-grid UX users already know from crypto
   wallets). Mandatory "I've written these 12 words down on
   paper. I understand Bharat OS cannot recover them for me if I
   lose them." checkbox before *Done* enables. A *Copy to
   clipboard* secondary action for power users (with toast advice
   to delete after writing). An *I'll save it later* escape hatch
   that triggers a `window.confirm` warning + sets the persistent
   backup-warning banner on the Home tab.

After step 4 the wizard lands on a *"You're in"* screen with two
choices: enter Bharat OS, or first set up a passkey (one tap jumps
to the Profile tab and triggers the existing passkey-binding
flow).

### Path 2 — Move from another phone

Routes the user to the §7c WebRTC pairing receiver — the same
artifact ADR 0063 / 0066 / 0070 built, surfaced as a first-class
welcome-screen choice. Three claim modes in priority order:

- **📷 Scan QR** — uses `BarcodeDetector` + `getUserMedia` (from
  ADR 0070); the QR carries both the 6-digit code and the
  recovery phrase so the prompt is skipped entirely.
- **6-digit code typed** + `window.prompt` for the phrase
  (fallback for browsers without `BarcodeDetector`).
- The decrypted vault binds the migrated identity as the new
  device owner; `setBackupBackedUp(true)` because the phrase was
  inherited from the old device — no warning banner.

### Path 3 — Try a demo persona

Reuses the existing `reinitializeDeviceAs` flow. Explicitly
labelled *"demo-only path — you're not creating your own identity,
you're trying on someone else's."* Lists every seeded persona
(filtered out bootstrap / tenant identities) with their avatar +
display name + language + "demo persona" tag. One tap binds.

Demo personas also get `setBackupBackedUp(true)` — they don't
need a warning banner because the user isn't building their own
account.

### Backup warning banner (persistent)

When `deviceOwnerId` is set AND `bharat-os.shell.phraseBackedUp.v1`
is not `'1'`, a red-tinted banner sits at the top of the Home tab:

> ⚠️ **Back up your recovery phrase.** Without it you'll lose
> access if your phone is lost or wiped. **[Back up now]**

Tapping *Back up now* re-fetches the phrase for the active
identity and re-opens the wizard's phrase-step modal (no
re-creation needed — the phrase is deterministic from the
publicKey, so it's the same 12 words every time). Confirming
backup hides the banner.

### Reset device button (Profile tab)

A `Reset this device` link-button (red) sits next to *Replay
welcome tour*. Clicking it shows a `window.confirm` with explicit
copy:

> Reset this device?
>
> This clears the owner binding from this browser, so you'll see
> the welcome screen next time.
>
> The identity itself is NOT deleted — it stays on the server and
> can be re-claimed from another device via QR pairing. Make sure
> you have your recovery phrase if you want to come back later.

On confirm: clear `deviceOwnerId` / `householdIds` /
`phraseBackedUp` from localStorage and `window.location.reload()`.
Wizard fires again on reload.

### `loadIdentities` no longer auto-binds

Previously:
```js
if (!state.deviceOwnerId) {
  const owner = state.identities.find(…) ?? state.identities[0];
  state.deviceOwnerId = owner.id;
}
```

Now:
```js
if (!state.deviceOwnerId) {
  renderProfileList(); // wizard owns the next step
  return;
}
```

Bootstrap sequence: `setupFirstRun() → loadIdentities() → maybeShowFirstRun()`.
The wizard is the only path to setting `deviceOwnerId`. The
onboarding tour (existing) only fires after the wizard completes.

### Service worker

`bharat-os-shell-v22 → v23`.

## §15 bindings — what changed, what didn't

| Binding | Resolution |
|---|---|
| Identity is the person, not the device | The wizard's three paths embody this: *Set up new* creates a person; *Move from another phone* moves a person to a new device; *Try demo* explicitly puts a different person on this device. Each path makes the binding visible to the user, not assumed. |
| Aadhaar optional, never mandatory | New-identity wizard asks only for a display name. No Aadhaar prompt, no phone number forced. Phone OTP (recovery hook) is deferred to Tier 1 partner integration (Gupshup / Twilio); the wizard doesn't pretend it exists yet. |
| Recovery is the user's responsibility | Trust-Wallet/MetaMask pattern — the phrase is deterministically derived (no random seed for the user to misplace), but the user must write it down. The *"Bharat OS cannot recover them for me"* line in the checkbox is explicit. The *I'll save it later* escape hatch is honest about the consequence. |
| Never sell user data | The wizard captures only what's needed (display name + locale). No phone, no email, no Aadhaar at this step. |
| Workers / users never pay | Wizard is free. |

## Tests

No new test files — the wizard is a UI overlay over already-tested
API routes (`POST /api/identities`,
`GET /api/identities/:id/recovery-phrase`, the §7c pairing
endpoints). Existing `api.test.mjs` continues to pass.

Full suite: **280 / 280 green** (unchanged). SW cache to v23.

Live sanity check confirmed:
- First-run sheet HTML renders with three choice cards, language
  grid, name input, phrase grid, migration controls, demo persona
  list, done screen.
- Wizard JS hooks loaded: `setupFirstRun`, `maybeShowFirstRun`,
  `createNewIdentity`, `finalizeNewIdentity`, `resetThisDevice`.
- CSS for `.first-run-*` + `.backup-warning-*` rules served.

## Consequences

- **Bharat OS has a front door.** A new user opening the app on a
  fresh browser sees the welcome screen, picks New / Migrate /
  Demo, and lands at the right place. No silent identity binding.
- **The recovery-phrase story matches user expectations.** Trust
  Wallet / MetaMask normalised the *"we generated this for you,
  write it down, we can't recover it for you"* model — Bharat OS
  uses the same pattern with the same 12-word grid UX. The phrase
  is deterministic (from the publicKey), so even a user who
  ignored the backup step at first run can re-display it later
  from the banner.
- **The migration flow is now first-class.** A user moving to a
  new phone doesn't have to know to navigate to Profile → Move to
  a new phone — it's literally the second button on the welcome
  screen.
- **Demo personas remain accessible.** Investors / developers can
  still walk through Bharat OS as Sita or Priya — the path is
  clearly labelled demo-only so it doesn't confuse a real user.
- **Reset device is honest.** Spells out exactly what gets
  cleared (localStorage only — identity stays on the server), and
  what the user needs (the recovery phrase) to come back. This is
  cleaner than a silent "log out" that would suggest the identity
  is gone forever.
- **280 / 280 tests**, no API changes, SW cache to v23.

## Future polish

- **Phone OTP recovery step** — optional fourth field on the
  new-identity wizard, asking *"Phone number for recovery if you
  lose your phrase?"*. Today this is a Tier 1 partner integration
  gap (Gupshup / Karix); add it once that's wired.
- **Localized wizard copy** — currently the wizard text is English
  for all locales. Translation pass after the user picks a
  language in step 1 — re-render the rest of the wizard in that
  language.
- **Biometric sign-in on launch** — when a passkey is configured
  and `deviceOwnerId` exists, prompt for the passkey before
  showing the shell. Today the passkey is action-gating only;
  Phase 2b can move it to launch-gating.
- **Persistent recovery-phrase test** — a low-friction quarterly
  re-confirmation (*"Quick check: can you still find your
  recovery phrase?"*) so users keep the paper backup up to date.
  Crypto wallets do this; gives Bharat OS a chance to remind
  before a phone is actually lost.
- **Account linking across instances** — when the user already has
  Bharat OS on phone A and downloads it to phone B without
  triggering pairing, surface a *"Did you mean to migrate?"*
  helper if the API can match the phone's existing identity by
  some non-PII hint (e.g. the FCM token). Tricky — defer until
  Phase 2b hardware-keystore lands.
- **Sign-out vs reset distinction** — currently Reset clears
  everything. A softer *"Lock this profile"* that requires the
  passkey to unlock would let users hand the phone to someone
  briefly without resetting. Phase 2b.
