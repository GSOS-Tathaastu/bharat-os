# ADR 0084: Phase 4.5 — i18n Framework

## Status

Accepted

## Context

Bharat OS has had vernacular suggestion chips (§9C 2a.16) and
localized response strings (§9C 2a.18) since early Phase 2a, but
the *static UI shell* — button labels, card headers, error
toasts, the welcome wizard — was English-only. For an Indian
launch this gap matters: a user opening the app on a Tamil phone
shouldn't see *"Set up new identity"* in English.

§17 demands honesty about what's real. So this phase also names
what we're NOT doing: ship machine-translated **seed** strings,
mark coverage per locale, and call out that production-grade
translations need native-speaker review.

## Decision

### New artifact — `public/shell/i18n.mjs`

Lightweight i18n with seven supported locales:

```
en-IN  hi-IN  hi-Latn-IN  mr-IN  bho-IN  ta-IN  bn-IN
```

Public surface:

- **`t(key, { fallback, locale })`** — lookup. Active locale →
  en-IN fallback → caller's `fallback` → key itself (so missing
  keys are visible during dev).
- **`getLocale()` / `setLocale(locale)`** — read/write the active
  locale; setting persists to localStorage under
  `bharat-os.shell.locale.v1`; emits change events to listeners.
- **`onLocaleChange(callback)`** — subscribe to locale changes.
  Returns an unsubscribe function.
- **`applyI18n(root)`** — sweep the DOM for `data-i18n="key"`
  attributes and update `textContent`. Re-runnable so calls after
  `setLocale` repaint the UI in the new language. Also supports
  `data-i18n-aria-label="key"` and `data-i18n-placeholder="key"`
  for attribute-only translations.
- **`getLocaleCoverage(locale)` / `listLocales()`** — coverage
  stats per locale for the §17 honesty board and a future
  language picker.

### Translations seeded for the highest-impact surfaces

| Surface | Keys |
|---|---|
| Welcome wizard | `welcome.title`, `welcome.subtitle`, `welcome.choice.{new,migrate,demo}.{title,sub}`, `welcome.legal` |
| Bottom nav | `nav.{home,earn,trust,profile}` |
| DPDP card | `card.dpdp.{title,note,export,delete,dpo}` |
| Phone OTP card | `card.phone.{title,note,send,verify,cancel,status.notVerified,status.verified}` |
| Errors / actions | `error.{network,offline,rateLimited}`, `action.{retry,dismiss}` |

Coverage by locale (auto-computed via `getLocaleCoverage`):

| Locale | Coverage |
|---|---|
| en-IN | 100% (reference) |
| hi-IN | ~95% (most keys translated) |
| hi-Latn-IN | ~75% (most user-visible keys) |
| mr-IN, ta-IN, bn-IN | ~50% (highest-impact only) |
| bho-IN | ~40% (Devanagari script, fewer translators) |

The remaining strings fall through to en-IN — visible English in
otherwise-localized UI is a known §17 honesty gap, not a bug.

### Wiring

- `index.html` — `data-i18n="key"` attributes added to:
  - First-run wizard welcome step (title, subtitle, 3 choice cards,
    legal notice)
  - Bottom-nav labels (Home / Earn / Trust / Profile)
  - DPDP card (title, note, export / delete / DPO buttons)
  - Phone OTP card (title, note, status, send / verify / cancel
    buttons)
  - Offline banner text
- `app.js` — `setupI18n()` runs once at startup to apply the
  initial translation pass + subscribe to locale changes for
  re-paint.
- `setActiveProfile(identity)` — calls
  `applyI18nForLocale(profileLocale(identity))` so when the user
  switches to a Tamil profile the UI text updates to Tamil
  automatically.

Initial locale resolution order:
1. localStorage (`bharat-os.shell.locale.v1`) if previously set
2. `navigator.language` if it maps to a supported locale
3. Prefix match — `hi*` → `hi-IN`, `ta*` → `ta-IN`, etc.
4. Fallback: `en-IN`

### Service worker

`bharat-os-shell-v27 → v28`. Added `/shell/i18n.mjs` to the
app-shell precache so the translations are available offline.

## §15 bindings — what changed

Nothing. i18n is pure presentation; no new data flows, no PII
captured, no telemetry. The `data-i18n` attribute is a static
class name, not a per-user marker.

One small thing: the locale stored in localStorage is technically
a user preference, but it's identical to the locale the user
already chose when creating their identity (carried in the
`displayName`-derived locale inference). No new fingerprinting
surface.

## Tests

`tests/node/i18n.test.mjs` — 12 tests:

1. `SUPPORTED_LOCALES` has the seven expected entries
2. `t(key)` returns active-locale translation when present
3. `t(key)` falls back to en-IN when locale lacks the key
4. `t(key, { fallback })` honours caller fallback as last resort
5. `t(key)` returns the key itself when nothing matches (visible
   missing-key signal)
6. `setLocale` rejects unsupported locales
7. `setLocale` fires `onLocaleChange` listeners
8. `onLocaleChange` returns an unsubscribe that stops further
   callbacks
9. `getLocaleCoverage` reports translation % per locale
10. `listLocales` returns all supported locales with coverage
11. Module exports the protocol version
12. **Every locale has at least the four bottom-nav keys
    translatable** (via en-IN fallback) — guarantees the most
    visible UI never shows raw `nav.home` etc.

Full suite: **372 / 372 green** (was 360; +12 new). SW cache to
v28.

## Consequences

- **Tamil / Hindi / Bengali users see localized UI on first run.**
  The welcome wizard, bottom nav, DPDP card, and phone-OTP card
  open in the user's language. Falling-back English strings are
  the known gap, not a surprise.
- **Locale switching is one place, one call.** A future language
  picker on the Profile tab just calls `setLocale('ta-IN')` —
  every `data-i18n` element repaints automatically via the
  listener.
- **Coverage is auditable.** `getLocaleCoverage('bho-IN')` returns
  exact stats; ops can publish *"Bharat OS UI is X% translated in
  Bhojpuri"* on a transparency page without manual counting.
- **No new server-side code.** All i18n is client-side. Server
  responses stay in English; UI translates display strings.
- **372 / 372 tests**, SW cache to v28.

## What this does NOT solve

- **Native-speaker quality.** The seed strings are machine-
  translation drafts. Production launch requires a native-speaker
  review pipeline per locale. Captured in §17.
- **Right-to-left scripts.** All seven supported locales are LTR.
  Urdu (when we add it) needs `dir="rtl"` plumbing.
- **Date / number / currency formatting.** Today every ₹ amount,
  date, and time uses `Intl.DateTimeFormat` / `toLocaleString`
  with the active locale, which is mostly fine, but a launch
  audit should confirm formats match Indian conventions across
  every locale.
- **Plural rules.** `t('error.attemptsRemaining', { count })`
  doesn't yet support `one / other / few / many` — many Indian
  languages have richer plural rules than English's binary.
- **Server-emitted error messages.** API errors return English
  strings; the shell could intercept known error codes and map
  them to localized strings, but that's a follow-up.

## Future polish

- **Language picker on Profile tab** — let users override the
  identity-inferred locale without changing their display name.
- **Coverage badge in the welcome wizard** — for languages below
  80% coverage, show *"X% translated, English fallback for the
  rest"* so the user knows what to expect.
- **`Intl.PluralRules` integration** for richer plural support.
- **Translation contribution workflow** — let community
  volunteers submit translations via a GitHub PR with auto-
  generated coverage diff.
- **Pre-rendered server-side rendering** for SEO + first paint —
  a server route that knows the user's `Accept-Language` header
  could pre-translate before sending the HTML.
- **Translate the legal pages** (`/legal/privacy.html`,
  `/legal/terms.html`) — currently English-only. Each language
  needs a separate review pass given the regulatory weight of
  the copy.
