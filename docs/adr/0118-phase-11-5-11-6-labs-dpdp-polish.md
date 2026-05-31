# ADR 0118: Phase 11.5 + 11.6 — `/app/labs/` Real-API Wire + DPDP §12 Settings + Polish

## Status

**Accepted — shipped.** Closes the Phase 11 FE rebuild arc by
wiring `/app/labs/` to the real Phase 9.0a/9.0b SLM endpoints
and adding the DPDP §12 download-my-data + erase-my-account
flow to `/app/settings/`. Phase 11.6's Playwright end-to-end
smoke is deferred to a future polish ship — the manual smoke
covers the four investor-demo paths.

## Context

ADR 0116 shipped placeholder Labs and Settings pages. This ADR
fills them in:

- **Labs** needs to surface the live SLM catalogue from Phase 9.0a's
  `/api/slm-model-packs` registry and the per-identity install
  records from Phase 9.0b's `/api/identities/:id/installed-slms`.
- **Settings** needs the DPDP §12 worker-facing exports + the
  §12(3) two-step erase flow.

Both ship in one commit because they're independent + small.

## Decision

### Labs (`/app/labs/`)

`LabsPage` rewritten with four cards:

#### 1. On-device language model
- **Active SLM packs** from `useSlmCatalog` (calls
  `GET /api/slm-model-packs?activeOnly=true`)
- **Installed list** rendered from `useInstalledSlms(identityId)`
  with per-row pack family + variant + runtime + bytes + revoked
  annotation (when `pack.status === 'revoked'`) + failure reason
  (when `status === 'failed'`) + `installed`/`failed` status badge
  + remove ghost button
- **Catalogue list** rendered from the catalog response with per-pack
  family + variant + runtime label + meta line (params /
  quantization / license / download size) + optional description +
  [Install (X GB)] primary action (disabled when already installed)
- **Install flow** (`handleInstall`): `window.confirm` gate with
  honest pack-size + storage posture; `fetch(pack.sourceUrl)`
  attempt (which fails honestly today since `models.bharat-os.example`
  is a placeholder); records via `useRecordSlmInstall` with
  `status: 'failed'` + the network error as `failureReason`. The
  audit trail is real even when the mirror isn't.
- **Remove flow** (`handleRemove`): `window.confirm` + `useRemoveSlm
  Install` mutation
- **Evidence collapsible** explaining the OPFS-backed download +
  SHA-256 verify posture + the Phase 9.0c runtime gap honestly

This is intentionally **simpler** than the `/shell/` SLM install
card (which has real OPFS + SHA-256 + stream-fetch code). For the
investor demo we don't want a real 2 GB download attempt to happen;
the failure path demonstrates the audit-ledger discipline without
the demo grinding to a halt. When Phase 9.0c (llama.cpp-wasm
runtime) ships, the install flow gets upgraded then per the
FE+BE parity rule.

#### 2. Federated training rounds (§7f)
- Static description card with `<Stat>` placeholder "Active rounds: —"
- Honest note that the round-discovery surface ships in a future
  polish step

#### 3. OCR + health records (Phase 2a.8 substrate)
- Description card pointing at `/shell/` for the live OCR flow
- Migration to `/app/` post-MVP

#### 4. Voice + TTS (Indic Whisper + IndicTTS)
- Description card pointing at `/shell/` for current voice surface
- Migration to `/app/` post-MVP

### Settings (`/app/settings/`)

`SettingsPage` rewritten with four cards:

#### 1. Identity
- Local-only persona-clear action (unchanged from 11.0)

#### 2. Your data rights (DPDP §12) — governance-toned
- **Download my data** action via `useDownloadMyData`:
  - Calls `GET /api/identities/:id/export`
  - Streams response as Blob
  - Creates object URL + clicks an `<a download>` synthesised in
    JS
  - Cleans up object URL
  - Toast: *"Downloaded N KB"*
- **Delete my account** action opens a `<Sheet>` with:
  - Warning-toned card explicitly stating *"This cannot be
    undone"* + DPDP §12(3) cascade description
  - **Type DELETE to confirm** `<Field>` (autoComplete off)
  - **Erase my account permanently** destructive action
    (disabled until the field contains literal `DELETE`)
  - Calls `useEraseIdentity` → `DELETE /api/identities/:id
    ?confirm=YES_DELETE`
  - On success: clears local persona, toasts goodbye, navigates
    to `/` (split-hero onboarding)

#### 3. Notifications
- Description card pointing at `/shell/` for current push surface
- Migration post-MVP

#### 4. Developer
- "Open /shell/" ghost action — explicit escape hatch for the
  developer surface

### New TanStack Query hooks

`lib/hooks.ts` extensions:

- `useErasurePreview(identityId)` — `GET /api/identities/:id/
  erasure-preview`; `enabled: false` so it never auto-fetches
  (explicit `refetch()` only)
- `useDownloadMyData()` — mutation that fetches `/api/identities/:
  id/export`, downloads the Blob via a synthesised `<a>` click,
  returns the byte size for the toast
- `useEraseIdentity()` — mutation that hits
  `DELETE /api/identities/:id?confirm=YES_DELETE`

### Bundle size

|  | JS gzipped | CSS gzipped | Notes |
|---|---|---|---|
| Phase 11.0 ship | 96 KB | 4 KB | Baseline |
| Phase 11.4 ship | 99 KB | 4 KB | +MFI flow |
| Phase 11.5+6 ship | 102 KB | 4 KB | +Labs +Settings |

Under target. No code-splitting needed at this size.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| SLM bytes never on server | Labs install records track only metadata + status; even the failed attempts demonstrate the pointer-not-payload posture |
| Honest mirror-unreachable disclosure | Install attempts fail with the real network error as `failureReason`; no fake "success" |
| Revoked packs honest in install list | `pack.status === 'revoked'` annotation rendered in the installed list |
| DPDP §12 export self-service | One-click download via worker-initiated mutation; no admin intervention |
| DPDP §12(3) erase two-step confirm | Sheet with type-DELETE gate matches the `/shell/` Phase 4.0 pattern |
| Erase clears local persona too | After server-side DELETE succeeds, we clear `useIdentityStore` so the next visit goes to onboarding instead of a stale dead-identity error |
| `/shell/` honest escape hatch | Settings explicitly links to `/shell/` for features not yet migrated |

## Tests

- **Node**: 800/800 still passing (no backend changes in this
  sub-phase)
- **Frontend**: 7/7 Vitest still passing
- **Manual smoke** verified:
  - Labs catalogue shows 2 seeded packs (Phi-3-mini + Gemma-2B)
  - Install attempt records `failed` status with the network
    error (`models.bharat-os.example` unreachable)
  - Failed install row appears in the installed list with error
    badge + reason
  - Remove action deletes the record
  - Settings → Download my data triggers browser save dialog
  - Settings → Delete my account → type DELETE → erase succeeds
    → persona cleared → onboarding

## Phase 11 closeout

| Sub-phase | ADR | Bundle gz | Status |
|---|---|---|---|
| 11.0 — scaffold + tokens + components + /app/ route | 0116 | 96 KB | ✅ |
| 11.1 — split-hero onboarding + persona picker | 0116 | (same) | ✅ |
| 11.2 — /app/worker/ earn + trust | 0116 | (same) | ✅ |
| 11.3 — /app/citizen/ intent + recent | 0116 | (same) | ✅ |
| 11.4 — /app/verify/ + MFI issuance + file-store parity | 0117 | 99 KB | ✅ |
| 11.5 — /app/labs/ wired to 9.0a/9.0b real endpoints | 0118 (this) | 102 KB | ✅ |
| 11.6 — DPDP §12 settings + polish | 0118 (this) | (same) | ✅ |

**Phase 11 ARC CLOSED.** `/app/` v1 is investor-demo-ready.
`/shell/` (developer surface) still works. Backend test count
798 → 800. Frontend test count 0 → 7 (more to add as flows
stabilise; ADR 0115's ~80-test target is the goal by v1
shipping milestone).

## What's NOT in v1

- **Playwright end-to-end smoke** — manual smoke covers the four
  investor-demo paths (worker earn / cash-out / MFI issuance →
  verifier read / citizen intent / settings erase). Playwright
  comes as a follow-up polish ship
- **More Vitest coverage** — the component library has 7 tests
  across 2 files. Growing this is ongoing maintenance, not a
  blocker
- **i18n** — English only (deferred to v2 per ADR 0115 scope)
- **PWA + service worker** — online-only v1 (deferred per ADR 0115)
- **Voice input on /app/citizen/** — text only (deferred per
  ADR 0115)

## What's next (per ROADMAP)

**Phase 9.0c — llama.cpp-wasm runtime adapter.** Resumes per the
FE+BE parity rule with its own `/app/labs/` panel upgrade. ADR
0114 (runtime choice + distroless-deploy trade-off) drafted
first, then `src/phase1/slm-runtime.mjs` + Labs install card
upgrade to actually run inference. ~2-3 weeks.

Then 9.0d (federated round + mesh-inference event integration),
then 9.1 (sponsored federated rounds — demand-side revenue),
then 10.0-10.5 (labeling marketplace — strongest non-investor
revenue line).

## Future polish

- **Playwright e2e smoke** for all four demo paths
- **Real SLM mirror hosting** unlocks the success path in Labs
  install (paired with Phase 9.0c runtime)
- **Per-pack install progress bar** with real streaming
  (today's `fetch` is no-cors so no progress)
- **DPDP export bundle inspector** — view what's in your download
  before saving
- **Erase-preview** sheet step showing exactly what will be
  deleted before the type-DELETE confirm
- **Settings → developer mode toggle** that swaps the topbar
  saffron for the existing `/shell/` debug surface inline
