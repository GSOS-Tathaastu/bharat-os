# ADR 0016: Add Consent Timeline Before More Shell Features

## Status

Accepted

## Context

The operator console can create consent grants from memory rows and revoke the
latest active consent, but that is not enough to audit the consent surface. The
next UI layer needs to show active, revoked, expired, signed, and unsigned grants
as first-class artifacts.

## Decision

Add a Phase 1.10 consent timeline to the console. It reads `GET /api/consents`,
renders lifecycle status, subject, grantee, scopes, purpose, signature count,
expiry, and a row-level revoke action for active grants.

Row revocation calls the existing
`POST /api/consents/:consentId/revoke` endpoint and signs with the subject
identity in this local prototype.

## Consequences

Consent review becomes an explicit console workflow instead of a hidden
dashboard count. Future identity and user-facing consent screens can build on
the same API contract without inventing a second permission model.
