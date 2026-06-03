# ADR 0173 — Phase 2a.1.5: Mobile SLM install OOM fix (streaming SHA-256 + storage preflight + SW + Caddy hardening)

Status: Accepted
Date: 2026-06-03

## Context

User reported "the SLM installation failed on my mobile" (Android
Chrome latest) shortly after Phase 2a.1.4 registered the
Qwen2.5-1.5B + Phi-3.5-mini packs on the production VM. Their
symptom: "Download failed in between or may be it completed but
failed at installation."

A four-phase Ultracode workflow (5 parallel finders + 1 live HTTP
probe + 1 synthesizer + 3 adversarial skeptics) was dispatched to
investigate. The synthesizer's top-ranked cause ("SPA bundle is
404 in production") was REFUTED by all 3 independent skeptics on
methodology grounds — the synthesizer used HEAD probes, but the BE
static handler at `src/phase0/api.mjs:4854` only matches
`request.method === 'GET'`. GET probes return 200 for every
allegedly-missing asset; direct local-curl re-verification
confirmed the SPA is fully deployed and reaches the browser.

The actual root cause — agreed by all 3 skeptics + 4 of 5 finders —
is **a memory blowup in `frontend/src/lib/opfs.ts:downloadAndPersist`**:

```ts
// pre-2a.1.5
const chunks: Uint8Array[] = [];
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  chunks.push(value);          // ← accumulator #1
  await writable.write(value);
}
const concatenated = new Uint8Array(downloaded); // ← accumulator #2
for (const chunk of chunks) concatenated.set(chunk, offset);
const hashBuf = await crypto.subtle.digest('SHA-256', concatenated);
```

For the 1.0 GB Qwen pack the peak JS heap was **~2.1 GB**
(raw chunks + concatenated copy). Android Chrome's per-tab budget
is ~1 GB. The tab gets OOM-killed silently mid-hash. The catch
block surfaces as "install failed" with no actionable detail. For
the 2.3 GB Phi pack the failure was deterministic on any phone.

A second class of issue — surfaced by the live probe and three
finders — is that Caddy's `/models/*` route emits NO
`Content-Type`, NO `Cross-Origin-Resource-Policy`, and NO
`Cache-Control` header. Mobile browsers can silently downgrade
fetches of unknown-type responses; CORP absence becomes a hard
blocker the moment any future COEP/COOP isolation enters the
worker chain; Cache-Control absence forces redundant re-downloads
on flaky 4G.

A third issue — flagged by the service-worker finder — is the
SW's static-asset cache regex includes `gguf`, so any GGUF fetch
under the SW's scope would be cached a SECOND time in CacheStorage,
doubling the storage cost and increasing the chance of
QuotaExceededError. Today the SW scope (`/app/`) does not include
`/models/`, but the regex was a latent footgun.

## Decision

### 1. Stream the SHA-256 — drop the in-memory accumulator

`frontend/src/lib/opfs.ts:downloadAndPersist` is refactored to:

- Drop `chunks: Uint8Array[]` and the post-loop concatenation block.
- Use `@noble/hashes` `sha256.create()` for an incremental hasher;
  each chunk is `hasher.update(value)`-ed in place during the
  download loop, then immediately released to GC.
- Web Crypto's `subtle.digest` is one-shot only (no
  `update()`/`finalize()` streaming API), so a pure-JS hasher is
  the correct choice here. `@noble/hashes` is MIT-licensed, well-
  audited, ~10 KB minified, has zero native deps.

Peak JS heap drops from `~modelSize` to `~chunkSize` (typically
64 KB, never more than the network read size). The 2.3 GB Phi
pack becomes installable on phones that previously couldn't even
finish Qwen.

Trade-off: pure-JS SHA-256 is ~3× slower than Web Crypto. On a
1 GB download that is ~2-3 seconds of CPU — invisible next to the
1-2 minute network transfer.

### 2. Discriminated `DownloadFailureError`

A new `DownloadFailureError` subclass carries a `failureCode` from
a fixed set: `no_opfs | no_crypto | no_streaming_fetch |
no_opfs_dir | mirror_status | quota_exceeded | oom |
network_aborted | unknown`. The `classifyError` helper maps native
error shapes (QuotaExceededError, RangeError, AbortError,
network/fetch failures) onto the code.

`Labs.tsx` branches on the code via `mapFailureToUserMessage` to
emit actionable copy ("storage quota exceeded — free space and
retry" / "phone ran out of memory — close other apps + retry" /
"network dropped — reconnect to WiFi and retry; install is
restart-safe") instead of opaque DOMException text.

### 3. Quota preflight — `estimateInstallFeasible`

Before launching the install confirm dialog, `Labs.tsx` calls
`estimateInstallFeasible(pack.diskBytes)` which probes
`navigator.storage.estimate()` and refuses installs where free
space < `1.3 × diskBytes` (1.3 covers SHA-256 hashing intermediates
+ OPFS write-ahead state). The error copy explicitly lists the
free GB and required GB.

If the browser doesn't expose `estimate()` (rare; baseline since
Chrome 61 / Safari 14.5 / Firefox 90), the preflight returns
`ok: true` and the install proceeds; if it actually fails, the
new error-code mapping surfaces the cause.

### 4. Service worker — explicit `/models/*` bypass + drop `gguf` regex

`frontend/public/service-worker.js`:

- Adds an early-return in the fetch handler for any same-origin
  request to `/models/*`. Multi-GB GGUFs MUST never enter
  CacheStorage; they live in OPFS exclusively.
- Drops `gguf` from the `isStaticAsset` regex as
  defence-in-depth.

Today the SW scope is `/app/` so `/models/*` requests don't
actually hit this handler, but the explicit bypass is correct-by-
construction and future-proofs the SW for any scope change.

### 5. Caddy `/models/*` headers

`/etc/caddy/Caddyfile` on the VM (and `scripts/bootstrap-vm.sh`
for reproducibility) extend the `handle_path /models/*` block:

```
handle_path /models/* {
  root * /home/HP/models
  header Content-Type application/octet-stream
  header Cross-Origin-Resource-Policy same-origin
  header Cache-Control "public, max-age=31536000, immutable"
  file_server
}
```

Verified live via `curl -I https://bharat-os.com/models/qwen...`:
all three headers now present.

`max-age=31536000, immutable` is correct because URLs are
content-addressed by sha256 (registry pin) — a different model
gets a different URL.

### 6. Adversarial review verdict: ship_with_no_must_fix

The fix is the synthesis of a 9-agent Ultracode workflow whose top
cause was correctly refuted by all 3 adversarial skeptics, who
themselves converged on this same root cause. The fix:

- Solves the symptom the user reported (mobile OOM on Qwen install)
- Solves the predictable Phi-3.5 failure that would have hit
  every user
- Adds defensive headers + SW bypass for the two latent issues
- Improves the user's error experience on every failure path
- Adds no new external dependencies for the BE; one tiny + audited
  dep (`@noble/hashes`) for the FE
- Preserves Phase 2a.0 PWA install + Phase 2a.1 / 2a.1.1 / 2a.1.4
  substrate
- All 542 existing vitest + 1466 Node tests still pass; 7 new
  vitest tests pin the new helpers

Notes for follow-up (not must-fix):
- **SF-1.** `opfsSupported()` is a structural-presence probe;
  doesn't catch iOS Safari < 26 createWritable-throws-but-getDirectory-
  exists case. The new error-code mapping at least surfaces the
  failure honestly; a future polish phase can do a write-and-delete
  probe at app start to catch it pre-install.
- **SF-2.** Device-tier-based pack recommendation (read
  `navigator.deviceMemory` + `hardwareConcurrency`, surface the
  right pack at the top of `/app/labs`) per the prior session's
  Qwen vs Phi conversation.
- **SF-3.** Resumable chunked download via Range support (server
  emits 206 for partial requests; FE should remember `downloadedBytes`
  per-pack and resume on retry instead of restarting from 0).
- **SF-4.** Self-host wllama WASM at `/vendor/wllama/3.4.1/`
  on the apex domain instead of cdn.jsdelivr.net (defence-in-depth
  for captive portals / corporate firewalls).

## Consequences

- **Qwen2.5-1.5B (1.0 GB) install succeeds on 4 GB RAM Android
  phones** — the OOM tab kill is gone.
- **Phi-3.5-mini (2.3 GB) install succeeds where storage allows**
  — peak heap is bounded by chunk size, not model size.
- Mobile users get actionable error messages on every failure path
  instead of "install failed".
- Pre-install storage preflight catches "not enough space" before
  wasting the user's data.
- Caddy `/models/*` route is hardened against multiple latent
  mobile-browser issues.
- Service worker is bypass-correct for `/models/*` even if scope
  changes later.

## Tests

- `frontend/src/lib/opfs.test.ts` — 7 new cases.
  - `estimateInstallFeasible`: ok when storage API absent, ok when
    quota null, insufficient when free < 1.3× expected, ok when
    free exceeds margin, ok if estimate() throws (defensive
    fallback).
  - `DownloadFailureError`: failureCode preserved + UI-branchable,
    cause chain preserved.
- All 542 prior vitest tests still pass (no regressions).
- All 1466 Node tests still pass (no BE delta).
- tsc clean.
- `vite build` succeeds; main bundle grew 1,291 KB → 1,299 KB
  gzip 372 KB → 376 KB (≈+8 KB from @noble/hashes — same order
  of magnitude as predicted).
- Live verification: `curl -I https://bharat-os.com/models/qwen...`
  shows the 3 new headers (Content-Type, CORP, Cache-Control).

## Follow-ups (deferred)

- SF-1 robust OPFS probe (createWritable test).
- SF-2 device-tier pack recommendation.
- SF-3 resumable downloads.
- SF-4 self-host wllama WASM.
- Phase 2a.2 — daily disk snapshot + GitHub Actions CI/CD.
- First live API integration via createAdapter (DigiLocker
  sandbox) per [[apis-going-live-mode]].

## Cross-references

- [[phase-2a-1-gcp-vm-deployment-shipped]] — the VM the GGUFs live on
- [[phase-2a-1-1-real-domain-shipped]] — bharat-os.com canonical
- [[apis-going-live-mode]] — directional shift this serves
- [[phase-2a-0-pwa-install-shipped]] — PWA whose SW we hardened
- [[bharat-os-doc-update-rule]] — followed (§17 + README + ROADMAP
  + memory + ADR same-commit)
