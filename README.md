# Bharat OS

Phase-by-phase implementation of the Bharat OS canonical product reference.

The current codebase starts with **Phase 0: protocol + identity + mesh**, matching
`BHARAT_OS.md`. The baseline executable spec is dependency-free PowerShell, and
the Phase 0.1 CLI/persistence layer runs on the local portable Node.js runtime in
`.tools/`.

## Phase 0 MVP

Implemented pieces:

- identity records with local root keys;
- signed protocol messages;
- encrypted chunk manifests using pointer-not-payload semantics;
- a small control-plane model for node registration and manifest publishing;
- a mesh placement simulator that enforces KYC, WiFi, charging, battery, and
  storage constraints;
- contribution accounting for the future fair-use model.
- deterministic bootstrap simulation for the first 1,000-node demand test.
- Phase 1 policy/consent/decision dry-runs.
- Phase 1.1 mocked IndiaStack tool adapters behind the policy gate.
- Phase 1.2 intent orchestration from user intent to policy-gated tool plan.
- Phase 1.3 signed consent artifacts and tamper-evident receipt verification.
- Phase 1.4 consent lifecycle controls for active, revoked, and expired grants.
- Phase 1.5 queryable audit ledger for consent, policy, tool, and mesh events.
- Phase 1.6 identity-anchored encrypted memory records with consent-gated reads.
- Phase 1.7 metadata-only memory search and provenance lookup.
- Phase 1.8 operator-console memory reveal through the consent gate.
- Phase 1.9 operator-console memory-read consent grants.
- Phase 1.10 operator-console consent timeline and row-level revocation.
- Phase 1.11 operator-console public identity profile view and actor selection.
- Phase 1.12 local identity creation through API and operator console.
- Phase 1.13 row-level consent receipt verification in the operator console.
- Phase 1.14 audit ledger filtering by event type and limit in the console.
- Phase 1.15 audit ledger NDJSON export from API and operator console.
- Phase 1.16 Trust Passport v1 read model from public identity, consent,
  memory-metadata, integrity, and ledger evidence.
- Phase 1.17 deterministic Hindi/Hinglish intent normalization for the first
  vernacular regulated-flow path.
- Phase 1.18 signed Trust Passport snapshots as portable evidence artifacts.
- Phase 1.19 L6 skill registry for policy-gated tool manifests and sandbox
  posture.
- Phase 1.20 L7 orchestration now selects L6 skill manifests before invoking
  policy-gated tools.
- Phase 1.21 CLI access for local L6 skill manifest list/read workflows.
- Phase 1.22 versioned, hash-verified L6 skill manifests with API/CLI integrity
  checks.
- Phase 1.23 skill invocation preflight for integrity, consent, scope, and policy
  checks before execution.
- Phase 1.24 persisted skill preflight receipts with audit hashes, ledger events,
  API/CLI lookup, and integrity verification.
- Phase 1.25 orchestration now runs the selected L6 skill through preflight
  before any L3 tool execution.
- Phase 1.26 direct API/CLI tool execution is also bound to L6 skill preflight
  receipts and carries preflight IDs into tool receipts.
- Phase 1.27 blocked skill preflights now include consent and policy
  remediation templates for UI-driven recovery.
- Phase 1.28 stored preflight remediation can create explicit signed consent
  grants through API/CLI.
- Phase 1.29 operator console can grant the latest blocked preflight consent
  remediation through the same API boundary.
- Phase 1.30 remediation consent grants return lifecycle and integrity evidence
  immediately after creation.
- Phase 1.31 stored blocked preflights can be retried after remediation grants,
  producing a new persisted preflight receipt from the original request.
- Phase 1.32 approved preflight receipts can be executed directly through
  API/CLI/console while preserving the `skillPreflightId` evidence chain.
- Phase 1.33 skill invocation trace view links preflights, remediation consent,
  retries, tool executions, decisions, and ledger evidence.
- Phase 1.34 skill invocation traces now include stable evidence hashes and
  metadata-only privacy posture.
- Phase 1.35 Trust Passport v1 now includes skill preflight and execution
  evidence counts without exposing raw payloads.
- Phase 1.36 approved-preflight execution responses include tool-execution
  integrity verification.
- Phase 1.37 dedicated L8 vernacular module covering Hindi, Marathi, Bhojpuri,
  Tamil, and Bengali (script + romanized) across every canonical action type,
  with localized response phrases attached to orchestration receipts.
- Phase 1.38 §9A worker-protection policies: no-advance-fee (generalized),
  escrow required, minimum-wage-floor, age verification, kiosk-mediation
  worker-authorization, and fiat-only settlement — enforced in the L4 engine,
  surfaced via skill-preflight remediation hints, idempotent across passes.
- Phase 1.39 §9B native service marketplace: Bharat OS-owned L6
  `bharat_marketplace` tool + skill as the substrate for cab / hotel / ticket
  / food / grocery / professional-services booking. ONDC is a Phase A
  outbound bridge only (`ondc_beckn` L3 tool, `bos:skill:ondc-bridge`).
  Voice intents like *"mujhe ek cab book karo"* route to the native
  marketplace across Hindi, Marathi, Bhojpuri, Tamil, and Bengali, with
  localized response strings.
- Phase 1.40 Net Contribution Score surfaced via `store.computeContribution`,
  `GET /api/identities/:id/contribution`, `bos contribution show`, and a
  `mesh` block on the Trust Passport (covered by the audit hash and
  signed snapshots). The §13B fair-use lever is now readable end-to-end.
- Phase 1.41 §9A worker authorization receipts as a signed first-class
  artifact (`src/phase1/worker-authorization.mjs`). L4 mediation policy
  now verifies signature + workerId + expiry, not just ID presence.
  `publicRecords` threaded through `evaluateDecision`,
  `evaluateSkillPreflight`, `executeToolAction`, `orchestrateIntent`,
  and the API + CLI surfaces.
- Phase 1.42 Phase 1 tie-off bundle: (a) operator console adds an NCS
  column on Trust Passports + a §9B Service Marketplace panel + a §9A
  Worker Authorizations panel with verify buttons; (b) new CLI commands
  `bos service book`, `bos vernacular normalize`, `bos vernacular
  languages`, `bos worker-auth create/list/verify`,
  `bos device recovery-phrase / verify-phrase / pair`; (c) PWA conversion
  of the operator console with manifest, service worker, and offline app
  shell (Phase 2a §13 distribution path); (d) device-pairing scaffold
  (`src/phase1/device-pairing.mjs`) with deterministic recovery phrase
  and pairing payload for §7c phone migration.

## Quickstart

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

Run the bootstrap simulator:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 simulate bootstrap --nodes 1000 --objects 100 --report-out .tmp/bootstrap.md --store .bharat-os
```

Run the local API for the future UI:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/api.ps1 --store .bharat-os --host 127.0.0.1 --port 8787
```

Then open:

```text
http://127.0.0.1:8787/console/
```

The test runner imports `src/BharatOS.Phase0/BharatOS.Phase0.psm1`, runs the
PowerShell behavioral tests, then runs the Node.js tests in `tests/node/`.

## Repository Layout

```text
BHARAT_OS.md                         Canonical product and architecture reference
src/BharatOS.Phase0/                 Phase 0 PowerShell module
src/phase0/                          Phase 0.1 Node core and store
bin/bos.mjs                          Phase 0.1 CLI
bin/bos-api.mjs                      Phase 0.3 local API
public/operator-console/             UI 0 operator console
tests/                               Dependency-free test scripts
scripts/test.ps1                     Test entry point
docs/phase0/                         Phase 0 implementation notes
docs/phase1/                         Phase 1 implementation notes
docs/adr/                            Architecture decision records
docs/ui/                             UI roadmap
```
