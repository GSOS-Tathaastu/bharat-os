# ADR 0107: Phase 9.0 — Tier-4 SLM Download + Runtime (Federated-as-a-Service Prerequisite)

## Status

**Proposed.** Design captured for review; implementation not yet
greenlit. Prerequisite for the Phase 9.1 sponsored-federated-round
API discussed in the federated-training-as-a-service strategic
thread. Distinct from the Phase 8.x shell-UI arc.

## Context

Bharat OS today ships **two model artifacts** to the device:

1. The Tier-2 OCR / TTS runtime (~7 MB lazy-loaded — Tesseract.js
   etc. per ADR 0057).
2. The Phase 3.1 **intent classifier head** — a 216-parameter
   multinomial logistic regression that gets fine-tuned via §7f
   federated rounds (`src/phase1/local-training.mjs`).

Critically, **neither is a real Small Language Model.** ADR 0057's
"Tier 4 1.5-4 GB opt-in SLM" footprint accounting was always
forward-looking: we documented the planned envelope but never
implemented the download + runtime.

This matters for the business model because:

- The federated-learning-as-a-service pitch (sell privacy-preserving
  fine-tuning to banks / hospitals / government) requires a real
  SLM on participating devices. A 216-param classifier can't be
  the student in distillation from a 7B teacher.
- The "compute marketplace" pitch where workers earn paise per
  inference token requires the device to actually run inference.
  A 7-13B SLM is the smallest viable workload that's commercially
  interesting.
- The §7f federated-round substrate (Phase 3.0/3.1/3.2) is
  architecturally ready for larger models — `composeFederatedUpdate`
  accepts any model shape — but the *available* models on devices
  cap what sponsors can actually train.

Phase 9.0 closes the gap.

## Decision

### Three components

**1. Model-pack registry extension.** Already-existing
`on-device-model-packs` storage (Phase 2a.6) gets new entries for
Tier-4 SLMs with extra fields:

```js
{
  modelPackId: 'bos:slm:phi-3-mini-4k-q4_k_m',
  family: 'phi-3-mini',
  parameterCount: 3_800_000_000,
  quantization: 'q4_k_m',
  diskBytes: 2_300_000_000,
  ramRequiredMb: 2800,
  runtime: 'llama-cpp-wasm',  // or 'webllm' / 'mlc-llm' / 'native'
  sourceUrl: 'https://...',   // a Bharat OS-hosted mirror
  sourceHash: 'sha256:...',   // integrity check on download
  license: 'MIT' | 'apache-2.0' | 'meta-llama',
  capabilities: ['inference', 'lora_finetune', 'classifier_head']
}
```

The registry is admin-curated (Phase 5.7 admin-auth pattern); the
device queries `GET /api/on-device-model-packs?tier=4` to see what's
available + what fits its hardware.

**2. Capability detection + opt-in download flow.** New shell
flow:

```
Profile tab → "Advanced features" card → 
  "📦 Install a Bharat OS language model" section.

Shows compatible packs filtered by:
  - Device RAM ≥ ramRequiredMb
  - Free disk ≥ diskBytes * 1.2
  - Browser supports the chosen runtime
    (WebGPU for MLC-LLM, WASM threads for llama-cpp-wasm, etc.)

For each compatible pack:
  - Headline ("Phi-3-mini 3.8B · 2.3 GB · Microsoft, MIT licence")
  - "Why install" copy (Bharat OS uses this for: vernacular
     intent matching, on-device daily-brief composition, 
     participating in paid federated training rounds for ₹X/month)
  - Honest tradeoff line ("Uses 2.3 GB. Takes ~10 min to download
     on home WiFi.")
  - [Install] button.

[Install] triggers:
  - Stream download with progress indicator
  - SHA-256 verification on completion
  - Persist to IndexedDB / OPFS (Origin Private File System)
  - Record install in `installed_on_device_models` table
  - Test inference on a canned prompt to verify runtime works
```

**3. Runtime adapter layer.** A small abstraction in
`src/phase1/slm-runtime.mjs` that wraps whichever inference
backend the model pack declares:

```js
const runtime = await loadSlmRuntime(modelPack);

const result = await runtime.generate({
  prompt: '…',
  maxTokens: 128
});

const gradients = await runtime.computeGradients({
  prompt: '…',
  targetLogits: '…',  // for distillation
  lora: { rank: 8, layers: ['q_proj', 'v_proj'] }
});
```

Three runtime backends evaluated for Phase 9.0:

| Backend | Pros | Cons | Use case |
|---|---|---|---|
| **MLC-LLM (WebGPU)** | Real GPU offload on modern phones; fast inference | Requires WebGPU support (Android 14+, iOS 18+) | Premium tier |
| **llama.cpp-wasm** | CPU-only; works on older devices | Slow inference (3-10 tok/s on phones) | Universal fallback |
| **ONNX Runtime Web** | Better browser support than WebGPU; intermediate speed | Limited LoRA support | Middle tier |

The shell picks the highest-tier runtime the device supports.

### Phase 2a vs Phase 2b distinction

Phase 9.0 ships the **PWA-side runtime** (WASM / WebGPU). Phase 2b
(AOSP shell) gets native bindings via JNI to llama.cpp + native
acceleration on the device's NPU. Same model-pack registry; same
runtime adapter API; different implementation.

### Storage

New SqliteStore tables:

- `slm_model_packs` — Tier-4 entries with full metadata + admin
  ledger events on add/remove.
- `installed_on_device_models` — per-identity install records:
  `{ identityId, modelPackId, installedAt, downloadedBytes,
  runtimeBackend, lastUsedAt, status }`. **Doesn't store the
  model bytes** — those live in client-side IndexedDB/OPFS.
  Server only tracks install status.

DPDP cascade: the `installed_on_device_models` row on the server
is erased per §12(3); the device-side IndexedDB blob is cleared
when the user erases their identity (Phase 4.0's
`/api/identities/:id?confirm=YES_DELETE` already triggers a
client-side wipe of identity-scoped storage).

### Wire-up to existing systems

- **Phase 3.1 federated rounds** — when a sponsored round arrives
  with `modelPackId`, the device's SLM runtime computes the
  gradient update. Today's 216-param classifier becomes a special
  case of the SLM runtime.
- **Phase 6.0b mesh dashboard** — the `inference` workload type
  in `bos:mesh-contribution.v0` events finally has a real source:
  ticks recorded when the SLM serves inference for the user's own
  intent flows (or, in Phase 9.1, for sponsor-paid external calls).
- **Phase 5.7 admin endpoints** — new `POST /api/admin/slm-model-packs`
  to curate the registry.

## §15 bindings (forward — to be preserved when implemented)

| Binding | Resolution |
|---|---|
| Opt-in download | Tier 4 is NEVER auto-downloaded. The shell asks the user, shows the honest 2.3 GB cost, and refuses to start without explicit consent. |
| Inference runs locally | Once installed, the user's intent flows route to the local SLM instead of an external API. No prompt content leaves the device unless the user explicitly enables a "use cloud for hard prompts" toggle (future polish). |
| Federated round gradients are still DP-noised | Phase 3.2's privacy-budget accountant applies to gradient updates from the SLM exactly as it does to today's classifier — `composeFederatedUpdate({ samples, epsilon })` is model-agnostic. |
| Model pack download is integrity-checked | SHA-256 of the download is verified against `sourceHash` from the registry. A compromised mirror can't ship a backdoored SLM. |
| Server doesn't see device-side prompts | The `installed_on_device_models` server record tracks install status + last-used timestamp only. The prompts the user sends to their local SLM stay local. |
| Admin curation prevents rogue model packs | New entries to `slm_model_packs` go through Phase 5.7 admin-auth; signed ledger event per add/remove. No anonymous packs. |

## Tests (when implemented)

- **Model-pack registry** unit tests + admin CRUD via end-to-end
  live HTTP.
- **Capability detection** unit tests covering each combination of
  device RAM × free-disk × browser runtime support.
- **Download verification** — corrupted-bytes test that asserts
  SHA-256 mismatch aborts the install + leaves no half-loaded
  state.
- **Runtime adapter** mocked-backend tests for each of MLC-LLM /
  llama.cpp-wasm / ONNX paths.
- **Federated round integration** — verify a sponsored round
  routes through the SLM runtime + produces a DP-noised gradient
  update (compose with existing Phase 3.x tests).

Estimated test surface: ~40 new tests. Estimated test count
after Phase 9.0: 790-800.

## Estimated effort

- **Registry + admin curation** — ~1 week (small).
- **Capability detection + shell flow** — ~1-2 weeks.
- **Runtime adapter wrapping llama.cpp-wasm + MLC-LLM** — ~3-4
  weeks (the gnarly part — these are real third-party deps that
  break Bharat OS's "zero npm dependencies" pattern; trade-off
  is documented in the implementation phase).
- **Integration with federated round + mesh-contribution events**
  — ~1 week.

Total: ~6-8 weeks of focused work. Substantially bigger than any
single Phase 8.x shell-UI ship (~1 day each).

## Consequences

- **Federated-learning-as-a-service becomes pitchable.** A bank or
  hospital can finally be told "we have N thousand Indian phones
  running a real SLM that can be fine-tuned on local data." Until
  Phase 9.0 ships, that pitch is aspirational.
- **The mesh inference market becomes pitchable.** Phase 6.0b's
  inference workload type stops being demo-seeded and starts
  recording real ticks.
- **First time we introduce third-party runtime dependencies** —
  llama.cpp-wasm or MLC-LLM are not zero-dep. We need a careful
  ADR-level discussion of which backend to vendor + how to keep
  the distroless deploy story intact.
- **Shell footprint envelope from ADR 0057 becomes real.** Tier 4
  was always documented as "1.5-4 GB opt-in." Phase 9.0 makes the
  opt-in mechanism a thing the user actually sees.

## Sequencing

Phase 9.0 should ship BEFORE Phase 9.1 (sponsored federated-round
API) because without it sponsors have nothing to fine-tune. But
the Phase 8.x shell-UI arc (8.2 MFI consent, 8.3 withdrawal, 8.4
push opt-in) can ship in parallel — they don't depend on Phase
9.0.

Suggested order:
1. Phase 8.2 (MFI consent UI) — small, well-bounded.
2. Phase 8.3 (UPI cash-out UI) — small.
3. Phase 8.4 (push opt-in UI) — small; activates Phase 7.x.
4. Phase 9.0 (this ADR — Tier-4 SLM) — multi-week effort.
5. Phase 9.1 (sponsored federated rounds) — depends on 9.0.

## Future polish (after MVP)

- **Model-pack signing** — each pack signed by Bharat OS's release
  key. Devices reject unsigned packs even if SHA matches.
- **Delta-updates** — when a base model gets a security fix or
  new variant, ship only the diff (LoRA-style adapter) instead of
  re-downloading 2.3 GB.
- **Multi-model coexistence** — let a flagship device install
  both Phi-3-mini (3.8B, instructions) and a code-specialised
  model. Today's spec assumes one SLM per identity.
- **NPU acceleration** — most modern Indian phones ship NPUs
  (Snapdragon Hexagon, Apple Neural Engine, MediaTek APU). The
  WASM/WebGPU runtimes don't use them. A Phase 2b AOSP shell
  could.
- **Per-pack revenue split telemetry** — when a sponsor pays for
  federated rounds using a specific SLM, track per-pack
  revenue so we can decide which packs to prioritise for the
  registry.
