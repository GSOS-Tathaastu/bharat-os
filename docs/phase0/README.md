# Phase 0: Protocol + Identity + Mesh

This phase intentionally does **not** build the AI shell. It proves the primitives
the shell will need later:

1. identity records and local root keys;
2. signed protocol messages;
3. encrypted storage manifests where the control plane stores pointers, not
   payloads;
4. KYC-aware mesh node registration;
5. storage placement rules that honor the Bharat OS device constraints:
   WiFi-only, charging-only, battery threshold, KYC, and available capacity;
6. contribution accounting for the future fair-use model.
7. deterministic bootstrap simulation for the first 1,000-node demand test.

## Boundary

Phase 0 uses mocks/placeholders for Aadhaar, UPI, TEE attestation, and real
networking. The goal is to make the protocol testable before real partners or
regulated API access exist.

## Current Module

`src/BharatOS.Phase0/BharatOS.Phase0.psm1` is the original executable
specification. `src/phase0/` is the Node.js Phase 0.1 implementation used for the
CLI and persistent local store.

The PowerShell module should be treated as the baseline executable
specification. The Node implementation is the growth path for the production
control plane and developer tooling.

## Test Command

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

## CLI

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 init --store .bharat-os
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 identity create --name "Local Operator" --store .bharat-os
powershell -ExecutionPolicy Bypass -File scripts/bos.ps1 simulate bootstrap --nodes 1000 --objects 100 --report-out .tmp/bootstrap.md --store .bharat-os
```

The CLI uses the local portable Node.js runtime installed under `.tools/`.

## Later UI Path

The UI should sit on top of the CLI/control-plane boundary, not bypass it. The
first useful UI will be an operator console that reads the same store and shows:

- node eligibility and rejection reasons;
- committed storage and utilization;
- bootstrap report history;
- object/manifests without exposing payloads;
- later, consent and policy checks before Phase 1 workflows.
