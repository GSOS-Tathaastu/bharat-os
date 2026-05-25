# ADR 0113: Phase 9.0b — Per-Identity SLM Install Records + Shell Install UI

## Status

**Accepted — shipped.** Second sub-phase of the Phase 9.0 arc
(ADR 0107 Proposed). Adds the per-identity install record layer
on top of the Phase 9.0a registry (ADR 0112), with DPDP §12(3)
cascade, REST endpoints, and a worker-facing shell card that
streams + SHA-256-verifies + persists to OPFS. **Still no
runtime** — that's Phase 9.0c. The shell honestly tells the
worker the installed pack won't *run* yet; the install pipeline
end-to-end is what's being demoed.

## Context

Phase 9.0a shipped the registry — operator-curated metadata about
which Tier-4 SLM packs exist, what they cost (RAM / disk), what
their licences are, and what their integrity hash is. But:

- The server had no way to record *that a worker installed pack X*
  for surfacing across paired devices (§7c identity-not-device).
- The shell had no UI to actually install a pack — the registry
  was discoverable only via curl.
- DPDP §12(3) had no story for the per-identity install row when
  the worker erases their identity.

Phase 9.0b closes all three.

## Decision

### `src/phase1/installed-slm.mjs` (new module)

Pure validation, no I/O. Exports:

- `createInstalledSlmRecord(input)` — validates a per-identity
  install record. Two terminal statuses (`installed` / `failed`);
  no mid-flight `pending` state needs to leave the client.
  Defends the **expected vs observed hash invariant** server-
  side: if `status: 'installed'` and both hashes are provided
  but mismatch, refuses (belt-and-suspenders so a buggy client
  can't silently misreport a hash mismatch as success).
- `INSTALLED_SLM_STATUSES` = `['installed', 'failed']`.

Record shape:

```js
{
  installId: 'bos:installed-slm:<32-hex>',
  protocolVersion: 'bos.phase9.installed-slm.v0',
  objectType: 'installed-slm',
  identityId: '...',
  modelPackId: '...',
  runtimeBackend: 'llama_cpp_wasm' | 'mlc_llm_webgpu' | …,
  downloadedBytes: 2_300_000_000,
  status: 'installed' | 'failed',
  failureReason: string | null,    // required when status=failed
  expectedHash: 'sha256:…' | null, // bound to registry sourceHash
  observedHash: 'sha256:…' | null, // client-computed
  storageLocation: 'opfs',         // for forward-compat
  installedAt: '<iso>'
}
```

**Pointer-not-payload**: the model bytes themselves live in the
browser's Origin Private File System (`navigator.storage.getDirectory()`
+ `getFileHandle()` + `createWritable()`). The server never holds a
copy. The install record is the server-side pointer.

### Storage

- **SqliteStore**: new `installed_slms` table (`install_id PK`,
  `identity_id`, `json TEXT`) + index on `identity_id` for the
  per-identity GET. `saveInstalledSlm` upserts + emits
  `installed_slm.recorded` (or `.failed`) ledger event;
  `deleteInstalledSlm` hard-removes + emits `installed_slm.removed`.
- **BosStore (file)**: new `installed-slms/` directory; same CRUD
  shape; ledger events mirror the sqlite backend.

**DPDP §12(3) cascade**:
- SqliteStore `eraseUserData` sweeps `installed_slms` by
  `identity_id`. `report.sections.installedSlms` counts the
  removed rows.
- BosStore `eraseUserData` adds `installedSlms` to its sweep list.
- The on-device OPFS blob is wiped by Phase 4.0's identity-
  scoped client storage clear when the user calls
  `DELETE /api/identities/:id?confirm=YES_DELETE`. (The shell's
  Phase 9.0b uninstall flow proactively removes the OPFS blob
  too, so it works even if the user hasn't yet hit the erase
  button.)

### API routes

```
GET    /api/identities/:identityId/installed-slms
POST   /api/identities/:identityId/installed-slms
DELETE /api/identities/:identityId/installed-slms/:installId
```

- **GET** returns the worker's install list **decorated with
  registry metadata** for each row (`family`, `variant`,
  `quantization`, `parameterCount`, `diskBytes`, `license`,
  `status`). If the registry has revoked a pack the worker
  installed earlier, the row still appears but carries `pack.status:
  'revoked'` honestly — useful for surfacing a "you have a revoked
  pack installed; consider removing" cue (future polish in 9.0c).
- **POST** creates a new record after the client's download +
  verify completes. **Binds `expectedHash` to the registry's
  `sourceHash`** server-side — the client cannot claim a
  different expected hash than the operator-curated one.
  Refuses with 404 `unknown_pack` if the registry doesn't know
  the pack; 409 `pack_revoked` if the registry revoked it
  AND the client claims `status: 'installed'` (revoked packs
  CAN record `status: 'failed'` for completeness — the worker
  attempted to install something that no longer exists);
  400 `invalid_install_record` for validation failures (status
  mismatch, hash mismatch, etc.).
- **DELETE** scoped to the identity — 404 if the install
  belongs to a different identity. Hard-deletes the server row
  (the DPDP cascade does the same on identity erase; this is
  the worker-initiated path) and emits `installed_slm.removed`.

Routes added to the catalog at `GET /api`.

### Shell UI: `#slmInstallSection` on Profile tab

Inserted between the Phase 8.4 push opt-in card and the existing
health-doc card. Header *"🧠 Install a Bharat OS language model"*
+ status caption (`Off` / `1 installed` / `N installed`).

Honest copy: *"Bharat OS can run a Small Language Model (1–4 GB)
on your phone for offline intent matching, voice-rationale
labeling, and participating in paid federated training rounds.
The runtime is not yet wired (Phase 9.0c); for now this card
shows the catalogue and tracks your installs."*

Card sub-components:

- **Device profile block** — surfaces what the browser reports
  about itself: `navigator.deviceMemory` × 1024 → RAM MB;
  `navigator.storage.estimate()` → free disk; runtime support
  probes (OPFS + WASM → `llama_cpp_wasm`; OPFS + WebGPU →
  `mlc_llm_webgpu`; OPFS + WASM → `onnx_runtime_web`).
- **Installed list** — per-row tile with status badge (`installed`
  green / `failed` red / `removed` grey), per-pack family +
  variant, bytes downloaded, optional `pack revoked since
  install` annotation, `[Remove]` button.
- **Catalogue** — filtered call to
  `GET /api/slm-model-packs?compatible=true&deviceRamMb=…&freeDiskBytes=…&supportedRuntimes=…`.
  Each tile shows family + variant + runtime + meta line (params
  / quantization / license / download size) + description + an
  `[Install (X.X GB)]` button. Tiles for already-installed packs
  show `Already installed` (disabled).
- **`[Refresh catalogue]`** link button to re-poll after admin
  publishes a new pack.
- **Per-pack install progress** — `<progress>` bar visible during
  download.
- **`How on-device SLMs work`** collapsible explaining OPFS
  storage + Bharat-OS-mirror sourcing + SHA-256 verify + DPDP
  erase behaviour + the Phase 9.0c runtime gap.

Install handler (`installSlmPack(modelPackId)`) does, in this
order:

1. `window.confirm` gate with the honest pack-size + storage
   posture.
2. Probe OPFS + SubtleCrypto availability — refuse early if
   either is missing.
3. `fetch(pack.sourceUrl)` with `response.body.getReader()` for
   streaming.
4. `navigator.storage.getDirectory()` → `getDirectoryHandle('bharat-os-slm', {create: true})`
   → `getFileHandle(safeName, {create: true})` →
   `createWritable()`. Stream chunks straight to OPFS.
5. SHA-256 compute over the concatenated bytes via
   `crypto.subtle.digest('SHA-256', …)`.
6. Compare against `pack.sourceHash`. If mismatch → discard the
   OPFS blob + mark `status: 'failed'` + populate
   `failureReason`.
7. POST `/api/identities/:id/installed-slms` with the outcome
   (the server defends the expected/observed invariant a second
   time).
8. Re-render the catalogue + installed list.

Uninstall handler (`removeInstalledSlm(installId)`):

1. `window.confirm` gate.
2. OPFS blob removal via `slmDir.removeEntry(safeName)` (best-
   effort — the same install may exist on another paired device).
3. DELETE the server record.
4. Re-render.

### CSS

New rules: `.slm-install-card` background; `.slm-install-device-grid`
2-col label / value; `.slm-installed-row` border + meta layout;
`.slm-install-status-installed` (green), `.slm-install-status-failed`
(red), `.slm-install-status-removed` (grey) badge variants matching
the Phase 8.2/8.3 status-badge palette; `.slm-pack-tile` catalogue
tile with header + meta + actions + progress bar; `.slm-install-empty`
empty-state message.

### SW cache → v35

## §15 bindings

| Binding | Resolution |
|---|---|
| Bytes never on the server | OPFS persistence is client-side only. The server record carries metadata (status / bytes-downloaded / runtime / hash) — never the model itself. The "How on-device SLMs work" copy spells this out so the worker isn't told to trust the server blindly. |
| Integrity verified before install is claimed | The shell SHA-256-verifies before POSTing `status: 'installed'`. The server defends the same invariant: `expectedHash` is bound to the registry's `sourceHash`; mismatching `observedHash` → 400. Two layers, neither alone trusted. |
| Pack must exist + not be revoked for new installs | 404 `unknown_pack` if registry doesn't know it; 409 `pack_revoked` if registry revoked it AND client claims `status: 'installed'`. (Revoked packs can record `status: 'failed'` so the audit trail of "worker tried, registry refused" is complete.) |
| Cross-identity install access is impossible | GET filters by `identityId` server-side; DELETE 404s if the install belongs to a different identity. The bearer-token-style consentId from Phase 6.1 has no parallel here because installs are identity-scoped, not consent-scoped. |
| DPDP §12(3) cascade is total | Server: `eraseUserData` sweeps `installed_slms` by `identity_id` on both backends + reports a `sections.installedSlms` count. Client: Phase 4.0 identity-erase + Phase 9.0b uninstall both remove the OPFS blob (the latter proactively). The model bytes have no path to outlive the identity. |
| Worker-initiated opt-out is one tap + confirm | `[Remove]` button on each installed-row → `window.confirm` → OPFS-then-server delete. Matches the Phase 8.2 / 8.3 / 8.4 revoke pattern. |
| Audit trail covers register / install / uninstall | `slm_model_pack.registered` (9.0a) + `installed_slm.recorded` / `.failed` / `.removed` (9.0b) ledger events bracket the full lifecycle. |
| Operator can audit per-worker install state | The decorated GET response shows the registry metadata at read-time, so an investor demo can ask "what models does this worker have?" without exposing the model bytes themselves. |

## Tests

`tests/node/installed-slm.test.mjs` — 21 tests covering:

- Module: `INSTALLED_SLM_STATUSES`, `createInstalledSlmRecord`
  happy path + every validation guard (missing identity / pack /
  runtime; bad bytes; bad status; failed-needs-reason; expected/
  observed mismatch). 7 tests.
- File store: persist + ledger emit on installed + deleted +
  failed paths. 3 tests.
- SqliteStore: persist + identity_id index + survive reload. 1
  test.
- DPDP §12(3) cascade: BosStore + SqliteStore both sweep
  `installed_slms` by identity_id; only the erased identity's
  rows go. 2 tests.
- HTTP: 404 for unknown identity, GET empty, POST + decorated
  GET, registry-bound expected-hash defence (400), failed-status
  no-hash path (201), 404 unknown pack, 409 revoked pack,
  cross-identity DELETE 404 + own-identity DELETE 200 + ledger
  event. 8 tests.

Full suite: **798/798 Node tests pass** (was 777; +21 new
installed-slm tests). Run in batches of 16 files to dodge
Windows process-spawn OOM hitting parallel `--test` runners.

Live smoke verification on `BHARAT_OS_ADMIN_TOKEN`-configured
local server:
- `GET /shell/` 200; HTML contains `slmInstallSection`,
  `slmInstallCatalogue`, "Install a Bharat OS language model".
- `POST /api/admin/slm-model-packs` registers a Phi-3-mini pack
  (`d0fe045f…`).
- `GET /api/identities/:id/installed-slms` returns
  `{installs: []}`.
- `POST /api/identities/:id/installed-slms` with matching
  `observedHash` returns 201 with the install record.
- Decorated GET returns the install with `pack.family:
  "phi-3-mini"` + `pack.status: "registered"`.
- `POST` with mismatched hash returns 400 `invalid_install_record`
  + message *"expectedHash and observedHash mismatch — refusing
  to record as installed."*
- `DELETE` returns `{ok: true, removed: true}`.

## Consequences

- **Phase 9.0 install pipeline is end-to-end demoable.** Worker
  opens Profile tab → sees device profile + catalogue → taps
  Install → confirm gate → progress bar → SHA-256 verify → row
  appears under Installed. Until 9.0c lands the worker can't
  *use* the model for anything, but the full opt-in flow + DPDP
  story is real.
- **Investor demo gains a concrete "1–4 GB SLM on every Indian
  phone" artifact.** Previously that pitch was registry-only +
  curl-only. Now you can demo the catalogue + install + remove
  in the shell.
- **Phase 9.0c unblocked.** The runtime adapter
  (`src/phase1/slm-runtime.mjs`) needs an install record to know
  which model to load. That record now exists and is queryable
  per-identity.
- **OPFS dependency introduced.** First time Bharat OS shell
  uses Origin Private File System. Most modern browsers support
  it (Chrome/Edge/Firefox 111+/Safari 17+). Older browsers get
  the early "Browser lacks OPFS support" error in `installSlm
  Pack`. Footprint accounting from ADR 0057 already covered the
  Tier-4 envelope; OPFS is the *mechanism* that fills it.
- **DPDP §12(3) coverage is complete for Phase 9.0.** Both
  server-side sweeps + client-side OPFS clear are wired. When
  9.0c adds usage telemetry (per-call inference logs) those will
  need to join the cascade too.
- **No third-party runtime dependency yet.** Still no
  llama.cpp-wasm or MLC-LLM. The shell uses only browser-native
  APIs (`fetch`, `crypto.subtle`, `navigator.storage`). Zero-dep
  posture preserved.

## What's NOT in this sub-phase

- **No live download tested end-to-end** — the `sourceUrl` in
  the demo registry points to a `models.bharat-os.example` host
  that doesn't actually serve bytes. The shell's fetch will
  fail (DNS or 4xx), the failure path is exercised (`status:
  'failed'`), and that's the honest investor-demo posture.
  Hosting a real Phi-3-mini mirror is operationally separate.
- **No background-resume of partial downloads.** A dropped
  network mid-download leaves an orphaned OPFS file +
  half-complete in-memory chunks; today the user re-taps Install
  and starts over. Real-world Tier-4 downloads (2.3 GB on home
  WiFi) need this; future polish.
- **No per-pack signature check** — just the SHA-256 hash from
  the registry. Pack-signing (ADR 0112 future-polish item)
  would catch a compromised registry too.
- **No on-device storage usage panel** — the worker doesn't see
  "you've used 4.6 GB of OPFS for SLMs". The
  `navigator.storage.estimate()` output is only used for compat
  filtering; future polish could display it.

## Sub-phase position in the Phase 9.0 arc

- **9.0a** ✅ Registry + admin curation + ledger evidence (ADR 0112).
- **9.0b** ✅ **This sub-phase** — install records + DPDP cascade
  + shell UI.
- **9.0c** — runtime adapter wrapping llama.cpp-wasm /
  MLC-LLM / ONNX Runtime Web. **First third-party-runtime-
  dependency commit; needs its own ADR for the choice + the
  distroless-deploy trade-off.** ~3–4 weeks.
- **9.0d** — federated-round + mesh-inference event integration
  (uses 9.0c). ~1 week.

Total Phase 9.0 progress: ~30% (9.0a + 9.0b are the storage +
UI scaffolding; 9.0c is the bulk of the remaining effort).

## Future polish

- **Background download resume** — Range header retry against
  the orphaned OPFS file.
- **Per-pack signature verification** (in addition to SHA-256).
- **Storage usage panel** showing free/used OPFS + per-install
  bytes.
- **Auto-remove revoked packs** with worker confirmation —
  today's UI surfaces "pack revoked since install" but doesn't
  push the worker to act.
- **i18n** — copy is English-only.
- **Per-device install ledger view** — when 9.0c records
  per-call inference, a "this pack ran 142 inferences in the
  last 7 days" surface would help the worker decide whether to
  keep it.
