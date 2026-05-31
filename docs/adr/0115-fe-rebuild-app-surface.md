# ADR 0115: Frontend Rebuild — `/app/` Surface with Vite + React + Tailwind

## Status

**Accepted — direction set 2026-05-27.** Implementation begins next
session. **Pauses Phase 9.0c** (llama.cpp-wasm runtime, ADR 0114 not
yet drafted) until `/app/` v1 ships. Does NOT pause any in-flight
backend work that ALSO ships its own FE surface per the [[fe-be-
parity-rule]] (Phase 9.0d, 9.1, 10.0 will resume after `/app/`
lands with the new rule binding both layers together).

## Context

The existing `/shell/` accumulated **4,811 lines of vanilla JavaScript
and 1,062 lines of HTML** across Phases 1.0 → 9.0b. Every phase
added a card. The shell tried to be:

- a worker dashboard (mesh ticker, cash-out, earnings log)
- a citizen orchestration interface (intent → policy → outcome)
- a verifier read surface (Trust Passport, MFI consent share)
- a settings panel (notifications, language, identity management)
- a labs / advanced features tray (SLM install, federated rounds,
  OCR, voice runtime, TTS runtime)
- a first-run wizard with three nested flows (new identity, migrate,
  demo persona)

On 2026-05-27 the founder opened the demo cold and **could not get
past the "No profile" wall**. The first-run wizard's auto-show logic
existed but did not fire visibly. A debugging session of ~1 hour
across multiple turns failed to identify a single root cause —
because there isn't one. The shell is structurally incoherent: it
has no editorial discipline about what belongs on which surface.

The decision: stop polishing the shell, rebuild the user-facing
layer from scratch with discipline, leave the shell as a developer
surface, and bind FE+BE to ship together for all future phases.

## Decision

### Stack

- **Vite 5+** dev server + static build pipeline
- **React 19** with **TypeScript** as the component framework
- **Tailwind CSS** for the design system (custom theme with Bharat
  OS tokens)
- **shadcn/ui** as the starting component library (copy-paste
  components, not an npm dependency — preserves auditable-code
  posture)
- **Zustand** for client state (replaces the global `state` object)
- **TanStack Query** for API state + caching (replaces ad-hoc
  `fetchJson` + manual refetching)
- **React Router v7** for the persona-surface routing
- **Vitest** for component / hook tests (replaces "no automated
  browser tests" pattern with a real test surface for the FE)

**This is the first significant npm dependency surface for Bharat
OS frontend.** The backend's zero-npm-dep posture is preserved —
`bin/bos-api.mjs` and `src/` continue to import only Node stdlib.
The `/app/` build is a static bundle that the existing API serves
from `public/app/build/`.

### Surfaces

Four routes under `/app/`:

| Route | Purpose | Persona | Status |
|---|---|---|---|
| `/app/` | Split-hero onboarding | First-time visitor | NEW |
| `/app/worker/` | Mesh earn → cash-out → trust passport | Priya / Suresh / Rajesh | NEW |
| `/app/citizen/` | Voice/text intent → orchestrate → recent | Sita / Lakshmi / Anjali / Aarav | NEW |
| `/app/verify/` | Open share URL → render signed bundle | MFI / kirana / hotel | adapted from existing `/verify/` |
| `/app/labs/` | SLM install, federated rounds, OCR | (anyone) | NEW |
| `/app/settings/` | Identity, language, notifications, recovery | (anyone) | NEW |

Existing `/shell/` route stays at the same URL with no code changes
— it's the developer surface. `/console/` (operator) stays
untouched.

### Design system (locked)

**Colour tokens** (tricolour-inspired, flag-grade):

```
background     #FFFFFF   white surface
surface        #FAFAFA   near-white cards
primary        #FF9933   flag-grade saffron — actions, brand
trust          #138808   flag-grade green — verified, success
governance     #000080   navy — regulated / policy-gated flows
text           #1A1A1A   charcoal — body
text-muted     #6B7280   muted gray — captions
border         #E5E7EB   light gray — dividers
error          #DC2626   red — destructive
warning        #F59E0B   amber — caution
```

**Discipline rule**: flag colors are ACCENTS, not splashes. The
surface is white. Saffron appears as primary buttons + brand mark
only. Green for verified-state badges + cash-out confirmation only.
Navy reserved for policy / regulated flows. **Must not look like a
government app** — keep generous whitespace, modern typography, no
shapes-inside-shapes.

**Typography**:
- Headings: **Manrope** (clean, geometric, free, Indian-friendly)
- Vernacular (Hindi / Marathi / Tamil / Bengali): **Noto Sans
  Devanagari**, **Noto Sans Tamil**, **Noto Sans Bengali**
  (Google Fonts, locale-matched, switched at runtime)
- Monospace: **JetBrains Mono** (for share URLs, hashes, technical
  evidence display)
- Sizes: `12 / 14 / 16 / 20 / 28 / 36` (px). No other sizes.
- Weights: `400` regular, `600` semibold. No other weights.

**Spacing scale**: `4 / 8 / 12 / 16 / 24 / 32 / 48` (px). No other
values.

**Border radius**: `6 / 12 / 18` (px). Cards = 12, sheets = 18,
buttons = 6.

### Component library (initial set)

Built first, before any feature work:

- `<Hero>` — page-top headline + subtitle + primary action; has a
  `split` variant for the onboarding screen
- `<Card>` — surface container with title + body + actions slots
- `<Action>` — primary button (saffron). Variants: `default`,
  `secondary` (outline), `trust` (green), `governance` (navy),
  `destructive` (red), `ghost` (link-style)
- `<Badge>` — status pill. Variants: `trust`, `pending`, `warning`,
  `error`, `neutral`
- `<Sheet>` — modal bottom-sheet on mobile, side-sheet on desktop
- `<Tab>` — bottom-nav (mobile) / top-tab (desktop). Auto-switches
  layout by viewport
- `<Toast>` — top-right notification
- `<Identity>` — avatar circle + name + meta line. Used in
  switcher + headers
- `<Field>` — labelled input with helper text + error state
- `<Money>` — formatted ₹ with Indian numbering (₹50,000 / ₹1,00,000)
- `<Stat>` — large number + label + optional delta
- `<Evidence>` — collapsible technical-detail panel (signed hash,
  audit ledger reference, integrity proof) — for the "Show technical
  details" surface

Everything else composes from these.

### Onboarding (the critical fix)

1. Land on `/app/` → **split-hero** with two big cards:

```
┌───────────────────────────────────────────────┐
│  ⚒  Bharat OS                                  │
│                                                │
│  Your phone. Your identity. Your data.         │
│                                                │
│  ┌───────────────┐    ┌───────────────┐       │
│  │  ⚒            │    │  ✿            │       │
│  │  I work       │    │  I live       │       │
│  │               │    │               │       │
│  │  Earn from    │    │  Replace the  │       │
│  │  your phone.  │    │  10 apps on   │       │
│  │  UPI, not     │    │  your phone   │       │
│  │  crypto.      │    │  with one.    │       │
│  │               │    │               │       │
│  │  [Continue]   │    │  [Continue]   │       │
│  └───────────────┘    └───────────────┘       │
│                                                │
│  Already on Bharat OS?  Sign in →             │
└───────────────────────────────────────────────┘
```

2. Tap "I work" → persona picker showing Priya / Suresh / Rajesh as
   cards with name + role + brief background.
3. Tap "I live" → persona picker showing Sita / Lakshmi / Anjali /
   Aarav as cards.
4. Selected persona stored under `bharat-os.app.deviceOwnerId`
   (distinct localStorage key from `/shell/`'s
   `bharat-os.shell.deviceOwnerId` so the two surfaces never
   conflict).
5. Redirect to `/app/worker/` or `/app/citizen/`.
6. Persona switcher pinned to top-right on every page after.

**No "create new identity" flow in v1** — investors don't need that
path, and creating a real Bharat OS identity is a multi-step crypto
ceremony that distracts from the demo. The demo personas are seeded
via `scripts/seed-demo.mjs` and that's enough.

### State management

Three Zustand stores (small + composable):

- `useIdentityStore` — active identity, identities list, switcher
  state
- `useEarnStore` — mesh balance, monthly summary, withdrawals,
  earnings log
- `useTrustStore` — Trust Passport, MFI consents, attestations

API calls go through TanStack Query hooks (`useIdentities()`,
`useMeshBalance(identityId)`, etc.) — automatic cache, refetch on
focus, optimistic updates.

### Build + serve pipeline

- `npm install` in a new `frontend/` subdir (root of repo stays
  clean — `package.json` for Vite lives in `frontend/`)
- `npm run build` outputs to `public/app/build/`
- `bin/bos-api.mjs` serves `/app/` → `public/app/build/index.html`
  with SPA fallback for client-side routes (`/app/worker`,
  `/app/citizen`, etc.)
- Dev mode: `npm run dev` runs Vite at `:5173`, proxying `/api/*`
  to `:8787`. Hot-reload + instant feedback.
- CI / test: `npm run test` runs Vitest. Will be added to
  `scripts/js-test.ps1` as a separate step.

### Out of scope for v1

- Voice input / IndicWhisper integration on `/app/citizen/` — text
  intent only in v1, voice comes back via Labs
- Native PWA install / service worker on `/app/` — v1 is an SPA, no
  offline mode. SW comes in v2 after the surface settles.
- Live federated round join — Labs surface in v1
- Health-doc OCR — Labs surface in v1
- SLM install — Labs surface in v1
- i18n / vernacular UI strings — v1 ships English only. Adding
  Hindi / Marathi / Tamil / Bengali is a v2 sub-phase once the
  copy stabilises (otherwise we translate strings that change)
- Operator console redesign — stays at `/console/`
- The `/shell/` surface — left as-is, no breaking changes

## §15 bindings preserved

| Binding | Resolution in /app/ |
|---|---|
| Identity is the person, not the device | Persona switcher always in top-right; one-tap switch; localStorage records the active person not the device |
| Pointer-not-payload | Trust Passport shows attestation COUNTS + hashes, not raw payloads. MFI bundle render shows the bundle structure but not raw earnings rows. Same posture as current `/verify/` |
| DPDP §12(3) erasure cascade | `/app/settings/` includes "Erase my data" with the same two-step confirm flow currently in `/shell/`. Calls the same `DELETE /api/identities/:id?confirm=YES_DELETE` endpoint |
| Audit ledger is transparent | Every action that mutates server state shows the ledger event hash in the result card's "Show technical details" collapsible |
| No bytes on the server for SLM | Labs SLM install reuses the Phase 9.0b OPFS-backed flow |
| Worker controls consent (MFI flow) | `/app/worker/` MFI-consent card uses the same Phase 6.1 endpoints with the same confirmation gates |

## Tests

- **Component tests**: Vitest + React Testing Library for each
  primitive (`<Action>`, `<Card>`, `<Identity>`, etc.)
- **Hook tests**: Vitest for each Zustand store + TanStack Query
  hook
- **Smoke test**: Playwright (or Cypress — TBD) for the three
  demo flows end-to-end (onboarding → worker cash-out / citizen
  intent / verifier bundle read)

**Test count target**: ~80 new FE tests by v1. Combined with the
798 Node backend tests, total post-rebuild ≈ 880.

The existing `scripts/js-test.ps1` gains a second step that runs
the FE test suite. PowerShell-execution-policy issue (already
flagged in [[bharat-os-state-2026-05-25]]) means we'll invoke
Vitest directly via `node node_modules/vitest/vitest.mjs run`.

## Consequences

- **Investor demo becomes real.** A clean 90-second flow per persona
  with no debugging required. The "what does Bharat OS do?" answer is
  visible in five seconds.
- **First npm dependency surface for Bharat OS.** Backend remains
  zero-dep (auditable-code posture preserved). Frontend gets a
  modern stack so future engineers (when they're hired) know it on
  day one.
- **`/shell/` lives on as the developer surface.** Engineers /
  testers / admins still have full access to every feature without
  the "investor-friendly" framing getting in the way.
- **Phase 9.0c paused.** llama.cpp-wasm runtime adapter (ADR 0114
  not yet drafted) waits until `/app/` v1 ships. Estimated 2-3 week
  slip on the SLM runtime; arguably worth it because a working SLM
  with no investor-facing demo doesn't move the needle.
- **FE+BE parity rule activates.** [[fe-be-parity-rule]] memory
  binds every future phase to ship both layers together. No more
  Phase 5.9 → 7.3-style 10-phase BE backlog that leaves the FE to
  catch up.
- **Tech debt is honestly named.** The 4,811-line vanilla-JS shell
  is acknowledged as accumulated tech debt rather than papered over
  as "minimalist".
- **PWA / offline story deferred.** v1 is online-only. The SW
  rebuild comes in v2 once the surface settles — we just spent an
  hour debugging SW cache issues, no need to relive that during
  the rebuild.

## Sub-phase breakdown

| Sub-phase | Scope | Effort |
|---|---|---|
| **Phase 11.0** | Vite scaffold + design tokens + base components + `/app/` route in API + CI integration | ~3 days |
| **Phase 11.1** | Split-hero onboarding + persona picker + identity state + switcher | ~2 days |
| **Phase 11.2** | `/app/worker/` — mesh balance, monthly summary, cash-out, MFI consent issuance, Trust Passport (worker view) | ~4 days |
| **Phase 11.3** | `/app/citizen/` — intent input, policy-gated orchestration result, recent activity, memory records | ~4 days |
| **Phase 11.4** | `/app/verify/` adaptation — MFI bundle read, Trust Passport public view, evidence display | ~2 days |
| **Phase 11.5** | `/app/labs/` — SLM install (Phase 9.0b wire), federated rounds, OCR, voice/TTS settings | ~2 days |
| **Phase 11.6** | Polish + end-to-end investor demo smoke + ADR 0115 closeout | ~1 day |

Total: **~18 days** (~2.5 weeks). Each sub-phase ships its own commit
+ ADR (0116 … 0121) following the doc-update rule.

## Future polish (v2 and beyond)

- **i18n + vernacular** — Hindi / Marathi / Tamil / Bengali UI
  strings once copy stabilises
- **PWA + service worker + offline mode** — installable, works on
  patchy 4G
- **Voice input via IndicWhisper** — moved from `/shell/` to
  `/app/citizen/` properly
- **Native Android wrapper (Phase 2b)** — same React surface in a
  Capacitor / Tauri shell for the OEM bundle
- **Animations + motion design** — Framer Motion for transitions
  once the static surface lands
- **Accessibility audit** — axe-core CI step
- **Performance budget** — Lighthouse CI with hard ceilings on
  bundle size / TTI
- **Persona-specific themes** — Worker surface gets a warmer tint,
  citizen surface a cooler one — explored after v1 ships

## How to apply at next session

1. Re-read this ADR + [[fe-rebuild-direction-set]] +
   [[fe-be-parity-rule]] memory entries.
2. Confirm the persona-split-hero + tricolour choices still hold.
3. Open Phase 11.0: `mkdir frontend/`, `npm create vite@latest .`,
   pick React + TypeScript template.
4. Set up Tailwind config with the locked tokens from this ADR.
5. Build the component library FIRST (Hero, Card, Action, Badge,
   Sheet, Toast, Tab, Identity, Field, Money, Stat, Evidence) before
   touching any feature surface.
6. Wire `/app/` route in `src/phase0/api.mjs` to serve
   `public/app/build/`.
7. Then Phase 11.1: onboarding.

Stop and ask the user before adding any FE npm dep not listed in
the Stack section above — the dependency surface is bounded
intentionally.
