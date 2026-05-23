# ADR 0019: Verify Consent Receipts From The Timeline

## Status

Accepted

## Context

The consent timeline shows lifecycle and signature counts, but operators also
need a direct way to verify whether a consent artifact and its revocation receipt
are internally valid.

Verification should not mutate consent state and should not create a parallel
receipt model.

## Decision

Add a Phase 1.13 `Verify` action on each consent timeline row. The action calls
`POST /api/integrity/verify` with `artifactType: "consent"` and displays
validity, signature validity, revocation validity, and reasons.

## Consequences

Receipt verification becomes part of the normal operator flow. The console still
uses the same integrity contract as CLI/API tests, so audit behavior does not
fork across surfaces.
