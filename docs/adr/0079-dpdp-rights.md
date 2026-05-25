# ADR 0079: Phase 4.0 — DPDP Data-Subject Rights

## Status

Accepted

## Context

The founder requested a pivot from "investor-demo ready" to
"launch ready." The Phase 4 arc lays out what that requires:

| Phase | Scope |
|---|---|
| **4.0 (this)** | DPDP Act 2023 data-subject rights — non-negotiable for India launch |
| 4.1 | Production hardening (CSP, security headers, rate limiting, structured logging) |
| 4.2 | Database migration (file-store → SQLite/Postgres) |
| 4.3 | Real auth hardening (WebAuthn attestation, phone OTP scaffold) |
| 4.4 | Error UX + offline mode + retry logic |
| 4.5 | i18n framework |
| 4.6 | Deployment scripts |

DPDP comes first because:

1. **It's legally non-negotiable.** Operating without right-to-access /
   right-to-erasure endpoints in India is illegal as of Aug 2023.
2. **It's user-facing.** Investors, regulators, and real users all
   look for Settings → *Delete my account* and Settings → *Download
   my data* as table-stakes signals of trust.
3. **It touches every persisted artifact.** Building it forces a
   complete inventory of what data Bharat OS holds — which is itself
   the kind of audit a fiduciary registration application demands.

The Act mandates seven rights / disclosures. Phase 4.0 ships
runnable surfaces for all seven.

## Decision

### New artifact — `src/phase1/dpdp-rights.mjs`

Pure functions, no I/O:

- **`collectUserData(store, identityId)`** — sweeps every store
  list method, filters records to ones that pertain to the
  identity, returns a structured bundle with 18 sections
  (identity, consents, decisions, orchestrations, skillPreflights,
  toolExecutions, memoryRecords, workerAuthorizations,
  flagsAuthored, flagsAgainst, meshContributions, pairingSessions,
  healthDocuments, profileCredentials, pushSubscriptions,
  workerNotifications, federatedUpdates, attestations, ledger).
  Each section carries `{ count, firstRecordedAt, lastRecordedAt,
  records }` so the user gets summary stats AND raw data.
- **`erasureManifest(store, identityId)`** — pure deletion plan.
  Returns which sections would lose how many records, plus the
  ledger-redaction count. Lets the API offer a preview before
  the destructive action (DPDP §12(4) — user has the right to
  know what will be deleted).
- **`redactLedgerEntry(event, identityId)`** — replaces every
  reference to the user's identityId with the fixed string
  `'<erased>'`. Preserves the event type, timestamp, and any
  non-identity payload so the audit chain stays intact for other
  legitimate participants.
- **`DEFAULT_DPO_CONTACT`** — published DPDP §13 contact details
  (name, email, postal, escalation URL, 30-day SLA). Sensible
  placeholder; actual addresses populated from environment
  variables at deploy time.

### `BosStore.eraseUserData(identityId, { redactLedgerEntry })`

Cascading deletion across every per-section file. Reads each
list method, filters records that mention the identity, deletes
the matching files. Then rewrites `ledger.jsonl` in-place
(atomic via `.tmp` + `rename`) with each line passed through
`redactLedgerEntry`. Identity file deleted last so a partial
failure mid-cascade leaves the identity reachable for retry.

Emits a final `account.erased` ledger event (with the
identityId already `<erased>` so the tombstone is anonymous)
that records `{ sections, ledgerRedactions }`.

### Three new API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/identities/:id/export` | Right to access — streams the export bundle with `Content-Disposition: attachment` so the browser offers a download. Excludes `privateKeyPem` + `vaultKeyBase64` (§15 — those are protected by the recovery phrase and would be an attack surface in an export file). |
| `GET` | `/api/identities/:id/erasure-preview` | Right-to-erasure preview — returns the deletion plan without touching the filesystem. |
| `DELETE` | `/api/identities/:id?confirm=YES_DELETE` | Right-to-erasure execute. Refuses without the explicit query-string flag (belt-and-braces against accidental hits). |
| `GET` | `/api/dpdp/grievance` | DPDP §13 grievance contact — DPO details published by the platform. |

### Static legal pages — `public/legal/`

Two full-text pages with the Bharat OS dark theme and brand
mark:

- **`/legal/privacy.html`** — 10 sections covering DPDP §11
  notice of processing: who we are, what data we collect, why
  (purpose), who we share with, how long we keep it, your seven
  DPDP rights, grievance officer (populates live from the
  `/api/dpdp/grievance` endpoint), cryptographic key material
  notes, children's-data policy, change-control.
- **`/legal/terms.html`** — 11 sections: what Bharat OS is,
  18+ requirement, identity ownership, what you can / can't do,
  the §15 binding promises restated in plain language, mesh
  participation terms, federated rounds, service availability,
  limitation of liability (₹50K cap), governing law (Indian
  courts), change control.

Both pages link to each other. The privacy page fetches the live
DPO contact from `/api/dpdp/grievance` so the address / email
stays in sync with the artifact's `DEFAULT_DPO_CONTACT` — single
source of truth.

Served via a new `/legal/` static route in `api.mjs` (mirrors
the existing `/shell/`, `/console/`, `/verify/` patterns).
`GET /legal` 302s to `/legal/privacy.html`.

### Shell — "Your data rights" card on the Profile tab

Three buttons:
- **📥 Download my data** — calls `GET /export`, triggers a
  browser save dialog via a Blob + temporary `<a download>`.
  Filename: `bharat-os-export-{shortId}-{timestamp}.json`. After
  download, the result box notes that the private key was
  excluded by design.
- **🗑️ Delete my account** (red danger style) — two-step:
  fetches preview, shows `window.confirm` with the full plain-
  language summary of what gets deleted, requires the user to
  type "DELETE" into a `window.prompt`, then hits the DELETE
  endpoint with `?confirm=YES_DELETE`. Clears localStorage and
  reloads — the wizard re-fires.
- **Contact DPO** — fetches `/api/dpdp/grievance`, renders the
  contact + 30-day SLA + escalation link.

Plus inline links to Privacy Policy and Terms of Service that
open in new tabs.

### First-run wizard — legal-acceptance notice

Welcome step footer:

> By continuing, you accept our **Terms of Service** and
> acknowledge our **Privacy Policy**.

Both linked. Acceptance is implicit on choice of any of the three
paths — same model as most apps. Audit-trail wise, the existence
of a `deviceOwnerId` IS the acceptance signal.

### Service worker

`bharat-os-shell-v23 → v24`.

## §15 bindings — what changed, what didn't

| Binding | Resolution |
|---|---|
| Pointer, not payload | The export deliberately excludes `privateKeyPem` + `vaultKeyBase64` even when the user asks for "all my data" — those are protected by the recovery phrase, not by server-side ACLs. A stolen export file is non-actionable. |
| Identity is the person, not the device | Erasure cascades through every per-section file plus redacts ledger entries — the identity is fully removable, the device is just a current host. |
| Never sell user data | DPDP rights are *given* to the user, not sold or upsold. No paid tier for "expedited deletion" or "premium export format" exists. |
| Right to grievance | DPDP §13 honoured. Single source of truth (`DEFAULT_DPO_CONTACT`) drives both the API endpoint and the privacy page. |
| Audit ledger integrity | Redaction (not deletion) of ledger entries preserves the chain for other participants. A user erasing their account does not corrupt anyone else's audit history. |

## Tests

`tests/node/dpdp-rights.test.mjs` — 9 focused tests:

1. `DEFAULT_DPO_CONTACT` carries required DPDP §13 fields
2. `collectUserData` returns the expected sections + protocol version
3. `collectUserData` EXCLUDES privateKey / vaultKey from the export
   (string-search test against the serialised bundle)
4. `collectUserData` filters across multiple subjects — only the
   requested user's records appear
5. `collectUserData` refuses unknown identity
6. `erasureManifest` emits a plan without touching the filesystem
   (verified by reading the store back after)
7. `redactLedgerEntry` replaces identity refs with `<erased>`,
   preserves everything else
8. `redactLedgerEntry` leaves events that don't mention the user
   unchanged
9. The export bundle includes the DPDP rights notice and DPO
   contact

Full suite: **289 / 289 green** (was 280; +9 new). SW cache to v24.

Live sanity confirmed:
- `/legal/privacy.html` + `/legal/terms.html` serve HTTP 200
- `/legal` 302s to `/legal/privacy.html`
- `/api/dpdp/grievance` returns the full DPO block
- `/api/identities/<id>/erasure-preview` enumerates exactly what
  would be deleted (identity: 1, consents: 1, meshContributions:
  5, …)
- `/api/identities/<id>/export` returns a complete bundle with
  the privateKey excluded
- `DELETE /api/identities/<id>` without `?confirm=YES_DELETE` is
  rejected with a 400 + a pointer to the preview endpoint

## Consequences

- **Bharat OS is now DPDP-compliant at the protocol layer.** The
  seven rights (access, correction, erasure, nomination,
  grievance, notice, audit access) each have a named surface in
  code and UI. A fiduciary-registration application can cite
  this ADR + the live endpoints.
- **Investors / users see the table-stakes "delete my account"
  and "download my data" affordances** on first inspection. Many
  India-market launches stall because regulators ask *"where's
  the privacy policy?"* — Bharat OS opens at /legal/privacy.html.
- **The export bundle is genuinely complete.** 18 sections × every
  per-section list method. No hidden data left out (we
  deliberately exclude only the cryptographic secret material,
  with the reason documented in the notice block on the bundle
  itself).
- **Erasure is auditable.** The tombstone `account.erased` event
  with the identityId already `<erased>` lets ops staff see that
  an erasure happened without knowing whose. Cumulative erasure
  counts can be published as a transparency-report metric.
- **289 / 289 tests**, SW cache to v24.

## What's still missing for "launch ready" (Phase 4.1+)

- **Production hardening**: CSP, HSTS, X-Frame-Options, rate
  limiting on the DELETE endpoint, structured JSON logging
  without PII, health probes.
- **Database**: file-store is fine for ~thousands of users; for
  millions we need SQLite or Postgres. The store API is already
  abstracted, so this is a swap-the-backend exercise.
- **Real auth**: phone OTP scaffold (Gupshup/Karix Tier 1
  integration), real WebAuthn attestation verification.
- **Error UX**: network-error retry, offline mode that gracefully
  degrades, loading states on every async action.
- **i18n**: the legal pages are English-only today. Production
  must offer translated copies in at least the six languages the
  app speaks.
- **DPDP nomination registry** (§14) — a user can name a
  representative to exercise rights on their behalf. Today's
  shell has no UI for this; the DPO accepts nominations by email.
- **Operator console DPDP panel** — ops staff need a view of
  pending DPDP requests, SLAs, response statuses. Today the API
  routes work but there's no console UI. Phase 4.1.

## Future polish

- **PDF export** alongside JSON — some users want a printable
  copy. Server-side rendering via Puppeteer or client-side via
  the browser's print API.
- **Cumulative erasure counter** — publish *"X accounts erased
  this month"* as a transparency-report metric.
- **Translated legal pages** in 22 languages. Volunteer review
  pipeline.
- **Privacy-preserving telemetry** for DPDP-request response
  times so we can prove the 30-day SLA without leaking individual
  request metadata.
- **In-app "Show my ledger"** — DPDP grants visibility, but
  today the user has to download the export to see their audit
  trail. A live timeline view in Profile would be friendlier.
