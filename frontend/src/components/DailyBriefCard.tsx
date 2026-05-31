import { useMemo } from 'react';
import { Card, Action, Money, Badge } from '@/components/ui';
import { useActiveIdentity, useDailyBrief } from '@/lib/hooks';

// Phase 12.0.2 — daily brief surfaced on /app/citizen/home.
//
// The orchestrator's `daily_brief` action type composes a brief
// from on-device signals: mesh earnings, recent activity, expiring
// consents, open §9A flags. §15: the composition happens on the
// server-as-stand-in-for-device (Phase 2a) or in-device (Phase 2b).
// Numbers and dates render as bands/labels; no raw transaction
// text reaches the brief body.
//
// Composed brief text requires a memory.read + consent.record
// consent. The structured signals come back even when blocked, so
// we can render the brief partly without consent and prompt for
// consent to unlock the composed prose.

interface DailyBriefCardProps {
  onGrantConsent?: () => void;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function relativeTime(at: string | null | undefined): string {
  if (!at) return '';
  const ms = Date.now() - new Date(at).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function DailyBriefCard({ onGrantConsent }: DailyBriefCardProps) {
  const identity = useActiveIdentity();
  const { data, isPending, error } = useDailyBrief(identity?.id);

  const orchestration = data?.orchestration;
  const signals = orchestration?.actionRequest?.metadata?.signals;
  const status = orchestration?.status;
  const composedText = orchestration?.localizedResponse?.text;
  const consentRequirement = orchestration?.consentRequirement;
  const needsConsent = status === 'blocked' && Boolean(consentRequirement?.scopes?.length);

  // Don't show the brief if no signals at all (loading state).
  const meshEarned = signals?.mesh?.earnedPaise ?? 0;
  const recent = signals?.recent ?? [];
  const expiringConsents = signals?.expiringConsents ?? [];
  const openFlags = signals?.openFlags ?? 0;

  const hasAnything =
    meshEarned > 0 ||
    recent.length > 0 ||
    expiringConsents.length > 0 ||
    openFlags > 0 ||
    Boolean(composedText);

  const firstName = useMemo(
    () => identity?.displayName?.split(' ')[0] ?? '',
    [identity?.displayName]
  );

  if (isPending || error || !signals) {
    // Don't render anything while loading — the citizen sees the
    // intent textarea first; the brief slides in once signals arrive.
    return null;
  }

  // If signals show nothing AND the brief isn't composed, suppress —
  // a brand-new user sees an empty intent textarea + suggestions.
  if (!hasAnything && !needsConsent) return null;

  return (
    <Card tone="trust">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        {greeting()}, {firstName}
      </p>
      {composedText && status === 'completed' ? (
        <p className="mt-2 text-body-lg whitespace-pre-line">{composedText}</p>
      ) : (
        <p className="mt-2 text-body">Here is your day so far.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {meshEarned > 0 && (
          <div className="rounded-sm border border-trust-100 bg-white p-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Earned in the last 24h
            </p>
            <div className="mt-1">
              <Money paise={meshEarned} size="lg" />
            </div>
            <p className="mt-1 text-caption text-text-muted">
              {signals.mesh.eventCount} mesh event{signals.mesh.eventCount === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {expiringConsents.length > 0 && (
          <div className="rounded-sm border border-orange-100 bg-white p-3">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Expiring soon
            </p>
            <ul className="mt-1 space-y-1">
              {expiringConsents.slice(0, 3).map((c) => (
                <li key={c.consentId} className="text-caption">
                  <span className="font-semibold">{c.purpose}</span>{' '}
                  <span className="text-text-muted">
                    {' · '}
                    {new Date(c.expiresAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div className="rounded-sm border border-border bg-white p-3 sm:col-span-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Recent on this profile
            </p>
            <ul className="mt-1 space-y-1">
              {recent.slice(0, 4).map((r) => (
                <li key={r.orchestrationId} className="text-caption">
                  You {r.summary}
                  {' · '}
                  <span className="text-text-muted">{relativeTime(r.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {openFlags > 0 && (
          <div className="rounded-sm border border-error bg-white p-3 sm:col-span-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-error">
              {openFlags} open report{openFlags === 1 ? '' : 's'} mentioning you
            </p>
            <p className="mt-1 text-caption text-text-muted">
              §9A flag reports awaiting review. Check Trust → Reports.
            </p>
          </div>
        )}
      </div>

      {needsConsent && (
        <div className="mt-4 rounded-sm border border-orange-100 bg-white p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Unlock the personalised summary
          </p>
          <p className="mt-1 text-caption text-text-muted">
            Bharat OS can write a short summary in your language from these signals.
            That needs your one-time memory.read consent. The composition stays
            on-device.
          </p>
          {onGrantConsent && (
            <div className="mt-2">
              <Action size="sm" onClick={onGrantConsent}>
                Review + grant
              </Action>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-caption text-text-muted">
        Composed on-device · {signals.horizonHours}h window ·{' '}
        <Badge variant="trust">§15 pointer-not-payload</Badge>
      </p>
    </Card>
  );
}
