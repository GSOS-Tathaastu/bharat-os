# Phase 1: Policy, Consent, Tool Dry-Runs

Phase 1 starts the Bharat OS decision layer. It does not call production
regulated systems yet; it evaluates whether a proposed action is allowed to
proceed and can execute mocked IndiaStack tools behind that gate.

Implemented primitives:

- default policy registry for the binding guardrails;
- consent artifacts with subject, grantee, scope, purpose, status, and expiry;
- consent lifecycle checks for active, revoked, and expired grants;
- decision evaluations with pass/fail checks and an audit hash;
- mocked IndiaStack tool adapters behind the same decision gate;
- L7 intent orchestration from plain-language intent to action request, policy
  decision, selected tool, and execution plan;
- deterministic Hindi/Hinglish intent normalization for first regulated-flow
  inference without an LLM dependency;
- signed consent artifacts using local identity keys;
- signed revocation receipts for consent withdrawal;
- canonical integrity verification for consent IDs, decision audit hashes, tool
  execution receipts, and orchestration receipts;
- persistence for consents, decision receipts, and tool execution receipts;
- queryable audit ledger for consent, decision, tool, orchestration, and mesh
  events;
- identity-anchored encrypted memory records with provenance and consent-gated
  reads;
- metadata-only memory search and provenance lookup without plaintext reveal;
- operator-console memory reveal actions that call the same consent-gated read
  endpoint and display the resulting decision receipt;
- operator-console memory-read grants that create signed consent artifacts for
  the selected record owner and scopes;
- operator-console consent timeline with lifecycle status, signature count, and
  row-level revocation;
- operator-console public identity profile view with actor selection and no
  private-key exposure;
- local identity creation through API and operator console while returning only
  the public profile;
- row-level consent receipt verification in the operator-console timeline;
- audit ledger filtering by event type and limit in the operator console;
- audit ledger NDJSON export through the same filter parameters;
- Trust Passport v1 public read model derived from identity, consent, integrity,
  memory metadata, and ledger evidence;
- signed Trust Passport snapshots as portable evidence artifacts;
- L6 skill registry for policy-gated tool manifests, required scopes, developer
  KYC posture, sandbox posture, and no-raw-PII guarantees;
- L7 orchestration links each intent to a selected L6 skill manifest before tool
  execution;
- CLI list/read commands for local L6 skill manifests;
- versioned, hash-verified L6 skill manifests with API/CLI integrity checks;
- skill invocation preflight for manifest integrity, consent, scope, and policy
  checks before execution;
- persisted skill preflight receipts with audit hashes, ledger events, and
  integrity verification;
- orchestration uses the selected L6 skill preflight as the gate before any L3
  tool execution;
- direct API/CLI tool execution also runs L6 preflight first and links the
  resulting `skillPreflightId` into the tool execution receipt;
- blocked skill preflights include remediation actions and a consent-grant
  template when active consent is missing;
- stored preflight remediation templates can be converted into explicit consent
  artifacts through API/CLI grant commands;
- operator-console preflight remediation grants call the same stored-preflight
  consent API;
- remediation consent grants return lifecycle status and integrity verification
  in the API/CLI response;
- stored preflights can be retried after remediation, preserving a pointer to
  the original blocked preflight;
- approved preflight receipts can be executed directly, linking the resulting
  tool execution receipt to the preflight ID;
- skill invocation traces link related preflights, remediation consent grants,
  retries, decisions, executions, and ledger events;
- skill invocation traces include evidence hashes and metadata-only privacy
  posture;
- Trust Passport v1 includes skill invocation evidence counts and skill IDs;
- approved-preflight execution responses include tool-execution integrity
  verification;
- dedicated L8 vernacular module (`src/phase1/vernacular.mjs`) covering Hindi,
  Marathi, Bhojpuri, Tamil, and Bengali across script and romanized forms for
  every canonical action type, with disambiguation by language-marker score and
  localized status phrases attached as `localizedResponse` on every
  orchestration receipt (covered by the audit hash);
- §9A worker-protection policy set in the L4 engine: no-advance-fee
  (generalized to any action), escrow_required, minimum_wage_floor,
  age_verification (default-blocking when unattested), mediation
  worker-authorization, and fiat_settlement_only. Labor / mediation /
  age-attestation fields flow through the action request, the L6 skill
  preflight, and the L3 tool execution, with remediation hints on every new
  policy. `resolveActionRequest` is idempotent so decision hashes are stable
  across preflight and execution;
- §9B native service marketplace at L6 (`bos:skill:bharat-marketplace`,
  `bharat_marketplace` tool) as the substrate for cab / hotel / ticket / food
  / grocery / professional-services booking. Bharat OS owns the provider
  registry, matching, settlement, policy, and audit. The ONDC / Beckn bridge
  (`bos:skill:ondc-bridge`, `ondc_beckn` tool) is a Phase A density adapter
  invoked by the marketplace, not the substrate. Vernacular intent aliases
  for service booking across Hindi, Marathi, Bhojpuri, Tamil, Bengali in
  script and romanized forms, with localized response phrases on every
  orchestration receipt;
- Phase 2a profile passkey binding scaffold: WebAuthn register/verify
  challenge evidence, profile credential persistence, ledger events,
  `/api/profile-auth/*` routes, and `/shell/` controls for
  `navigator.credentials.create/get` in secure browser contexts;
- Phase 2a worker notification scaffold: push-subscription metadata,
  worker-notification receipts, `/api/push/subscriptions`,
  `/api/worker-notifications`, and `/shell/` Worker alerts controls backed by
  service-worker local notifications;
- Phase 2a Indic voice runtime scaffold: local ASR model-pack metadata,
  `/api/voice/runtime`, `/api/voice/model-packs`, and shell runtime planning
  that prefers installed Indic Whisper WASM packs before falling back to Web
  Speech or text input;
- Phase 2a Indic TTS runtime scaffold: TTS model-pack metadata,
  `/api/tts/runtime`, `/api/tts/model-packs`, and shell Listen controls for
  localized responses using browser speech synthesis until IndicTTS-WASM is
  wired;
- Phase 2a on-device SLM runtime scaffold: local model-pack metadata,
  `/api/on-device/runtime`, `/api/on-device/model-packs`, and shell
  orchestration metadata that records whether a WebGPU/WASM local model is
  ready before falling back to deterministic rules;
- API and CLI routes for policy/consent/decision/tool work;
- operator console policy panel.

## CLI

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 policy list --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill list `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill read `
  --id bos:skill:digilocker-docrefs `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill preflight `
  --id bos:skill:digilocker-docrefs `
  --actor-id bos:person:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill grant-consent `
  --preflight-id bos:skill-preflight:example `
  --sign-with-identity-id bos:person:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill retry-preflight `
  --preflight-id bos:skill-preflight:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill execute-preflight `
  --preflight-id bos:skill-preflight:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 skill trace `
  --preflight-id bos:skill-preflight:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 consent create `
  --subject-id bos:person:example `
  --grantee-id bharat-os-orchestrator `
  --scopes identity.verify,consent.record,regulated.workflow `
  --purpose "Regulated onboarding" `
  --sign-with-identity-id bos:person:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 consent list `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 consent revoke `
  --id bos:consent:example `
  --reason "subject_withdrawal" `
  --sign-with-identity-id bos:person:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 decision evaluate `
  --actor-id bos:person:example `
  --action-type regulated_onboarding `
  --scopes identity.verify,consent.record,regulated.workflow `
  --regulated `
  --pii-handling tokenized `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 tool execute `
  --actor-id bos:person:example `
  --action-type scheme_delivery `
  --tool digilocker `
  --scopes identity.verify,scheme.eligibility,consent.record `
  --regulated `
  --pii-handling tokenized `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 intent orchestrate `
  --actor-id bos:person:example `
  --intent "Which government scheme am I eligible for?" `
  --execute `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 integrity verify `
  --artifact consent `
  --id bos:consent:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 integrity verify `
  --artifact skill `
  --id bos:skill:digilocker-docrefs `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 integrity verify `
  --artifact skill-preflight `
  --id bos:skill-preflight:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 ledger list `
  --limit 20 `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 memory put `
  --identity-id bos:person:example `
  --label "Language preference" `
  --text "Prefers Marathi and Hindi" `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 memory read `
  --identity-id bos:person:example `
  --record-id bos:memory:example `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 memory search `
  --query Language `
  --tags profile `
  --store .bharat-os

powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 memory provenance `
  --record-id bos:memory:example `
  --store .bharat-os
```

## Mocked Tools

- `uidai_offline_ekyc`: returns an attestation token, not Aadhaar payload.
- `digilocker`: returns document references, not raw files.
- `account_aggregator`: returns derived financial signals, not transactions.
- `abha`: returns minimal health summaries and record references.
- `abha` for `health_document_upload`: returns mocked structured ABHA upload
  receipts from captured health-document observations without raw image/OCR
  payloads.
- `upi_escrow`: creates escrow receipts with declared monetary limits.
- `mesh.storage`: records mesh storage intent without payloads.
- `bharat_marketplace`: returns native service-booking receipts with booking
  refs, provider choice, UPI deep-link payment artifacts, and optional ONDC
  bridge evidence.
- `ondc_beckn`: returns Phase A ONDC / Beckn bridge booking receipts with the
  same UPI deep-link payment shape.

## Orchestration Templates

- `regulated_onboarding` -> Account Aggregator mock.
- `scheme_delivery` -> DigiLocker mock.
- `health_record_read` -> ABHA mock.
- `health_document_upload` -> ABHA structured upload mock.
- `labor_match_post` -> UPI escrow mock.
- `mesh_storage` -> mesh storage mock.
- `service_booking` -> Bharat OS native marketplace mock.

## Current Limits

- The policy registry is local code, not yet a policy DSL.
- Tools are mocked; they do not call production IndiaStack systems.
- Intent parsing is rule-based, not yet LLM-driven.
- Vernacular support is deterministic across five Indian languages (Hindi,
  Marathi, Bhojpuri, Tamil, Bengali) in script and romanized form for the
  canonical action types, with localized status phrases on every orchestration
  receipt. It is not yet integrated with Bhashini, IndicWhisper / IndicTTS,
  IndicTrans2, or a generative UI renderer — those are the next L8 steps.
- Consent lifecycle is local-store based; it is not yet backed by a distributed
  revocation log.
- Memory reads are local-owner decryptions guarded by consent; they are not yet
  distributed across devices or reconstructed from the mesh.
- Memory search is metadata-only: labels, tags, source descriptors, scopes,
  owner IDs, and manifest pointers are searchable; plaintext is not indexed.
- Console memory reveal is not a bypass; it calls the policy-gated read endpoint
  and returns plaintext only when an active consent covers the record scopes.
- Console memory grants use the same `POST /api/consents` path as other grants
  and sign with the selected memory owner's local identity key in this prototype.
- Console consent timeline revocation uses the same signed revocation endpoint as
  the CLI/API flow; it is a review surface, not a separate permission system.
- Identity profiles in the console are public records only: display name, public
  key, attestations, and creation time. Private keys and vault keys stay inside
  the local store.
- Identity creation generates private key and vault key material locally, stores
  it in the configured store, and returns only `publicIdentity` to API clients.
- Consent timeline verification calls `/api/integrity/verify`; it reports receipt
  validity and revocation validity without mutating the consent artifact.
- Audit filtering uses `/api/ledger` query parameters and does not create a
  separate event index.
- Audit export uses `/api/ledger.ndjson` with the same `type` and `limit`
  filters, returning one JSON event per line for evidence capture.
- Trust Passport v1 is a derived read model, not a new authority. It exposes
  public identity posture, attestation types, consent counts, memory metadata
  counts, and an evidence hash without private keys, vault keys, raw attestation
  payloads, or memory plaintext.
- Trust Passport signing is local-subject signing in this prototype. It signs the
  canonical passport payload and returns a verifiable snapshot without persisting
  a new passport authority.
- The skill registry is local and static. It describes mocked core skills and
  their tool bindings; it is not yet a third-party marketplace, installer, or
  runtime sandbox.
- Orchestration skill selection currently maps from the selected tool to the
  local static skill registry, then requires the selected L6 skill preflight to
  pass before L3 tool execution. It does not yet resolve third-party skills,
  versions, or remote trust roots.
- Skill manifest integrity verifies the local manifest ID and manifest hash. It
  is not yet a signed third-party package or marketplace trust chain.
- Skill preflight checks local manifest integrity and runs the existing policy
  engine, then persists a preflight receipt and its decision receipt. It does
  not reserve capacity or execute tools.
- Direct API/CLI tool execution now creates a preflight receipt before invoking
  the L3 adapter, but the lower-level `executeToolAction` primitive remains
  available for isolated unit tests and adapter work.
- Preflight remediation only suggests the missing consent or policy correction;
  it does not auto-grant consent or mutate artifacts. The separate grant command
  is an explicit action that creates a normal consent artifact from the stored
  remediation template.
- The operator-console grant action uses the same preflight consent endpoint; it
  does not create a separate UI-only permission path.
- Remediation grants return immediate integrity evidence, including signature
  verification when the grant is signed with a local identity key.
- Preflight retry reuses the stored original request and adds
  `retryOfPreflightId` metadata; it does not execute tools.
- Preflight execution requires an approved stored preflight and writes a normal
  tool execution receipt linked by `skillPreflightId`.
- Skill invocation traces are derived read models. They summarize metadata and
  receipt IDs; they do not expose raw tool payloads beyond existing receipts.
- Trace evidence hashes are stable over the linked receipt IDs and ledger event
  evidence, while `generatedAt` remains a runtime timestamp.
- Trust Passport skill invocation evidence is summary-only: counts, skill IDs,
  and timestamps, not raw tool payloads.
- Preflight execution returns integrity verification for the created tool
  execution receipt, so clients can show audit-hash status immediately.
- Aadhaar, PAN, DigiLocker, Account Aggregator, ABHA, and UPI remain mocked until
  real partnerships exist.
- Health document upload uses deterministic OCR-text normalization today. Real
  camera-image OCR via Tesseract.js / IndicOCR is still a Phase 2a hardening
  item; raw images and full OCR text are not persisted in the current artifact.
- Profile passkey binding stores credential metadata and challenge evidence
  only. Full FIDO2 attestation/assertion signature verification, challenge
  persistence, replay protection, and recovery policy are still Phase 2a
  hardening work.
- Worker notifications store endpoint hashes and key-presence metadata only.
  Real VAPID Web Push sending, encrypted endpoint storage, retry/unsubscribe
  handling, and production push-service integration remain Phase 2a hardening
  work.
- Indic voice runtime planning is wired, but no WASM ASR decoder or model pack
  is bundled in the repo. Model download/side-load, microphone streaming into
  the decoder, cache management, and Android latency tests remain hardening
  work.
- Indic TTS runtime planning is wired, but no WASM TTS decoder or model pack is
  bundled in the repo. Voice selection, decoder playback, Bhashini SDK
  evaluation, and Android latency tests remain hardening work.
- On-device SLM planning is wired, but no WebGPU/llama.cpp runtime or model
  weights are bundled in the repo. Model download/side-load UX, cache quota,
  inference-worker isolation, prompt contracts, and Android thermal/latency
  tests remain hardening work.
- §9A worker authorization is now a signed first-class artifact and the
  mediation policy verifies signature, worker ID, and expiry. Device-less
  assisted/kiosk channels are still out of scope (identity-layer work).
- Net Contribution Score is exposed through the API, CLI, Trust Passport, and
  operator console. It is not yet tied to pricing, credit settlement, abuse
  controls, or real node telemetry.
