# ADR 0122: Phase 10.3 — Remaining Task Kinds (Classification / Span / Transcription / Safety)

## Status

**Accepted — shipped 2026-05-31.** Closes the per-task-kind UI gap
opened in Phase 10.2 (preference_pair only). Adds Classification,
Span Annotation, Transcription, and Safety Label renderers on
`/app/labels/`. All four wire through the same backend lifecycle
shipped in 10.1/10.2 — no API or storage changes needed; the
worker just submits opaque `labelValue` shapes the sponsor's
export pipeline already understands. Phase 10.4 (QC pipeline),
10.5 (signed export), 10.6 (SLM pre-labeling hint) remain ahead.

## Context

Phase 10.2 shipped the worker `/app/labels/` surface with a single
hard-coded `<PreferencePairTask>`. The dispatcher rendered an
honest "not supported in /app/ v1" card for the other four task
kinds. That worked as scaffolding but blocks any sponsor whose
data isn't preference-pair-shaped — which is most non-RLHF
labeling work (intent classification, named-entity recognition,
ASR validation, safety triage).

Phase 10.3 fills in the four remaining renderers. Each is a small,
self-contained component under
`frontend/src/components/labeling/`, plugged into the existing
dispatcher.

## Decision

### Dispatcher refactor

`Labels.tsx`'s inline `<TaskRenderer>` becomes a thin lookup
against a module-level map:

```tsx
const TASK_RENDERERS: Record<string, ComponentType<LabelingTaskProps>> = {
  preference_pair: PreferencePairTask,
  classification: ClassificationTask,
  span_annotation: SpanAnnotationTask,
  transcription: TranscriptionTask,
  safety_label: SafetyLabelTask
};
```

`<PreferencePairTask>` was extracted from `Labels.tsx` into its own
file for parity with the four new components. All five live under
`frontend/src/components/labeling/`. Shared `LabelingTaskProps` +
`types.ts` keeps the surface uniform.

### Component-by-component

| Kind | Item body shape | Submission shape | UI |
|---|---|---|---|
| `preference_pair` (unchanged) | `{prompt?, a, b}` | `{choice: 'a' \| 'b' \| 'skip'}` | Two A/B cards, ghost Skip |
| `classification` | `{prompt?, text, options: [{value, label, description?}]}` | `{value: '<option.value>' \| 'skip'}` | Text card + radio cards |
| `span_annotation` | `{text, instruction?, labelKind?}` | `{wordIndices: number[] \| 'skip', labelKind}` | Word-toggle |
| `transcription` | `{audioUrl?, languageHint?, asrPreFill?, instruction?}` | `{transcript: string \| 'skip'}` | `<audio>` + textarea |
| `safety_label` | `{prompt?, text, categories: [{value, label, description?}]}` | `{values: string[] \| 'skip'}` | Multi-select checkboxes |

### Why word-level for span annotation

Character-level drag selection on touch is gnarly cross-platform —
mobile Safari, Chrome Android, and desktop pointer events all
disagree about selection boundaries, especially across mixed
scripts (Devanagari + Latin). Word-level toggling is:

- Reliable on mobile (tap targets are large)
- Accessible by keyboard tab + space/enter
- Honest about precision (sponsors get word indices, not
  character ranges)
- Sufficient for the most common span tasks (named entity, intent,
  loan-amount extraction)

When character-level precision is needed (medical transcription,
PII extraction), it can ship as a v2 task kind without
disturbing this v1 spec.

### Audio handling in transcription

The browser `<audio>` element handles every format Chrome / Edge
/ Firefox / Safari support natively (MP3, OGG, OPUS, WAV). When
`audioUrl` is missing OR loading fails (404, CORS, codec), the
component renders an honest *"No audio attached / could not load"*
message and the textarea stays usable. Workers can still
transcribe from memory if they heard the clip elsewhere, or skip.

The seed-demo intentionally omits `audioUrl` for the transcription
items — Bharat OS doesn't host public audio in v1. Sponsors hosting
real audio (e.g., on S3 / R2 / Bharat OS's own future blob store)
fill in the URL. The ASR pre-fill exists so workers see something
to edit even without the audio.

### Indic ASR auto-fill

Phase 2a.5 ships Indic Whisper in `/shell/`. Phase 10.3
intentionally **doesn't** wire it into the transcription task
because:

- Loading Whisper-WASM costs ~50-100 MB; doing it for every
  transcription session is wasteful
- `body.asrPreFill` from the sponsor is already enough — sponsors
  pre-process their audio with their own ASR pipeline (or
  Bharat OS's, via a future `/api/transcription/preprocess`
  endpoint)
- Worker-side ASR + edit becomes a Phase 10.6 polish (the same
  ship that adds SLM pre-labeling hints)

### Safety label multi-select

The component uses a `Set<string>` for picked categories with
explicit `[Mark as safe]` action when nothing is picked (so "no
harm" is an honest positive choice, not an absence of action).
This is intentional UX:

- Forces workers to engage with the safe-vs-harm decision
- Captures "I considered it and concluded safe" in the submission
  payload (`{values: []}` is distinct from no submission)
- Phase 10.4 QC can compute inter-annotator α across this
  multi-label space

### Span annotation — Clear action

A `[Clear]` secondary action complements the word-toggle for
workers who want to start over without skipping. Submit is
disabled when zero words are selected; Skip is always available.

### Backend changes — none

Items are stored opaquely as `body` JSON; submissions are stored
opaquely as `labelValue` JSON. Phase 10.1/10.2 already accept
any shape. The only thing each task kind needs from the BE is
the matching `taskKind` string on the job — which the existing
`createLabelingJob` validator already enforces (rejects
`reasoning_trace` etc).

This means **Phase 10.3 ships ZERO new BE code**. Pure FE.

### File layout

```
frontend/src/components/labeling/
├── types.ts                    ← shared LabelingTaskProps
├── PreferencePairTask.tsx      ← extracted from Labels.tsx
├── ClassificationTask.tsx
├── SpanAnnotationTask.tsx
├── TranscriptionTask.tsx
└── SafetyLabelTask.tsx
```

Each component is 90-150 lines, self-contained, and uses the
existing `<Card>`, `<Action>`, `<Field>` primitives. Zero new
deps.

### seed-demo extension

Four new active jobs under the existing Pragati Microfinance
sponsor — one per new kind, two items each, all Hindi-language:

1. **classification** — *"Classify loan-applicant intent (Hindi)"*
   with 4 options (business / personal / home / unclear)
2. **span_annotation** — *"Highlight the words that name the loan
   amount"* with mixed-script Devanagari + Latin samples
3. **transcription** — *"Transcribe the customer call in Hindi"*
   with ASR pre-fills (no audio URL — honest v1 demo posture)
4. **safety_label** — *"Flag harmful content"* with 4 categories
   (threat / harassment / self-harm / safe); per-label rate raised
   to ₹5 since safety is higher-cognitive-load

Sponsor escrow is topped up by ₹100 before locking the four jobs
(total cost ≈ ₹36 for 8 items across the kinds; ample headroom).

On a fresh seed, `/app/labels/` now shows **five active jobs**
across all five task kinds.

## §15 bindings preserved

| Binding | Resolution |
|---|---|
| All task UIs honest about source | Sponsor's prompt / text / instruction rendered verbatim; React `{value}` interpolation, no `dangerouslySetInnerHTML` |
| Sponsor never sees raw worker identity | Same as 10.2 — worker auth via workerId param; sponsor export (10.5) will rotate identityHash |
| Skip is always available | Every task kind has an explicit `'skip'` submission value so workers can opt out per-item without disengaging from the job entirely |
| Multi-select honesty | Safety task makes "no harm" an explicit positive choice (`[Mark as safe]`), not silent absence |
| Word-level honesty | Span annotation submits word INDICES not character ranges — sponsors know exactly what precision they're paying for |
| Audio failure graceful | Transcription component renders an honest failure message when audio doesn't load; worker can still submit a remembered transcript or skip |
| No silent UI defaults | Every task starts with empty state; worker must engage to submit. No pre-checked options. |
| Server-side opacity preserved | Every label shape is server-opaque JSON; submission validators don't peek into shape — sponsor owns the schema for their export consumer |

## Tests

- **FE**: 16/16 Vitest still passing. New components are render-
  shape-only — pure functions of props + local state, no async
  flows. Component-level tests via Vitest could be added; deferred
  to a polish ship since the dispatcher integration is exercised
  by the existing Labels test target indirectly.
- **BE**: 0 new tests. The Phase 10.1 lifecycle tests already
  exercise the opaque-`labelValue` contract.
- **Spot-check on related suites** (labeling-job + sponsor +
  mesh-contribution): 46/46 pass.
- **Bundle**: main 352 → **359 KB / 110 KB gzipped** (+7 KB for
  four new task components). wllama lazy chunk unchanged at
  292 KB / 126 KB gzipped. Build 1.42s.
- **seed-demo runs clean**: 5 labeling jobs land on a fresh seed
  with sponsor escrow correctly locked across all four new jobs.

## Consequences

- **All 5 task kinds are now first-class on `/app/labels/`.** Any
  sponsor whose data fits one of these five shapes can launch a
  job and have workers fulfill it without writing custom UI or
  asking workers to use `/shell/`.
- **Labeling-marketplace v1 is feature-complete.** Phase 10.4 (QC)
  + 10.5 (signed export) + 10.6 (SLM pre-labeling hint) are
  enhancement layers on this surface, not gaps.
- **Pattern established for v2 task kinds.** Add a component under
  `frontend/src/components/labeling/` + register it in the
  dispatcher map; the BE doesn't need to know. Future kinds
  (ranking, A/B/C/multi-comparison, freeform text rewrite,
  bounding-box image annotation when 10.7+ adds modality:image)
  follow the same pattern.
- **Bundle still well under target.** 110 KB gzipped main with
  the runtime lazy at 126 KB. Headroom for Phase 10.4/10.5/10.6
  work without code-splitting.
- **Demo is investor-impressive.** Open `/app/labels/` on a fresh
  seed and the worker has 5 labeling jobs across all 5 task kinds
  to demonstrate — each with realistic Indic content.

## What's NOT in this sub-phase

- **Indic ASR auto-fill in transcription** — Phase 10.6 polish
  (alongside SLM pre-labeling)
- **Character-level span selection** — kept word-level for v1;
  character-level can ship as a separate task kind (e.g.,
  `span_annotation_precise`) when a medical / PII sponsor needs
  it
- **Image / bounding box annotation** — Phase 10.7+ when modality:
  image flows through
- **Voice recording task (worker speaks, sponsor consumes audio)**
  — separate ship; needs MediaRecorder API + upload route
- **Component-level Vitest tests** — render-shape-only components,
  deferred to polish
- **Refund on job close / cancel** — Phase 10.1.1 still pending;
  reuses Phase 9.1 `refundLockedEscrow` helper

## Future polish

- Component-level Vitest tests for each task kind
- Indic ASR auto-fill in TranscriptionTask (Phase 10.6 hook)
- SLM pre-labeling hints in ClassificationTask + PreferencePairTask
  (Phase 10.6 hook; tap "Suggest" → installed Phi-3-mini answers →
  worker accepts/edits → submits)
- Character-level span selection as a separate `span_annotation_
  precise` task kind
- Image / bounding-box annotation (modality: image)
- Voice-recording task (worker speaks, sponsor consumes audio)
- Per-worker rate-limit hooks (prevent fraud / fatigue gaming)
- Confidence rating: worker indicates how sure they are per label
  (`{value: 'business_loan', confidence: 0.8}`)
- Saved drafts mid-session so workers can pause without losing
  state
- Keyboard shortcuts (1/2/3 keys for option selection)
- Animated transitions between items (Framer Motion polish ship)
