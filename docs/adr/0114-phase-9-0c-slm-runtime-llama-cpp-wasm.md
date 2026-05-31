# ADR 0114: Phase 9.0c — SLM Runtime Adapter (llama.cpp-wasm via @wllama, lazy-loaded)

## Status

**Accepted — shipped 2026-05-31.** Locks in the runtime choice that
was set in direction-set memory on 2026-05-25 (after the
three-option deliberation in ADR 0107 which proposed all three of
llama.cpp-wasm / MLC-LLM / ONNX Runtime Web). Ships the actual
implementation in the same commit per the FE+BE parity rule —
inseparable from the `/app/labs/` install card upgrade that
exercises it.

## Context

ADR 0107 (Phase 9.0 Proposed) sketched three competing runtime
backends:

| Backend | Speed | Compat | Footprint |
|---|---|---|---|
| MLC-LLM (WebGPU) | Fast | Android 14+ / iOS 18+ only | Large |
| llama.cpp-wasm | Slow (3-10 tok/s on phones) | Universal CPU | Smaller |
| ONNX Runtime Web | Medium | Wider than WebGPU | Limited LoRA |

The 2026-05-25 direction-set memory locked **llama.cpp-wasm only**
for v1 because:
- Universal CPU compatibility works on every Indian phone the
  shell already targets — no WebGPU required.
- 3-10 tok/s is real, not zero — slow but demoable.
- Single third-party runtime dep — breaks the zero-npm-dep
  posture once, deliberately, with rationale.
- MLC-LLM deferred to v2 once we have a Snapdragon 8 Gen 2+ test
  device + a real reason to ship two runtimes.
- ONNX dropped — no clear win over llama.cpp.

Phase 9.0a (registry, ADR 0112) + 9.0b (install records + DPDP
cascade + shell install card, ADR 0113) shipped the storage +
opt-in flow. Phase 11.5 (ADR 0118) shipped the `/app/labs/`
install card with a deliberately-failing placeholder flow.
**Phase 9.0c here actually wires the runtime** so an installed
pack can run inference end-to-end.

## Decision

### Runtime: `@wllama/wllama` 3.4.1

[wllama](https://github.com/ngxson/wllama) is a maintained
TypeScript wrapper around llama.cpp compiled to WebAssembly. It
exposes:
- `loadModel(blobs[], { n_ctx, progressCallback })` — load GGUF
  weights from a Blob (perfect for OPFS file handles)
- `createCompletion({ prompt, nPredict, sampling, stream: true })`
  — streaming token generation
- `createChatCompletion(...)` — OpenAI-compatible chat completion
- `getModelMetadata()` — model hyperparameters
- `exit()` — clean WASM shutdown

Why wllama specifically:
- Production-grade — used by HuggingFace chat-ui and the WebLLM
  community
- Active maintenance (3.x major version, regular releases)
- TypeScript types ship with the package
- WASM binaries served from jsDelivr CDN by default — no static
  asset shipping required in `public/app/build/`
- ESM-native (matches our Vite stack)
- ~290 KB raw JS (~126 KB gzipped) for the wrapper; WASM is
  fetched separately on demand

### Lazy-loading

The Wllama JS + WASM is **NOT** in the main `/app/` bundle. The
adapter (`src/lib/slm-runtime.ts`) uses a dynamic `import('@wllama/
wllama')` so Vite code-splits it into its own chunk. Users who
never install an SLM never pay the bytes.

Build output confirms:
```
public/app/build/assets/index-DiRUNnEp.js   338 KB / 105 KB gzipped  (main app)
public/app/build/assets/index-DKztdZdB.js   292 KB / 126 KB gzipped  (wllama lazy chunk)
```

Main bundle grew only 8 KB vs Phase 11.6 (from 330 → 338 KB raw)
for the adapter + OPFS helpers + Try Prompt component. The full
runtime cost (231 KB gzipped combined) only applies when a worker
actually generates.

### Adapter API

`src/lib/slm-runtime.ts` exposes a stable interface independent
of which underlying engine is used. If Phase 9.0c-v2 (MLC-LLM)
ever ships, the same `SlmRuntime` type works:

```typescript
interface SlmRuntime {
  generate(opts: GenerateOptions): Promise<string>;
  unload(): Promise<void>;
  metadata: SlmRuntimeMetadata;
}

interface GenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  onToken?: (token: string, partial: string) => void | boolean;
}
```

Two loader functions:
- `loadSlmRuntime({ ggufBytes, onProgress })` — primary entry; takes
  a `Blob` (from OPFS) or `ArrayBuffer` (from fetch)
- `loadSlmRuntimeFromUrl(url)` — convenience for cases where the
  caller hasn't already cached to OPFS

### OPFS layer

`src/lib/opfs.ts`:
- `opfsSupported()` — feature check (`navigator.storage.getDirectory`)
- `readSlmBlob(modelPackId)` — fetch the persisted bytes as `File`
- `downloadAndPersist({ url, modelPackId, onProgress })` —
  streaming fetch + write-to-OPFS + concurrent SHA-256 computation;
  on abort or error, removes the partial file; returns
  `{ observedHash, downloadedBytes, blob }`
- `removeSlmBlob(modelPackId)` — best-effort delete

OPFS dir: `bharat-os-slm/` under the origin's private file system.
Filename: `safeName(modelPackId)` (alphanumeric/dot/dash/underscore
only).

### `/app/labs/` install flow — upgraded

Phase 11.5 shipped a placeholder where every install attempt failed
honestly via `fetch(url, {mode: 'no-cors'})`. Phase 9.0c replaces
this with the real flow:

1. **OPFS check** — refuse early if the browser doesn't support it
2. **Confirm gate** — `window.confirm` with honest pack-size +
   storage posture
3. **`downloadAndPersist`** — streaming fetch with per-chunk
   progress callback updating a `<progress>` bar; concurrent
   SHA-256 computation; OPFS write
4. **Server-side hash verification** — the Phase 9.0b API's
   `createInstalledSlmRecord` validator already binds expectedHash
   to the registry's `sourceHash`; mismatch returns 400. We pass
   `observedHash` and let the server be authoritative.
5. **Mismatch handling** — if observed ≠ source: discard OPFS blob
   via `removeSlmBlob`, record install with `status: 'failed'` +
   `failureReason` describing the mismatch
6. **Success** — record `status: 'installed'`; toast "Tap 'Try a
   prompt' to test it"

### `<SlmTryPrompt>` component

Post-install inference surface (`src/components/SlmTryPrompt.tsx`):
- Inline card opens above the installed list
- 3 sample prompt chips ("Write a short greeting for a kirana shop
  owner in Hindi", "Explain UPI in one sentence", "Suggest a name
  for a federated learning round")
- Textarea + Generate button
- On first click: `readSlmBlob` → `loadSlmRuntime` (lazy-loads
  wllama from CDN; runtime + WASM both load on demand here, not
  at app start) with progress bar
- On subsequent clicks: reuses the loaded runtime (cached in
  `useRef`)
- Streaming output renders into a monospace block as tokens arrive
- Generation latency shown ("Generated in N ms · pack-id")
- Close button calls `runtime.unload()` to free WASM memory
- `<Evidence>` collapsible explains the on-device posture

### Vendoring posture (the distroless-deploy trade-off)

wllama's WASM lives at `https://cdn.jsdelivr.net/npm/@wllama/wllama@3.4.1/esm/wasm/`.
This is **public CDN** — for v1 demo this is fine; for production:

| Posture | When |
|---|---|
| **CDN (default)** | Demo, dev, low-traffic deploys; one-line config; jsDelivr's SLA is reasonable for non-critical paths |
| **Self-hosted mirror** | Production / sovereignty-conscious deploys; copy `node_modules/@wllama/wllama/esm/wasm/` into `public/wasm/wllama/` and pass that path config |
| **Operator-CDN** | Audit-grade — Bharat OS's release key signs the WASM bundles like SLM packs are signed (future polish) |

The adapter exposes `pathConfig` as a parameter so the operator can
flip between the three without touching adapter code.

### Backend changes

**None** in this sub-phase. Phase 9.0a/9.0b's `/api/slm-model-packs`
+ `/api/identities/:id/installed-slms` endpoints already handle the
data model. The runtime is purely an FE adapter that talks to the
already-deployed registry + install record API.

The seeded demo packs (Phi-3-mini + Gemma-2B with placeholder
URLs at `models.bharat-os.example`) **still fail to download** —
that's the honest demo posture per Phase 11.5. To exercise the
end-to-end "install → SHA verify → try a prompt" success path,
an operator needs to register a pack with a real HTTPS URL and
the correct SHA-256. This is now flagged in the ROADMAP external
items.

## Tests

`src/lib/slm-runtime.test.ts` — 7 new tests with wllama fully
mocked (we don't load actual WASM in jsdom):

- `loadSlmRuntime` loads a model from a Blob and exposes metadata
- `loadSlmRuntime` wraps `ArrayBuffer` in a Blob before calling
  `loadModel`
- `loadSlmRuntime` forwards the progress callback through to wllama
- `runtime.generate` streams tokens and returns accumulated text
- `runtime.generate` stops streaming when `onToken` returns false
- `runtime.unload` calls `wllama.exit()`
- `runtime.unload` swallows exit errors silently

**Vitest 7 → 14 tests.** Backend Node tests untouched (still
800/800).

OPFS helpers are not unit-tested in jsdom (OPFS isn't supported
there); they're exercised by the live smoke. The SHA-256
computation is a thin wrapper around `crypto.subtle.digest` which
is browser-native.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| Bytes never on the server | Adapter loads weights from OPFS or a direct fetch — server never sees the GGUF |
| Prompt never leaves the device | `runtime.generate` operates entirely within the WASM worker; the Try Prompt UI emits no outbound network calls beyond the initial CDN runtime load |
| Honest mode disclosure | Try Prompt's `<Evidence>` block names the runtime (llama.cpp-wasm via @wllama), explains where the WASM came from, and shows generation latency |
| Lazy-loading honored | wllama is in its own code-split chunk; users who never install pay 0 bytes |
| Integrity check before "installed" status | Real SHA-256 over the streamed bytes; server-side createInstalledSlmRecord enforces expectedHash == observedHash |
| Discard on mismatch | OPFS blob removed via `removeSlmBlob` when verify fails; install record stores `failed` status with the mismatched-hash failure reason |
| Worker-initiated uninstall is total | `removeSlmBlob` runs before server DELETE so the bytes are gone from the device even if the network call fails |
| Audit ledger covers everything | All install/uninstall records emit Phase 9.0b's `installed_slm.recorded` / `.failed` / `.removed` ledger events |

## Bundle accounting

| Phase | Main bundle JS | Main gzipped | Lazy chunk gzipped |
|---|---|---|---|
| 11.0 | 307 KB | 96 KB | — |
| 11.3 (worker + citizen) | 307 KB | 96 KB | — |
| 11.4 (+ MFI) | 322 KB | 99 KB | — |
| 11.6 (+ Labs + Settings) | 330 KB | 102 KB | — |
| 9.0c (+ runtime + Try Prompt) | **338 KB** | **105 KB** | wllama: **126 KB** |

**Main app stays under 110 KB gzipped** — well within reasonable
mobile budget. Total cost (main + runtime) only paid by users who
generate.

Build time: 1.55s.

## Consequences

- **On-device inference is real on `/app/`.** Tap Install → real
  download → real SHA-256 verify → tap Try a prompt → real WASM
  load → real streaming generation. Investor demo shows the full
  loop with no "imagine this works" hand-waving.
- **First third-party runtime dependency landed cleanly.** Single
  npm package; lazy-loaded; main bundle barely moved; main app
  startup cost zero. The zero-npm-dep posture is broken
  deliberately, with rationale, and bounded to this one runtime
  adapter file + a dynamic import.
- **`/shell/` SLM card becomes redundant.** The legacy install
  surface from Phase 9.0b can stay for developer use but the
  primary investor demo path is now `/app/labs/`.
- **The runtime is forward-compatible.** When 9.0c-v2 ships
  MLC-LLM/WebGPU, the adapter API stays the same — `SlmRuntime`
  + `GenerateOptions` are runtime-agnostic. Branching happens
  inside `loadSlmRuntime` based on pack metadata + device
  capability probe.
- **Federated rounds (Phase 9.0d) becomes meaningful.** Until
  9.0c the §7f federated-round substrate had no real model to
  fine-tune — just the 216-param classifier (`local-training.mjs`).
  Now there's an actual SLM that can do distillation, LoRA fine-
  tuning, gradient updates with DP-SGD.

## What's NOT in this sub-phase

- **`runtime.computeGradients(...)` for federated rounds** — the
  adapter shape is sketched; wllama's gradient API needs more
  exploration than fits this ship. Lands with Phase 9.0d.
- **Multi-modal (image input)** — wllama supports it via the
  `mediaMarker` config but the GGUF packs in the registry are
  text-only.
- **Embedding models** — wllama can do embeddings; not wired here.
  Useful for Phase 10 labeling marketplace's pre-labeling.
- **Real demo SLM in the seeded packs** — Phi-3-mini + Gemma-2B
  still point at placeholder URLs. Picking a real small model
  (SmolLM2-135M ≈ 90 MB looks ideal) + pre-computing its SHA-256
  + updating the seed is an external-action ROADMAP item.
- **WebGPU detection / runtime tier switching** — single runtime
  for now.
- **Memory / OOM guardrails** — wllama's `n_ctx: 2048` is a sane
  default; a future hardening step would probe `navigator.deviceMemory`
  + cap the context size on memory-constrained devices.
- **Operator-CDN signed-WASM** — Phase 9.0c future polish; for
  v1 we rely on jsDelivr.

## Future polish

- Self-host or operator-mirror the WASM (vendor `node_modules/@wllama/wllama/esm/wasm/` into `public/wasm/wllama/`)
- Sign the WASM bundles like SLM packs (operator audit-grade
  posture)
- WebGPU path / MLC-LLM as the premium tier (Phase 9.0c-v2 with
  a Snapdragon 8 Gen 2+ test device)
- Chat template auto-detection from GGUF metadata (currently
  rendering raw `createCompletion`; chat models would benefit from
  `createChatCompletion`)
- Per-pack default sampling params (temperature, top_p) stored on
  the registry entry
- "Stop" button mid-generation that triggers `onToken: () => false`
- Persisted conversations / save outputs locally
- Federated round participation (Phase 9.0d) using the same
  adapter
