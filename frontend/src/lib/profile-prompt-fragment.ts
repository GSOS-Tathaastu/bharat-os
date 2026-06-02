// Phase 13.3 — SLM-G profile-aware prompt fragment builder.
//
// Pure function. Reads an on-device personalization profile and
// returns a compact prompt PREAMBLE the SLM consumer hooks
// (use-slm-intent-parser, use-slm-doc-summariser, future SLM-H)
// inject above their existing prompt body.
//
// §15 bindings:
//   • Honest-empty default — returns `''` when the profile is at
//     defaults so existing prompts stay byte-identical for
//     un-personalised citizens. Vitest pins this invariant.
//   • Deterministic — same profile snapshot → byte-identical
//     fragment. No Date.now / Math.random. Domains are sorted
//     before emit so two equivalent profiles produce the same
//     bytes regardless of insertion order.
//   • Capped — `FRAGMENT_MAX_CHARS` hard ceiling so a future
//     schema bump can't blow the Phi-3-mini-4k context budget.
//   • Defence-in-depth — runs `scanWithRegex` on the emitted
//     fragment and returns `''` if any PII span is found. The
//     schema is enum/bool/allowlist-domain by construction so PII
//     should never appear, but this catches a future schema
//     addition where free-text might leak in.
//   • Protocol version pinned.

import { isDefaultProfile, type ProfileV1, type SupportedLanguage, type ResponseTone, type SupportedDomain } from './profile-store';
import { scanWithRegex } from './pii-detectors';

export const PROFILE_FRAGMENT_PROTOCOL_VERSION = 'bos.phase13.profile-fragment.v1' as const;

export const FRAGMENT_MAX_CHARS = 400;

const LANGUAGE_GLOSS: Record<Exclude<SupportedLanguage, 'auto'>, string> = {
  'en-IN': 'Indian English',
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati'
};

const TONE_GLOSS: Record<ResponseTone, string> = {
  formal: 'formal',
  friendly: 'friendly',
  terse: 'terse and brief'
};

const DOMAIN_GLOSS: Record<SupportedDomain, string> = {
  finance: 'personal finance',
  health: 'health and wellness',
  gov: 'government services and schemes',
  work: 'work and earnings',
  edu: 'education',
  transport: 'transport and commute',
  kirana: 'kirana / retail',
  tax: 'tax filing and salary slips'
};

interface BuildOptions {
  /** Override the default cap (mostly for testing). */
  maxChars?: number;
}

/**
 * Build the prompt PREAMBLE block from the citizen's profile.
 * Returns `''` (empty string) when:
 *   - profile is at defaults (honest-empty contract)
 *   - emitted fragment trips `scanWithRegex` (defence-in-depth)
 *
 * Caller-managed: consumers concatenate this WITH a leading
 * newline if they want it spaced from the next block. The fragment
 * itself never includes a trailing newline so the byte-equal
 * regression pin holds when caller passes `''`.
 */
export function buildProfileFragment(
  profile: ProfileV1,
  opts: BuildOptions = {}
): string {
  if (isDefaultProfile(profile)) return '';
  const cap = opts.maxChars ?? FRAGMENT_MAX_CHARS;

  const directives: string[] = [];

  if (profile.preferredLanguage !== 'auto') {
    const lang = LANGUAGE_GLOSS[profile.preferredLanguage as Exclude<SupportedLanguage, 'auto'>];
    if (lang) {
      directives.push(`Respond in ${lang}.`);
    }
  }

  if (profile.responseTone !== 'friendly') {
    directives.push(`Use a ${TONE_GLOSS[profile.responseTone]} tone.`);
  }

  if (profile.domains.length > 0) {
    // Sort for byte-stable output regardless of citizen click order.
    const sortedDomains = [...profile.domains].sort();
    const glossed = sortedDomains
      .filter((d) => d in DOMAIN_GLOSS)
      .map((d) => DOMAIN_GLOSS[d as SupportedDomain]);
    if (glossed.length > 0) {
      directives.push(
        `The citizen has flagged interest in: ${glossed.join(', ')}. Bias examples accordingly when relevant; do not invent facts.`
      );
    }
  }

  // Accessibility hints land last so they nudge style without
  // overriding content directives above.
  const a11y: string[] = [];
  if (profile.accessibility.largeText) a11y.push('keep responses short');
  if (profile.accessibility.ttsAuto) a11y.push('avoid markdown formatting that screen readers stumble on');
  if (a11y.length > 0) {
    directives.push(`Accessibility: ${a11y.join('; ')}.`);
  }

  if (directives.length === 0) return '';

  const header = 'Citizen preferences (stay on-device; respect when relevant):';
  let fragment = [header, ...directives.map((d) => `- ${d}`)].join('\n');

  if (fragment.length > cap) {
    // Word-boundary truncation so the fragment doesn't end
    // mid-sentence on the cap.
    const sliced = fragment.slice(0, cap);
    const lastSpace = sliced.lastIndexOf(' ');
    fragment = lastSpace > cap * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  }

  // Defence-in-depth: even though the schema makes PII structurally
  // impossible, scan the emitted bytes. A future schema bump that
  // sneaks in a free-text field will get caught here.
  if (scanWithRegex(fragment).length > 0) {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[profile-fragment] PII detected in emitted fragment; suppressing.');
    }
    return '';
  }

  return fragment;
}
