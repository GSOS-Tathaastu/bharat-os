# ADR 0112: Phase 9.0a — Tier-4 SLM Model-Pack Registry (Admin-Curated Metadata)

## Status

**Accepted — shipped.** First sub-phase of the Phase 9.0 arc
(ADR 0107 Proposed). Ships the admin-curated registry, public
read endpoints, and compatibility filter. Defers the actual
download flow + runtime adapter wrapping llama.cpp-wasm / MLC-LLM
/ ONNX Runtime Web to later Phase 9.0 sub-phases (9.0b shell
download flow, 9.0c runtime adapter).

## Context

ADR 0107 sketched the Phase 9.0 substrate end-to-end but flagged
the runtime-adapter component as the gnarly part — first time
Bharat OS introduces third-party runtime dependencies that break
the "zero npm dependencies" pattern. The right sequencing is to
ship the easy pieces (registry + public read API + compatibility
filter) first so:

1. The investor demo can show *"a curated set of 1.5–4 GB SLMs
   the worker could install"* immediately, with empty download
   slots, before we have a runtime to actually load them.
2. The shell's Phase 9.0b capability-detection + download flow
   has a stable API to consume from day 1.
3. Admin ops can populate the registry from a jumphost without
   waiting for any of the runtime work.

Phase 9.0a is the smallest defensible slice — registry CRUD +
ledger evidence — and is wholly disjoint from the runtime work.

## Decision

### `src/phase1/slm-model-pack.mjs` (new module)

Pure validation + helpers — no I/O. Exports:

- `createSlmModelPack(input)` — validates and normalises a pack
  record. Throws on invalid metadata. Derives `modelPackId` from
  the canonical hash when caller doesn't provide one.
- `filterCompatibleSlmModelPacks(packs, deviceProfile)` —
  excludes revoked packs + packs exceeding device RAM + packs
  without 1.2× free disk headroom (so a half-finished download
  fits + leaves scratch for the SHA-256 verify pass) + packs
  whose runtime isn't in the device's `supportedRuntimes`.
- `revokeSlmModelPack(pack, { revokedBy, reason })` — flips
  status to `revoked` without hard-deleting (so the audit trail
  of "who installed this when" still resolves). Idempotent.

Constants exported for the API + shell:

| Constant | Values |
|---|---|
| `SLM_RUNTIMES` | `llama_cpp_wasm`, `mlc_llm_webgpu`, `onnx_runtime_web`, `native_aosp` |
| `SLM_QUANTIZATIONS` | `q4_k_m`, `q5_k_m`, `q8_0`, `fp16`, `int4`, `int8` |
| `SLM_LICENSES` | `mit`, `apache-2.0`, `bsd-3-clause`, `meta-llama-3`, `gemma-terms`, `phi-license`, `other` |
| `SLM_CAPABILITIES` | `inference`, `lora_finetune`, `classifier_head`, `embedding` |

Pack record shape:

```js
{
  modelPackId: 'bos:slm-model-pack:<32-hex>',  // or caller-supplied
  protocolVersion: 'bos.phase9.slm-model-pack.v0',
  objectType: 'slm-model-pack',
  tier: 4,
  family: 'phi-3-mini',
  variant: '4k-instruct' | null,
  parameterCount: 3_800_000_000,
  quantization: 'q4_k_m',
  diskBytes: 2_300_000_000,
  ramRequiredMb: 2800,
  runtime: 'llama_cpp_wasm',
  sourceUrl: 'https://…',           // HTTPS-only — http: is rejected
  sourceHash: 'sha256:<64-hex>',    // mandatory for integrity verify
  license: 'mit',
  capabilities: ['inference'],
  contextWindow: 4096 | null,
  description: '...' | null,
  registeredAt: '<iso>',
  registeredBy: 'sre-on-call',
  status: 'registered' | 'revoked',
  revokedAt?: '<iso>',
  revokedBy?: 'sre-on-call',
  revocationReason?: '...'
}
```

Validation guards:

- `diskBytes` capped at 8 GB (Tier-4 envelope per ADR 0107).
- `ramRequiredMb` capped at 16 GB (no realistic phone hardware
  target above this; saves us from typos like `32768` MB).
- `sourceUrl` MUST be HTTPS (a compromised plain-HTTP mirror
  could ship a backdoored SLM even before the SHA-256 verify).
- `sourceHash` MUST be in `sha256:<64-hex>` form.
- Capabilities/runtime/quantization/license restricted to the
  enumerated constants — caller cannot pass arbitrary strings.

### Storage

Both backends grow a `slm_model_packs` table / directory.

- **SqliteStore**: new `slm_model_packs` table
  (`slm_model_pack_id PRIMARY KEY`, `json TEXT`); `saveSlmModelPack`
  upserts + emits ledger event; `readSlmModelPack` / `listSlmModelPacks`.
- **BosStore (file)**: new `slm-model-packs/` directory; same
  CRUD shape; `saveSlmModelPack` appends a `slm_model_pack.*`
  ledger event for parity.

Ledger events emitted from `saveSlmModelPack`:

- `slm_model_pack.registered` — on initial save (status:
  registered).
- `slm_model_pack.revoked` — on revoke save (status: revoked).

Each event carries `modelPackId`, `family`, `variant`, `runtime`,
`quantization`, `diskBytes`, `operator` (registeredBy /
revokedBy), `at` — same fields the SqliteStore ledger queries
already filter on.

**DPDP §12(3) cascade NOT updated.** The registry is admin-
curated, not per-identity. Per-identity install records
(`installed_on_device_slms`) come in Phase 9.0b and WILL go in
the cascade.

### API routes

Public (no auth):
- `GET /api/slm-model-packs` — list all packs.
  - `?activeOnly=true` — exclude revoked.
  - `?compatible=true&deviceRamMb=…&freeDiskBytes=…&supportedRuntimes=csv`
    — filter to packs the device can actually run.
  - Response carries `totalRegistered`, `totalActive`, and the
    four enum constants so the shell doesn't need a separate
    capabilities endpoint.
- `GET /api/slm-model-packs/:modelPackId` — single pack lookup
  or 404.

Admin (Phase 5.7 `BHARAT_OS_ADMIN_TOKEN` bearer):
- `POST /api/admin/slm-model-packs` — register a new pack.
  - 201 with `{ ok, modelPack }` on success.
  - 400 `invalid_slm_model_pack` on metadata failure (error
    message names the field).
  - 409 `duplicate_pack` if a non-revoked pack already has the
    same `modelPackId` (revoke-then-re-register if the operator
    actually wants to replace).
  - 503 `admin_disabled` when token unset (Phase 5.7 default).
- `DELETE /api/admin/slm-model-packs/:modelPackId` — revoke
  (soft-delete). Body `{ reason?: string }`.
  - 200 with `{ ok, modelPack }` on success — the returned pack
    has `status: 'revoked'` + `revocationReason`.
  - 404 `unknown_pack` if the pack doesn't exist.

Both admin routes log `admin_slm_pack_registered` /
`admin_slm_pack_revoked` at INFO and rely on the store's
ledger-event emit for the audit trail. The route catalog at
`GET /api` includes all four new endpoints.

## §15 bindings

| Binding | Resolution |
|---|---|
| No anonymous packs | Admin curation through `BHARAT_OS_ADMIN_TOKEN`; both create and revoke emit signed ledger events with operator attribution. |
| Integrity-checked downloads (forward) | `sourceHash` is mandatory + must be `sha256:<64-hex>`. Phase 9.0b download flow will SHA-256-verify and abort on mismatch. A compromised mirror can't ship a backdoored SLM even if it owns the HTTPS endpoint. |
| HTTPS-only source URL | `assertHttpsUrl` rejects `http:` so plain-HTTP transport-level tampering can't get a model onto the device before integrity verify runs. |
| Soft-delete instead of hard-delete | `revokeSlmModelPack` flips `status` rather than removing the row. The audit trail of "this worker installed phi-3-mini-q4 on 2026-05-25" still resolves to a known pack the registry has seen, even after revocation. |
| Tier-4 envelope cap | `diskBytes ≤ 8 GB` + `ramRequiredMb ≤ 16 GB` guards prevent the admin from accidentally registering a pack that no phone could ever run — a typo here would otherwise let the shell offer "install this 80 GB model". |
| Revoked packs filtered from compat list | `filterCompatibleSlmModelPacks` excludes `status: 'revoked'`. Shell downloaders never offer revoked packs to new installs; previously installed copies on devices keep working until the next Phase 9.0c runtime check kicks them out (future work). |
| Admin write audited end-to-end | Every POST/DELETE emits both an HTTP log line (operator + family + runtime) AND a ledger event (`slm_model_pack.registered` / `slm_model_pack.revoked`). |

## Tests

`tests/node/slm-model-pack.test.mjs` — 30 tests covering:

- Constants advertised match the spec.
- `createSlmModelPack` happy path + every validation guard
  (unsupported runtime / quantization / license, http URL,
  malformed sha256, diskBytes overflow, RAM overflow, empty
  capabilities). 12 tests.
- `revokeSlmModelPack` flips status without removing metadata +
  idempotency. 2 tests.
- `filterCompatibleSlmModelPacks` excludes revoked / RAM-over /
  disk-headroom-under / unsupported-runtime. 4 tests.
- `BosStore` + `SqliteStore` persist packs + emit ledger
  evidence + survive reload. 3 tests.
- HTTP wiring: GET empty + register-then-list + admin-auth
  (unset / wrong token) + invalid metadata (400) + duplicate
  (409) + revoke (DELETE) + 404 / compat filter / single
  lookup. 9 tests.

Full suite: **777/777 Node tests pass** (was 747; +30 new SLM
tests). Run in batches of 16 files to dodge Windows process-
spawn OOM hitting parallel `--test` runners.

## Consequences

- **Phase 9.0 arc has started.** Shell-side and runtime work
  (9.0b, 9.0c) now have a stable, tested API to build against.
  An investor demo today can call `GET /api/slm-model-packs` and
  show a curated catalogue — empty install slot only, but the
  pipeline is real.
- **Admin ops surface grows.** Total admin endpoints now: 8
  (SMS circuit reset, recovery-cooldown clear, backup snapshot,
  mesh withdrawal accepted/paid/failed, blessed-collectives
  add/remove, slm-model-packs register/revoke). The launch
  runbook needs entries for the SLM CRUD; deferred to the Phase
  9.0c ship when there's a download flow to validate against.
- **Ledger growth.** Modest — registry changes happen weeks or
  months apart, not per request. Phase 9.0b will add per-install
  `slm_install.started` / `.succeeded` / `.failed` events that
  are higher-volume but still bounded by worker count × packs.
- **No third-party runtime dependency yet.** We have NOT
  introduced llama.cpp-wasm or MLC-LLM. The "zero npm dep"
  posture is preserved through Phase 9.0a. The hard call comes
  in Phase 9.0c.
- **§15-compliant from day 1.** HTTPS-only source URL, mandatory
  SHA-256 integrity hash, admin-curated registry, soft-delete
  audit trail, Tier-4 envelope caps — all the
  Phase-9.0-as-implemented guards are in place even before any
  actual downloads happen.

## Sub-phase breakdown for the rest of Phase 9.0

Per ADR 0107 sequencing, with this sub-phase complete:

- **9.0a** (this ADR) — registry + admin curation + public read
  + ledger evidence + compatibility filter. ~1 day of work.
- **9.0b** — shell download flow on Profile tab: capability
  detection (RAM / disk / WebGPU / WASM-threads support),
  per-pack install card, stream-download with progress, SHA-256
  verify, IndexedDB / OPFS persist, `installed_on_device_slms`
  per-identity table with DPDP cascade. ~1-2 weeks; no runtime
  yet, just storage.
- **9.0c** — runtime adapter layer (`src/phase1/slm-runtime.mjs`)
  wrapping llama.cpp-wasm / MLC-LLM / ONNX Runtime Web. ~3-4
  weeks. **First introduction of third-party runtime
  dependencies; needs its own ADR for the choice + the
  distroless-deploy trade-off.**
- **9.0d** — integration with Phase 3.x federated rounds (SLM
  as the model in `composeFederatedUpdate`) + Phase 6.0b mesh-
  inference workload events finally recording real ticks. ~1
  week.

Total Phase 9.0: ~6-8 weeks per ADR 0107's estimate. Phase 9.0a
is ~5% of that, but unblocks the rest.

## Future polish

- **Pack signing** — each pack signed by Bharat OS's release
  key in addition to SHA-256. Devices reject unsigned packs even
  if hash matches. (Phase 9.0c+ — needs a key-rotation story.)
- **Pack versioning** — multiple variants of the same family
  (Phi-3-mini at q4, q5, q8 quantization) coexisting with shared
  family metadata. Today each is a fully-independent pack.
- **Delta-updates** — when a base model gets a security fix,
  ship only the diff (LoRA-style adapter) instead of re-
  downloading 2.3 GB. Needs registry-side support for parent-
  pack pointers.
- **Admin shell UI** — today admin CRUD is curl-only. A
  jumphost-friendly CLI (`bos slm register --family phi-3-mini
  --hash sha256:…`) would reduce typo risk on the JSON body.
- **Listing-endpoint pagination** — when the registry grows past
  ~100 packs the JSON envelope gets heavy. Today everything fits
  in one response; revisit before public launch.
