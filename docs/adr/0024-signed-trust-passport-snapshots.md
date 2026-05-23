# ADR 0024: Sign Trust Passport Snapshots Locally

## Status

Accepted

## Context

Trust Passport v1 is intentionally derived from current evidence rather than
stored as a mutable authority. Operators still need a portable artifact that can
be handed to another workflow and verified later.

## Decision

Add Phase 1.18 signed Trust Passport snapshots. The API route
`POST /api/trust-passports/:identityId/sign` recomputes the current passport,
signs the canonical passport payload with the subject's local identity key, and
returns the snapshot plus integrity flags.

The operator console adds a Sign action in the Trust Passport table. The action
downloads the signed snapshot as JSON and shows signature verification status in
the receipt output.

## Consequences

Trust posture can now become a portable evidence artifact without introducing a
new persisted trust authority. This remains prototype-local: future partner-grade
Trust Passports can add issuer roles, expiry rules, and revocation distribution.
