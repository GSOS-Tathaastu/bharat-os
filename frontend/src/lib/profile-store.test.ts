import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useProfileStore,
  getActiveProfile,
  isDefaultProfile,
  PROFILE_STORE_PROTOCOL_VERSION,
  SUPPORTED_LANGUAGES,
  RESPONSE_TONES,
  SUPPORTED_DOMAINS,
  MAX_DOMAINS
} from './profile-store';

const LS_KEY = 'bharat-os.app.profile.v1';

beforeEach(() => {
  // Reset both the in-memory store and the persisted slot so each
  // test gets clean defaults — Zustand persist auto-hydrates on
  // module load and the in-memory state survives across vitest
  // cases by default.
  window.localStorage.clear();
  useProfileStore.getState().clearProfile();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('PROFILE_STORE_PROTOCOL_VERSION', () => {
  it('is pinned to bos.phase13.profile.v2 (Phase 13.3 MF-3 bump)', () => {
    expect(PROFILE_STORE_PROTOCOL_VERSION).toBe('bos.phase13.profile.v2');
  });
});

describe('profile-store defaults', () => {
  it('all sentinel-meaningful defaults', () => {
    const s = useProfileStore.getState();
    expect(s.schemaVersion).toBe(1);
    expect(s.identityId).toBeNull();
    expect(s.preferredLanguage).toBe('auto');
    expect(s.responseTone).toBe('friendly');
    expect(s.accessibility).toEqual({ largeText: false, ttsAuto: false });
    expect(s.domains).toEqual([]);
    expect(s.updatedAt).toBe(0);
  });

  it('exposes 8 languages, 3 tones, 8 domains', () => {
    expect(SUPPORTED_LANGUAGES.length).toBe(8);
    expect(RESPONSE_TONES.length).toBe(3);
    expect(SUPPORTED_DOMAINS.length).toBe(8);
    expect(MAX_DOMAINS).toBe(4);
  });
});

describe('setPrefs', () => {
  it('round-trips a valid patch + stamps identityId + updatedAt', () => {
    const before = Date.now();
    useProfileStore.getState().setPrefs(
      { preferredLanguage: 'hi-IN', responseTone: 'terse' },
      'identity-A'
    );
    const s = useProfileStore.getState();
    expect(s.preferredLanguage).toBe('hi-IN');
    expect(s.responseTone).toBe('terse');
    expect(s.identityId).toBe('identity-A');
    expect(s.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('persists the JSON to localStorage', () => {
    useProfileStore.getState().setPrefs(
      { preferredLanguage: 'bn-IN' },
      'identity-X'
    );
    const raw = window.localStorage.getItem(LS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.preferredLanguage).toBe('bn-IN');
    expect(parsed.state.identityId).toBe('identity-X');
  });

  it('coerces off-allowlist preferredLanguage to "auto"', () => {
    useProfileStore.getState().setPrefs(
      // @ts-expect-error — exercising defence-in-depth.
      { preferredLanguage: 'fr-FR' },
      'identity-A'
    );
    expect(useProfileStore.getState().preferredLanguage).toBe('auto');
  });

  it('coerces off-allowlist responseTone to "friendly"', () => {
    useProfileStore.getState().setPrefs(
      // @ts-expect-error — exercising defence-in-depth.
      { responseTone: 'sarcastic' },
      'identity-A'
    );
    expect(useProfileStore.getState().responseTone).toBe('friendly');
  });

  it('filters off-allowlist domains', () => {
    useProfileStore.getState().setPrefs(
      // @ts-expect-error — bad domains.
      { domains: ['health', 'jazz-music', 'finance'] },
      'identity-A'
    );
    const s = useProfileStore.getState();
    expect([...s.domains].sort()).toEqual(['finance', 'health']);
  });

  it('truncates domains to MAX_DOMAINS=4', () => {
    useProfileStore.getState().setPrefs(
      { domains: ['finance', 'health', 'gov', 'work', 'edu'] },
      'identity-A'
    );
    expect(useProfileStore.getState().domains.length).toBe(4);
  });

  it('dedupes domains', () => {
    useProfileStore.getState().setPrefs(
      { domains: ['health', 'health', 'finance', 'finance'] },
      'identity-A'
    );
    const s = useProfileStore.getState();
    expect([...s.domains].sort()).toEqual(['finance', 'health']);
  });

  it('refuses write when identityId is empty / null (pre-hydration guard)', () => {
    const before = useProfileStore.getState();
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, '');
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, null);
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, undefined);
    const after = useProfileStore.getState();
    expect(after.preferredLanguage).toBe(before.preferredLanguage);
    expect(after.identityId).toBeNull();
  });

  it('rejects identityId longer than 128 chars', () => {
    const huge = 'x'.repeat(200);
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, huge);
    expect(useProfileStore.getState().identityId).toBeNull();
    expect(useProfileStore.getState().preferredLanguage).toBe('auto');
  });
});

describe('clearProfile', () => {
  it('resets all fields to defaults but preserves schemaVersion', () => {
    useProfileStore.getState().setPrefs(
      { preferredLanguage: 'ta-IN', responseTone: 'formal', domains: ['tax'] },
      'identity-A'
    );
    useProfileStore.getState().clearProfile();
    const s = useProfileStore.getState();
    expect(s.schemaVersion).toBe(1);
    expect(s.preferredLanguage).toBe('auto');
    expect(s.responseTone).toBe('friendly');
    expect(s.domains).toEqual([]);
    expect(s.identityId).toBeNull();
    expect(s.updatedAt).toBe(0);
  });
});

describe('getActiveProfile cross-identity isolation', () => {
  it('returns the persisted profile when identityId matches', () => {
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, 'identity-A');
    const out = getActiveProfile('identity-A');
    expect(out.preferredLanguage).toBe('hi-IN');
  });

  it('returns defaults when identityId mismatches the snapshot', () => {
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, 'identity-A');
    const out = getActiveProfile('identity-B');
    expect(out.preferredLanguage).toBe('auto');
    expect(out.identityId).toBeNull();
    expect(out.domains).toEqual([]);
  });

  it('returns defaults when no identity is supplied', () => {
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, 'identity-A');
    expect(getActiveProfile(null).preferredLanguage).toBe('auto');
    expect(getActiveProfile(undefined).preferredLanguage).toBe('auto');
    expect(getActiveProfile('').preferredLanguage).toBe('auto');
  });
});

describe('isDefaultProfile', () => {
  it('true for defaults', () => {
    expect(isDefaultProfile(useProfileStore.getState())).toBe(true);
  });

  it('false when any preference is non-default', () => {
    useProfileStore.getState().setPrefs({ preferredLanguage: 'hi-IN' }, 'identity-A');
    expect(isDefaultProfile(useProfileStore.getState())).toBe(false);
  });

  it('false when a single domain is selected', () => {
    useProfileStore.getState().setPrefs({ domains: ['tax'] }, 'identity-A');
    expect(isDefaultProfile(useProfileStore.getState())).toBe(false);
  });

  it('false when any accessibility flag is true', () => {
    useProfileStore.getState().setPrefs(
      { accessibility: { largeText: true, ttsAuto: false } },
      'identity-A'
    );
    expect(isDefaultProfile(useProfileStore.getState())).toBe(false);
  });
});

// Phase 13.3 adversarial fix MF-3 — v1 LS payloads carrying the
// deprecated `highContrast` field rehydrate cleanly without it.
describe('migrate v1 → v2 (highContrast strip)', () => {
  it('strips highContrast from a v1 persisted payload', () => {
    // Seed LS with a v1 shape directly.
    const v1Payload = {
      state: {
        schemaVersion: 1,
        identityId: 'identity-A',
        preferredLanguage: 'hi-IN',
        responseTone: 'terse',
        accessibility: { largeText: true, highContrast: true, ttsAuto: false },
        domains: ['tax'],
        updatedAt: 12345
      },
      version: 1
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(v1Payload));
    // Force rehydrate so the migrate path runs.
    useProfileStore.persist.rehydrate();
    const s = useProfileStore.getState();
    expect(s.preferredLanguage).toBe('hi-IN');
    expect(s.responseTone).toBe('terse');
    expect(s.accessibility.largeText).toBe(true);
    expect(s.accessibility.ttsAuto).toBe(false);
    // The dropped field is structurally absent.
    expect('highContrast' in s.accessibility).toBe(false);
  });

  // Phase 13.3 adversarial fix SF-1 — pin the §15 bytes-never-
  // leave-device binding. The Evidence copy on PersonalizationCard
  // invites investors to verify zero /api/ traffic during toggling;
  // this test enforces the invariant so a future phase that
  // accidentally subscribes a fetch / sendBeacon to the store
  // gets caught.
  it('SF-1 — full toggle matrix issues zero network requests', () => {
    const fetchSpy = (globalThis.fetch = (() => {
      throw new Error('SF-1 violation: fetch must not fire during profile toggles');
    }) as typeof globalThis.fetch);
    const beaconSpy = (navigator.sendBeacon = ((): boolean => {
      throw new Error('SF-1 violation: sendBeacon must not fire');
    }) as typeof navigator.sendBeacon);
    try {
      const store = useProfileStore.getState();
      const identity = 'identity-spy';
      // Walk every language × every tone × every accessibility flag
      // × every domain (up to MAX_DOMAINS).
      for (const lang of ['auto', 'en-IN', 'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'mr-IN', 'gu-IN'] as const) {
        store.setPrefs({ preferredLanguage: lang }, identity);
      }
      for (const tone of ['formal', 'friendly', 'terse'] as const) {
        store.setPrefs({ responseTone: tone }, identity);
      }
      store.setPrefs({ accessibility: { largeText: true, ttsAuto: false } }, identity);
      store.setPrefs({ accessibility: { largeText: false, ttsAuto: true } }, identity);
      store.setPrefs(
        { domains: ['finance', 'health', 'gov', 'tax'] },
        identity
      );
      store.clearProfile();
      // If we get here, no spy threw.
      expect(fetchSpy).toBeDefined();
      expect(beaconSpy).toBeDefined();
    } finally {
      // Restore — vitest tears down jsdom per file but be defensive.
      delete (globalThis as Record<string, unknown>).fetch;
    }
  });

  it('coerces hand-edited bogus values on v1 rehydrate (SF-4)', () => {
    const v1Payload = {
      state: {
        schemaVersion: 1,
        identityId: 'identity-A',
        preferredLanguage: 'fr-FR', // off-allowlist
        responseTone: 'sarcastic', // off-allowlist
        accessibility: 'garbage',
        domains: ['health', 'jazz-music', 'finance'],
        updatedAt: 'not-a-number'
      },
      version: 1
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(v1Payload));
    useProfileStore.persist.rehydrate();
    const s = useProfileStore.getState();
    expect(s.preferredLanguage).toBe('auto');
    expect(s.responseTone).toBe('friendly');
    expect(s.accessibility).toEqual({ largeText: false, ttsAuto: false });
    expect([...s.domains].sort()).toEqual(['finance', 'health']);
    expect(s.updatedAt).toBe(0);
  });
});
