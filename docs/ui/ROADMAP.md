# Bharat OS UI Roadmap

The UI comes after the Phase 0 protocol is stable enough to inspect. It should
start as an operator/developer console, not the consumer AI shell.

## UI 0: Operator Console

Purpose: make the mesh observable.

Data source: the Phase 0.3 API in `docs/phase0/API.md`.

Status: implemented as `public/operator-console/`, served at `/console/`.

Views:

- bootstrap dashboard;
- node table with KYC, WiFi, charging, battery, trust score, and rejection reason;
- storage utilization view;
- manifest/chunk placement view;
- report history.
- policy, consent, decision, and mocked tool execution status.
- local L6 skill registry with tool binding and no-raw-PII posture.
- skill manifest version and hash evidence in the registry table.
- skill preflight action before tool execution.
- persisted skill preflight count and latest receipt integrity status.
- orchestration status now includes the selected skill preflight receipt before
  tool execution.
- direct tool execution output includes the linked skill preflight receipt.
- blocked skill preflight output includes consent and policy remediation
  templates.
- stored preflight remediation can be converted into explicit signed consent
  grants through the API/CLI boundary.
- operator-console action to grant the latest blocked preflight remediation
  consent through the API.
- remediation grant responses surface lifecycle and integrity evidence in the
  console output.
- after a remediation grant, the console retries the original stored preflight
  request and surfaces the new preflight receipt.
- approved preflight receipts can be executed from the console and produce
  linked tool execution evidence.
- preflight trace action summarizes the invocation chain across preflights,
  consent grants, executions, and ledger events.
- trace output includes evidence hash and metadata-only privacy flags.
- Trust Passport table includes skill preflight/execution evidence counts.
- approved-preflight execution output includes receipt integrity status.
- intent orchestration status, selected tool/plan, and first Hindi/Hinglish
  locale evidence.
- selected skill manifest evidence in orchestration receipts.
- signed-consent count and latest receipt integrity status.
- active, revoked, and expired consent counts with latest-consent revocation.
- recent audit ledger events for consent, policy, tools, and mesh changes.
- identity memory count and latest encrypted memory metadata.
- metadata memory search and provenance table.
- consent-gated memory reveal action with decision receipt output.
- signed memory-read consent grant action for a selected record.
- consent timeline with lifecycle, signature counts, and row-level revocation.
- public identity profile list with actor selection.
- local identity creation with public-only API response.
- Trust Passport v1 table with assurance, consent, memory, and evidence signals.
- signed Trust Passport snapshot export from the trust table.
- consent timeline receipt verification.
- audit ledger filtering by event type and limit.
- audit ledger NDJSON export for evidence review.

Recommended first screen: a dense operator dashboard backed by
`GET /api/reports`, `GET /api/control-planes/bootstrap`, and `GET /api/nodes`.
This is not the consumer-facing Bharat OS shell yet; it is the observability
console for building the shell safely.

## UI 1: Consent And Identity Console

Purpose: prepare Phase 1 by making identity, consent, and policy checks visible.

Views:

- identities and public records;
- attestations and fallback status;
- permission scopes;
- audit log.
- tool execution receipts and no-raw-PII evidence.
- orchestration receipts linking intent, decision, tool, and audit hash.
- consent signature status and artifact integrity checks.
- subject-facing grant withdrawal and expiry timeline.
- audit evidence review workflows beyond the basic NDJSON export.
- user-facing consent review timeline for memory grants and reveal receipts.
- identity pairing and recovery controls remain future UI 1 work.

## UI 2: Vernacular Shell Prototype

Purpose: begin the actual Bharat OS experience layer.

This should only start once the control plane, identity vault, and policy
interfaces have stable contracts. The shell should call the same API/CLI
boundary the operator console uses, so the product experience does not fork from
the protocol reality.
