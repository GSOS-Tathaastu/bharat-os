# ADR 0015: Console Memory Grants Use Consent Artifacts

## Status

Accepted

## Context

The console can now search memory provenance and attempt a consent-gated read.
Without a grant action, the happy path requires leaving the console to create a
matching `memory.read` consent from the CLI or raw API.

The grant control must not create a private shortcut around policy. It should
produce the same signed consent artifact as every other regulated permission.

## Decision

Add a Phase 1.9 console grant action on each memory row. The action calls
`POST /api/consents` with the record owner as subject, `bharat-os-orchestrator`
as grantee, and the record scopes as the grant scopes. In this local prototype,
the grant is signed with the selected owner's local identity key.

The separate read action remains unchanged and still calls
`POST /api/memory-records/:recordId/read`.

## Consequences

The console can demonstrate the full memory flow: discover metadata, create a
signed consent grant, and reveal plaintext only after policy approval. The model
still keeps grant creation, policy evaluation, and decryption as separate
auditable steps.
