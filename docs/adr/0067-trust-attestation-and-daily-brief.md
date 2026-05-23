# ADR 0067: Phase 2a.18 §9C Vignette Coverage — Trust Attestation + Daily Brief

## Status

Accepted

## Context

§9C lists 18 canonical user vignettes that the shell should make
clickable. By Phase 2a.17, sixteen of them were covered (the six
core action types handle vignettes 1–4, 7, 9–11, 16a + the
mesh/operator surface, with vignette 8 falling out as a mediation
mode of regulated_onboarding and vignettes 5, 6, 12–14 being supply-
side / OEM / B2B flows that don't surface in a single citizen
shell).

Two genuinely citizen-facing vignettes had no shell action:

- **#15 Sneha → landlord trust attestation** (§13A #7 Trust-as-a-
  service) — the only §13A revenue line never exercised in a
  demoable flow.
- **#16b Priya's morning daily brief** — the canonical *on-device
  SLM* demo moment named explicitly in the doc. Cannot be told
  without a place to type *"give me my morning brief"*.

Without these, the §9C → shell mapping has visible holes that an
investor reading the doc would notice.

## Decision

Add `trust_attestation` and `daily_brief` as first-class action
types alongside the existing six.

### Tools — `src/phase1/tools.mjs`

Two new tool adapters added to `TOOL_REGISTRY` + `ADAPTERS`:

- **`trust_passport_attestation`** (`layer: L7`, `mocked: false`).
  Mints a scoped, signed attestation envelope: `{ subjectId,
  verifierName, purpose, claims, issuedAt, expiresAt, shareDays,
  rawPiiReturned: false, revenueLine: '§13A #7 …' }`. `shareDays`
  clamps to `[1, 90]`. Default claim set is
  `[identity_verified, income_band, rental_history_clean,
  no_open_flags]`; callers can override via `metadata.requestedClaims`.
  Every claim resolves to a band or boolean — selective disclosure
  literal — never to a raw value (`disclosure: 'band_or_boolean'`).
- **`daily_brief_compose`** (`layer: L7`, `mocked: false`). Returns
  `{ subjectId, runtime: 'on_device_only', networkLegs: 0,
  horizonHours, sections, issuedAt, rawPiiReturned: false,
  revenueLine: 'none — citizen-facing (§15 binding)' }`.
  `horizonHours` clamps to `[1, 168]` (one hour to one week).
  Default sections: `[calendar, mesh_earnings, reminders, unread]`.

### Skills — `src/phase1/skills.mjs`

Two new skill definitions:

- `bos:skill:trust-passport-attestation` — `category: 'trust'`,
  `requiredScopes: ['trust.attest', 'consent.record']`,
  `dataExposure: 'attestation_bands_only'`.
- `bos:skill:daily-brief-compose` — `category: 'agent'`,
  `requiredScopes: ['memory.read', 'consent.record']`,
  `dataExposure: 'on_device_summary_only'`.

### Orchestration templates — `src/phase1/orchestrator.mjs`

`trust_attestation` is `regulated: true` (signed attestation needs
consent) with the plan: `parse_attestation_request →
select_claims_for_disclosure → mint_signed_attestation →
write_receipt`.

`daily_brief` is `regulated: false` (memory.read only) but still
consent-required via the skill scopes, with the plan:
`parse_brief_request → gather_local_signals → compose_on_device →
write_receipt`.

### Vernacular coverage — `src/phase1/vernacular.mjs`

Both action types gain aliases across **all six supported
languages**: Hindi (Devanagari + Latin), Marathi, Bhojpuri, Tamil,
Bengali, and English (via the fallback `INTENT_PATTERNS`).
Verified via tests:

- *"Generate a trust attestation for my landlord"* → `trust_attestation`
- *"Mujhe landlord ke liye trust attestation chahiye"* → `trust_attestation`
- *"मुझे मकान मालिक के लिए विश्वास प्रमाण-पत्र चाहिए"* → `trust_attestation`
- *"வீட்டு உரிமையாளருக்கு நம்பிக்கை சான்றிதழ் வேண்டும்"* → `trust_attestation`
- *"Give me my morning brief"* → `daily_brief`
- *"Aaj ka brief sunao"* → `daily_brief`
- *"आज का ब्रीफ बताओ"* → `daily_brief`
- *"What is on today"* → `daily_brief`

Vernacular response strings (planned / blocked / completed) added
for both actions across all seven locales (six languages + en-IN
fallback) — the shell's localized response card now speaks both new
actions in the user's language.

### Shell — `public/shell/app.js` + `index.html` + `styles.css`

- `ACTION_ICON_BY_TYPE`: 🛡️ for `trust_attestation`, 📋 for
  `daily_brief`.
- `ACTION_LABEL_BY_TYPE`: *"Trust attestation"* and *"Daily brief"*.
- Suggestion chips: one trust + one brief chip added to every
  locale's suggestion set (replacing the two least-distinguishing
  prompts; the loan / cab / health / train chips stay, hotel /
  scheme drop down to make room).
- Result rendering: `trust_attestation` shows the verifier, purpose,
  share window + expiry timestamp, attestation ID, and a
  selective-disclosure claims list with each claim's value.
  `daily_brief` shows runtime, network legs (= 0), horizon, section
  list, and a §7e on-device note.
- New CSS: `.attestation-claims*` styles for the selective-
  disclosure list.

### Service worker

`CACHE_NAME` bumped `v13 → v14` to pick up the new JS / CSS.

## Tests

`tests/node/trust-and-brief.test.mjs` — 10 focused tests:

1. tool registry includes both new tools
2. skill registry covers both action types with correct scopes
3. orchestration templates wired
4. vernacular classification across 4 locales for both actions
5. response strings present for every locale × status pair
6. trust_attestation mints a signed, time-bound attestation
7. trust_attestation honours custom claims + clamps shareDays
8. daily_brief completes on-device with zero network legs
9. daily_brief without consent is blocked
10. horizonHours clamps to [1, 168]

Full suite: **220 / 220 green** (was 210; +10 new).

## §15 bindings — how each is preserved

| Binding | Resolution |
|---|---|
| Pointer, not payload | Trust attestation returns bands + booleans only. Daily brief returns metadata only — the actual brief text is rendered client-side. |
| Never sell user data | Both tools return `rawPiiReturned: false`. The receipt is a metadata envelope, not raw memory or financial data. |
| Monetize businesses, never citizens | Trust attestation `revenueLine` is *"§13A #7 Trust-as-a-service (verifier-paid)"* — the landlord/NBFC/HR portal pays per attestation, the subject pays nothing. Daily brief `revenueLine` is *"none — citizen-facing (§15 binding)"*. |
| Identity is the person, not the device | Attestation is signed against the subject's identity, valid on any of their devices. Daily brief composes from the active profile's memory. |

## Consequences

- §9C coverage closes from 16 / 18 → 18 / 18 user-facing vignettes
  with a clickable shell action. The two remaining gaps (#12 NBFC
  B2B, #13 Lava OEM, #14 logistics dispatcher) are intentionally
  not citizen-shell flows — they belong to the operator console
  and OEM partnership surfaces.
- The §13A #7 revenue line is finally demoable end-to-end. An
  investor can type *"trust attestation for my landlord"*, see
  the bands-only disclosure, and read the per-attestation revenue
  framing in the result evidence row.
- The §7e on-device routing story (memory + activity in, vernacular
  text out) now has a named demo handle: *daily brief*. Today the
  shell shows the brief envelope; once the Tier 4 SLM (Sarvam-1 q4
  / Gemma 2 q4) is installed it composes the actual vernacular
  paragraph from the local signals.
- Backward-compatible — all existing action types and tests
  unchanged. The two new templates slot in without touching any
  L4 policy or L3 tool adapter.

## Future polish

- Wire the Trust Passport (`src/phase1/trust-passport.mjs`) into
  the attestation tool so the `claims` array is derived from the
  user's actual evidence (active consents, attestation count, NCS,
  open flag count) instead of from request metadata. The current
  shape supports it via the `metadata.requestedClaims` override;
  the cleaner version derives the defaults from the passport.
- Add a dedicated `/api/identities/:id/trust-passport` endpoint so
  the shell can show a Trust Passport card before the user issues
  an attestation — *"this is what the verifier would see"* lets the
  user preview the selective disclosure before agreeing.
- Generate the actual daily-brief text via the on-device SLM
  (`public/shell/ondevice-slm.mjs`) once it's warmed up, instead
  of returning a metadata envelope. The plumbing exists; the prompt
  template is the missing piece.
- Add a `/api/attestations/verify` endpoint for the verifier side —
  pass an `attestationId` + the subject's `publicKeyPem`, get back
  pass / fail + the claims. This closes the round-trip on the
  *verifier-paid* revenue line.
