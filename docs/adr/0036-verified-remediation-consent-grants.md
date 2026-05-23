# ADR 0036: Verified Remediation Consent Grants

## Status

Accepted

## Context

Phase 1.28 and Phase 1.29 let API, CLI, and console create explicit consent
artifacts from stored preflight remediation templates. The grant response still
needed immediate evidence that the consent was active and, when signed, that the
signature verified.

## Decision

Add Phase 1.30 verified remediation grant responses. The stored-preflight
consent endpoint and CLI command now return:

- the created consent artifact;
- lifecycle status from the consent engine;
- integrity verification from the receipt verifier.

## Consequences

- Clients can show whether the remediation grant is active immediately.
- Signed grants expose signature verification evidence without a separate
  follow-up call.
- The grant still follows the normal consent artifact path and does not create a
  UI-only permission model.
