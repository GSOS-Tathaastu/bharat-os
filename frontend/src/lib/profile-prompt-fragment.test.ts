import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildProfileFragment,
  PROFILE_FRAGMENT_PROTOCOL_VERSION,
  FRAGMENT_MAX_CHARS
} from './profile-prompt-fragment';
import { useProfileStore, type ProfileV1 } from './profile-store';

function makeProfile(patch: Partial<ProfileV1> = {}): ProfileV1 {
  return {
    schemaVersion: 1,
    identityId: 'identity-A',
    preferredLanguage: 'auto',
    responseTone: 'friendly',
    accessibility: { largeText: false, ttsAuto: false },
    domains: [],
    updatedAt: 0,
    ...patch
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useProfileStore.getState().clearProfile();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('PROFILE_FRAGMENT_PROTOCOL_VERSION', () => {
  it('is pinned to bos.phase13.profile-fragment.v1', () => {
    expect(PROFILE_FRAGMENT_PROTOCOL_VERSION).toBe('bos.phase13.profile-fragment.v1');
  });

  it('exposes FRAGMENT_MAX_CHARS=400', () => {
    expect(FRAGMENT_MAX_CHARS).toBe(400);
  });
});

describe('buildProfileFragment — honest-empty invariant', () => {
  it('returns "" at all defaults (CRITICAL: preserves byte-equal prompt baseline)', () => {
    expect(buildProfileFragment(makeProfile())).toBe('');
  });

  it('returns "" when only language is at "auto"', () => {
    expect(buildProfileFragment(makeProfile({ preferredLanguage: 'auto' }))).toBe('');
  });

  it('returns "" when only tone is "friendly"', () => {
    expect(buildProfileFragment(makeProfile({ responseTone: 'friendly' }))).toBe('');
  });

  it('returns "" with empty domains and all-false accessibility', () => {
    expect(
      buildProfileFragment(
        makeProfile({
          accessibility: { largeText: false, ttsAuto: false },
          domains: []
        })
      )
    ).toBe('');
  });
});

describe('buildProfileFragment — directive emission', () => {
  it('emits a language directive when non-auto', () => {
    const out = buildProfileFragment(makeProfile({ preferredLanguage: 'hi-IN' }));
    expect(out).toMatch(/Respond in Hindi\./);
    expect(out).toMatch(/Citizen preferences/);
  });

  it('emits a tone directive when non-friendly', () => {
    const out = buildProfileFragment(makeProfile({ responseTone: 'terse' }));
    expect(out).toMatch(/Use a terse and brief tone\./);
  });

  it('emits a domains directive sorted byte-stably', () => {
    const a = buildProfileFragment(makeProfile({ domains: ['tax', 'health'] }));
    const b = buildProfileFragment(makeProfile({ domains: ['health', 'tax'] }));
    expect(a).toBe(b);
    expect(a).toMatch(/health and wellness/);
    expect(a).toMatch(/tax filing/);
  });

  it('emits accessibility directives when any flag is true', () => {
    const out = buildProfileFragment(
      makeProfile({
        accessibility: { largeText: true, ttsAuto: true }
      })
    );
    expect(out).toMatch(/Accessibility:/);
    expect(out).toMatch(/keep responses short/);
    expect(out).toMatch(/avoid markdown/);
  });
});

describe('buildProfileFragment — determinism', () => {
  it('two equal profile snapshots produce byte-identical fragments', () => {
    const a = buildProfileFragment(
      makeProfile({ preferredLanguage: 'hi-IN', responseTone: 'terse', domains: ['tax'] })
    );
    const b = buildProfileFragment(
      makeProfile({ preferredLanguage: 'hi-IN', responseTone: 'terse', domains: ['tax'] })
    );
    expect(a).toBe(b);
  });

  it('domain order does not affect output bytes (sort stability)', () => {
    const a = buildProfileFragment(makeProfile({ domains: ['gov', 'finance', 'health'] }));
    const b = buildProfileFragment(makeProfile({ domains: ['health', 'gov', 'finance'] }));
    expect(a).toBe(b);
  });
});

describe('buildProfileFragment — char cap', () => {
  it('respects FRAGMENT_MAX_CHARS', () => {
    const out = buildProfileFragment(
      makeProfile({
        preferredLanguage: 'hi-IN',
        responseTone: 'terse',
        domains: ['finance', 'health', 'gov', 'tax'],
        accessibility: { largeText: true, ttsAuto: true }
      })
    );
    expect(out.length).toBeLessThanOrEqual(FRAGMENT_MAX_CHARS);
  });

  it('respects a custom maxChars override', () => {
    const out = buildProfileFragment(
      makeProfile({ preferredLanguage: 'hi-IN', domains: ['tax', 'finance'] }),
      { maxChars: 50 }
    );
    expect(out.length).toBeLessThanOrEqual(50);
  });
});

// Phase 13.3 adversarial fix MF-1 — proves the getActiveProfile
// fresh-read pattern picks up store mutations without requiring a
// re-render. The SLM hooks use this same pattern (lazy
// getActiveProfile(identityId) → useProfileStore.getState() under
// the hood), so toggles between renders are honoured on the next
// parse() / summarise() call.
describe('MF-1 stale-closure fix — getActiveProfile reads fresh state', () => {
  it('a setPrefs followed by an immediate buildProfileFragment reflects the new value', async () => {
    const { getActiveProfile } = await import('./profile-store');
    const beforeFragment = buildProfileFragment(getActiveProfile('identity-A'));
    expect(beforeFragment).toBe('');
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, 'identity-A');
    const afterFragment = buildProfileFragment(getActiveProfile('identity-A'));
    expect(afterFragment).toMatch(/Respond in Hindi\./);
  });
});

describe('buildProfileFragment — PII defence-in-depth', () => {
  it('returns "" when emitted fragment trips scanWithRegex (forward-compat guard)', () => {
    // Today the schema is PII-impossible by construction so this
    // branch is unreachable via the UI. We exercise it by casting
    // a fabricated profile where a domain-like string contains a
    // demo PAN shape that the regex layer will catch.
    const profile = makeProfile({
      // @ts-expect-error — fabricated free-text via cast for the
      // forward-compat guard test only.
      domains: ['ABCDX1234F']
    });
    expect(buildProfileFragment(profile)).toBe('');
  });
});
