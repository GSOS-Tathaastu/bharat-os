// Phase 13.3 — SLM-G on-device personalization profile store.
//
// Per-citizen preferences (language, response tone, accessibility,
// domains) persisted to localStorage via Zustand. The store IS the
// pitch beat: investors can open DevTools → Application → Local
// Storage and see the JSON. No /api/profile/* endpoint, no server
// round-trip, no encryption-at-rest — because the citizen is the
// sole reader / writer / decrypter, encryption would only add
// theatre.
//
// §15 bindings:
//   • Bytes never leave device — zero fetch() anywhere in the
//     personalization arc.
//   • PII-impossible by construction — every field is
//     `enum | boolean | enum[]` from closed allowlists. The UI uses
//     select / radio / checkbox / chip-multiselect only; no
//     free-text input can enter the store.
//   • Cross-citizen isolation — `identityId` is snapshotted on
//     every write; `getActiveProfile(identityId)` returns defaults
//     when the stored snapshot mismatches. Combined with the
//     parent-route `key={identity?.id}` remount (Phase 13.0 MF-1)
//     this is a two-moat guard.
//   • Protocol version pinned. Bumping requires a new ADR. Zustand
//     `persist({ version, migrate })` stub is in place for v2.
//   • DPDP cascade — `clearProfile()` is wired into both Settings
//     "Forget persona" and the `eraseIdentity` onSuccess. Identity
//     erase → profile wipe in the same tick, no server round-trip
//     required.
//
// Storage shape: a single LS slot. Multi-persona-per-device with
// per-identity LS suffix is forward-deferred to Phase 14 Bharat-ID.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Phase 13.3 MF-3 — bumped to v2 after the adversarial review
// flagged `highContrast` as a wire-only no-op (no UI theme or SLM
// directive ever consumed it). Migration in `migrate()` strips it
// from any v1 persisted state.
export const PROFILE_STORE_PROTOCOL_VERSION = 'bos.phase13.profile.v2' as const;

const LS_KEY = 'bharat-os.app.profile.v1';

// ─── Closed allowlists (PII-impossible by construction) ─────────

export const SUPPORTED_LANGUAGES = [
  'auto',
  'en-IN',
  'hi-IN',
  'bn-IN',
  'ta-IN',
  'te-IN',
  'mr-IN',
  'gu-IN'
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RESPONSE_TONES = ['formal', 'friendly', 'terse'] as const;
export type ResponseTone = (typeof RESPONSE_TONES)[number];

export const SUPPORTED_DOMAINS = [
  'finance',
  'health',
  'gov',
  'work',
  'edu',
  'transport',
  'kirana',
  'tax'
] as const;
export type SupportedDomain = (typeof SUPPORTED_DOMAINS)[number];

export const MAX_DOMAINS = 4;
export const MAX_IDENTITY_ID_LEN = 128;

export interface AccessibilityPrefs {
  largeText: boolean;
  ttsAuto: boolean;
}

export interface ProfileV1 {
  schemaVersion: 1;
  identityId: string | null;
  preferredLanguage: SupportedLanguage;
  responseTone: ResponseTone;
  accessibility: AccessibilityPrefs;
  domains: ReadonlyArray<SupportedDomain>;
  updatedAt: number;
}

export type ProfilePatch = Partial<
  Omit<ProfileV1, 'schemaVersion' | 'identityId' | 'updatedAt'>
>;

export interface ProfileStore extends ProfileV1 {
  setPrefs: (patch: ProfilePatch, identityId: string | null | undefined) => void;
  clearProfile: () => void;
}

// ─── Sentinel-meaningful defaults ───────────────────────────────
//
// Every default is "no preference stated" so `buildProfileFragment`
// can emit `''` at defaults — keeping existing prompts byte-equal
// for un-personalised citizens.

const DEFAULT_PROFILE: ProfileV1 = {
  schemaVersion: 1,
  identityId: null,
  preferredLanguage: 'auto',
  responseTone: 'friendly',
  accessibility: {
    largeText: false,
    ttsAuto: false
  },
  domains: Object.freeze([] as SupportedDomain[]),
  updatedAt: 0
};

// ─── Coercers ───────────────────────────────────────────────────

function coerceLanguage(raw: unknown): SupportedLanguage {
  if (typeof raw === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)) {
    return raw as SupportedLanguage;
  }
  return 'auto';
}

function coerceTone(raw: unknown): ResponseTone {
  if (typeof raw === 'string' && (RESPONSE_TONES as readonly string[]).includes(raw)) {
    return raw as ResponseTone;
  }
  return 'friendly';
}

function coerceAccessibility(raw: unknown): AccessibilityPrefs {
  const v = raw && typeof raw === 'object' ? (raw as Partial<AccessibilityPrefs>) : {};
  return {
    largeText: Boolean(v.largeText),
    ttsAuto: Boolean(v.ttsAuto)
  };
}

function coerceDomains(raw: unknown): ReadonlyArray<SupportedDomain> {
  if (!Array.isArray(raw)) return DEFAULT_PROFILE.domains;
  const seen = new Set<SupportedDomain>();
  for (const d of raw) {
    if (typeof d !== 'string') continue;
    if (!(SUPPORTED_DOMAINS as readonly string[]).includes(d)) continue;
    seen.add(d as SupportedDomain);
    if (seen.size >= MAX_DOMAINS) break;
  }
  return Object.freeze([...seen]);
}

function coerceIdentityId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_IDENTITY_ID_LEN) return null;
  return trimmed;
}

// ─── Store ──────────────────────────────────────────────────────

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PROFILE,
      setPrefs: (patch, identityId) => {
        const safeIdentity = coerceIdentityId(identityId ?? null);
        // Empty/null identityId is a no-op — pre-hydration guard.
        if (!safeIdentity) return;
        set((prev) => ({
          schemaVersion: 1,
          identityId: safeIdentity,
          preferredLanguage:
            patch.preferredLanguage !== undefined
              ? coerceLanguage(patch.preferredLanguage)
              : prev.preferredLanguage,
          responseTone:
            patch.responseTone !== undefined
              ? coerceTone(patch.responseTone)
              : prev.responseTone,
          accessibility:
            patch.accessibility !== undefined
              ? coerceAccessibility({ ...prev.accessibility, ...patch.accessibility })
              : prev.accessibility,
          domains:
            patch.domains !== undefined
              ? coerceDomains(patch.domains)
              : prev.domains,
          updatedAt: Date.now()
        }));
      },
      clearProfile: () => {
        set({
          ...DEFAULT_PROFILE,
          updatedAt: 0
        });
      }
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // Phase 13.3 MF-3 + SF-4 — strict coerce-on-rehydrate so a
      // hand-edited LS payload (or an older v1 write that included
      // the deprecated highContrast field) is normalised before it
      // reaches the runtime. Any unknown / corrupt shape falls
      // through to defaults.
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return DEFAULT_PROFILE;
        }
        const p = persistedState as Partial<ProfileV1>;
        // v1 → v2 strips `highContrast` (wire-only no-op). Any
        // intermediate version with the same field set is also
        // safely coerced here.
        if (version === 1 || version === 2) {
          return {
            schemaVersion: 1,
            identityId: coerceIdentityId(p.identityId ?? null),
            preferredLanguage: coerceLanguage(p.preferredLanguage),
            responseTone: coerceTone(p.responseTone),
            accessibility: coerceAccessibility(p.accessibility),
            domains: coerceDomains(p.domains),
            updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0
          };
        }
        return DEFAULT_PROFILE;
      },
      // Defence-in-depth on rehydrate — any persisted shape that
      // doesn't survive coercion gets defaults.
      partialize: (state) => ({
        schemaVersion: 1,
        identityId: state.identityId,
        preferredLanguage: state.preferredLanguage,
        responseTone: state.responseTone,
        accessibility: state.accessibility,
        domains: state.domains,
        updatedAt: state.updatedAt
      })
    }
  )
);

// ─── Selector ──────────────────────────────────────────────────
//
// Cross-identity isolation: returns the persisted profile only when
// `identityId` matches the snapshotted `state.identityId`. On
// mismatch (or when no identity is supplied) returns the defaults
// snapshot so a freshly-switched persona never inherits the prior
// citizen's preferences.

export function getActiveProfile(
  identityId: string | null | undefined,
  state: ProfileV1 = useProfileStore.getState()
): ProfileV1 {
  if (!identityId) return DEFAULT_PROFILE;
  if (state.identityId !== identityId) return DEFAULT_PROFILE;
  return state;
}

export function isDefaultProfile(profile: ProfileV1): boolean {
  return (
    profile.preferredLanguage === 'auto' &&
    profile.responseTone === 'friendly' &&
    !profile.accessibility.largeText &&
    !profile.accessibility.ttsAuto &&
    profile.domains.length === 0
  );
}
