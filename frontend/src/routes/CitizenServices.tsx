import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Action, Badge, Card, Money, Tabs, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useExpressInterest,
  useNearbyProviders,
  usePublicProvider,
  type DistanceBand,
  type NearbyProvider,
  type ProviderKycLevel,
  type ProviderRoleKind
} from '@/lib/hooks';
import { distanceBandLabel, round1, type CityCentroid } from '@/lib/geo';
import { useGeolocationCapture, LOCATION_CONSENT_COPY } from '@/lib/geolocation';
import { LocationConsentSheet, CityPickerSheet } from '@/components/geo';

// Phase 12.1a.1 — Citizen marketplace browse surface.
//
// Routes (nested under /citizen):
//   /citizen/services             → ServicesIndex (role tiles)
//   /citizen/services/role/:role  → ServicesByRole (nearby list)
//   /citizen/services/provider/:providerIdentityId → ProviderDetail
//
// We do NOT add a 6th bottom-nav tab — the same 5-tab Tabs renders
// on every nested screen for context. Discovery feels native to
// the existing /citizen surface, not a separate marketplace silo.

const TABS = [
  { to: '/citizen/home', label: 'Home', icon: '🏠' },
  { to: '/citizen/notes', label: 'Notes', icon: '📝' },
  { to: '/citizen/trust', label: 'Trust', icon: '🛡' },
  { to: '/labs', label: 'Labs', icon: '🧪' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

// Wave-1 roles browsable in 12.1a.1 — match the EARN_ROLES catalog
// wave-1 list.
const BROWSE_ROLES: Array<{ role: ProviderRoleKind; label: string; icon: string; blurb: string }> = [
  { role: 'cab-driver', label: 'Cabs & autos', icon: '🚕', blurb: 'Owner-driven taxi, auto, or app-cab.' },
  { role: 'personal-driver', label: 'Personal driver', icon: '🚗', blurb: 'Chauffeur for your own vehicle.' },
  { role: 'household-help', label: 'Cook / maid', icon: '🍲', blurb: 'Household help with police verification.' },
  { role: 'labourers', label: 'Daily-wage labour', icon: '🛠', blurb: 'Construction, loading, farm.' }
];

const KYC_LABEL: Record<ProviderKycLevel, string> = {
  verified: 'KYC verified',
  basic: 'KYC basic',
  none: 'KYC pending'
};

// UX-11 (adversarial review) — 'none' is intentional & honest for
// Phase 12.1a.1 (KYC adapter ships in 12.2); rendering it as
// warning-orange falsely alarms citizens and hurts cold-start
// supply. Neutral pill keeps the signal honest without scaring.
const KYC_TONE: Record<ProviderKycLevel, 'trust' | 'neutral' | 'warning'> = {
  verified: 'trust',
  basic: 'neutral',
  none: 'neutral'
};

function rupeesFromPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function ServicesIndex() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-4">
      <header>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Bharat OS marketplace · Phase 12.1a
        </p>
        <h1 className="text-display font-semibold">Find someone near you</h1>
        <p className="mt-2 text-body text-text-muted">
          Direct contact with Bharat OS providers. No middleman markup
          — you pay them, we don&apos;t take a cut.
        </p>
      </header>

      <Card tone="trust">
        <p className="text-body">
          <span className="font-semibold">Your location stays on this device.</span>{' '}
          We round it to about 11 km before searching, never store it, and
          never share it with providers.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BROWSE_ROLES.map((r) => (
          <Link
            key={r.role}
            to={`/citizen/services/role/${r.role}`}
            className="block rounded-lg border border-border bg-surface p-4 hover:border-accent"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-3xl">{r.icon}</span>
              <div>
                <p className="text-body font-semibold text-text">{r.label}</p>
                <p className="text-caption text-text-muted">{r.blurb}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card tone="governance">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Coming next (Phase 12.1a.2)
        </p>
        <p className="mt-1 text-body text-text">
          Tap to book + parallel escrow + provider notification. For
          now, &ldquo;Express interest&rdquo; lets the provider know you&apos;d like
          to talk; the actual booking flow ships next.
        </p>
      </Card>
    </main>
  );
}

function NearbyProviderCard({ provider }: { provider: NearbyProvider }) {
  // UX-12 (adversarial review) — service-only providers may set
  // ratePaisePerService without ratePaisePerHour. Render whichever
  // are non-zero; fall back to honest "discuss" copy when both
  // are zero so the listing doesn't look priceless.
  const hasHourly = provider.ratePaisePerHour > 0;
  const hasPerService = provider.ratePaisePerService > 0;
  return (
    <Link
      to={`/citizen/services/provider/${encodeURIComponent(provider.providerIdentityId)}`}
      className="block rounded-lg border border-border bg-surface p-4 hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-text">{provider.displayName}</p>
          {provider.description && (
            <p className="mt-1 text-caption text-text-muted line-clamp-2">{provider.description}</p>
          )}
          {(hasHourly || hasPerService) ? (
            <p className="mt-1 text-caption text-text">
              {hasHourly && <>₹{rupeesFromPaise(provider.ratePaisePerHour)}/hr</>}
              {hasHourly && hasPerService && <> · </>}
              {hasPerService && <>₹{rupeesFromPaise(provider.ratePaisePerService)} per service</>}
            </p>
          ) : (
            <p className="mt-1 text-caption text-text-muted">Rates: discuss with provider</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="trust">{distanceBandLabel(provider.distanceBand as DistanceBand)}</Badge>
          <Badge variant={KYC_TONE[provider.kycLevel]}>{KYC_LABEL[provider.kycLevel]}</Badge>
        </div>
      </div>
    </Link>
  );
}

function ServicesByRole() {
  const params = useParams<{ role: string }>();
  const role = params.role as ProviderRoleKind;
  const roleMeta = BROWSE_ROLES.find((r) => r.role === role);

  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  // PRIV-5 (adversarial review) — once the citizen declines location
  // sharing, suppress the consent prompt for the rest of this session
  // and steer them straight to the city picker. CityPickerSheet
  // remains permanently available; nobody is ever forced to geo-share.
  const [skipLocationPrompt, setSkipLocationPrompt] = useState(false);

  // Citizen search wants coarse precision (~11 km).
  const geo = useGeolocationCapture({ precision: 'coarse' });

  // Push captured geo into origin.
  useEffect(() => {
    if (geo.status.kind === 'captured') {
      setOrigin({
        lat: geo.status.result.lat,
        lng: geo.status.result.lng,
        label: 'Your area'
      });
    }
  }, [geo.status]);

  const enabled = origin != null;
  const lat = origin ? round1(origin.lat) : null;
  const lng = origin ? round1(origin.lng) : null;
  const nearby = useNearbyProviders({
    lat,
    lng,
    radiusMeters: 10000,
    role,
    enabled
  });

  if (!roleMeta) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card tone="warning">
          <p className="text-body">
            Unknown role.{' '}
            <Link to="/citizen/services" className="underline">
              Back to services
            </Link>
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-4">
      <header>
        <Link to="/citizen/services" className="text-caption text-text-muted underline">
          ← All services
        </Link>
        <h1 className="mt-1 text-display font-semibold">
          {roleMeta.icon} {roleMeta.label}
        </h1>
        <p className="mt-1 text-body text-text-muted">{roleMeta.blurb}</p>
      </header>

      {!origin && (
        <Card title="Where are you?">
          <p className="text-body text-text-muted">
            We need a rough area (about 11 km) to find providers near you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!skipLocationPrompt && (
              <Action onClick={() => setConsentOpen(true)}>Use my location</Action>
            )}
            <Action variant={skipLocationPrompt ? 'default' : 'ghost'} onClick={() => setCityOpen(true)}>
              Pick a city
            </Action>
          </div>
          {geo.status.kind === 'denied' && (
            <p className="mt-2 text-caption text-text-muted">{geo.status.reason}</p>
          )}
          {geo.status.kind === 'unavailable' && (
            <p className="mt-2 text-caption text-text-muted">{geo.status.reason}</p>
          )}
        </Card>
      )}

      {origin && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="trust">{origin.label}</Badge>
            <button
              type="button"
              onClick={() => {
                setOrigin(null);
                geo.reset();
              }}
              className="text-caption text-text-muted underline"
            >
              Change location
            </button>
          </div>
        </Card>
      )}

      {origin && nearby.isPending && (
        <Card>
          <p className="text-body text-text-muted">Searching nearby…</p>
        </Card>
      )}

      {origin && nearby.isError && (
        <Card tone="warning">
          <p className="text-body">Could not load providers.</p>
          {/* UX-5 (adversarial review) — actually let the citizen retry. */}
          <div className="mt-2">
            <Action onClick={() => nearby.refetch()}>Retry</Action>
          </div>
        </Card>
      )}

      {origin && nearby.data && nearby.data.results.length === 0 && (
        <Card tone="governance">
          <p className="text-body font-semibold">
            No Bharat OS providers near you yet.
          </p>
          <p className="mt-1 text-body text-text-muted">
            We don&apos;t fall back to other apps automatically — that would
            mean a cut. Invite someone you trust to onboard, or check a
            nearby city.
          </p>
        </Card>
      )}

      {origin && nearby.data && nearby.data.results.length > 0 && (
        <div className="space-y-3">
          {nearby.data.results.map((p) => (
            <NearbyProviderCard key={p.providerIdentityId} provider={p} />
          ))}
        </div>
      )}

      <LocationConsentSheet
        open={consentOpen}
        copy={LOCATION_CONSENT_COPY}
        onUseLocation={() => {
          setConsentOpen(false);
          geo.capture();
        }}
        onPickCity={() => {
          setConsentOpen(false);
          setCityOpen(true);
        }}
        onDontAskAgain={() => {
          setSkipLocationPrompt(true);
          setConsentOpen(false);
          setCityOpen(true);
        }}
        onClose={() => setConsentOpen(false)}
      />

      <CityPickerSheet
        open={cityOpen}
        onClose={() => setCityOpen(false)}
        onPickCity={(city: CityCentroid) => {
          setCityOpen(false);
          setOrigin({
            lat: round1(city.lat)!,
            lng: round1(city.lng)!,
            label: city.label
          });
        }}
      />
    </main>
  );
}

function ProviderDetail() {
  const params = useParams<{ providerIdentityId: string }>();
  const identity = useActiveIdentity();
  const navigate = useNavigate();
  const show = useToast((s) => s.show);
  const provider = usePublicProvider(params.providerIdentityId);
  const expressInterest = useExpressInterest();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const area = useMemo(() => {
    if (!provider.data?.serviceArea) return null;
    return provider.data.serviceArea;
  }, [provider.data]);

  if (provider.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading provider…</p>
      </main>
    );
  }

  if (provider.isError || !provider.data) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card tone="warning">
          <p className="text-body">
            Could not load this provider.{' '}
            <Link to="/citizen/services" className="underline">
              Back to services
            </Link>
          </p>
        </Card>
      </main>
    );
  }

  const p = provider.data;

  function handleExpressInterest() {
    if (!identity) {
      // UX-1 (adversarial review) — reset local UI state so a
      // signed-out citizen tapping the button doesn't see a stale
      // "interest sent" card from a prior session.
      setSent(false);
      setNote('');
      show('Sign in first.', 'error');
      return;
    }
    expressInterest.mutate(
      {
        providerIdentityId: p.providerIdentityId,
        citizenRootIdentityId: identity.id,
        note: note.trim() || null
      },
      {
        onSuccess: () => {
          setSent(true);
          show('Interest sent — the provider will be notified.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-4">
      <header>
        <Link to="/citizen/services" className="text-caption text-text-muted underline">
          ← All services
        </Link>
        <h1 className="mt-1 text-display font-semibold">{p.displayName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            {BROWSE_ROLES.find((r) => r.role === p.roleKind)?.label ?? p.roleKind}
          </Badge>
          <Badge variant={KYC_TONE[p.kycLevel]}>{KYC_LABEL[p.kycLevel]}</Badge>
        </div>
      </header>

      {p.description && (
        <Card title="About">
          <p className="text-body">{p.description}</p>
        </Card>
      )}

      {(p.ratePaisePerHour > 0 || p.ratePaisePerService > 0) && (
        <Card title="Rates (citizens pay direct, no Bharat OS cut)">
          <div className="space-y-2">
            {p.ratePaisePerHour > 0 && (
              <p className="text-body">
                <span className="font-semibold">Hourly:</span> <Money paise={p.ratePaisePerHour} />/hr
              </p>
            )}
            {p.ratePaisePerService > 0 && (
              <p className="text-body">
                <span className="font-semibold">Per service:</span> <Money paise={p.ratePaisePerService} />
              </p>
            )}
          </div>
        </Card>
      )}

      {area && area.kind === 'point-radius' && (
        <Card title="Service area">
          <p className="text-body text-text">
            About {Math.round(area.radiusMeters / 1000)} km radius
            around {area.summary ?? 'their pin'}.
          </p>
          <p className="mt-1 text-caption text-text-muted">
            Pin is shown approximately (~1 km accurate) for the
            provider&apos;s safety.
          </p>
        </Card>
      )}

      {area && area.kind === 'legacy-summary' && area.summary && (
        <Card title="Service area">
          <p className="text-body text-text">{area.summary}</p>
          <p className="mt-1 text-caption text-text-muted">
            Provider hasn&apos;t set a pinned area yet.
          </p>
        </Card>
      )}

      <Card title="Get in touch">
        {sent ? (
          <Card tone="trust">
            <p className="text-body font-semibold">Interest sent.</p>
            <p className="mt-1 text-body text-text-muted">
              The provider will be notified next session. The actual
              booking flow (with escrow + confirmation) ships in Phase
              12.1a.2.
            </p>
            <div className="mt-3">
              <Action variant="ghost" onClick={() => navigate('/citizen/services')}>
                Browse more
              </Action>
            </div>
          </Card>
        ) : (
          <>
            <p className="text-body text-text-muted">
              Send a short message — the provider sees that you&apos;d like to
              talk. Phase 12.1a.2 will add tap-to-book + escrow on top of
              this.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              placeholder="Eg: Need a ride from Shivajinagar to PMC tomorrow morning."
              className="mt-2 w-full rounded-md border border-border bg-surface p-2 text-body"
              rows={3}
            />
            <p className="text-caption text-text-muted">{note.length}/280</p>
            <div className="mt-2">
              <Action onClick={handleExpressInterest} disabled={expressInterest.isPending}>
                {expressInterest.isPending ? 'Sending…' : 'Express interest'}
              </Action>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}

export function CitizenServices() {
  return (
    <>
      <Routes>
        <Route index element={<ServicesIndex />} />
        <Route path="role/:role" element={<ServicesByRole />} />
        <Route path="provider/:providerIdentityId" element={<ProviderDetail />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
      <Tabs items={TABS} />
    </>
  );
}
