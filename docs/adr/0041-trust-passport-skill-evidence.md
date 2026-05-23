# ADR 0041: Trust Passport Skill Evidence

## Status

Accepted

## Context

Trust Passport v1 already summarized public identity, consent, memory metadata,
integrity, and ledger evidence. Skill invocation receipts now form an important
part of the local trust story, but they were not visible in the passport.

## Decision

Add Phase 1.35 skill invocation evidence to Trust Passport v1. The passport now
summarizes:

- skill preflight count;
- approved and blocked preflight counts;
- tool execution count;
- completed execution count;
- involved skill IDs;
- latest preflight and execution timestamps.

## Consequences

- Public trust summaries can reflect skill usage without exposing raw payloads.
- The passport evidence hash now includes skill preflight and tool execution IDs.
- Skill evidence remains summary-only and does not replace detailed invocation
  traces.
