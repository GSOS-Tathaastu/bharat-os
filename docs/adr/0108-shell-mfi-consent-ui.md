# ADR 0108: Phase 8.2 — Shell UI for MFI Income-Verification Consent Issuance

## Status

**Accepted — shipped.** Third UI commit in the Phase 8 arc. Wires
Phase 6.1's MFI income-verification consent endpoints into a
worker-facing card on the Trust tab.

## Context

Phase 6.1 (ADR 0097) shipped the substrate for MFI consent issuance:

- `POST /api/identities/:id/income-verification/consents` — creates a
  worker-signed envelope authorising a named MFI to read the
  bundle.
- `GET /api/identities/:id/income-verification/consents` — lists
  issued consents.
- `POST /api/identities/:id/income-verification/consents/:consentId/revoke`
  — revoke before expiry; non-issuer 404.
- `GET /api/income-verification/:consentId` — what the MFI reads
  (returns the signed bundle; burns one read).

But no shell UI. A worker who wanted to apply for an MFI loan had
to curl the endpoint themselves, which is not the MVP path.

Phase 8.2 puts a card on the **Trust tab** (which already hosts the
Trust Passport flow — same "share data with verifiers" family).

## Decision

### `#mfiConsentSection` card on the Trust tab

Inserted after the existing `#trustPassportSection`. Card layout:

- **Header** "🏦 Share income with a lender" + status caption.
- **Body copy** (honest framing) — "Bharat OS hands a named MFI a
  signed summary of your earnings + portable attestations +
  verified memberships. You issue the consent; they read it ONCE;
  it burns. The MFI never sees raw entries — only the aggregated
  bundle."
- **Form**:
  - **Lender name** text input (maxlength 80, matches Phase 6.1
    server-side cap).
  - **Purpose** text input (maxlength 200, ≥ 8 chars enforced
    server-side).
  - **Financial year** select — populated dynamically with current
    + 2 prior FYs (April-March basis); defaults to the
    just-ended FY (most relevant for an MFI assessing recent
    annual income).
  - **Valid for** select (7 / 30 / 60 / 90 days). Default 30.
  - **Max reads** select (1 / 3 / 5 / 10). Default 1 (single-use
    bearer, matching the Phase 6.1 default).
  - **[Issue consent]** button.
- **After issuance**: orange-highlighted block showing the
  `mfiFetchUrl` (single-use share URL) + **[Copy]** button using
  `navigator.clipboard.writeText`.
- **List of issued consents** below: each row shows lender name,
  status badge (`active` / `revoked` / `expired` / `exhausted`),
  financial year, expiry date, read count, last 8 chars of the
  consentId for identification, and a **[Revoke]** button on
  active consents only (with `window.confirm` + reason prompt).
- **"How an MFI uses this"** details collapsible explaining the
  bundle flow + disclaimer.

### `setupMfiConsent()` in `app.js` (~170 lines)

Follows the Phase 8.0 / 8.1 setup-function pattern. Notable bits:

- **FY dropdown is populated client-side** based on the current
  date (April-March logic; offsets -1 / 0 / -2 for the just-ended,
  in-progress, and previous-prior FYs). The default selection is
  the just-ended FY because that's the year a lender will assess
  for an annual income claim.
- **`classifyStatus(consent)`** derives `active` / `revoked` /
  `expired` / `exhausted` from the consent's mutable fields the
  same way the server's `verifyIncomeVerificationConsent` does
  (Phase 6.1's status enum). Lets the UI render badges without an
  extra server round-trip.
- **Revoke flow** uses `window.confirm` + `window.prompt` for the
  reason (consistent with the existing "Reset device" pattern from
  Phase 2a.26). Reason isn't actually sent to the server in the v1
  wire (the API doesn't require it on revoke — only on
  cooldown-clear); the prompt is for the user's own records via
  the `cooldown_override.applied`-style audit narrative.
- **Share URL** is `${window.location.origin}${body.mfiFetchUrl}`
  — the worker copies + shares via WhatsApp / email with the
  lender out-of-band. The URL is a bearer token; possession =
  read access until burn.
- **`escapeHtml(text)`** applied before any user-controlled
  field (lender name, purpose) is interpolated into the rendered
  list HTML. XSS-safe.

### CSS

New rules in `public/shell/styles.css`:

- `.mfi-consent-issued` — orange-highlighted post-issuance block
  with the share URL.
- `.mfi-consent-share input[type="text"]` — monospace, small font
  for the long consentId URL.
- `.mfi-consent-list-entry` — 2-column grid (info + revoke
  button).
- `.mfi-consent-status-badge` with status-coloured variants:
  - `.active` — green (`#d1fae5 / #065f46`)
  - `.revoked` — red (`#fee2e2 / #991b1b`)
  - `.expired` — grey (`#e5e7eb / #6b7280`)
  - `.exhausted` — amber (`#fef3c7 / #92400e`)

### Service worker cache → v32

Forces refresh of the new HTML / CSS / JS for already-installed
clients.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Worker controls the consent | UI never auto-issues; explicit click on **Issue consent** is required. The form fields are exactly what Phase 6.1's API requires; the UI is a thin wrapper. |
| Status derivation is client-side | The status badge logic doesn't make an extra API call — uses the consent's own mutable fields. Server is still the source of truth (the API enforces status on read), so the badge is advisory display only. |
| Cross-user isolation | All calls use `state.deviceOwnerId` from localStorage. The list endpoint server-side already filters by `workerId` (Phase 6.1); the UI can't show another user's consents. |
| HTML escaping | `escapeHtml()` applied to `mfiName`, `purpose`, and the consentId suffix before list-row interpolation. |
| Share-URL is bearer-token (worker's responsibility) | The honest framing in the card copy: "Hand this URL to the lender (single-use)" — worker decides which channel (WhatsApp, email, in-person QR). Not auto-shared. |
| Revoke is local-action only | `window.confirm` + `window.prompt` gates the revoke call. No accidental revokes from a stray click. |

## Tests

**No automated browser tests** — same pattern as Phase 8.0 / 8.1.

Live smoke verification:

- `GET /shell/index.html` contains `mfiConsentSection`, `mfiName`
  input, `mfiConsentIssue` button.
- End-to-end API round-trip the UI relies on:
  - `POST .../income-verification/consents` returns 201 + valid
    `mfiFetchUrl`.
  - `GET .../income-verification/consents` returns the list
    with the newly-issued entry.
- All 747 Node tests still pass.

## Consequences

- **The MFI flow is now demoable end-to-end.** Investor demo
  path: worker logs earnings on the Earn tab → switches to Trust
  tab → issues a consent for "Bajaj Finserv / Personal loan / FY
  2025-26" → copies the share URL → in a separate window,
  curls the URL to simulate the MFI fetch → sees the signed
  bundle response with all the worker's aggregated data + the
  mandatory disclaimer.
- **Trust tab now hosts two complementary flows:** the existing
  Trust Passport (share verified profile attestations with a
  verifier) + the new MFI consent (share verified income with a
  lender). Both follow the worker-issues / counter-party-reads
  pattern.
- **Backward-compatible.** No existing surfaces changed; the new
  card just renders below the Trust Passport on the same tab.

## Future polish

- **QR-code rendering of the share URL** for in-person MFI
  handoff (the URL is long enough that QR is more usable than
  copy/paste).
- **Per-consent read history** — when the MFI reads the bundle,
  Phase 7.1's `income_verification.pushed` already fires; the UI
  could show the read time on the consent list entry once the
  push handler is wired (Phase 8.4).
- **Bulk-revoke** — "Revoke all consents to Bajaj Finserv" for
  workers who want to cut a lender off entirely.
- **i18n** — copy is English-only. Phase 4.5's `applyI18n`
  substrate exists; needs `data-i18n` attributes + translation
  entries.
- **Per-MFI shortcut buttons** — if Bharat OS pre-curates a list
  of known MFI partners (Bajaj Finserv, Mahindra Finance,
  Lendingkart, Indifi), the form could offer them as
  one-click presets. Caveat: needs the MFI to actually be on
  the platform; otherwise it's marketing-only.
- **Per-consent QR + "share via WhatsApp" deep link** — a
  one-tap share intent via the Web Share API.
