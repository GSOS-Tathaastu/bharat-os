# Phase 0.3 API

The Phase 0.3 API is the local service boundary for future UI work. It exposes
the executable OS-service layer without letting the UI read private keys or raw
payloads directly.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File scripts/api.ps1 --store .bharat-os --host 127.0.0.1 --port 8787
```

Open:

```text
http://127.0.0.1:8787/health
http://127.0.0.1:8787/api
http://127.0.0.1:8787/shell/
http://127.0.0.1:8787/console/
```

## Routes

- `GET /health`
- `GET /api`
- `GET /shell/`
- `GET /console/`
- `GET /api/dashboard`
- `GET /api/policies`
- `GET /api/skills`
- `GET /api/skills/:skillId`
- `POST /api/skills/:skillId/preflight`
- `GET /api/skill-preflights`
- `GET /api/skill-preflights/:preflightId`
- `POST /api/skill-preflights/:preflightId/consent`
- `POST /api/skill-preflights/:preflightId/retry`
- `POST /api/skill-preflights/:preflightId/execute`
- `GET /api/skill-preflights/:preflightId/trace`
- `GET /api/tools`
- `GET /api/tool-executions`
- `POST /api/tools/execute`
- `GET /api/orchestration-templates`
- `GET /api/orchestrations`
- `POST /api/orchestrations`
- `GET /api/consents`
- `POST /api/consents`
- `GET /api/consents/:consentId`
- `POST /api/consents/:consentId/revoke`
- `GET /api/decisions`
- `POST /api/decisions/evaluate`
- `GET /api/memory-search`
- `GET /api/memory-records`
- `POST /api/memory-records`
- `GET /api/memory-records/:recordId`
- `GET /api/memory-records/:recordId/provenance`
- `POST /api/memory-records/:recordId/read`
- `GET /api/health-documents`
- `POST /api/health-documents`
- `GET /api/health-documents/:captureId`
- `POST /api/profile-auth/challenges`
- `GET /api/profile-auth/credentials`
- `POST /api/profile-auth/credentials`
- `POST /api/profile-auth/assertions`
- `GET /api/push/subscriptions`
- `POST /api/push/subscriptions`
- `GET /api/worker-notifications`
- `POST /api/worker-notifications`
- `GET /api/voice/runtime`
- `GET /api/voice/model-packs`
- `POST /api/voice/model-packs`
- `GET /api/tts/runtime`
- `GET /api/tts/model-packs`
- `POST /api/tts/model-packs`
- `GET /api/on-device/runtime`
- `GET /api/on-device/model-packs`
- `POST /api/on-device/model-packs`
- `POST /api/integrity/verify`
- `GET /api/ledger`
- `GET /api/ledger.ndjson`
- `GET /api/trust-passports`
- `GET /api/trust-passports/:identityId`
- `POST /api/trust-passports/:identityId/sign`
- `GET /api/identities`
- `POST /api/identities`
- `GET /api/nodes`
- `GET /api/manifests`
- `GET /api/reports`
- `GET /api/reports/:reportId`
- `GET /api/reports/:reportId.md`
- `GET /api/control-planes/:controlPlaneId`
- `POST /api/simulations/bootstrap`

## Bootstrap Simulation

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/simulations/bootstrap `
  -ContentType 'application/json' `
  -Body '{"nodeCount":1000,"objectCount":100,"replicationFactor":3}'
```

The API persists the owner identity, `bootstrap` control plane, and simulation
report in the configured store.

## UI Contract

The first UI should call this API. It should not read `.bharat-os/` files
directly, and it should never render private key material or chunk payloads.

`public/operator-console/` is UI 0. It is served by the API and consumes
`/api/dashboard`, `/api/simulations/bootstrap`, `/api/decisions/evaluate`,
`/api/skills`, `/api/skill-preflights`, and `/api/tools/execute`,
`/api/orchestrations`, `/api/consents`, `/api/consents/:consentId/revoke`,
`/api/memory-search`,
`/api/memory-records/:recordId/read`, `/api/identities`, and
`/api/integrity/verify`, `/api/trust-passports`, plus `/api/ledger.ndjson` for
audit export.

`POST /api/orchestrations` accepts `intentText`, `locale`, and `channel`.
Phase 1.17 adds deterministic Hindi/Hinglish normalization evidence to the
orchestration receipt through `intent.detectedLocale`, `intent.normalizedText`,
and `intent.matchedAliases`. Phase 1.20 also returns the selected L6
`actionRequest.skillId` and `actionRequest.skillManifestId` before tool
execution. Phase 1.25 adds `skillPreflightId` and the embedded
`skillPreflight` receipt; orchestration does not execute the selected L3 tool
unless the L6 preflight approves.

## Identity Profiles

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/identities `
  -ContentType 'application/json' `
  -Body '{"displayName":"Local Bharat OS User"}'
```

`POST /api/identities` creates a local identity and persists its private key and
vault key in the configured store. The API response returns only the public
identity record; private key and vault key material are not exposed.

## Skill Registry

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/skills

Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/skills/bos%3Askill%3Adigilocker-docrefs

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/skills/bos%3Askill%3Adigilocker-docrefs/preflight `
  -ContentType 'application/json' `
  -Body '{"actorId":"bos:person:example"}'

Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/skill-preflights

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/skill-preflights/bos%3Askill-preflight%3Aexample/consent `
  -ContentType 'application/json' `
  -Body '{"signWithIdentityId":"bos:person:example"}'

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/skill-preflights/bos%3Askill-preflight%3Aexample/retry `
  -ContentType 'application/json' `
  -Body '{}'

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/skill-preflights/bos%3Askill-preflight%3Aexample/execute `
  -ContentType 'application/json' `
  -Body '{}'

Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/skill-preflights/bos%3Askill-preflight%3Aexample/trace
```

`GET /api/skills` exposes local L6 skill manifests for the mocked core tools.
Each manifest includes version, manifest hash, developer KYC posture, required
scopes, tool binding, sandbox posture, and the no-raw-PII data exposure rule.
This is a registry contract, not a third-party marketplace yet.

`POST /api/skills/:skillId/preflight` verifies the manifest and evaluates the
requested invocation through the policy engine. It persists a
`skill-preflight` receipt and a decision receipt, but it does not execute the
skill or write a tool execution receipt. Blocked preflights include
`remediation.actions` and, when consent is missing, a `remediation.consentGrant`
template that the UI can use to request a grant.

`POST /api/tools/execute` also runs the selected tool through its L6 skill
preflight before invoking the mocked adapter. The response includes both
`preflight` and `execution`, and the tool execution receipt carries
`skillPreflightId`.

`POST /api/skill-preflights/:preflightId/consent` reads a stored blocked
preflight remediation template and creates a normal consent artifact from it.
Signing is optional and uses the same local identity key path as
`POST /api/consents`. The response includes the new consent lifecycle and
integrity verification result so clients can show whether the grant is active
and signature-valid immediately after creation.

`POST /api/skill-preflights/:preflightId/retry` re-evaluates the stored request
from a previous preflight against the current consent set and persists a new
preflight receipt. The retried request records `retryOfPreflightId` metadata and
does not execute tools.

`POST /api/skill-preflights/:preflightId/execute` invokes the tool request from
an approved stored preflight and writes a normal tool execution receipt linked
by `skillPreflightId`. The response includes integrity verification for the
created tool execution receipt.

`GET /api/skill-preflights/:preflightId/trace` returns a derived trace read
model linking related preflights, retry receipts, consent grants, decisions,
tool executions, and ledger events. The trace includes a stable `evidenceHash`
and metadata-only privacy flags.

## Identity Memory

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/memory-records `
  -ContentType 'application/json' `
  -Body '{"identityId":"bos:person:example","label":"Language","text":"Prefers Marathi"}'
```

Memory metadata is listable through `GET /api/memory-records`. Plaintext is
encrypted under the owner's vault key and only returned by
`POST /api/memory-records/:recordId/read` after the policy engine finds active
consent for `memory.read` and `consent.record`.

## Memory Search And Provenance

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8787/api/memory-search?query=Language&tags=profile"

Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/memory-records/bos%3Amemory%3Aexample/provenance
```

`GET /api/memory-search` searches record metadata only: label, owner, source,
tags, scopes, sensitivity, content type, and pointer IDs. It does not index or
return plaintext. `GET /api/memory-records/:recordId/provenance` returns the
record provenance envelope, including source metadata and manifest pointer, so
operators can inspect where a memory came from before requesting consent-gated
read access.

## Audit Ledger

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/ledger?limit=20

Invoke-WebRequest `
  -Uri "http://127.0.0.1:8787/api/ledger.ndjson?type=consent.saved&limit=20" `
  -OutFile .tmp/consent-ledger.ndjson
```

The ledger endpoint reads the append-only `ledger.jsonl` event stream. Add
`type=consent.saved` or another event type to filter. `GET /api/ledger.ndjson`
uses the same `type` and `limit` filters and returns one JSON ledger event per
line for evidence export.

## Trust Passports

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/trust-passports

Invoke-RestMethod `
  -Uri http://127.0.0.1:8787/api/trust-passports/bos%3Aperson%3Aexample

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/trust-passports/bos%3Aperson%3Aexample/sign `
  -ContentType 'application/json' `
  -Body '{"role":"subject"}'
```

Trust Passport v1 is a public read model derived from existing store evidence:
identity metadata, attestation types, consent lifecycle and integrity, memory
metadata counts, skill invocation counts, and ledger event types. It does not
expose private keys, vault keys, raw attestation payloads, tool payloads, or
memory plaintext.

`POST /api/trust-passports/:identityId/sign` creates a portable signed snapshot
of the current passport. In this prototype the snapshot must be signed by the
subject's local identity key and returns integrity flags for ID, payload-hash, and
signature verification.

## Consent Lifecycle

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/consents/bos%3Aconsent%3Aexample/revoke `
  -ContentType 'application/json' `
  -Body '{"reason":"subject_withdrawal","signWithIdentityId":"bos:person:example"}'
```

Revoked and expired consents remain visible in `GET /api/consents`, but policy
evaluation treats only active, unexpired consents as covering regulated scopes.

## Integrity Verification

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/integrity/verify `
  -ContentType 'application/json' `
  -Body '{"artifactType":"decision","id":"bos:decision:example"}'
```

Supported artifact types are `consent`, `decision`, `tool-execution`,
`orchestration`, `skill-preflight`, and `skill`. The API can also verify an
inline `artifact` object in the request body.
