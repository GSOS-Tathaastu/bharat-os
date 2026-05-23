# ADR 0048: Phase 1 Tie-Off Bundle — Console, CLI, PWA, Device Pairing

## Status

Accepted

## Context

The `BHARAT_OS.md` §17 status section listed six Phase 1 tie-offs that
needed to close before any Phase 2 work begins. ADR 0046 closed item #1
(NCS surfacing) and ADR 0047 closed item #2 (worker authorization
receipts). This ADR bundles the remaining four — they are all surface
work over existing primitives, no new architecture, so a single ADR is
clearer than four separate ones.

## Decision

### Operator console panels for 1.37–1.41 surfaces

The console now renders:
- A **Mesh / NCS** column on the Trust Passport table, surfacing
  `contributedBytes`, `consumedBytes`, `scoreBytes`, and the
  `producer | consumer` class from the §13B fair-use lever.
- A new **§9B Service Marketplace** panel listing every
  `service_booking` orchestration with its booking ref, vertical,
  provider name, source (`native` vs `ondc-bridge`), fare, detected
  locale, status, and completion timestamp.
- A new **§9A Worker Authorizations** panel listing signed
  authorization receipts with a per-row "Verify" button that calls
  `POST /api/worker-authorizations/:id/verify`.

### CLI commands for service booking + vernacular inspection

- `bos service book --actor-id ID --vertical cab|hotel|ticket|food|grocery|services [--from X --to Y --amount N]`
  — executes the §9B native marketplace tool directly without going
  through the intent orchestrator. Useful for manual testing of routing,
  pricing, and the ONDC-bridge inclusion flag.
- `bos vernacular normalize --intent "TEXT"` — runs the §7e/§7a
  vernacular normalizer and prints the matched aliases, detected locale,
  detected language ID, and a localized response phrase for the implied
  action type.
- `bos vernacular languages` — lists the five supported Indian
  languages with their locales.

### Progressive Web App conversion

`public/operator-console/` is now installable as a PWA. New files:
- `manifest.webmanifest` — standalone display mode, theme color, icons.
- `icon.svg` — minimal "BOS" mark.
- `service-worker.js` — caches the app shell (`index.html`, `app.js`,
  `styles.css`, manifest, icon) for offline boot. **API calls always go
  to the network** so the L4 audit ledger and §15 pointer-not-payload
  guarantees are not subverted by stale cache responses.

The Phase 0.3 static handler learned `.webmanifest`, `.png`, `.ico`
MIME types and emits `cache-control: public, max-age=3600` for the
app-shell assets so the service worker can actually cache them. The
rest of the console still serves `no-store` for dev iteration speed.

The investor-demo runway is now: start the API on the founder's
laptop, side-load the PWA onto a phone over the same WiFi, and have a
runnable Bharat OS on the phone with no Play Store / OEM dependency.
This is the §13 / §17 Phase 2a path.

### Device pairing scaffold

`src/phase1/device-pairing.mjs` is the runnable seam for §7c phone
migration. It is explicitly a SCAFFOLD — not production cryptographic
device pairing:
- `generateRecoveryPhrase(identity)` — deterministic 12-word phrase
  from the identity's public key fingerprint, using a 64-word embedded
  scaffold list (~72 bits entropy). Production must replace this with
  a full BIP-39 or equivalent multilingual wordlist (Indic-friendly per
  §7a) before any real-money flow.
- `verifyRecoveryPhrase(identity, phrase)` — confirms the phrase
  matches the identity.
- `createPairingPayload(identity, {ttlSeconds})` — builds a JSON-safe
  envelope the old device would encode as a QR; carries identity ID,
  display name, public-key fingerprint, nonce, and expiry.
- `verifyPairingPayload(payload, identity)` — validates the payload
  against the local identity record.

CLI: `bos device recovery-phrase`, `bos device verify-phrase`,
`bos device pair`.

Hardening (real ephemeral-key handshake over WiFi/Bluetooth, full BIP-
39 wordlist, encrypted local transport of the L5 vault) is a Phase 2b
commitment per §7c "status" and §17.

## Consequences

- §17 Phase 1 tie-off list is closed end-to-end. The investor demo loop
  is now coherent: from CLI primitives, to operator console
  observability, to a PWA that runs on a phone.
- 133/133 tests green (was 124 going in; +9 from device-pairing tests).
- Phase 2 commitments can now begin against a clean Phase 1 surface.
  Per [[phase-1-clean-before-phase-2]] memory, Phase 2a (Android app /
  PWA distribution) is the next focus and is largely already started by
  this ADR's PWA work.
- The device-pairing scaffold uses a deliberately small wordlist. Any
  use beyond demo MUST be replaced before storing real money on the
  recovery phrase.
