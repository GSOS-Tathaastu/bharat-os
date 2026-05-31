# ADR 0125 — Phase 10.6: SLM pre-labeling hint for labeling tasks

Status: Accepted (2026-05-31).
Phase: 10.6 (labeling marketplace v1, runtime integration).
Depends on: ADR 0114 (Phase 9.0c llama.cpp-wasm runtime), ADR 0113
(Phase 9.0b per-identity install records), ADR 0121 (Phase 10.1
+10.2 labeling marketplace v1), ADR 0122 (Phase 10.3 all 5 task
kinds).

## Context

The labeling marketplace's first-order bottleneck is worker
throughput: how many items per hour can a worker label without
fatigue? At ₹3-5 per label, a worker has to push ~150 labels/hour
to earn a meaningful daily wage. Reading the prompt, considering
the options, tapping the answer — even at ~10s/item that's only
360 items/hour. Halving the time-per-label doubles take-home pay.

The Phase 9.0c runtime ships a Phi-3-mini-class SLM running in
WebAssembly on the worker's own device. The Labs page already
exposes a `<SlmTryPrompt>` surface that wires the runtime end-to-
end (lazy-load → generate → bill mesh-inference event). The
labeling tasks have a strict structure (item body + categories /
options / text) that fits an SLM prompt template perfectly.

Phase 10.6 wires the two together: a "Suggest a label with your
on-device SLM" card surfaces above every task; the worker taps it
to get a pre-fill; they accept or edit; submit goes through the
existing pipeline. Workers without an installed SLM see nothing
new — the card hides itself.

## Decision

Ship a pure FE feature with zero BE changes. Specifically:

1. **`frontend/src/lib/labeling-slm-hint.ts`** (pure module) —
   `buildHintPrompt(taskKind, body)` returns a prompt string per
   task kind (classification, preference_pair, span_annotation,
   transcription, safety_label), or `null` for malformed bodies.
   `parseHintCompletion(taskKind, body, completion)` parses the
   SLM's free-form text back into a typed `labelValue` matching
   the shape the task would submit by hand, or `null` if parsing
   fails. `HINT_MAX_TOKENS` (96) and `HINT_TEMPERATURE` (0.3)
   exported as defaults — small enough to stay fast on Phi-3-mini
   (~3-5s on a mid-range Android), large enough for the longest
   expected answer (a re-cleaned transcription).

2. **`frontend/src/components/labeling/SlmHintCard.tsx`** — gated
   on `useInstalledSlms(identityId).data?.[0]`. Returns `null`
   when no SLM is installed (clean degradation — no broken
   button). Lazy-loads the runtime on first tap (reuses
   `loadSlmRuntime` + `readSlmBlob` from Labs); generates with
   `onToken` streaming the partial completion so the worker sees
   progress; runs `parseHintCompletion` to convert to a typed
   labelValue. UI: trust-toned card with [Suggest a label] /
   [Suggest again] action + a [Use this suggestion] action that
   appears only after parsing succeeds + a `<pre>` showing the
   raw model output below so the worker can sanity-check it +
   honest error states for OPFS-miss / runtime-load-fail /
   parse-fail. Resets the suggestion when the item changes
   (`useEffect` on `item.itemId`). Cleans up the WASM runtime on
   unmount (`useEffect` cleanup).

3. **Wired into `Labels.tsx`** above the task renderer with the
   same `onAccept` / `onSubmit` signature, so accepting an SLM
   suggestion flows through the existing submit pipeline (golden-
   set check, sponsor-review sampling, mesh credit, escrow
   debit). No special case needed server-side.

## §15 bindings the design enforces

- **On-device only.** Prompt + completion stay in WASM in the
  browser. The only thing that leaves the device is the eventual
  `labelValue` the worker chose to submit — same shape and
  semantics as a hand-authored label. Server cannot distinguish
  SLM-suggested from hand-authored.
- **No auto-submit.** The card never calls `onAccept` without an
  explicit worker tap. The suggestion is always shown first.
- **Suggestion is editable.** Workers can [Suggest again] for a
  different temperature draw or ignore the suggestion and label
  by hand. The task renderer below is fully functional regardless.
- **Honest about uncertainty.** When `parseHintCompletion`
  returns null (SLM produced unparseable text), the card shows
  the raw output + an error message and leaves the [Use this
  suggestion] button hidden — workers cannot accidentally submit
  garbage.
- **Mesh credit is for actual labels.** No mesh-inference event
  is recorded for hint generation — the Labs `<SlmTryPrompt>`
  pays per prompt, but the labeling hint is per item and would
  inflate worker earnings beyond what sponsors paid for. Workers
  earn the per-label payout when they submit, not when they
  consult the SLM. Future polish (10.6.1) could attribute a
  small inference event for the hint, but v1 keeps the
  accounting clean.

## Prompt template choices

Each task kind got a single template tuned to give the SLM the
best chance of producing parseable output:

- **classification** — lists options as `value: label
  (description)` lines and asks for "the option value ONLY".
  Parser tolerates extra words via substring match on value
  first, label second.
- **preference_pair** — shows both responses; asks for "a" or
  "b" only. Parser uses a `\b(a|b)\b` boundary match (avoids
  matching "and"/"because").
- **span_annotation** — enumerates each word with its index
  (`0: I`, `1: need`, `2: 50000`, ...). Asks for comma-
  separated indices or "none". Parser extracts every plausible
  integer in range, sorts ascending, falls back to empty set
  on "none".
- **transcription** — only fires when sponsor provided an
  `asrPreFill` (the SLM cannot do speech-to-text from the
  audio URL alone). Asks for a corrected transcript, single-
  string parser strips quotes.
- **safety_label** — lists categories; asks for applicable
  category values or "safe". Parser short-circuits on "safe"
  (returns empty array — explicit "no harm" choice from Phase
  10.3); otherwise scans for category values + labels.

All templates default to a `temperature: 0.3` low-creativity draw
so parses are stable.

## Why pure FE

- The §15 binding "prompt + completion stay on-device" demands
  no server involvement. Sending the body to the server to
  pre-render a prompt template would weaken pointer-not-payload
  pointlessly.
- The Phase 9.0c runtime is FE-only by construction (WASM in the
  browser). The hint feature is a thin glue layer between it
  and the existing labeling UI.
- Zero new BE risk. The submit path is unchanged; the same
  validations apply whether the labelValue came from a human or
  an SLM.

## What's NOT in this sub-phase

- **Per-task-kind UI annotations.** The hint card sits above the
  task renderer. Future polish (10.6.1) could push the
  suggestion *into* the task UI (highlight the suggested option,
  pre-fill the span words, pre-fill the textarea) for a smoother
  flow.
- **Mesh-inference attribution.** Workers don't earn paise for
  consulting the SLM on a labeling task. v1 accepts the small
  unfairness in exchange for clean accounting.
- **Multi-model selection.** Worker uses the first installed
  SLM. If they have multiple, no UI lets them pick. 10.6.1
  polish — uncommon scenario in v1.
- **Hint quality telemetry.** No tracking of accept-rate per
  task kind. The signal would be useful for tuning templates
  but requires a per-action ledger event the design intentionally
  avoids (would expose hint usage to the sponsor).
- **Hint determinism via fixed seed.** Wllama doesn't expose a
  seed API; suggestions vary between [Suggest again] taps. Fine
  for v1.

## Consequences

- Labeling marketplace v1 is feature-complete. Phase 10.0 → 10.6
  shipped. Remaining 10.x items are polish (10.4.1 inter-
  annotator α, 10.5.1 audit signer rotation, 10.5.2 sponsor
  console download UI, 10.5.3 premium-job UI gating, 10.1.1
  cancel + refund route).
- Workers with an SLM installed get a ~2-3× throughput boost on
  the tasks the SLM handles well (classification, preference,
  safety_label). Marginal on span (Phi-3-mini struggles with
  exact word indices) and transcription (only useful when
  sponsor pre-filled).
- Pattern proven for Phase 12+ "AI-native OS" surfaces: any UI
  with structured input can be SLM-prompted on-device using the
  same `buildPrompt / parseCompletion` shape.
- Bundle main 363 → 369 KB / 112 KB gzipped (+6 KB for the hint
  module + SlmHintCard component). wllama lazy chunk unchanged
  292 KB / 126 KB gzipped (the hint card reuses the same dynamic
  import).

## Tests

16 Vitest cases in
[frontend/src/lib/labeling-slm-hint.test.ts](../../frontend/src/lib/labeling-slm-hint.test.ts):

- 6 `buildHintPrompt`: classification renders option values +
  question; preference_pair renders both responses; span lists
  indices; transcription returns null without pre-fill; safety
  lists categories; malformed bodies return null.
- 10 `parseHintCompletion`: classification value match + label
  fallback + null on no match; preference_pair "a"/"b" extraction
  + word-boundary; span indices + "none" + out-of-range drop;
  transcription quote-strip + whitespace-null; safety multi-
  category + "safe" empty-array.

FE Vitest total: 16 → 32 (+16). No new Node tests (zero BE
changes). Node suite spot-check 207/207 on batch 2/5.

Build clean: main 369 KB / 112 KB gzipped (+6 KB vs 10.5);
wllama lazy chunk unchanged 292 KB / 126 KB gzipped; Vite build
1.56s.
