# ADR 0021: Export Filtered Ledger Events As NDJSON

## Status

Accepted

## Context

Phase 1.14 made ledger filtering visible in the operator console, but audit
review still required copying table rows or querying the local store directly.
Evidence capture needs a stable API artifact that can be archived, diffed, or
processed line by line.

## Decision

Add `GET /api/ledger.ndjson` for Phase 1.15. It accepts the same `type` and
`limit` query parameters as `GET /api/ledger` and returns one JSON ledger event
per line with the `application/x-ndjson` content type.

The operator console adds an export action that calls the NDJSON route using the
current ledger filters and downloads the result as a timestamped `.ndjson`
file.

## Consequences

The JSON dashboard route remains optimized for rendering, while the NDJSON route
is optimized for evidence capture. Both routes share the same filter parsing and
store query, so audit review does not fork into separate semantics.
