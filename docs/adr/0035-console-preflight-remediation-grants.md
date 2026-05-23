# ADR 0035: Console Preflight Remediation Grants

## Status

Accepted

## Context

Phase 1.28 added API/CLI consent creation from stored preflight remediation.
The operator console could display remediation details, but it could not yet
trigger the grant flow directly.

## Decision

Add Phase 1.29 operator-console support for the latest blocked preflight
remediation grant. The console keeps the latest preflight response in local UI
state and calls `POST /api/skill-preflights/:preflightId/consent` when the
operator chooses `Grant Consent`.

## Consequences

- The console can recover from missing-consent preflight blocks without manual
  scope copying.
- The UI still uses the canonical API and consent artifact path.
- This remains an operator-console affordance, not an automatic user consent
  grant.
