# ADR 0144 — Phase 12.2.4: Per-role heavy extras (wave-1) + operator attestation flow

Status: Accepted
Date: 2026-06-01

## Context

Phase 12.2.2 KYC L1 covered the common identity slice (legal name +
Aadhaar last-4 + PAN last-4 + address). Phase 12.2.3 added the
attachment CORE substrate + KYC L1 photo capture (selfie +
ID proof). Phase 12.2.4 closes the wave-1 onboarding loop by
adding the per-role **heavy** extras: role-specific verification
fields (driving licence #, vehicle registration #, police
verification #, employer reference, contractor name, etc.)
paired with role-specific document attachments (DL photo, RC
scan, PCC PDF, employer ref letter, contractor attestation).

Phase 12.1b.3 already shipped "light" forms (filterable
preferences like vehicle type / seats / languages). The heavy
layer sits ORTHOGONAL: same provider record, different
lifecycle (citizen submits → operator attests → activation
gate), different §15 treatment (verification numbers redacted
on owner-list, never on the ledger).

User feedback during the phase build: real validation of
DL # / vehicle reg # against **mParivahan / Sarathi / Vahan**
endpoints is the right automation layer. **Reserved as Phase
12.2.5** — composes the Phase 12.2.1 external-adapter substrate
in the same shape as Nominatim + India Post PIN. For 12.2.4 the
operator manually cross-checks the typed numbers against the
document images.

## Decision

### 1. Substrate (`src/phase1/provider-role-extras.mjs`)

`PROVIDER_ROLE_EXTRAS` map — 4 wave-1 schemas, each
`{schemaVersion, required[], optional[], requiredAttachmentKinds[]}`.

| Role | Required fields | Required attachments |
|---|---|---|
| `cab-driver` | drivingLicenceNumber, vehicleRegistrationNumber, commercialPermitNumber | driving_licence, vehicle_registration |
| `personal-driver` | drivingLicenceNumber, policeVerificationNumber, priorEmployerName | driving_licence, police_verification, employer_reference |
| `labourers` | contractorName, contractorAttestationNumber | contractor_attestation |
| `household-help` | policeVerificationNumber, priorEmployerName, priorEmployerContact | police_verification, employer_reference |

Field kinds: `text`, `date`, `phone` (Indian 10-digit
6-9-leading), `integer`. The schemas are **deep-frozen** (Phase
12.2.4 adversarial fix PII-Q4 — the initial Object.freeze was
shallow; field-spec objects could be mutated at runtime
weakening every subsequent validator). The
`/api/provider-role-extras-schemas` GET returns a
`structuredClone` so callers cannot mutate the substrate via the
public response either.

`validateRoleExtras(role, raw, {attachmentVerifier})` returns
the cleaned envelope or throws `RoleExtrasValidationError` with
a stable code per field. The verifier closure cross-checks
attachment ownership against the substrate (a citizen cannot
reference another citizen's blob). **Schema version drift** is
caught explicitly: a citizen sending an old `schemaVersion`
trips `schema_version_stale` (Phase 12.2.4 adversarial fix
PII-Q6 — the initial impl silently overwrote the version,
masking client/server drift behind confusing per-field errors).

### 2. provider-identity extension

NEW fields on `providerIdentity`:
- `roleExtrasSubmission` — `{schemaVersion, role, answers,
  attachments: {kind: attachmentId}, submittedAt}` or null.
- `roleExtrasAttestation` — `{level, operatorId, evidenceRefs,
  notes, attestedAt, attestedSchemaVersion,
  attestedSubmittedAt}` or null.

`recordRoleExtrasSubmission(provider, envelope, {at})` — now
accepts both `draft` AND `submitted` (Phase 12.2.4 adversarial
fix L2-1 — `attestProviderKyc` auto-promotes draft → submitted,
so requiring draft locked out citizens who submitted KYC
before completing role extras). Always **clears any prior
attestation** so the operator's old sign-off doesn't silently
apply to the new answers.

`attestRoleExtras(provider, {level, operatorId, ...})` — pins
both `attestedSchemaVersion` AND `attestedSubmittedAt` (Phase
12.2.4 adversarial fix L2-2 — without the timestamp anchor, a
citizen could swap answers between operator review and attest).

`transitionProviderStatus` activation guard refuses when:
- wave-1 role AND no `roleExtrasAttestation` →
  `role_extras_attestation_required`
- `attestedSchemaVersion < roleExtrasSubmission.schemaVersion` →
  `role_extras_attestation_stale_schema` (Phase 12.2.4
  adversarial fix L2-5)
- `attestedSubmittedAt !== roleExtrasSubmission.submittedAt` →
  `role_extras_attestation_stale_submission` (Phase 12.2.4
  adversarial fix L2-2 defense-in-depth)

`selfProviderRecord` echoes `roleExtrasSubmission` but redacts
verification numbers to "••••" (same posture as KYC L1
last-4). Attachment refs (substrate handles) stay.
`publicProviderRecord` does NOT echo either field.

### 3. API endpoints

- `POST /api/provider-identities/:id/submit-role-extras` —
  citizen, `requireProviderOwnerAuth`, validates the envelope,
  cross-checks attachment ownership, optimistic concurrency
  re-read, ledger-before-save.
- `POST /api/admin/provider-identities/:id/attest-role-extras` —
  operator-only, admin bearer.
- `GET /api/provider-role-extras-schemas` — public schema map,
  `structuredClone`'d.

Ledger events:
- `provider_identity.role_extras_submitted` — field NAMES +
  attachment IDs + role + schemaVersion. **Never values.**
  Binding-grep test asserts no DL / vehicle reg / permit
  numbers in event JSON.
- `provider_identity.role_extras_attested` — level + operatorId
  + attestedSchemaVersion + role. Never citizen values.

### 4. FE — wizard 5→6 steps

`STEP_ORDER` derives from `roleRequiresExtras(provider.roleKind)`.
Wave-1 (cab-driver / personal-driver / labourers / household-help)
gets `identity → selfie → idProof → address → roleExtras → review`;
wave-2 (kirana / skilled-trades) keeps the 5-step flow.

`useEffect` snaps `step` back into `STEP_ORDER` when the role
changes mid-session (Phase 12.2.4 adversarial fix UX-3 — without
this, a roleKind change while on `roleExtras` left the wizard
in a "Step 0 of 5" dead-end).

NEW `<RoleExtrasStep/>` component — renders required + optional
fields via `<Field>` components and required attachments via
`<PhotoCapture/>` array. **All failing fields paint at once**
(Phase 12.2.4 adversarial fix UX-1 — the initial validator
returned only `firstFieldError`; a citizen with 3 problems
fixed 1, saw the next, then the next — jagged UX).

`<PhotoCapture/>` extended:
- `acceptMode='image+pdf'` prop for document scans. PDF
  preview = doc-card with filename + size (no `<img>`).
  Existing-attachment fetch detects `application/pdf` and
  renders an "Open PDF" link instead.
- **Magic-byte PDF sniffing** (Phase 12.2.4 adversarial fix
  UX-2 — Android often returns `application/octet-stream`
  for sideloaded PDFs; `file.type` alone broke the preview).
  First 4 bytes checked for `%PDF`.

Review step echoes every typed answer (Phase 12.2.4
adversarial fix UX-6 — the initial impl showed only "All
captured (N)" so the citizen couldn't verify what they typed).

NEW `useSubmitRoleExtras` TanStack mutation. Sends
`X-Bharat-OS-Acting-Identity` header + body channel.

### 5. Operator console

Row layout extends with:
- Per-kind View buttons for each `roleExtrasSubmission.attachments`
  entry (View driving_licence / View vehicle_registration /
  View police_verification / etc.).
- "Attest role basic" / "Attest role verified" buttons —
  separate from the KYC attest pair, so the audit trail
  records which evidence chain (identity vs role) the
  operator reviewed.
- EXIF warning banner inherited from Phase 12.2.3.
- Two-step confirm on attest echoes role + schemaVersion
  before collecting notes.

### 6. §15 bindings honored

- **No values on the ledger.** Both new event types carry
  field NAMES + attachment ID handles + role + schemaVersion.
  Binding-grep test rejects any DL / vehicle reg / permit /
  employer name literal.
- **Owner-list redaction.** `selfProviderRecord` redacts
  verification numbers to "••••" — same posture as KYC L1
  last-4. Wizard edit-mode forces the citizen to re-type
  (the substrate keeps the values; only the projection
  redacts).
- **Cross-owner attachment isolation.** Substrate
  `attachmentVerifier` closure rejects refs to another
  citizen's blob. Test confirms.
- **Schema-version drift caught loudly.** Stale FE clients
  get a clean `schema_version_stale` instead of confusing
  partial-validation errors.
- **Closed substrate.** Unknown answer fields rejected;
  unknown attachment kinds rejected (separate from the
  attachment substrate's MIME allowlist).

### 7. Tests

**Node (`tests/node/role-extras.test.mjs`, 32 cases)**:
- Substrate: protocol version, frozen role list, deep-freeze
  enforcement (PII-Q4), schema_version_stale (PII-Q6),
  validator happy paths + missing required + unknown answer
  + unknown attachment kind + malformed attachment ID +
  bad phone + bad date + foreign-owned attachment.
- provider-identity integration: createProviderIdentity
  null-init + recordRoleExtrasSubmission accepts draft AND
  submitted (L2-1) + refuses other states +
  re-submission clears attestation (L2-2) + attestRoleExtras
  refuses missing submission + pins attestedSubmittedAt
  (L2-2) + activation refuses stale schemaVersion (L2-5) +
  activation refuses stale submittedAt (L2-2).
- HTTP: GET schemas, POST submit-role-extras happy path +
  ledger binding (no values on event), cross-owner
  attachment 400, missing acting identity 401, admin attest
  requires bearer + emits attestation event.

**Vitest** (3 new test files, 14 cases total):
- `role-extras-schema.test.ts` — FE validator happy + missing
  required + multi-error reveal (UX-1) + bad date + bad
  phone + integer out-of-range.
- `role-extras-schema.parity.test.ts` — UX-4 fix; loads BE
  PROVIDER_ROLE_EXTRAS and deep-equals projected field
  shape per role. A maxLen drift would ship LOUD.

### 8. Adversarial review (4 lenses)

- **PII**: 6 findings. 2 fixed in-phase (deep-freeze + schema
  version stale). 4 clean by construction.
- **State-machine**: 7 findings. 4 fixed in-phase (submission
  window open, attestation cleared on re-submit,
  attestedSubmittedAt anchor, activation version+timestamp
  guards). 2 inherited gaps deferred (substrate-wide CAS
  upsert from Phase 12.2.2 L2-1; basic→verified elevation
  asymmetry, product decision).
- **Auth / DoS**: 6 findings, **all clean** — substrate-wide
  weakness from Phase 12.2.2 still open, no NEW surface added.
- **UX / parity**: 8 findings. 4 fixed (snap step on role
  change, multi-error reveal, PDF magic-byte sniff, review
  step echoes answers). 1 added (FE/BE parity snapshot test).
  2 OK or accepted (confirm dialog redaction, wave-2 disabled
  buttons). 1 deferred (blob: in new tab on Safari — add
  `download` polish later).

Total: 27 findings, 11 high+med fixed in-phase, 16 clean or
deferred with explicit scope.

### 9. What's NOT in 12.2.4

- **Phase 12.2.5 — Parivahan / Sarathi / Vahan adapter.**
  User-flagged need: automate the operator's manual cross-
  check of DL # / vehicle reg # against the official
  Government of India endpoints. Composes the Phase 12.2.1
  external-adapter substrate; stub mode returns "valid" for
  demo; live mode hits `parivahan.gov.in/rcDlStatus` and
  related (requires sandbox key registration). RESERVED as
  Phase 12.2.5.
- **EXIF stripping** — inherited from Phase 12.2.3
  deferral; substrate still flags `mayContainExif: true`.
- **Orphan-attachment sweep** — inherited.
- **basic → verified attestation elevation** — operator
  console disables the buttons after any attestation. Product
  call deferred.
- **Substrate-wide CAS-on-seq** — Phase 12.2.2 inherited gap.
  Two operators racing on attest will both write events but
  only the loser's envelope survives. Affects KYC L1 + role
  extras + every provider-identity mutation.
- **Phone country code support** — substrate v1 is India-only
  (10 digits, 6-9 leading). International providers wait for
  a Phase 12.x localisation pass.
- **Field-level FE/BE label parity** — only `id`/`kind`/`maxLen`/
  `min`/`max`/`attachmentKinds` are diff-tested. Display labels
  can drift (BE labels are dev-facing; FE labels are
  citizen-facing).

## Files

NEW (BE):
- `src/phase1/provider-role-extras.mjs` (~340 lines).
- `tests/node/role-extras.test.mjs` (32 cases).

NEW (FE):
- `frontend/src/lib/role-extras-schema.ts` (~180 lines).
- `frontend/src/lib/role-extras-schema.test.ts` (8 cases).
- `frontend/src/lib/role-extras-schema.parity.test.ts` (5 cases).
- `frontend/src/components/forms/RoleExtrasStep.tsx` (~130 lines).

EXTENDED (BE):
- `src/phase1/provider-identity.mjs` — `roleExtrasSubmission` +
  `roleExtrasAttestation` fields, `recordRoleExtrasSubmission`,
  `attestRoleExtras`, activation guards.
- `src/phase0/api.mjs` — three new endpoints, GET clones via
  structuredClone.

EXTENDED (FE):
- `frontend/src/lib/hooks.ts` — `RoleExtrasSubmissionEnvelope` +
  `RoleExtrasAttestation` types + `useSubmitRoleExtras` mutation;
  `ProviderIdentity` carries the new optional fields.
- `frontend/src/routes/onboarding/KycLevel1Page.tsx` — 5→6
  steps, hydration of role-extras refs + values, step-snap
  effect on roleKind change.
- `frontend/src/components/forms/PhotoCapture.tsx` —
  `acceptMode` prop, PDF magic-byte sniff, PDF doc-card
  preview, existing-attachment PDF link.

EXTENDED (operator console):
- `public/operator-console/app.js` — `attestRoleExtras`
  handler, per-kind View buttons, attest buttons rendered
  per row.

EXTENDED (tests):
- `tests/node/provider-identity.test.mjs` — `kirana` substituted
  for `cab-driver` in non-role-extras scope tests (the
  activation guard now applies to wave-1).
- `tests/node/booking.test.mjs` — `makeActiveProvider` helper
  synthesizes a role-extras attestation when the role is
  wave-1.
- `tests/node/marketplace-discovery.test.mjs` —
  `seedActiveProvider` same treatment; EC-1 test switched to
  `kirana` role.

## Test results

- Node tests: **1110 → 1142** (+32 substrate + endpoint +
  binding-grep + adversarial-fix cases).
- Vitest: **124 → 138** (+14 across schema validator + parity
  + multi-error + new constants).
- tsc: clean. Build green.
- Bundle main: 618 → 628 KB / 175 → 177 KB gzipped (+10 KB for
  schema + RoleExtrasStep + wizard step + mutation).
