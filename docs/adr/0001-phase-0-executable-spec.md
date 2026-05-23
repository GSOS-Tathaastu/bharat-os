# ADR 0001: Phase 0 Starts as a Dependency-Free Executable Spec

## Status

Accepted

## Context

`BHARAT_OS.md` defines Phase 0 as protocol + identity, no OS yet. The repository
started with only the canonical markdown document, and the local workspace has
Windows PowerShell but no Node, Python, Go, Rust, Java, or .NET SDK on PATH.

## Decision

Start with a PowerShell module that acts as an executable specification for the
Phase 0 primitives:

- identities and public records;
- signed protocol messages;
- encrypted chunk manifests;
- mesh node eligibility;
- storage placement;
- net contribution scoring.

This keeps the first implementation runnable immediately without installing
dependencies or relying on network access.

## Consequences

The implementation is not the final production runtime. It is a verified protocol
model that can later be ported into the real Android client, control plane, and
mesh daemon. Tests define the behaviors that future ports must preserve.

