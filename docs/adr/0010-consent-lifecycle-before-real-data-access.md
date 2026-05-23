# ADR 0010: Add Consent Lifecycle Before Real Data Access

## Status

Accepted

## Context

Phase 1 can create consent artifacts and use them to approve regulated
decisions. That is not enough for a real OS boundary: users must be able to
withdraw consent, and expired grants must stop authorizing new actions.

## Decision

Add Phase 1.4 consent lifecycle controls. Consent IDs and grant signatures bind
the immutable grant terms. Revocation is represented as lifecycle state with a
tamper-evident revocation record, optionally signed by a local identity.

Policy checks now treat only active, unexpired consents as covering regulated
scopes. Revoked and expired consents remain inspectable for audit.

## Consequences

The consent layer now has the minimum lifecycle behavior needed before real
data access or production IndiaStack integrations. Future distributed storage
must preserve this contract and add a replicated revocation log rather than
treating consent as a one-time grant.
