# ADR 0033: Preflight Remediation Templates

## Status

Accepted

## Context

Skill preflight receipts can now block unsafe or unauthorized execution, but a
blocked receipt needs to be actionable for the future shell and operator UI.
The OS should say what is missing without auto-granting consent or revealing raw
data.

## Decision

Add Phase 1.27 remediation templates to `skill-preflight` receipts. A blocked
preflight includes failed policy IDs, remediation actions, and a
`consentGrant` template when an active consent artifact is missing.

The template includes only subject ID, grantee ID, required scopes, skill IDs,
manifest ID, and data exposure posture.

## Consequences

- The UI can guide the user toward the exact missing grant.
- Consent remains explicit; remediation does not mutate consent state.
- Future shell flows can render policy-specific recovery prompts from the
  receipt instead of hard-coding them.
