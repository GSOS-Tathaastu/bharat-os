# ADR 0156 — Phase 13.4: SLM-H skill-agent substrate + electricity bill explainer

Status: Accepted
Date: 2026-06-02

## Context

The SLM USP arc was complete through E/F/G after Phase 13.0.2
(ADR 0155), with **H — On-device skill agents for Indian tasks**
the last open SLM USP item per the
[[phase-12-13-sequencing-set]] memory. A "skill agent" is a
tightly-scoped on-device agent that composes existing SLM
substrates (intent parser / doc summariser / PII redactor /
personalization) with a skill-specific prompt template +
structured-output parser, producing concrete actionable guidance
for one Indian paperwork-class task (electricity bill /
consumer complaint / PM-KISAN scheme).

This phase ships the substrate + the first concrete skill
(electricity bill explainer). Subsequent skills land in
13.4.1/13.4.2/… as separate sub-phases under this ADR's
substrate.

## Decision

Ship Phase 13.4 as substrate + ONE concrete skill (electricity
bill explainer), wired into /labs as a sibling of
DocSummariserPanel. Composition is the demo: the SLM-E
doc-summary output (already shipped, Phase 13.0/13.0.1/13.0.2)
flows through a small in-memory bridge into the SkillAgentPanel
which runs the explainer on the same wllama runtime and renders
TARIFF / DEVIATION / EXPECTED RANGE / ACTIONS chips.

### 1. BE registry (admin-curated metadata)

`src/phase1/skill-agent.mjs` — registry validator mirroring the
Phase 9.0a SLM model-pack pattern. Protocol pinned:
`SKILL_AGENT_PROTOCOL_VERSION = 'bos.phase13.skill-agent.v1'`.

- **Strict allowlist** on top-level registry keys
  (`PERMITTED_SKILL_AGENT_KEYS`) — mirrors the Phase 13.2
  piiRedaction + Phase 13.0.2 doc-summary-envelope posture.
- `SKILL_AGENT_CATEGORIES = ['utility_bill_explainer',
  'consumer_complaint_drafter', 'government_scheme_status']`.
- `SKILL_AGENT_SUPPORTED_DOC_KINDS` mirrors the FE DocKind union
  (convergence test asserts set-equality at runtime).
- `FORBIDDEN_REGISTRY_SUBSTRINGS` — single source of truth for
  the JSON-grep defence-in-depth; same SF-2 posture as ADR 0155.
- Content-addressed `skillId` via sha256 of the canonical input
  payload. Re-registering the same seed is a no-op.
- Soft-delete via `revokeSkillAgent`; admin POST + DELETE under
  `/api/admin/skill-agents` (5.7-token-gated).
- `filterSkillAgentsByPackFamily` for FE narrowing.

`src/phase1/skill-agent-seed.mjs` — built-in canonical seed list.
v1 has one entry: electricity_bill_explainer. Boot-time loader in
`createPhase0ApiServer` registers idempotently on first request
(promise sentinel for concurrent-request safety).

`src/phase0/store.mjs` + `src/phase0/sqlite-store.mjs` —
`saveSkillAgent` / `readSkillAgent` / `listSkillAgents`. Ledger
events `skill_agent.registered` / `.revoked` carry pointer +
meta only (NEVER the FE prompt body — that ships in the FE
bundle).

`src/phase0/api.mjs` — public read at
`GET /api/skill-agents` (with `?activeOnly` + `?installedFamilies`
filters) and `GET /api/skill-agents/:skillId`.

### 2. FE substrate

`frontend/src/lib/skill-agent.ts` — shared substrate. Pinned
protocol; frozen `SKILL_AGENT_CATEGORIES` and
`SKILL_ACTION_VERBS` (8 entries with `ACTION_LABEL` mappings —
file dispute / request meter recheck / switch tariff plan / pay
via UPI / check subsidy / compare with neighbours / archive /
flag for review). `parseSkillBaseFields` shared parser for the
HEADLINE / ASSESSMENT / CONFIDENCE / RISK_FLAG / ACTIONS prefix
every skill emits.

`frontend/src/lib/skills/electricity-bill-explainer.ts` — first
concrete skill. Composes SLM-E doc-summary output (title / TLDR
/ bullets) as input; emits TARIFF_TIER (6-way enum) +
EXPECTED_RANGE (paise, with min ≤ max guard) + DEVIATION_FLAG
(under / on / over / far-over) on top of the base fields.
Hard-coded 6 tier-guidance bands in the prompt as informational
context, not adjudication. Action vocabulary tightly scoped to
the FIXED `SKILL_ACTION_VERBS` allowlist; drift coerces to safe
defaults at parser layer.

`frontend/src/lib/use-slm-skill-agent.ts` — generic hook over a
`SkillDefinition<TInput, TFields>`, same shape +
binding-equivalent posture as `useSlmDocSummariser` (shared
wllama via Phase 13.0.0a runtime, per-input rate limit
2/60s + global 6/5min, `running` / `cooling-down` / `error`
statuses, citizen-safe generic error message, no-no_blob branch).

`frontend/src/lib/last-doc-summary-bridge.ts` — tiny zustand
in-memory store. DocSummariserPanel publishes the last
successful parse; SkillAgentPanel reads via owner-gated
accessor (snapshot.ownerIdentityId must match the consumer's
identityId). No localStorage / sessionStorage — citizen B
opening the same tab after A signs out sees no cleartext bytes
even before the panel remounts.

`frontend/src/lib/hooks.ts` — `useSkillAgentsCatalog` React
Query hook on `/api/skill-agents`.

### 3. FE surface

`frontend/src/components/SkillAgentPanel.tsx` — mounted on /labs
next to DocSummariserPanel, keyed on `skill-<identityId>` so
identity flip remounts. Honest empty state when no SLM
installed OR no recent summary OR last summary is not
electricity_bill (the v1 supported kind). After successful run,
renders RISK + DEVIATION + TARIFF + CONFIDENCE badges with
expected-range numeric chip and a list of action steps drawn
from the citizen-readable `ACTION_LABEL` map.

`frontend/src/components/DocSummariserPanel.tsx` — extended to
publish `{ownerIdentityId, docKind, parsed, capturedAt}` to the
bridge on successful parse; clears the bridge on Try Sample /
Clear / docKind pill change.

`frontend/src/routes/Labs.tsx` — `<SkillAgentPanel
key={'skill-' + identity?.id} identityId={identity?.id} />`
added below DocSummariserPanel.

### 4. Adversarial review applied in-phase

Privacy / UX / edge-case 3-lens pass. Verdict: **ship_with
_fixes** — 0 must-fix, 3 should-fix applied:

- **SF-1** — docKind pill change in DocSummariserPanel now
  clears the SLM-H bridge. Without this, switching pill from
  electricity_bill to insurance left the stale electricity_bill
  snapshot on the bridge, and SkillAgentPanel kept the chip
  block alive over a summary the user had moved on from.
- **SF-3** — boot-time skill-agent seed sentinel resets on a
  request that fails to land any rows (lets the next request
  retry). A transient filesystem error on first boot would
  otherwise pin the catalog at empty for the server's lifetime.
- **SF-4** — synchronous `runningRef` guard in
  `SkillAgentPanel.handleRun`, mirrors the Phase 13.0.2 MF-2
  pattern: the disabled-button check catches re-renders but a
  same-tick double click can still arrive twice; the ref flips
  before any state write so the second call short-circuits.

Deferred (acceptable for v1):
- Bridge clear on identity flip (panel remount already handles
  the user-visible path; in-memory leak inside zustand state
  after sign-out is symmetric to the doc-summariser's own
  `lastResult` state and the underlying wllama WASM memory).
- Tier hint hardcoded to `domestic_mid` — future phase wires a
  Settings field.
- Action verbs are informational labels only; tapping a
  suggested action does NOT yet launch the action. Wiring lands
  in a future 13.4.x.

## Why this isn't FE-only like 13.3

Unlike personalization (Phase 13.3 / ADR 0153) where a BE
endpoint would have falsified the "preferences never leave
device" pitch beat, skill-agent metadata is a legitimate
catalog item — multiple devices owned by the same citizen need
to see the same available skills, and operator revocation of a
bad-prompt skill must propagate across the network. The
**registry record carries pointers only** — the FE prompt body
ships in the FE bundle and never crosses into a BE row. This
preserves the on-device pitch (the actual prompt + completion
flow runs in wllama only) while letting the BE serve a
discovery surface.

## Consequences

- The SLM-H arc gets its first concrete skill + the substrate
  that future skills compose. 13.4.1 (consumer complaint
  drafter) and 13.4.2 (PM-KISAN status) become surface-only
  follow-ups: add a FE skill file + a seed entry, no new BE
  substrate changes.
- The FE skill-agent substrate is generic over
  `SkillDefinition<TInput, TFields>` — future skills do NOT need
  to fork the hook.
- The bridge pattern (`last-doc-summary-bridge.ts`) is reusable
  for any cross-panel SLM-output composition without prop
  drilling.

## Tests

- `tests/node/skill-agent.test.mjs` — 26 cases. Pure registry
  validator (allowlist, content-derived skillId, soft-delete),
  FE↔BE convergence (reads FE source to assert categories +
  docKind union match), seed list sanity, HTTP integration
  (seed-populated catalog, activeOnly filter, per-skill GET,
  idempotent re-seeding).
- `frontend/src/lib/skill-agent.test.ts` — 12 cases. Protocol
  pin, frozen-constants, `parseSkillBaseFields` happy path +
  missing-headline null + drift coercion + action dedup + cap
  enforcement + clip + CRLF + clamp.
- `frontend/src/lib/skills/electricity-bill-explainer.test.ts`
  — 19 cases. SkillDefinition shape, byte-stable prompt
  for the sample input, profile-fragment injection above the
  role line, byte-equal at empty fragment, parser happy path
  + drift coercion (TARIFF / DEVIATION) + min/max swap on
  inversion + range cap at 100k₹ + negative-as-0 + missing
  HEADLINE null + tariff fallback.
- Full sweep at commit time: 419 vitest + 1282 Node + tsc clean.

## Follow-ups (deferred to 13.4.x)

- **13.4.1** — Consumer complaint drafter skill (consumer
  protection act draft + ODR / consumerhelpline.gov.in route).
- **13.4.2** — PM-KISAN status checker skill (installment date /
  beneficiary status / eligibility check).
- **13.4.3** — Wire action verbs to real next-step launchers
  (UPI app deep-link / consumer-forum URL / discom website).
- Bridge clear on identity flip (full sign-out cleanup).
- Tier-hint setting on /settings.
