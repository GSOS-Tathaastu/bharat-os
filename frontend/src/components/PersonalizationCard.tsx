// Phase 13.3 — SLM-G PersonalizationCard.
//
// Inline Settings card. Citizen toggles a preferredLanguage,
// responseTone, accessibility flags, and a small domains chip set.
// Profile persists to localStorage (Zustand persist); on-device SLM
// hooks read it on every parse / summarise call.
//
// Pitch beat: the same input typed twice produces a visibly
// different chip after a toggle. DevTools Application > Local
// Storage shows the JSON; Network tab stays empty.
//
// §15 framing in the card copy: "Stored only in this browser.
// Never sent to the server. Cleared when you forget your persona
// or delete your account."

import { useMemo } from 'react';
import { Badge, Card, Evidence } from '@/components/ui';
import {
  useProfileStore,
  isDefaultProfile,
  SUPPORTED_LANGUAGES,
  RESPONSE_TONES,
  SUPPORTED_DOMAINS,
  MAX_DOMAINS,
  type SupportedLanguage,
  type ResponseTone,
  type SupportedDomain,
  type ProfileV1
} from '@/lib/profile-store';

interface PersonalizationCardProps {
  identityId: string | null | undefined;
}

const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  auto: 'Auto-detect',
  'en-IN': 'English',
  'hi-IN': 'हिन्दी (Hindi)',
  'bn-IN': 'বাংলা (Bengali)',
  'ta-IN': 'தமிழ் (Tamil)',
  'te-IN': 'తెలుగు (Telugu)',
  'mr-IN': 'मराठी (Marathi)',
  'gu-IN': 'ગુજરાતી (Gujarati)'
};

const TONE_LABEL: Record<ResponseTone, string> = {
  formal: 'Formal',
  friendly: 'Friendly',
  terse: 'Terse'
};

const DOMAIN_LABEL: Record<SupportedDomain, string> = {
  finance: 'Personal finance',
  health: 'Health',
  gov: 'Government',
  work: 'Work / earnings',
  edu: 'Education',
  transport: 'Transport',
  kirana: 'Kirana / retail',
  tax: 'Tax'
};

export function PersonalizationCard({ identityId }: PersonalizationCardProps) {
  // Pull the entire store so any field change triggers a re-render.
  // The setPrefs call is identity-scoped; reading uses the active
  // identity guard inline.
  const profile = useProfileStore();
  const setPrefs = useProfileStore((s) => s.setPrefs);

  const isOwnedByActiveIdentity = profile.identityId === identityId;
  // Show defaults form when no identity OR when the store snapshot
  // belongs to a different identity (Phase 13.3 cross-citizen
  // isolation guard).
  const view: ProfileV1 = isOwnedByActiveIdentity ? profile : {
    schemaVersion: 1,
    identityId: identityId ?? null,
    preferredLanguage: 'auto',
    responseTone: 'friendly',
    accessibility: { largeText: false, ttsAuto: false },
    domains: [],
    updatedAt: 0
  };

  const isDefault = useMemo(() => isDefaultProfile(view), [view]);

  function handleLanguage(next: SupportedLanguage) {
    setPrefs({ preferredLanguage: next }, identityId ?? '');
  }
  function handleTone(next: ResponseTone) {
    setPrefs({ responseTone: next }, identityId ?? '');
  }
  function handleAccessibility(key: keyof ProfileV1['accessibility'], next: boolean) {
    setPrefs(
      { accessibility: { ...view.accessibility, [key]: next } },
      identityId ?? ''
    );
  }
  function handleDomainToggle(domain: SupportedDomain) {
    const has = view.domains.includes(domain);
    let next: SupportedDomain[];
    if (has) {
      next = view.domains.filter((d) => d !== domain);
    } else if (view.domains.length >= MAX_DOMAINS) {
      // Saturated — ignore further additions until something is
      // removed. The store also coerces, so this is belt-and-braces.
      return;
    } else {
      next = [...view.domains, domain];
    }
    setPrefs({ domains: next }, identityId ?? '');
  }

  return (
    <Card
      title="Personalization"
      subtitle="Tunes how on-device AI talks to you"
      tone="trust"
      actions={
        <Badge variant={isDefault ? 'neutral' : 'trust'}>
          {isDefault ? 'Defaults' : 'Active'}
        </Badge>
      }
    >
      <p className="text-body text-text-muted mb-4">
        Stored only in this browser. Never sent to the server.
        Cleared when you forget your persona or delete your account.
      </p>
      {/* Phase 13.3 adversarial fix MF-5 — explain the disabled
          state when no identity is active. */}
      {!identityId && (
        <div className="mb-4 rounded-sm border border-orange-100 bg-orange-50 p-3 text-caption text-text">
          Create or load a persona first to save personalization preferences
          for it.
        </div>
      )}
      {/* Phase 13.3 adversarial fix SF-6 — when the LS slot was
          written by a different persona on this browser, warn that
          saving here will replace those preferences. */}
      {identityId && profile.identityId && !isOwnedByActiveIdentity && (
        <div className="mb-4 rounded-sm border border-orange-100 bg-orange-50 p-3 text-caption text-text">
          Personalization is stored per persona on this device. Saving here
          will replace preferences saved by a different persona on this
          browser.
        </div>
      )}

      <div className="mb-4">
        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Preferred language
        </p>
        <select
          value={view.preferredLanguage}
          onChange={(e) => handleLanguage(e.target.value as SupportedLanguage)}
          disabled={!identityId}
          className="block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none disabled:opacity-50"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Response tone
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="Response tone">
          {RESPONSE_TONES.map((t) => {
            const active = view.responseTone === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!identityId}
                onClick={() => handleTone(t)}
                className={
                  'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold transition-colors disabled:opacity-50 ' +
                  (active
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-border bg-white text-text-muted hover:border-primary')
                }
              >
                {TONE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Accessibility
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={view.accessibility.largeText}
              disabled={!identityId}
              onChange={(e) => handleAccessibility('largeText', e.target.checked)}
              className="h-5 w-5"
            />
            Keep responses short
          </label>
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={view.accessibility.ttsAuto}
              disabled={!identityId}
              onChange={(e) => handleAccessibility('ttsAuto', e.target.checked)}
              className="h-5 w-5"
            />
            Avoid heavy markdown (TTS-friendly)
          </label>
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
          Topics I care about (up to {MAX_DOMAINS})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORTED_DOMAINS.map((d) => {
            const active = view.domains.includes(d);
            const saturated =
              !active && view.domains.length >= MAX_DOMAINS;
            return (
              <button
                key={d}
                type="button"
                disabled={!identityId || saturated}
                onClick={() => handleDomainToggle(d)}
                className={
                  'rounded-full border px-3 py-1 text-caption font-semibold transition-colors disabled:opacity-40 ' +
                  (active
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text-muted hover:text-text')
                }
              >
                {DOMAIN_LABEL[d]}
              </button>
            );
          })}
        </div>
        {/* Phase 13.3 adversarial fix SF-8 — explain the cap when
            saturated so the dimmed chips don't look broken. */}
        {view.domains.length >= MAX_DOMAINS && (
          <p className="mt-2 text-caption text-text-muted">
            Limit reached. Tap a selected topic to make room.
          </p>
        )}
      </div>

      <Evidence title="How personalization works on-device">
        {/* Phase 13.3 adversarial fix SF-7 — lead with the
            verifiable Network-tab claim; drop the WASM-sandbox
            phrasing that overclaimed an isolation guarantee
            wllama does not provide. */}
        Your preferences live in this browser&apos;s localStorage at
        the key <code>bharat-os.app.profile.v2</code>. The Phase 13.3
        SLM verbs — intent classifier and document summariser — read
        it before generation and weave a short preamble into the
        prompt. The preamble is composed and consumed entirely in
        this browser tab. Open DevTools → Application → Local Storage
        to see the JSON; open the Network tab while you toggle to
        verify zero <code>/api/</code> traffic. On Auto-detect we do
        not steer the language; pick one above to lock the response
        language.
      </Evidence>
    </Card>
  );
}
