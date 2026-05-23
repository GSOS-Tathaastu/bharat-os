# ADR 0049: User-Facing Vernacular Shell + Device-Claim Model + PWA-Scope Reframing

## Status

Accepted

## Context

The operator console at `/console/` (ADR 0005) is an admin observability
surface — useful for inspecting consents, ledger events, NCS, worker
authorizations, etc. — but it is explicitly not the consumer-facing
Bharat OS shell. The doc has flagged a "UI 2 Vernacular Shell Prototype"
in `docs/ui/ROADMAP.md` since Phase 0 and §17 listed it as deferred.

Two additional issues came up while demoing:

1. The first cut of a profile-switcher exposed *all* identities in the
   system registry as same-device profiles. That conflates the operator-
   console concept (every identity in the system) with the shell concept
   (this device's claimed household). §9A binds "identity is the person,
   not the device — a phone can hold several profiles, but only ones
   from the same household."
2. Phase 2a was framed as a *limited subset* relative to Phase 2b. That
   was wrong. ~85% of the §6 stack is PWA-buildable today; Phase 2b
   wins a specific ~15% (persistent mesh daemon, launcher replacement,
   system-wide intent capture, TEE attestation at OS level, syscall-
   level L4 enforcement). The doc's framing was hiding the addressable
   surface from the solo founder.

## Decision

### Phase 1.43 — user-facing vernacular shell at `/shell/`

New PWA surface in `public/shell/`:

- **Voice-first or text intent entry** with suggestion chips localized
  to the active persona's language (Hindi / Marathi / Bhojpuri / Tamil /
  Bengali / English).
- **Greeting and surface text** localize to the active persona.
- **Voice input** via Web Speech API where available, with fallback to
  text and clear error mapping (`not-allowed`, `service-not-allowed`,
  `network`, `audio-capture`, etc.) — the API is fragile on LAN HTTP
  contexts, so the fallback is explicit. The Phase 2a queue replaces
  this with IndicWhisper-WASM.
- **Per-action result cards** for every canonical action type (cab /
  hotel / ticket via `service_booking`; loan via `regulated_onboarding`;
  health via `health_record_read`; labor via `labor_match_post`; etc.),
  each rendering the orchestration's `localizedResponse` in an
  accent-coloured vernacular block plus a structured detail grid.
- **Flow card** showing the L8 → L7 → L6 → L4 → L3 plan with each
  step's status — the §6 architecture made visible to the user.
- **Recent activity** per-persona orchestration history (max 5).
- **Evidence footer** with orchestration ID, decision ID, audit hash,
  and failed-policy reasons when blocked.

### Device-claim model

- A device claims **one owner identity** at first run (stored in
  `localStorage`).
- Optionally adds **household members** via an "Add to household"
  action — recorded locally, with a toast that real Bharat OS requires
  a §9A in-person handshake for this in production.
- The profile sheet has two clearly separated sections:
  1. **"Your household — this device"** with the claimed identities.
  2. **"Demo: switch this device to another persona"** explicitly
     labelled as demo-only. Tapping a demo persona **re-initializes
     the device** (wipes localStorage, picks new owner). Conceptually
     "switch demo device," not "switch profile on the same device."

This addresses the §9A correction: non-related users are never
co-resident on the same device.

### Vernacular detection fix

`src/phase1/vernacular.mjs` now treats pure-ASCII text with no Indic
language markers as English. The Indic-romanized aliases deliberately
include code-mixed English words (`cab`, `taxi`, `hotel`, `book`) to
catch Hinglish like *"mujhe ek cab book karo"*, but those words alone
in *"Book me a cab"* no longer claim a non-English language.

### API + static routing

`src/phase0/api.mjs` now serves both `/shell/` and `/console/` as
static PWA roots. `/` redirects to `/shell/`. The `staticResponse`
helper handles `.webmanifest`, `.png`, `.ico` MIME types and emits
`cache-control: public, max-age=3600` for app-shell assets so each
service worker can cache them for offline use.

### PWA-scope reframing in §13 and §17

The §13 Phase 2 bullet was rewritten to make explicit that Phase 2a
(PWA) is **~85% of the product**, not a stripped-down preview. The
Phase 2a queue in §17 lists 13 prioritized PWA-buildable features with
effort estimates — UPI deep-link, document capture + OCR, WebAuthn,
Web Push, IndicWhisper-WASM, IndicTTS-WASM, on-device SLM via WebGPU,
WebRTC pairing transport, Background Sync mesh, etc. The Phase 2b
minimum scope is now an explicit five-item list of what genuinely
requires the OS layer.

## Consequences

- **A solo founder can ship Bharat OS as a PWA on any modern Android
  phone**, with the entire L3–L8 stack (and most of L2) running. The
  investor demo is the actual product surface for ~85% of use cases,
  not a stripped-down preview.
- The §9A device-identity binding is honoured in the UI: no
  "switch to anyone in India" anti-pattern.
- The English-vs-Hinglish fix removes the most jarring vernacular bug
  (`"Book me a cab"` mis-classified as `hi-Latn-IN`).
- §17 now contains a prioritized Phase 2a feature queue that any
  contributor (Codex, future Claude, human) can pick up sequentially.

### Still scaffold (Phase 2a queue or Phase 2b)

- Device claim itself is a localStorage write today; production needs
  the §7c ephemeral-key handshake plus WebAuthn biometric.
- Voice on LAN HTTP fails outside the localhost secure context;
  IndicWhisper-WASM (Phase 2a queue #5) removes that dependency.
- All L3 IndiaStack adapters remain mocked until partners are signed.
- Persistent mesh participation is Phase 2b.
