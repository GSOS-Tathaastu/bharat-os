# ADR 0128 — Phase 11.9: hero rebrand Earn / Use + in-flow role chooser

Status: Accepted (2026-05-31).
Phase: 11.9 (citizen `/app/` follow-up to Phase 11.8; Earn/Use
direction set 2026-05-31).
Depends on: ADR 0116 (Phase 11 split-hero scaffold), ADR 0127
(Phase 11.8 consent flow), direction memos
`onboarding-hero-earn-use.md` + `provider-vs-worker-identity-split.md`.

## Context

The 2026-05-31 direction discussion flagged that the Phase 11
hero ("I work" / "I live") is too narrow for the actual plan.
Bharat OS isn't just for gig-economy "workers" — the roadmap
includes drivers, cooks, maids, kirana owners, electricians, and
every shape of working-class India. The hero rebrand to "Earn" /
"Use" was decided; this ADR implements it together with an
in-flow role chooser that surfaces all the earning motions
(live + Phase 12 placeholders) the moment a user taps "Earn".

The catch: Phase 12.0's `providerIdentity` substrate isn't
shipped yet. We need the provider roles visible TODAY (so the
investor demo reads the direction immediately and the team has
real targets) without pretending those roles can onboard real
users yet.

## Decision

Pure FE. Zero BE changes.

1. **Hero copy rebrand** in `Onboarding.tsx`:
   - "I work" → "I earn"
   - "Continue as a worker →" → "Continue as an earner →"
   - "I live" → "I use" (kept the same copy block, swapped
     heading + CTA)
   - "Continue as a citizen →" stays (citizen reads better than
     "user" in this context)
   - Footer "developer-shell available" link to /shell/ removed
     per the `/app/-grows-/shell/-retires` direction; replaced
     with "Bharat OS is open-source. Built India-first."

2. **New `frontend/src/lib/earn-roles.ts`** — data catalog of
   earning motions. Each role has `{id, label, icon,
   description}` plus either `targetPath` (live roles) or
   `comingSoonPhase + comingSoonNote` (provider roles). The
   catalog is the single source of truth — the same list will
   drive a future "Add another way to earn" surface on the
   worker home, the docs, and the investor demo.

   v1 catalog:
   - **Live** — `label-data` (→ /labels), `federated-mesh`
     (→ /labs).
   - **Coming Phase 12.0** — `drive-cab`, `cook`, `kirana`,
     `home-help`, `skilled-trades`. Each carries a per-role
     `comingSoonNote` explaining what onboarding will look
     like + the §15 "no commission, no aggregator markup" line.

   `isComingSoonRole(role)` predicate keeps the two states
   separated through the rest of the UI.

3. **Three-step picker flow** on Onboarding:
   - **Step 0**: split-hero — "I earn" vs "I use" tap.
   - **Step 1 (earn side only)**: role chooser sheet — "How do
     you want to earn?" with a grid of role tiles. Live tiles
     are trust-tinted (active hover); coming-soon tiles are
     muted with an orange "Phase 12" badge.
   - **Step 2 (live roles only)**: persona picker sheet, scoped
     to the role's label. Identical to the previous persona
     picker but with role-aware copy ("Pick a persona for Label
     data").
   - **Coming-soon detail sheet** (separate state): when a
     citizen taps a coming-soon tile, instead of disappearing
     they get an honest "ships in Phase 12.0" card with the
     role's onboarding preview + a [← Back to earn options]
     action.

4. **Identity navigation unchanged.** Live roles route to the
   role's `targetPath` (`/labels` or `/labs`) on persona
   selection. The Phase 1 `classifyPersona` heuristic still
   classifies seeded demo personas as worker/citizen — no BE
   change required.

## Why this shape

**Two-button hero, not three.** The user picked "Earn + Use"
over "Earn + Provide + Use" in the direction discussion —
keeps hero simplicity for the investor demo. The earning
motions (micro-task vs provider) live one click deeper in the
role chooser.

**Coming-soon tiles visible from day one.** The role chooser
shows all seven roles even though only two route to live
surfaces. This is deliberate: investors and contributors see
the full intent, the placeholder copy reads as honest roadmap
(not broken UI), and the team has real per-role onboarding
shapes to design against. The orange "Phase 12" badge keeps
expectations honest.

**Data catalog, not embedded JSX.** Roles live in a separate
TypeScript module so the same list can drive:
- The onboarding role chooser (this ADR).
- A future "Add another way to earn" surface on the earner
  home (Phase 12.0+).
- Investor decks / docs that need a current snapshot.
- The provider-side admin surface that approves new providers
  (Phase 12.2).

**Citizen flow untouched.** The Use side of the hero retains
the existing citizen persona picker; no need to redesign a
working surface.

## §15 bindings

- **Honest about scope.** Coming-soon roles are clearly
  labelled and dated (Phase 12.0). No "Sign up to be notified
  later" flow that captures emails for marketing — the
  placeholder is informational only.
- **No commission language already in the data.** Each
  provider role's `comingSoonNote` explicitly states "Bharat
  OS does not take a cut" / "no commission, no aggregator
  markup" — locks the §15 binding into the catalog so any
  future copy refactor preserves it.
- **/shell/ link removed from the footer** per the
  `/app/-grows-/shell/-retires` memory. The dev surface is
  still reachable (typed URL); we just don't advertise it.

## Tests

6 new Vitest cases in `frontend/src/lib/earn-roles.test.ts`:

- Every role has a unique `id`.
- Live roles MUST carry `targetPath`; coming-soon roles MUST
  NOT (catches the easy mistake of pointing a placeholder at
  /worker).
- Every role has icon + label + description.
- Catalog contains both a live entry (`label-data`) and a
  coming-soon entry (`drive-cab`).
- Coming-soon roles all target Phase 12.x (not earlier).
- All five provider roles called out in the direction memo
  (`drive-cab`, `cook`, `kirana`, `home-help`,
  `skilled-trades`) are present — if a refactor accidentally
  drops one, the test fails.

FE Vitest total: 35 → 41 (+6). No new Node tests. Bundle:
main 380 → 384 KB / 116 KB gzipped (+4 KB — catalog + role
chooser sheet + coming-soon sheet). wllama lazy chunk
unchanged. Build 1.45s.

## Consequences

- The hero matches the actual product motion. Drivers, cooks,
  kiranas, maids, skilled trades are visible to anyone landing
  on /app/ — investors see the roadmap, contributors see the
  targets, future provider-side onboarding has a clear
  per-role shape to slot into.
- Live earning paths (Label data, Train AI on-device) are
  cleanly routable from a single chooser, which also lets
  workers add a second motion later via the same UI surface.
- The `EARN_ROLES` catalog becomes the canonical place for
  provider role taxonomy. Phase 12.0's `providerIdentity`
  table will reference these same `id` strings; the catalog
  evolves into the per-role attestation spec.
- No regressed flows — the existing persona picker still works
  for citizens and for active worker personas.

## What's NOT in this sub-phase

- **Real onboarding for any provider role.** The detail sheet
  is honest about Phase 12.0 dependency; no fake KYC flow.
- **Per-role icons beyond emoji.** Quick + clear for v1; a
  designer can replace with custom SVGs later.
- **i18n.** Catalog descriptions are English only;
  Hindi/Marathi/Tamil follow later via i18n.
- **Notify-when-ready email capture.** The direction explicitly
  excluded marketing-style "leave your email" flows on
  coming-soon tiles.
- **Multi-role earner home.** A worker who wants to label data
  AND train federated rounds still uses two tabs. "Add another
  way to earn" UI is Phase 12.0+ polish.
- **Sponsor / Business surface.** "Business" stays reserved
  for sponsor onboarding (MFI / bank / research lab) — not
  built here; lives at a future `/app/sponsor/` route when
  Phase 9.1 sponsor flows graduate from `/shell/`.

ADR 0128.
