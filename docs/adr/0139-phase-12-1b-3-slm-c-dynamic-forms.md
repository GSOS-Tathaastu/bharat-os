# ADR 0139 — Phase 12.1b.3: SLM-C light dynamic forms

Status: Accepted
Date: 2026-06-01

## Context

Phases 12.1b.1 (intent parser) and 12.1b.2 (offline queue) shipped.
Next per ROADMAP is SLM-C — on-device dynamic forms. The full
Phase 12.2 wizard with Aadhaar OCR + DigiLocker + operator review
is a multi-week build. Phase 12.1b.3 lands a **light** version
that proves the substrate composes: a generic
`DynamicForm` renderer driven by a JSON schema, per-role light
field schemas, and an SLM "suggest" chip on free-form text
fields. No file uploads, no KYC level elevation, no operator
console changes.

## Decision

### 1. Generic substrate: `src/phase0/dynamic-form.mjs`

- `FIELD_KINDS` = `['text', 'longtext', 'select', 'multiselect',
  'boolean', 'integer']`.
- `VALIDATORS` registry of pure sync functions returning a
  canonical error CODE string (not a localised message): `non-empty`,
  `max-length`, `int-range`, `one-of`, `plate-region`,
  `boolean-required-true`. FE translates codes to per-locale
  labels.
- `validateAnswers(schema, rawAnswers) → {ok, errors, normalized}`.
- `dependsOn` gating: a field with `{fieldId, equals}` runs its
  validators only when the controlling field equals the gate;
  otherwise the field MUST be empty (`gated_off_must_be_empty`
  error code).
- Hard caps: 24 fields per schema, 4 KB per normalised payload,
  default maxLen 80 (text) / 240 (longtext), default multiselect
  cap 16.
- Forward-compat passthrough: an empty schema validates to
  `{ok:true, errors:{}, normalized:{}}` so a not-yet-shipped
  role surface doesn't trip the substrate.

### 2. Per-role schemas: `src/phase1/provider-role-forms.mjs`

Wave-1 only (cab-driver / personal-driver / household-help /
labourers). Wave-2 (kirana / skilled-trades) gets schemas when
their onboarding routes light up; `validateRoleAnswers` returns
`{ok:true, errors:{}, envelope:null}` for unregistered roles.

Per-role examples:

- **cab-driver**: `vehicleType` (select), `seats` (integer 1..8),
  `plateRegion` (text 2-char + `plate-region` validator +
  SLM-suggest hint), `acAvailable` (boolean), `languages`
  (multiselect, cap 5).
- **household-help**: `canCook` (boolean), `canCookNonVeg`
  (boolean, `dependsOn canCook = true`), `languages`
  (multiselect), `aboutYou` (longtext with SLM-suggest hint).
- Etc.

### 3. Persistence

NEW optional `roleAnswers: {schemaVersion, values} | null` field
on the providerIdentity record. Created via
`createProviderIdentity({…, roleAnswers})`; updated via
`updateProviderProfile({…, roleAnswers})`.

The field is **NOT projected to publicProviderRecord** — answers
are owner-readable, not citizen-readable. Tested with an HTTP
assertion that `'roleAnswers' in publicRecord === false`.

### 4. API surface

- Extended `POST /api/identities/:rootId/provider-identities` —
  accepts `roleAnswerValues` (raw user input), runs
  `validateRoleAnswers` server-side, persists the envelope.
- Extended `POST /api/provider-identities/:id/profile` — same
  body field. Validates on every save (FE-only validation is a
  smuggling vector). Returns 400 with per-key error code map on
  failure.
- NEW `provider_identity.updated` ledger event emitted on every
  profile mutation. Carries `{updatedFields, providerIdentityId,
  rootIdentityId, at}` — field NAMES, not values
  (pointer-not-payload). The judge panel's 2nd review correctly
  flagged that this event didn't exist before; now it does.
- NEW `GET /api/provider-role-forms` returns the full schema map
  for FE consumers. NEW `GET /api/provider-role-forms/:roleKind`
  returns one schema; 404 for unknown.

### 5. Frontend renderer

`frontend/src/components/forms/DynamicForm.tsx` (controlled
component) + `SlmSuggestChip.tsx` + `index.ts` barrel.

- Schema-driven; renders the right field component per kind.
- Inline per-field errors via `translateFieldError(code)`.
- Hides gated-off fields.
- Multiselect respects `field.max` and disables further
  selection at the cap.

### 6. SLM suggest UX

`frontend/src/lib/use-slm-field-suggest.ts` wraps the existing
Phase 9.0c wllama runtime. Hidden when no SLM is installed
(`hasSlm: false`).

- Tap "✨ Suggest with my SLM" → prompt built from
  `field.suggest.promptHint` + role label + current value.
- Result renders as a chip "Use this: …" + "Dismiss". The
  citizen's tap is the only path that mutates the input
  (`onAccept`) — we NEVER auto-fill.
- Rate limit: **6 invocations per field per rolling 60s + 30
  globally per 5 minutes**, FE-only (no BE rate limit; the SLM
  call never crosses the wire).
- Inflight singleton so rapid tap doesn't enqueue parallel
  generations.

### 7. Audit

NO new `slm_suggest.accepted` ledger event for v1. The judge
panel's rationale: an SLM accept is a UI choice analogous to
picking an autocomplete option. The existing
`provider_identity.updated` event captures the binding
outcome (the values the user actually submitted). When Phase
12.2's per-role wizard introduces operator-reviewable AI
suggestions, that's where a dedicated event lands.

### 8. Parity

Hand-mirror with vitest snapshot guard. `FIELD_KINDS`,
`VALIDATORS` names, and the 4 wave-1 role keys must match
between `src/phase0/dynamic-form.mjs` + `src/phase1/provider-role-forms.mjs`
and the FE TS counterparts.

## Bindings honored

- **User controls inputs.** SLM suggest is tap-to-accept only;
  hidden when no SLM installed; chip with explicit "Use this" /
  "Dismiss" affordances.
- **BE re-validates on save.** Same `validateAnswers` runs in
  the API handler before persistence. Per-key canonical error
  codes returned to the FE; no free-text in audit logs.
- **Pointer-not-payload on audit.** The
  `provider_identity.updated` event carries the list of field
  NAMES that changed, never the values themselves.
- **Citizen privacy.** `roleAnswers` is owner-readable only;
  `publicProviderRecord` does not echo it. Tested.
- **Forward-compat substrate.** Wave-2 roles validate as
  pass-through; no dead schemas shipped today.
- **Common-features-as-core-substrates.** The dynamic-form
  primitive lives in `src/phase0/` for cross-phase reuse;
  per-role schemas live next to provider-identity in
  `src/phase1/`. Future `BookingComposer` + `ConsentSheet`
  can compose the same renderer + validator.

## Process

1. **Understanding workflow** — 4 parallel Explore agents
   mapped ProviderOnboarding state, ConsentGrantSheet pattern,
   provider-identity substrate, and intent-parser hook patterns.
2. **Design workflow** — 3 lenses (minimal / rigor / UX) × 2
   judges. Both judges picked C with overrides:
   - Wave-1 only (no dead schemas).
   - NO ledger event for SLM accept (analogous to autocomplete).
   - Renderer in `components/forms/` not `dynamic-form/`.
   - Tiered rate limit (6/field/60s + 30 global/5min).
   - Schema location: phase0/dynamic-form.mjs for the kind/
     validator core + phase1/provider-role-forms.mjs for the
     role schemas.
   - **NEW roleAnswers field** on providerIdentity (not
     JSON-in-description marker hack).
   - **BE re-validates on save.**
   - **Add `provider_identity.updated` ledger event** — judge 2
     correctly flagged it didn't exist before; this phase adds
     it.
3. **Implementation** — substrate → API wire → tests → FE lib
   parity → renderer + chip → ProviderOnboarding integration.

Adversarial review deferred this session per the user's "keep
building" directive; substrate is well-tested + binding-grep'd
+ HTTP-integration-covered. Will sweep in 12.1b.4 polish if
needed.

## Files

NEW (BE):
- `src/phase0/dynamic-form.mjs`.
- `src/phase1/provider-role-forms.mjs`.
- `tests/node/dynamic-form.test.mjs` (27 cases).

EXTENDED (BE):
- `src/phase1/provider-identity.mjs` — `createProviderIdentity`
  + `updateProviderProfile` accept `roleAnswers`;
  `publicProviderRecord` unchanged (does not echo).
- `src/phase0/api.mjs` — POST routes validate
  `roleAnswerValues`; GET routes serve schemas; new
  `provider_identity.updated` ledger event on every profile
  save.

NEW (FE):
- `frontend/src/lib/dynamic-form.ts`.
- `frontend/src/lib/provider-role-forms.ts`.
- `frontend/src/lib/use-slm-field-suggest.ts`.
- `frontend/src/lib/dynamic-form.test.ts` (13 vitest cases).
- `frontend/src/components/forms/DynamicForm.tsx`.
- `frontend/src/components/forms/SlmSuggestChip.tsx`.
- `frontend/src/components/forms/index.ts`.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `CreateProviderIdentityInput`
  carries optional `roleAnswerValues`.
- `frontend/src/routes/ProviderOnboarding.tsx` — renders
  "More about this role" Card with DynamicForm when a schema
  exists for the role; local-validates before POST.

## Test results

- Node tests: **1035/1035 green** (+27 dynamic-form).
- Vitest: **105/105 green** (+13 dynamic-form contract +
  per-role schema sanity + parity).
- tsc: clean.
- Build: main 577 → 592 KB / 168 KB gzipped (+15 KB for
  dynamic-form lib + role-forms + renderer + chip + suggest
  hook). wllama lazy chunk unchanged.

## What's NOT in 12.1b.3 (deferred)

- File uploads / document storage.
- KYC level elevation flow (operator attestation UI).
- Aadhaar OCR / DigiLocker / SARTHI integration.
- Operator review console FE (per-role wizard).
- Wave-2 schemas (kirana / skilled-trades) — substrate ready,
  schemas land with their onboarding routes.
- BookingComposer / ConsentSheet refactor onto DynamicForm —
  substrate is reusable; the swap is a separate phase to land
  cleanly.
- Telugu / Kannada / Gujarati / Punjabi suggest prompts (need
  SLM model packs trained on those languages).
- Adversarial review — substrate is binding-grep'd + HTTP-
  tested + parity-guarded; review folds into 12.1b.4 if needed.
