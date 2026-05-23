# ADR 0034: Preflight Remediation Consent Grants

## Status

Accepted

## Context

Phase 1.27 made blocked preflights actionable by adding remediation templates.
Operators still had to manually copy the subject, grantee, and scopes into a
separate consent call.

## Decision

Add Phase 1.28 explicit consent creation from stored preflight remediation. The
API route `POST /api/skill-preflights/:preflightId/consent` and CLI command
`skill grant-consent --preflight-id ...` read the stored `consentGrant` template
and create a normal consent artifact.

Signing remains explicit through `signWithIdentityId` / `--sign-with-identity-id`.

## Consequences

- Missing-consent recovery is less error-prone.
- Consent state still changes only through an explicit API/CLI action.
- The resulting grant is the same consent artifact used by all other policy
  checks.
