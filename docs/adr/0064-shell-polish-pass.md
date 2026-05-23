# ADR 0064: Phase 2a.15 Shell Polish Pass

## Status

Accepted

## Context

Phase 2a.7 through 2a.14 layered ten distinct cards into
`/shell/index.html`: the prompt card, flow, result, mesh node, recent
activity, pairing, profile security, worker alerts, health document,
flag report, and diagnostics. Each card landed honestly — every
section answered a specific §-binding (§7c, §7e, §9A, §13B, §15) and
none of them should disappear.

But laid out as a flat vertical stack, the demo loses its narrative.
An investor opening the shell sees a wall of controls before they see
the one thing that *matters*: "type or speak an intent → watch Bharat
OS plan it." The mesh ticker — arguably the most striking single
moment in the demo (a live ₹ counter while the device is "earning")
— was buried six cards down. Pairing, passkey, alerts, health-doc
capture, and the §9A flag form are all real, working surfaces, but
they are *secondary* to the core intent loop.

§17's honest accounting principle applies to layout as much as to
code: surfaces that are real should be visible, surfaces that are
auxiliary should be discoverable but not crowd the canvas.

## Decision

Phase 2a.15 reorders the shell and collapses the auxiliary surfaces
into a single `<details>` element.

### Above the fold

1. **Top bar** — brand + profile button (unchanged).
2. **Prompt card** — the intent textarea, mic, send, suggestion
   chips, and the on-device SLM warm-up row.
3. **Flow card** — appears once an intent is detected, showing the
   classifier output and policy steps.
4. **Result card** — appears after the flow resolves.
5. **Mesh node card** — §13B fair-use lever, live ticker, start/stop.
6. **Recent activity** — last few actions on this profile.

### Below the fold

A single `<details class="more-controls">` collapses:

- **Pair another device (§7c)** — the WebRTC handshake card from
  2a.14.
- **Profile security** — passkey bind/verify.
- **Worker alerts** — push notification opt-in.
- **Health document** — Tesseract OCR + ABHA upload.
- **Report a problem (§9A)** — signed flag form.

The summary line reads: *"More controls — device pairing · passkey ·
alerts · health doc · §9A flag"*, so a curious user (or a careful
investor) can see at a glance what is one click away.

### Diagnostics

Remains at the bottom as its own `<details>`, unchanged — it is the
*honesty panel* and intentionally low in the stack.

### CSS

New rules in `public/shell/styles.css`:

- `.more-controls` — same elevated-surface treatment as
  `.diagnostics` so the two collapsibles read as a matched pair.
- `.more-controls summary` — flex header with the same `▾ / ▴`
  affordance.
- `.more-controls-meta` — muted subtitle right-aligned in the
  summary row.
- `.more-controls-grid` — vertical flex stack of `.capture-card`s
  with consistent gap.

### Service worker

`CACHE_NAME` bumped `v10 → v11` so existing installs pick up the new
HTML and CSS on next reload.

## Consequences

- The demo opens with the *story*, not the *toolbox*. The first
  scroll is: "say what you want → watch it plan → watch the device
  earn." That is the §1 promise in three glances.
- Real working surfaces are preserved, not deleted. The §7c pairing
  card, §9A flag form, passkey, alerts, and health-doc capture are
  all one summary-click away — the *only* change is the default
  visibility.
- Mesh ticker — the most demoable single moment — gets prime real
  estate above the fold without competing with five other cards for
  attention.
- The diagnostics panel stays at the bottom as the §17 honesty
  badge: investors who want to know what is scaffolded can scroll
  there and see real / partial / placeholder tags.
- Tests unchanged at 201/201 green — the polish pass is HTML + CSS
  only.

## Future polish

- Mobile breakpoint review: the 480px breakpoint already handles the
  mesh ticker grid; the `<details>` block scales naturally.
- "What's in here?" tap-target: today the meta line is text-only; a
  small animated chevron beside it would aid discovery on first run.
- Onboarding tour: a one-time overlay walking through prompt → mesh
  → more controls, dismissed forever after first interaction.
- A11y audit: the `<details>` element is keyboard-accessible by
  default, but the `<summary>`'s right-aligned meta could read
  awkwardly to screen readers; a structured `aria-label` would
  tighten that.
