# ADR 0047: Worker Authorization as a Signed First-Class Artifact

## Status

Accepted

## Context

Phase 1.38 (ADR 0044) added `policy.mediation.requires_worker_authorization`
to enforce §9A design problem A: in a kiosk / assisted channel, the
operator can help but cannot *act as* the worker. The implementation
checked for the presence of an opaque string ID
(`mediation.workerAuthorizationId`). A malicious operator could populate
any arbitrary ID and the policy would pass — the safeguard was
ceremonial, not cryptographic. §17 flagged this as the worker-auth tie-off
to close before Phase 2.

## Decision

Phase 1.41 makes worker authorization a signed first-class artifact:

1. **New module `src/phase1/worker-authorization.mjs`** with
   `createWorkerAuthorization`, `signWorkerAuthorization`,
   `verifyWorkerAuthorization`, and `canonicalWorkerAuthorizationPayload`.
   The canonical payload binds `workerId`, `operatorId`, `jobReference`,
   `scopes`, `purpose`, `issuedAt`, `expiresAt`. The authorization ID is
   the prefixed hash of the canonical payload.

2. **Worker-only signing.** `signWorkerAuthorization` throws if the
   signer's identity does not match `workerId`. The operator cannot
   forge the worker's signature because they do not hold the worker's
   private key.

3. **Persistence in the store.** New `worker-authorizations/` directory
   with `saveWorkerAuthorization`, `readWorkerAuthorization`,
   `listWorkerAuthorizations`; ledger event
   `worker_authorization.saved`.

4. **L4 policy upgrade.** The mediation policy now requires the full
   `mediation.workerAuthorization` object (the receipt, not just an ID).
   It verifies: (a) the authorization ID matches the canonical payload
   hash, (b) the receipt has not expired, (c) the worker's signature is
   present and verifies against the worker's public record, (d) the
   worker named in the receipt matches the actor in the request. Any
   failure blocks the action with explicit reasons surfaced in the
   decision check.

5. **`publicRecords` threaded through.** `evaluateDecision` now accepts
   `publicRecords` in its options. `evaluateSkillPreflight`,
   `executeToolAction`, and `orchestrateIntent` propagate it.
   `intent orchestrate`, `decision evaluate`, `skill preflight`, and
   `tool execute` (CLI) load identities and pass their public records;
   the API does the same at the orchestration, preflight, tools/execute,
   and decisions/evaluate endpoints.

6. **API and CLI surfaces.** `POST /api/worker-authorizations` (create +
   optionally sign), `GET /api/worker-authorizations`,
   `GET /api/worker-authorizations/:id`,
   `POST /api/worker-authorizations/:id/verify`.
   `bos worker-auth create`, `bos worker-auth list`, `bos worker-auth verify`.

## Consequences

- A kiosk operator can no longer fabricate authorization. They must
  actually obtain the worker's signature over the canonical payload —
  which in practice means the worker authenticates on the device during
  the session (Phase 2 will tighten this further with per-profile auth).
- Tamper detection is automatic: any change to the payload after signing
  changes the canonical hash, the authorization ID stops matching, and
  the verification fails.
- The §9A safeguard escalates from "presence check" to "signature
  check." The bad-actor model is now cryptographic, not procedural.
- `publicRecords` is now a first-class option for policy evaluation;
  this also opens the seam for future receipt types (e.g., counterparty
  signatures on labor contracts) to use the same verification primitive.
- Backward compat: the deprecated `mediation.workerAuthorizationId`
  (opaque ID) is no longer sufficient; callers MUST upgrade to passing
  the full signed receipt. The existing Phase 1.38 test was updated to
  use a real signed receipt.
