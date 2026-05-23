# ADR 0060: Operator-Console Flag Review Panel

## Status

Accepted

## Context

ADR 0058 (Phase 2a.9) added the citizen side of §9A safeguard escalation:
signed flag reports from `/shell/`, persisted as artifacts, with an L4
policy that auto-blocks subjects carrying ≥ 3 open high-severity flags.

The operator side was missing. A flag filed from the shell sat in the
audit ledger and on disk, but resolving it required hitting the
`POST /api/flags/:id/resolve` endpoint via CLI or `curl`. For an
investor demo, the §9A story has two sides: the citizen reports
in-app, and an NGO / labour-law partner / Bharat OS operator reviews
and resolves in the admin console. Both should be visible.

## Decision

Phase 2a.11 adds a **§9A Flag Reports — review queue** panel to
`/console/`:

- New `<section id="flag-reports">` with status filter, refresh
  button, and a table of all flags.
- Columns: short flag ID, subject actor ID, reporter, category,
  severity (color-coded tag), summary (truncated to 60 chars,
  full text on hover), status, reported timestamp, per-row actions.
- Sort order: open flags first (pending → under_review), then by
  severity (high → medium → low) within each status, then newest
  first within each severity. Resolved/dismissed flags fall to the
  bottom unless the filter explicitly asks for them.
- Status filter defaults to `open` (pending + under_review combined)
  so the operator's review queue is what they see first.
- Per-row **Resolve** and **Dismiss** buttons prompt for a reason
  and a reviewer identifier, then POST to
  `/api/flags/:id/resolve`. The reason and `resolvedBy` are
  required and validated server-side.
- The resolution output panel shows the L4 implication:
  *"Subject's §9A auto-block recomputes on the next orchestration."*
  Closing flags down to < 3 open high-severity unwinds the block.

The dashboard loader (`loadDashboard`) now calls `loadFlagReports`
alongside `loadServiceMarketplace` and `loadWorkerAuthorizations` so
the panel populates on first load.

Operator-console service worker bumped to `v2` so the new panel
installs cleanly.

## Consequences

- The §9A loop is now end-to-end visible: a citizen files a flag in
  `/shell/` → it appears in the operator console review queue → the
  operator resolves with a reason → the L4 auto-block recomputes on
  the next orchestration by the subject. Investor demos can walk the
  full cycle in one window.
- The console becomes the natural seat for NGO / labour-law-partner
  collaboration (per §9A, *"bring in labour-law expertise and likely
  NGO / government partners before launch"*). Each resolution is
  recorded with the reviewer identifier so accountability is in the
  audit ledger.
- The `resolvedBy` field is currently a free-text string. A future
  iteration should tie it to a real partner identity (e.g.,
  `bos:operator:csc-bihar-001` validated against a partner registry).
- The panel has no batch-resolve action — one flag at a time, with an
  explicit reason — which is the right friction for a safeguard tool
  but means high-volume operators will eventually want a queue UX.
  Track as future polish.
- No new tests in this ADR — the API endpoints (POST resolve, GET
  flags with filter) are already covered in
  `tests/node/flag-report.test.mjs` and the resolve verb is
  identical to the existing `resolveFlagReport` primitive. The new
  code is purely UI rendering + click wiring.
