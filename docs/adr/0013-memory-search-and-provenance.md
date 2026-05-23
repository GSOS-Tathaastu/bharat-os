# ADR 0013: Search Memory Metadata Before Plaintext Access

## Status

Accepted

## Context

Phase 1.6 introduced encrypted identity memory records with provenance and
consent-gated reads. Operators still need a way to find relevant records and
inspect where they came from before requesting read access.

Indexing plaintext would weaken the memory boundary. It would create another
surface where personal context could leak outside the consent path.

## Decision

Add Phase 1.7 memory search over metadata only. Search considers record IDs,
owner IDs, labels, source descriptors, tags, scopes, sensitivity, and content
types. It does not index or return plaintext.

Expose provenance through CLI and API commands that return source metadata,
tags, scopes, manifest pointer, byte count, and creation time. Plaintext remains
available only through the existing `memory_read` decision flow after active
consent covers the record scopes.

## Consequences

Operators can discover and audit memory records without bypassing user consent.
The search experience is useful enough for the console now, while leaving room
for a future private or device-local semantic index that preserves the same
plaintext boundary.
