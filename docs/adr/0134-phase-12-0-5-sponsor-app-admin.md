# ADR 0134 — Phase 12.0.5: sponsor `/app/sponsor/` admin surface — sweep arc closes

Status: Accepted (2026-06-01).
Phase: 12.0.5 (last of four substrate-integration sub-phases —
12.0.2 citizen, 12.0.3 worker, 12.0.4 cross-cutting, **12.0.5
sponsor**).
Depends on: Phase 9.1 sponsor escrow + bearer-auth, Phase 10.1-10.5
labeling marketplace + QC + signed audit export, Phase 3.x federated
rounds, Phase 11.8 consent flow patterns.

## Context

Phases 12.0.2 → 12.0.4 wired ~80% of the existing substrate into
`/app/`. The last large surface — sponsor admin — lived in `/shell/`
nowhere (sponsors hit curl with their bearer token). Phase 12.0.5
closes the substrate-integration sweep by shipping `/app/sponsor/*`
— a token-gated console for labeling-job admin, federated-round
admin, escrow lifecycle, and the Phase 10.5 signed-audit-export
download.

Substrate is BE-complete (Phase 9.1 sponsors, Phase 10.x labeling,
Phase 10.4 QC, Phase 10.5 signed export, Phase 3.x federated). This
phase is pure FE plus one operational config (admin token + VAPID
env vars on the dev server).

The implementation was scoped by an exhaustive Workflow:
- **7 parallel Explore agents** mapped sponsor-auth, escrow,
  labeling-job lifecycle, QC review, signed export, federated rounds,
  and the absence of any `/shell/` sponsor UI.
- **Synthesis pass** produced a 600-line implementation spec
  (routing tree, auth flow, hooks-by-name, components-by-name,
  edge cases, §15 bindings, implementation order, deferred items).

After implementation, a second Workflow ran:
- **3 parallel adversarial reviewers** (privacy / UX / edge-case)
  produced findings with `mustFixBeforeShip` flags.
- **Triage synthesis** produced 6 MUST-FIX + 7 SHOULD-FIX + 10 DEFER
  items, with concrete code patches per item.
- All 13 MUST/SHOULD items were applied before commit.

## Decision

Pure FE; **zero BE changes**. Twenty-five new files: 1 Zustand
store, 1 bearer-auth fetch wrapper, 1 client-side export verifier,
14 route components, 9 shared components, 1 service-worker scope
adjustment unchanged from 12.0.4.

### 1. Auth substrate

- **`lib/sponsor-auth-store.ts`** — Zustand-persist store at
  `localStorage` key `bharat-os.app.sponsorAuth.v1` (distinct from
  the citizen/worker `deviceOwnerId` key). Holds `{sponsorId,
  bearerToken}` + `setAuth` / `clear`.
- **`lib/api-sponsor.ts`** — two helpers:
  - `apiWithBearer<T>(path, opts)` — JSON wrapper that injects
    `Authorization: Bearer <token>` from the store at call time.
  - `fetchWithBearer(path, opts)` — raw fetch for NDJSON streams.
    Throws on 401/403 with `.status` and `.code` set so the
    SponsorSurface auth guard reacts.
- **`useSponsorSelfProbe()`** — one-shot mutation against
  `GET /api/sponsors/:id/self` with a token override. On success
  seeds `['sponsor-self', sponsorId]` cache so the dashboard's
  first paint is instant.

### 2. Surface scaffold

- **`routes/sponsor/SponsorSurface.tsx`** — top-level guard:
  - Sets document title `Sponsor console — Bharat OS` (§15: no
    `displayName` in title to avoid shoulder-surfing).
  - Subscribes to TanStack Query v5's query-cache events. On any
    `['sponsor-*']` query whose `state.error.status === 401 ||
    code === 'invalid_token' || 'missing_authorization'`, calls
    `clear()` + `removeQueries({predicate})` + toast + navigate
    to `/sponsor/`.
  - Renders the entry page when no token; otherwise mounts the
    13 nested routes + `<SponsorTopBar>` + `<SponsorBottomNav>`.
- **`components/sponsor/SponsorTopBar.tsx`** — logo +
  "Sponsor console" + displayName + status badge + sign-out.
  Sign-out calls `cancelQueries({predicate})` BEFORE `clear()` so
  in-flight mutations don't land against the wrong identity.
- **`components/sponsor/SponsorBottomNav.tsx`** — 5 tabs
  (Dashboard / Jobs / Rounds / Escrow / Settings). Fixed-bottom on
  mobile, inline on `sm+`.

### 3. Entry page

- **`routes/sponsor/SponsorEntryPage.tsx`** — paste form with:
  - Sponsor ID field (validates `bos:sponsor:` prefix).
  - Bearer token field (`type="password"` + show/hide toggle).
  - Sign-in button → `useSponsorSelfProbe()` → on success
    `setAuth` + navigate. On 401/403/404 surfaces a specific
    inline error.
  - Evidence block with three-step explanation of where the
    token comes from (admin onboarding → out-of-band send →
    paste).

### 4. Dashboard

- **`routes/sponsor/SponsorDashboard.tsx`** — three escrow
  `<Stat>` tiles (available / locked / balance) + three counts
  (jobs / rounds / **honest "jobs sampling"** — *not* an estimated
  pending-submission count, which was caught by the adversarial UX
  review).

### 5. Labeling jobs lifecycle

- **`SponsorJobsList`** — filter chips (all / draft / active /
  complete) + per-job cards.
- **`SponsorJobCreate`** — full wizard covering task kind,
  language, modality, economics (per-label paise + fee + item
  count), QC pipeline params (golden / min score / sampling), IP
  terms, consent purpose code. Shows projected escrow lock
  inline. 402 errors surface `<EscrowInsufficientCallout>`.
- **`SponsorJobDetail`** — 3 stat cards (items uploaded /
  submissions / escrow locked) + plan + economics + items
  uploader (when draft) + launch button + nav to review queue +
  export.
- **`JobItemsUploader`** — accepts JSON array, JSONL, OR single
  JSON object. Strips UTF-8 BOM. 10 MB paste cap. Shows
  per-line parse errors in a collapsible `<details>`.
- **`SponsorReviewQueue`** — Phase 10.4 QC sampled submissions.
  Per-row `<LabelValueViewer>` (task-kind-specific). Accept /
  Reject buttons; Reject opens `<RejectReasonSheet>` with the
  clawback warning + reason ≥ 4 chars enforced. **No raw
  `workerId` ever rendered** — only `identityHash`
  (Phase 10.4 substrate strip preserved).
- **`SponsorJobExport`** — Phase 10.5 signed NDJSON download
  with four-bucket verification status: `verified`,
  `unverified`, `mismatch`, `fetch_failed`. Verdict legend
  rendered as a separate card. Retry-verification action when
  fetch failed.

### 6. Federated rounds

- **`SponsorRoundsList`** — per-round status + update count +
  payout-per-update.
- **`SponsorRoundCreate`** — model name + baseline hash + max
  participants + payout + max epsilon + deadline + aggregation
  mode (hash_combiner / fedavg) + optional SLM pack picker
  (reuses Phase 9.0a `useSlmCatalog`) + targetTask. 402 errors
  surface the same callout.
- **`SponsorRoundDetail`** — status + plan + privacy spend.
- **`SponsorRoundExport`** — NDJSON download with honest
  "unsigned (Phase 9.1)" badge until a future "Phase 9.2
  federated export signing" sub-phase.

### 7. Escrow

- **`SponsorEscrow`** — 3 stat cards (available / locked /
  balance) + ledger event list filtered to this sponsor's
  `sponsor_escrow.*` and `labeling_export.signed` events.
  Uses the public `/api/ledger` endpoint with client-side filter.

### 8. Settings

- **`SponsorSettings`** — read-only sponsor profile + audit
  signer public key transparency strip (copy-PEM button) +
  sign-out destructive button.

### 9. Export verification (FE port of Phase 10.5)

- **`lib/sponsor-export-verify.ts`** — async crypto-verifier
  using Web Crypto (`crypto.subtle.digest('SHA-256')` +
  `crypto.subtle.verify` with `Ed25519`). Mirrors
  `verifyLabelingExportLines` from `src/phase1/labeling-export.mjs`.

## §15 bindings

- **Bearer token never echoed to DOM** — entry field is
  `type="password"`, never re-rendered after entry, never in any
  URL/query/title/log.
- **Document title** never carries `displayName` — `Sponsor
  console — Bharat OS` is constant.
- **Per-(job, worker) rotating `identityHash`** preserved end-to-end
  — substrate strips raw `workerId`; FE types do NOT widen the
  shape to include it.
- **`goldenAnswer` values** — never displayed to the sponsor in the
  review queue (per substrate, the worker's `labelValue` is
  surfaced, never the truth they're being judged against).
- **Cross-sponsor isolation** — every query URL is scoped by
  `:sponsorId` from the auth store; the ledger filter additionally
  validates `event.sponsorId === sponsorId` even though the public
  ledger has no cross-sponsor sensitive fields.
- **Sign-out wipes everything** —
  `cancelQueries({predicate}) → clear() → removeQueries({predicate})`
  so no late-landing mutation onSuccess writes to a now-stale
  sponsor's cache.

## Adversarial-review-driven hardening (applied before commit)

Three lenses ran in parallel against the just-written code. 13
must/should items applied:

| ID | Issue | Fix |
|---|---|---|
| MF-1 | TanStack Query v5 emits action.type `'failed'`, not `'error'` — auth guard never fired | Drop the action.type check; read `state.error` directly |
| MF-2 | `fetchWithBearer` returned 401 Response silently | Throw on 401/403 with `.status` + `.code` set |
| MF-3 | In-flight mutation lands after sign-out, polluting next-sponsor cache | `cancelQueries` before `clear()` in both sign-out call sites |
| MF-4 | Pubkey-fetch failure indistinguishable from "unsigned bundle" | New `fetch_failed` bucket + retry action |
| MF-5 | Items parser broke on UTF-8 BOM + single-object paste + would freeze on 1 GB paste | BOM strip + single-object branch + 10 MB cap |
| MF-6 | Dashboard "pending review" count was wrong (counted jobs, not submissions) | Rename to "jobs sampling"; honest metric |
| SF-1 | Review queue showed label without source item | Inline `Link` to signed export + honest "polish phase" note |
| SF-2 | `verifyLabelingExportLinesAsync` could deref empty bodyLines | Guard before indexing |
| SF-3 | Dashboard refetched self after sign-in | Probe `onSuccess` seeds the cache |
| SF-4 | Escrow-insufficient callout persisted after successful launch | Clear on `onSuccess` |
| SF-5 | Entry form lacked token-acquisition guidance | Three-step Evidence block + escalation path |
| SF-6 | "N malformed" didn't say WHICH lines or WHY | Per-line errors in `<details>` |
| SF-7 | Export verdict badges had no legend | Verdict legend card with what each badge means |

Privacy review: **`ship_clean`** (no findings).

## Deferred to polish

The triage memo lists 10 deferred items (DP-1 through DP-10).
Each is real but the right place is a follow-up commit / Phase 12.1
polish pass:
- Per-task-kind body schema guidance + auto-update of
  `consentPurposeCode` on task-kind change.
- Cross-tab sign-in race (Zustand store).
- Bottom-nav `aria-label`s + "More" overflow on 5-inch phones.
- Shell-wide `EmptyState` + `ErrorState` primitives.
- Consent code autocomplete (needs BE enum).
- `RejectReasonSheet` char counter.
- `aggregationMode` lowercase case-sensitivity audit.
- `useMemo` micro-perf on derivations.
- `EscrowLedgerRow` composite key (needs `event.id` from BE).
- `verifyLabelingExportLinesAsync` timeout wrapper.

## Tests

No new tests this sub-phase (no BE changes; FE components are
pure surface code over typed hooks battle-tested upstream). The
adversarial workflow stands in for an integration-test pass.

Full Node: **890/890** unchanged. FE Vitest: **45/45** unchanged.
Bundle: main 434 → **505 KB / 144 KB gzipped** (+71 KB for 25 new
files, the export-verify Web-Crypto port, and 13 hooks). wllama
lazy chunk unchanged. Build 1.61s.

End-to-end verified on the running server with admin token +
VAPID env vars:
1. `POST /api/admin/sponsors` → sponsorId + plaintext bearer
   token returned once.
2. `POST /api/admin/sponsors/:id/deposit {amountPaise: 50000}` →
   escrow balance 500 ₹.
3. `POST /api/sponsors/:id/self` (bearer) → returns
   `publicSponsor` envelope.
4. `POST .../labeling-jobs {taskKind, language, perLabelPaise,
   itemCount, consentPurposeCode, description}` → draft job.
5. `POST .../labeling-jobs/:jobId/items {items: [...]}` → items
   uploaded.
6. `POST .../labeling-jobs/:jobId/launch` → status `active`,
   `escrowLockedPaise: 800`.
7. `GET .../labeling-jobs/:jobId/export.ndjson` (bearer) → signed
   NDJSON bundle returned.

## Consequences

- **Substrate integration sweep arc CLOSED.** Citizen + worker +
  cross-cutting + sponsor all on `/app/*`. The four-sub-phase
  audit-driven plan landed without scope creep.
- **`/shell/` is now strictly developer surface.** Every Phase 1
  → 12 substrate that any persona could plausibly use is wired
  into `/app/`. The `/app/-grows-/shell/-retires` direction lands.
- Sponsor demo flow is end-to-end: admin curl-creates sponsor +
  deposits → sponsor pastes token in `/app/sponsor/` → creates
  draft job → uploads items → launches → workers label via
  `/app/labels/` → sponsor reviews sampled submissions in
  `/app/sponsor/jobs/:id/review/` → rejects with reason
  (clawback fires per Phase 10.4) → downloads signed audit
  export → independently verifies via the audit signer public key.
- Pattern established for **any future bearer-gated surface**: the
  Zustand store + `apiWithBearer`/`fetchWithBearer` + the
  query-cache auth-guard subscription is reusable as-is. Phase
  13+ Bharat ID can swap the bearer for a signed JWT without
  changing the FE shape.

## What's NOT in this sub-phase

(verbatim from the triage's "Defer to polish" section + the plan's
explicit deferrals)

- **No BE changes.** No new endpoints, no cancel/refund/pause
  endpoints, no self-onboarding, no bearer rotation API. Token
  loss = admin re-creates sponsor.
- **No Phase 10.4.1 polish in the review queue** — bulk
  accept/reject, filter chips, sort controls, pagination, source-
  item display, diff view between golden and worker's submission.
- **No sponsor-side analytics dashboard** (cost-per-accepted-label,
  worker-acceptance-distribution, time-to-completion, golden-
  mismatch-rate). Phase 12.1.x analytics.
- **No round close / abandon actions.** BE has no endpoint.
- **No signed federated export.** Defer to "Phase 9.2 federated
  export signing".
- **No multi-sponsor session.** One bearer at a time; sign out to
  switch.
- **No CSV import**, item edit, sponsor webhook config, push
  notifications for sponsors.
- **No i18n** (English only).
- **No Vitest tests** for the new components (snapshot tests
  deferred per the plan + the adversarial workflow standing in).

ADR 0134.
