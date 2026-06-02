# ADR 0168 — Phase 13.6.1: Marketing polish — LICENSE + SEO defaults + landing animation

Status: Accepted
Date: 2026-06-03

## Context

Phase 13.6 (ADR 0156) shipped the 4-page marketing site (/about,
/how-it-works, /for-citizens, /for-sponsors). The MF-2 finding
in that ADR called out that the original copy claimed
"open-source" without a LICENSE file at the repo root, so the
claim was stripped from the marketing pages until the LICENSE
existed.

Open items remaining from 13.6:

1. **LICENSE file** so the "open-source" claim is honest.
2. **SEO meta tags** so the site is shareable on social /
   indexable by search.
3. **Landing animation** so a non-technical viewer (an
   investor) gets a felt sense of "this thing runs an SLM on
   your device" without having to install a 2.3 GB model pack.

This phase closes those three items. None of them touches the
BE. Together they are pitch-visible polish that the substrate
already supported.

## Decision

### 1. LICENSE — Apache License 2.0

The substrate is licensed under **Apache License, Version 2.0**.
The full Apache 2.0 text + appendix copyright stanza (Bharat OS
contributors, 2026) lives at `LICENSE` at the repo root.

Why Apache 2.0 over MIT or BSD-3-Clause:
- Permissive (commercial use OK) like MIT.
- Explicit **patent grant** — important for substrate work that
  composes external rails (UPI, DigiLocker, Aadhaar, GST). The
  patent grant gives downstream adopters defensive cover.
- Includes the **patent retaliation clause** — discourages
  contributors from filing patent suits against the substrate.
- Industry-standard for India-public-infrastructure
  substrates (IndiaStack docs, ONDC ref impls).

A complementary `NOTICE` file at the repo root credits the
substrate's two on-device runtime dependencies (wllama and
pdfjs-dist) and points back at LICENSE.

The marketing pages re-add the "open-source under Apache 2.0"
claim, now backed by the actual file.

### 2. SEO defaults

Two layers:

**Static defaults in `frontend/index.html`** — crawlers that
don't run JS still see a meaningful title, description, og:*,
twitter:*, theme-color, author, robots, application-name,
og:locale (en_IN). These defaults are the FALLBACK; per-route
JS-driven overrides improve UX for users who do load the JS.

**Per-route hook `frontend/src/lib/use-document-meta.ts`** —
~80 lines, zero new deps. Sets document.title + a managed set
of 6 meta tags (description, og:title, og:description, og:type,
twitter:title, twitter:description) on mount; restores the
previous values on unmount so SPA navigation between routes
doesn't leak stale tags. Gracefully handles missing tags
(returns null from setMeta, skips restore).

All 4 marketing pages call useDocumentMeta with per-route
title + description.

Why not react-helmet or vite-plugin-helmet:
- Zero new deps — the substrate posture is "trust internal
  guarantees, avoid unnecessary surface area".
- Per-route helmet gives no benefit over a 5-line useEffect
  for our case (no async, no nested providers).
- A static defaults + tiny hook combo is robust to a future
  SSG migration (could pre-render route HTML and the hook
  becomes a no-op).

### 3. Landing animation — OnDeviceInferenceAnimation

A purely-cosmetic React component that simulates the Phase
13.0 doc-summary skill streaming a real-shaped output
token-by-token. Tween-based; ~16 ms per token; ~220 ms pause
between lines; restart every ~4.5 s after completion;
pause-on-hover so a reader can actually read the output.

Wired into the AboutPage hero (2-column grid that collapses
below `lg`). Other marketing pages don't carry the animation
to keep it precious + not repetitive.

**Honest-by-construction** — the animation is explicitly
labeled:
- a11y label: "Illustration: streaming on-device SLM output,
  looped" (role="img").
- footer caption: "Illustration of /labs · the real surface
  runs the same flow live in your browser".
- The script text is what `doc-summary v1` actually produces
  on the labs surface today (electricity bill summary).

We did NOT record a real screen-capture GIF for v1. Two
reasons:
- A GIF of a 2.3 GB model load + streaming would be 8-15 MB
  on the wire — bad CWV scoring + slow on Indian mobile.
- A tween-based simulation lets the page-load-to-impression
  delay be ~0 (no asset to fetch). The honesty cost is
  bounded by the explicit labelling.

A real screen-capture is a Phase 2a (hosting / CDN) item
when we have a CDN to cheaply serve it.

### 4. Adversarial review verdict: ship_with_no_must_fix

3-lens pass (honesty / privacy / edge cases):

- **Honesty.** Animation explicitly labelled as illustration
  with `role="img"` + a11y label + footer caption naming
  /labs as the real source surface. Apache 2.0 claim now
  backed by actual file. Sound.
- **Privacy / §15.** Zero network calls; zero new entities;
  zero ledger events; zero PII surface. Sound.
- **Edge cases.** useDocumentMeta cleanup restores prior
  title + 6 managed meta tags on unmount; missing-meta-tag
  path returns null gracefully; animation cancellation is
  handled on unmount via a `cancelled` flag in the closure;
  external LICENSE link uses `rel="noreferrer noopener"`
  + `target="_blank"` per security best practice.

Notes for follow-up polish (not must-fix):
- **SF-1.** Could add a `prefers-reduced-motion` opt-out
  for the streaming animation (a11y polish).
- **SF-2.** Static `og:url` is not set (depends on the
  hosting domain). Lands when Phase 2a sets up hosting.
- **SF-3.** Real screen-capture GIF as a fallback for
  crawlers that don't run JS could improve linkedin/twitter
  share cards. Lands with Phase 2a CDN.

## Consequences

- The marketing site is now linkedin-/twitter-/whatsapp-
  shareable with sensible share-card defaults.
- The "open-source" claim is honest — a verifier can clone
  the repo and read LICENSE.
- The landing page now has a visible "this runs on-device"
  proof-of-feeling for non-technical visitors.
- Zero new external API. Zero new external dep. Zero new
  BE surface.
- §13.x marketing polish arc is now closed.

## Tests

- `tests/node/license-and-seo-defaults.test.mjs` — 13 cases.
  LICENSE existence + Apache 2.0 + canonical URL + copyright
  stanza; NOTICE existence + wllama/pdfjs credit + LICENSE
  pointer; index.html lang="en" + substantive title + meta
  description + og:type + og:title + og:description +
  twitter:card + twitter:title + twitter:description + Apache
  2.0 in description + theme-color saffron #FF9933.
- `frontend/src/lib/use-document-meta.test.ts` — 4 cases.
  Sets title + description + og + twitter on mount; uses
  ogTitle / ogDescription overrides; restores previous on
  unmount; does not crash if a meta tag is missing.
- `frontend/src/components/OnDeviceInferenceAnimation.test.tsx`
  — 2 cases. Renders with "illustration" a11y label; names
  /labs as the source surface.
- `frontend/src/routes/marketing.test.tsx` extended — 3 new
  AboutPage cases (renders the on-device inference animation
  in the hero; sets the document title via useDocumentMeta;
  mentions Apache 2.0 in body + footer).
- Full sweep at commit time: 522 vitest (+9) + 1438 Node
  (+12) + tsc clean.

## Follow-ups (deferred)

- **Phase 2a** — Hosting + CDN. Then add `og:url`, optional
  screen-capture GIF for share cards.
- **Phase 13.6.2** — `prefers-reduced-motion` opt-out on
  the landing animation (a11y polish).
- **Phase 14.0** — Sahayak provider role.
- **Phase 13.7.4** — Phase 9.0c wllama runtime serve-mode
  extension (closes the last manual step in the compute
  network demo).
