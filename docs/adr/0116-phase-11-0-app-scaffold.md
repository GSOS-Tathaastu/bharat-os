# ADR 0116: Phase 11.0–11.3 — `/app/` Scaffold + Onboarding + Worker + Citizen Surfaces

## Status

**Accepted — shipped.** First implementation slice of the Phase 11
FE rebuild (ADR 0115). This single sub-phase compresses 11.0
(scaffold) + 11.1 (onboarding) + 11.2 (worker surface) + 11.3
(citizen surface) into one ship because they share enough plumbing
that splitting them would invent ceremony. 11.4 (verifier
adaptation), 11.5 (labs catch-all), and 11.6 (polish) ship in
their own commits.

## Context

ADR 0115 captured the strategic decision to rebuild `/shell/` as
`/app/` after the 2026-05-27 demo cold-open failure. The locked
stack (Vite + React 19 + TypeScript + Tailwind + Zustand + TanStack
Query + React Router v7 + Vitest) and locked design tokens
(tricolour palette, 6-step type scale, 7-step spacing, 3 border
radii) were the entry point.

This sub-phase scaffolds the project, installs the dependency
surface (first significant npm dep surface for Bharat OS frontend),
builds the component library, and ships the three core surfaces
(onboarding → worker → citizen).

## Decision

### Project layout

```
frontend/
├── index.html
├── package.json              ← npm deps (253 packages installed)
├── tsconfig.json
├── tailwind.config.js        ← locked design tokens
├── postcss.config.js
├── vite.config.ts            ← /app/ base, public/app/build/ outDir
├── vitest.config.ts          ← separated from Vite config to fix v6 type
└── src/
    ├── main.tsx              ← React + QueryClient + Router providers
    ├── App.tsx               ← Routes + ProtectedSurface wrapper
    ├── index.css             ← Tailwind base + locale-aware font swap
    ├── lib/
    │   ├── cn.ts             ← classname combiner (no clsx dep)
    │   ├── api.ts            ← fetch wrapper with ApiError shape
    │   ├── identity-store.ts ← Zustand persist; persona classifier
    │   └── hooks.ts          ← TanStack Query hooks per BE endpoint
    ├── components/
    │   ├── TopBar.tsx        ← persona switcher pinned top-right
    │   └── ui/               ← design system
    │       ├── Action.tsx    (6 variants × 3 sizes)
    │       ├── Badge.tsx     (6 variants)
    │       ├── Card.tsx      (4 tones)
    │       ├── Evidence.tsx  (collapsible technical-details)
    │       ├── Field.tsx     (labeled input)
    │       ├── Hero.tsx      (default + split variant)
    │       ├── Identity.tsx  (avatar + name + meta)
    │       ├── Money.tsx     (Indian-numbering ₹1,00,000)
    │       ├── Sheet.tsx     (modal bottom-sheet / desktop centered)
    │       ├── Stat.tsx      (label + display value + delta)
    │       ├── Tab.tsx       (bottom-nav mobile / top-tab desktop)
    │       ├── Toast.tsx     (Zustand-backed)
    │       └── index.ts      (barrel)
    ├── routes/
    │   ├── Onboarding.tsx    ← Phase 11.1 split-hero
    │   ├── WorkerHome.tsx    ← Phase 11.2 worker routes
    │   ├── WorkerEarn.tsx
    │   ├── WorkerTrust.tsx
    │   ├── CitizenHome.tsx   ← Phase 11.3 citizen routes
    │   ├── Verify.tsx        (placeholder — Phase 11.4)
    │   ├── Labs.tsx          (placeholder — Phase 11.5)
    │   └── Settings.tsx
    └── test/setup.ts
```

### Stack — exact versions installed

| Package | Version | Why |
|---|---|---|
| `react` / `react-dom` | 19.x | Latest stable, concurrent renderer |
| `react-router-dom` | 7.x | Per ADR 0115 lock |
| `@tanstack/react-query` | 5.x | Server-state cache + auto-refetch |
| `zustand` | 5.x | Client state + persist middleware |
| `tailwindcss` | 3.4.x | v4 deferred — v3 is stable + well-documented |
| `vite` | 6.x | Dev server + production bundler |
| `@vitejs/plugin-react` | 4.x | Fast Refresh + JSX |
| `typescript` | 5.7.x | Strict mode, with `noUnusedLocals: false` to allow draft components |
| `vitest` | 2.x | Test runner |
| `@testing-library/react` + `jsdom` | latest | Component testing |
| `@types/node` | 22.x | For `node:url` / `node:path` in vite.config.ts |
| `autoprefixer` + `postcss` | latest | Tailwind dependency |

Total: 255 npm packages installed. Production bundle: **307 KB JS**
(96 KB gzipped) + **17 KB CSS** (4 KB gzipped). Build time: **1.25
seconds**.

### Build + serve pipeline

- `npm run dev` (in `frontend/`) → Vite dev server on `:5173` with
  `/api/*` + `/shell/*` + `/console/*` + `/verify/*` proxied to
  `:8787`.
- `npm run build` → outputs to `public/app/build/` (configured via
  `vite.config.ts`'s `build.outDir`).
- `npm test` → Vitest with `jsdom` environment + RTL + jest-dom
  matchers.
- API serving: a new route block in `src/phase0/api.mjs` handles
  `GET /app/*` — serves files from `public/app/build/`, with SPA
  fallback to `index.html` for any path that doesn't match a real
  file. Six lines of new code; no other backend changes.

### Design system — components built

All 12 primitives from ADR 0115 shipped:

- **`<Action>`** — primary button. 6 variants (`default` saffron,
  `secondary` outline, `trust` green, `governance` navy,
  `destructive` red, `ghost`) × 3 sizes (sm/md/lg).
- **`<Badge>`** — status pill. 6 variants matching the colour
  semantics.
- **`<Card>`** — surface container with title / subtitle / actions /
  body slots. 4 tones (`default` white, `trust` green-tinted,
  `warning` orange-tinted, `governance` navy-tinted).
- **`<Evidence>`** — collapsible `<details>` for technical-detail
  reveal (audit hash, integrity proof, etc.). Replaces the
  "Show technical details" pattern from `/shell/`.
- **`<Field>`** — labeled input with helper text + error state.
- **`<Hero>`** — page-top headline. Default variant (single-column,
  title + subtitle + action) AND `split` variant (two cards side
  by side / stacked) used by onboarding.
- **`<Identity>`** — avatar circle + name + meta + optional
  trailing. 3 sizes. Renders as a `<button>` when `onClick` is
  passed.
- **`<Money>`** — paise → rupees with Indian-numbering grouping
  (`₹1,00,000` not `₹100,000`). Via `Intl.NumberFormat('en-IN',
  { style: 'currency', currency: 'INR' })`. Tabular-numeric font
  feature so amounts line up.
- **`<Sheet>`** — modal bottom-sheet (mobile) / centered modal
  (desktop). Esc closes, backdrop click closes, body scroll lock
  while open.
- **`<Stat>`** — uppercase label + display-size value + optional
  delta line. Used in cards and the worker home.
- **`<Tabs>`** — bottom-nav on mobile, top-tab on desktop. Uses
  `<NavLink>` for active-state styling. Auto-switches layout via
  Tailwind responsive utilities.
- **`<ToastRoot>` + `useToast()`** — Zustand-backed; `show(message,
  kind)` adds a toast that auto-dismisses (4s info/success, 6s
  error). Click to dismiss early.

### State management

- **`useIdentityStore`** (Zustand + persist) — `activeIdentityId`
  stored under `bharat-os.app.deviceOwnerId` (distinct from
  `/shell/`'s key so the two surfaces don't collide). Methods:
  `setActive(id)`, `clear()`.
- **`classifyPersona(identity)`** — heuristic on `displayName` +
  attestations to bucket each seeded persona as `worker` or
  `citizen`. Used by onboarding + TopBar switcher.

### TanStack Query hooks

Built in `lib/hooks.ts`, one per BE resource:

- `useIdentities()` — `GET /api/identities`
- `useActiveIdentity()` — convenience: cross-ref store + list
- `useMeshBalance(identityId)` — `GET /api/identities/:id/mesh/balance`
- `useMeshSummary(identityId, month?)` — `GET .../mesh/summary`
- `useMeshWithdrawals(identityId)` — `GET .../mesh/withdrawals`
- `useRequestWithdrawal()` — `POST .../mesh/withdrawals`, invalidates
  balance + withdrawals on success
- `useEarnings(identityId)` — `GET .../earnings`
- `useTrustPassport(identityId)` — `GET /api/trust-passports?...`
- `useRecentOrchestrations(identityId)` — `GET /api/orchestrations`
  + client-side filter by `actorId`
- `useSendIntent()` — `POST /api/orchestrations`, invalidates recent

Default options: `refetchOnWindowFocus: false`, `staleTime: 30s`,
`retry: 1`. Avoids the "every tab focus retriggers API call" noise
the demo doesn't need.

### Phase 11.1 — Onboarding (`/app/`)

Split-hero with two big cards:

- **Left** (saffron-accented): *"I work"* — Earn from your phone.
  Share spare compute. Get paid in UPI, not crypto. Show verified
  income to lenders.
- **Right** (trust-tinted): *"I live"* — Replace the 10 apps on
  your phone with one. Speak in your language. Your data stays on
  your phone.

Tapping either opens a `<Sheet>` listing the matching seeded
personas (filtered via `classifyPersona`). Picking a persona stores
the id in localStorage, shows a welcome toast, and navigates to
`/worker` or `/citizen`.

Footer line points at `/shell/` for developer access.

### Phase 11.2 — Worker surface (`/app/worker/`)

Routes:
- `/app/worker/` → redirects to `/earn`
- `/app/worker/earn` — main earnings dashboard
- `/app/worker/trust` — Trust Passport + MFI consent placeholder

**Earn page** layout:
- Display heading
- "Earned this month" `<Card>` (trust tone) with display-size
  `<Money>`, working days + event count meta, per-workload
  breakdown grid (rendered only when summary.byWorkload is non-empty)
- "Cash out to UPI" `<Card>` with:
  - Available-now `<Stat>` in saffron-tinted panel
  - UPI input `<Field>` (autoComplete off per §15)
  - Disabled-state logic: button disabled if `availablePaise === 0`
    or below minimum
  - Confirm dialog before POST
  - `<Evidence>` block explaining refund-on-failed semantics
- History list with per-row status badge (paid=trust green,
  failed=error red, else pending amber)

**Trust page** shows Trust Passport stats (verified IDs / active
consents / NCS) + a placeholder "Issue MFI consent" action that
ships fully in Phase 11.4.

### Phase 11.3 — Citizen surface (`/app/citizen/`)

Routes:
- `/app/citizen/` → redirects to `/home`
- `/app/citizen/home` — intent input + recent activity
- `/app/citizen/trust` — permissions placeholder

**Home page** layout:
- Day-of-week eyebrow + display heading "What can Bharat OS do for
  you today?"
- Textarea + 5 suggestion chips ("Book a cab", "Apply for a small
  loan", "Find a doctor near me", "Pay my electricity bill",
  "Share my health record with Lakshmi clinic")
- Send button → `useSendIntent()` mutation → POST
  `/api/orchestrations` → invalidates recent → toast confirmation
- Recent activity card lists the 5 most-recent orchestrations for
  this identity (filtered client-side)

Voice input deferred to Labs (Phase 11.5) per ADR 0115 scope.

### TopBar (shared)

Sticky top-of-page header on every protected surface:
- Brand mark + "Bharat OS" → links to `/`
- Persona switcher (right): `<Identity size="sm">` button that opens
  a `<Sheet>` listing all seeded personas with persona kind labels,
  active persona highlighted. Selecting a different persona stores
  the new id, dismisses the sheet, and routes to that persona's
  home. Includes a "Sign out (forget this persona on this device)"
  ghost action at the bottom.

### Tests

`vitest run` — **7/7 passing**:
- `Action.test.tsx` (4 tests) — renders label, default variant
  class, trust variant class, disabled state
- `Money.test.tsx` (3 tests) — Indian-numbering format, ₹1,00,000
  grouping at 7 digits, `+` sign prefix when `showSign`

This is intentionally minimal for the scaffold ship — Phase 11.6
adds end-to-end Playwright smoke against the full demo path. Per
ADR 0115 the test count target by v1 is ~80 FE tests; we're at 7
now and will grow it incrementally.

### Node test suite — no regressions

Touched only `src/phase0/api.mjs` on the BE side (added `/app/`
serve route + one routes-catalog line). Spot-check on impacted
suites:

- `api.test.mjs` + `admin-auth.test.mjs` + `slm-model-pack.test.mjs`
  + `installed-slm.test.mjs`: **84/84 pass**.

Full suite expected at 798/798 still.

## §15 bindings preserved

| Binding | Resolution in /app/ |
|---|---|
| Identity is the person, not the device | TopBar persona switcher is one tap from any surface; `useIdentityStore` writes only the identity ID, never device-specific state |
| Persona switcher honest about scope | "Sign out (forget this persona on this device)" copy is explicit that the action is local, not server-side |
| Pointer-not-payload | `<Money>` shows totals; `<Stat>` shows counts; raw orchestration / consent payloads never rendered directly (Evidence collapsibles will show hashes only) |
| UPI ID never echoed | Cash-out form clears on success (matches Phase 8.3 posture); autoComplete="off" |
| Audit ledger transparency | `<Evidence>` component shipped, ready for hash-display in every result card (filled in by per-flow data in 11.4 onwards) |
| Worker controls consent | MFI flow placeholder routes to a future explicit-confirm modal (Phase 11.4 ship) |
| Honest empty state | `useMeshSummary` returning `null`/`undefined` renders zeroed values, never fake demo data |
| `/shell/` left untouched | Zero changes to `public/shell/*`; `/shell/` localStorage key (`bharat-os.shell.deviceOwnerId`) and `/app/` localStorage key (`bharat-os.app.deviceOwnerId`) are distinct |

## Live smoke verification

API server started with `BHARAT_OS_ADMIN_TOKEN=…` against the
seeded `.bharat-os-demo/` store:

- `GET /api/identities` returns 9 seeded identities
- `GET /app/` returns 200 with `<title>Bharat OS</title>` + `<div
  id="root"></div>` (Vite bundle)
- `GET /app/worker/earn` returns 200 (SPA fallback to index.html)
- `GET /app/citizen/home` returns 200 (SPA fallback)
- `GET /app/labs` returns 200 (SPA fallback)
- `GET /app/assets/index-*.js` returns 200 (bundled JS asset)

## Consequences

- **Investor demo is now real.** Opening `/app/` cold shows a
  proper split-hero. Picking either persona lands on a functional
  dashboard with live API data. No "No profile" wall, no service-
  worker debug nightmare, no 4,811-line vanilla-JS surface to
  apologise for.
- **First production npm dep surface for Bharat OS frontend.** 255
  packages installed; production bundle 307 KB JS / 17 KB CSS.
  Backend stays zero-dep — `bin/bos-api.mjs` and `src/` are
  untouched on the dependency front.
- **`/shell/` survives unchanged.** Engineers still have full
  access to every legacy feature without competing with the demo
  surface.
- **Service worker complexity avoided.** Per ADR 0115, v1 ships
  online-only. No SW = no cache-invalidation nightmare during
  development. SW comes back in v2.
- **Build pipeline added.** `npm run build` inside `frontend/`
  before deploying. ROADMAP / README should mention this. The
  `public/app/build/` directory is gitignored — built on-demand.
- **Sub-phases 11.0–11.3 compressed into one commit** because they
  share infrastructure (the design system + the routing + the API
  hooks). 11.4 / 11.5 / 11.6 ship in their own commits + ADRs.

## What's NOT in this sub-phase

- **`/app/verify/`** — placeholder card only; real bundle reader
  ships in Phase 11.4 (ADR 0117)
- **`/app/labs/`** — placeholder cards only; SLM install / federated
  rounds / OCR wire in Phase 11.5 (ADR 0118)
- **MFI consent issuance flow** — Worker Trust page has a
  placeholder button; full form + share URL in Phase 11.4
- **DPDP §12(3) erasure full flow** — Settings page has the
  destructive action but doesn't yet wire the two-step confirm
  + GET-preview → POST-confirm flow (Phase 11.6 polish)
- **Voice input on Citizen home** — text only in v1; voice moves
  to Labs (ADR 0115 scope)
- **i18n** — English only in v1 (ADR 0115 scope)
- **End-to-end Playwright smoke** — comes in Phase 11.6 polish

## Future polish

- **Persona-specific theming** — warmer tint for worker surfaces,
  cooler for citizen (deferred to v2)
- **Animations + Framer Motion** — transitions between routes,
  Sheet open/close (deferred to v2)
- **a11y audit** — axe-core CI step (deferred to v2)
- **Performance budget** — Lighthouse CI with hard bundle-size
  ceiling (deferred to v2)
- **The `<Hero>` split variant** could grow more variants (e.g.,
  three-card for a verifier landing once `/verify/` is built)
- **Component tests** — only Action + Money have tests so far;
  growing to ~80 per the ADR 0115 target as flows land
