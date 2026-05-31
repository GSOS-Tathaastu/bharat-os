import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Action, Badge, Card, Field, Money, Tabs, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useBooking,
  useBookingTransition,
  useCitizenBookings,
  useCitizenEscrow,
  useCreateBooking,
  useExpressInterest,
  useNearbyProviders,
  usePublicProvider,
  type BookingPricingBasis,
  type DistanceBand,
  type NearbyProvider,
  type ProviderKycLevel,
  type ProviderRoleKind
} from '@/lib/hooks';
import { distanceBandLabel, round1, round4, type CityCentroid } from '@/lib/geo';
import { useGeolocationCapture, LOCATION_CONSENT_COPY } from '@/lib/geolocation';
import { LocationConsentSheet, CityPickerSheet } from '@/components/geo';
import {
  BookingCard,
  BookingStatusPill,
  DisputeFileSheet,
  AutoReleaseCountdown
} from '@/components/booking';
import { formatRupees, formatRateBasis } from '@/lib/format-paise';

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

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body font-semibold">My bookings</p>
            <p className="text-caption text-text-muted">Active + history</p>
          </div>
          <Link to="/citizen/services/bookings">
            <Action variant="ghost">Open →</Action>
          </Link>
        </div>
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

      <Card title="Book now" tone="trust">
        <p className="text-body">
          Phase 12.1a.2: lock escrow, push the provider, and track the
          booking through completion. You pay the provider directly — no
          Bharat OS cut.
        </p>
        <div className="mt-2">
          <Action onClick={() => navigate(`/citizen/services/book/${encodeURIComponent(p.providerIdentityId)}`)}>
            Book now
          </Action>
        </div>
      </Card>

      <Card title="Or — Express interest (no escrow lock)">
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

// ─── Phase 12.1a.2 — booking flow ──────────────────────────────────

function BookingComposer() {
  const { providerIdentityId } = useParams<{ providerIdentityId: string }>();
  const identity = useActiveIdentity();
  const navigate = useNavigate();
  const show = useToast((s) => s.show);
  const provider = usePublicProvider(providerIdentityId);
  const escrow = useCitizenEscrow(identity?.id);
  const create = useCreateBooking();
  const geo = useGeolocationCapture({ precision: 'medium' });
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [basis, setBasis] = useState<BookingPricingBasis>('per-service');
  const [estimatedHours, setEstimatedHours] = useState('1');

  useEffect(() => {
    if (geo.status.kind === 'captured') {
      setPickupLat(geo.status.result.lat);
      setPickupLng(geo.status.result.lng);
    }
  }, [geo.status]);

  // UX-1 (adversarial review) — when the provider has only one rate,
  // flip the basis state to match so the user doesn't end up locked
  // into the wrong basis with a zero quoted amount.
  useEffect(() => {
    const hasHour = (provider.data?.ratePaisePerHour ?? 0) > 0;
    const hasService = (provider.data?.ratePaisePerService ?? 0) > 0;
    if (hasService && !hasHour && basis !== 'per-service') setBasis('per-service');
    else if (hasHour && !hasService && basis !== 'per-hour') setBasis('per-hour');
  }, [provider.data, basis]);

  if (provider.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading…</p>
      </main>
    );
  }
  if (provider.isError || !provider.data) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card tone="warning">
          <p className="text-body">
            Provider not found.{' '}
            <Link to="/citizen/services" className="underline">Back to services</Link>
          </p>
        </Card>
      </main>
    );
  }
  const p = provider.data;
  const ratePerHour = p.ratePaisePerHour > 0 ? p.ratePaisePerHour : null;
  const ratePerService = p.ratePaisePerService > 0 ? p.ratePaisePerService : null;
  const quotedAmountPaise =
    basis === 'per-service'
      ? (ratePerService ?? 0)
      : Math.round((ratePerHour ?? 0) * Math.max(0, Number(estimatedHours) || 0));
  const requiresPickup = p.roleKind !== 'kirana';
  const pickupOk = !requiresPickup || (pickupLat != null && pickupLng != null);
  const balanceOk = (escrow.data?.availablePaise ?? 0) >= quotedAmountPaise && quotedAmountPaise > 0;

  async function handleConfirm() {
    if (!identity) {
      show('Sign in first.', 'error');
      return;
    }
    if (!pickupOk) {
      show('Set your pickup location first.', 'error');
      return;
    }
    if (!balanceOk) {
      show(`Top up your escrow — need ${formatRupees(quotedAmountPaise)}, have ${formatRupees(escrow.data?.availablePaise ?? 0)}.`, 'error');
      return;
    }
    try {
      const result = await create.mutateAsync({
        citizenRootIdentityId: identity.id,
        providerIdentityId: p.providerIdentityId,
        pricingBasis: basis,
        estimatedHours: basis === 'per-hour' ? Number(estimatedHours) : null,
        pickup: requiresPickup
          ? { lat: round4(pickupLat!)!, lng: round4(pickupLng!)!, address: address.trim() || null }
          : null,
        citizenNote: note.trim() || null,
        expectedAmountPaise: quotedAmountPaise
      });
      show('Booking locked. Provider notified.', 'success');
      navigate(`/citizen/services/bookings/${encodeURIComponent(result.booking.bookingId)}`);
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <Link to={`/citizen/services/provider/${encodeURIComponent(p.providerIdentityId)}`} className="text-caption text-text-muted underline">
        ← Provider profile
      </Link>
      <header>
        <h1 className="text-display font-semibold">Book {p.displayName}</h1>
        <p className="mt-1 text-body text-text-muted">
          You&rsquo;re locking <Money paise={quotedAmountPaise} /> into escrow now. The
          provider sees a notification; they accept or reject.
        </p>
      </header>

      {/* UX-1 (adversarial review) — render an honest pricing card
          even when the provider has only one rate set. */}
      <Card title="Pricing basis">
        {ratePerHour && ratePerService ? (
          <div className="flex flex-wrap gap-2">
            <Action variant={basis === 'per-service' ? 'default' : 'ghost'} onClick={() => setBasis('per-service')}>
              {formatRateBasis(ratePerService, 'per-service')}
            </Action>
            <Action variant={basis === 'per-hour' ? 'default' : 'ghost'} onClick={() => setBasis('per-hour')}>
              {formatRateBasis(ratePerHour, 'per-hour')}
            </Action>
          </div>
        ) : ratePerHour ? (
          <p className="text-body">
            {formatRateBasis(ratePerHour, 'per-hour')} (provider&rsquo;s only option)
          </p>
        ) : ratePerService ? (
          <p className="text-body">
            {formatRateBasis(ratePerService, 'per-service')} (provider&rsquo;s only option)
          </p>
        ) : (
          <p className="text-body text-text-muted">
            This provider hasn&rsquo;t set a rate yet. Discuss directly before booking.
          </p>
        )}
      </Card>

      {basis === 'per-hour' && ratePerHour && (
        <Card>
          <Field
            label="Estimated hours"
            type="number"
            inputMode="decimal"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            helper="Used to compute the locked amount. Snapshot — provider rate edits don't affect this booking."
          />
        </Card>
      )}

      {requiresPickup && (
        <Card title="Pickup location">
          {pickupLat == null || pickupLng == null ? (
            <>
              <p className="text-body text-text-muted">
                Bharat OS rounds it to about 1 km before sending. Stored on
                this booking only — not on your profile.
              </p>
              <div className="mt-2">
                <Action onClick={() => geo.capture()}>Use my location</Action>
              </div>
              {geo.status.kind === 'denied' && (
                <p className="mt-2 text-caption text-text-muted">{geo.status.reason}</p>
              )}
              {geo.status.kind === 'unavailable' && (
                <p className="mt-2 text-caption text-text-muted">{geo.status.reason}</p>
              )}
            </>
          ) : (
            <>
              <Badge variant="trust">
                Pin: {pickupLat.toFixed(4)}, {pickupLng.toFixed(4)}
              </Badge>
              <Field
                label="Address / landmark (optional)"
                value={address}
                onChange={(e) => setAddress(e.target.value.slice(0, 200))}
                placeholder="Eg: Near Shivajinagar bus stand"
              />
              <button
                type="button"
                onClick={() => { setPickupLat(null); setPickupLng(null); geo.reset(); }}
                className="text-caption text-text-muted underline"
              >
                Clear pin
              </button>
            </>
          )}
        </Card>
      )}

      <Card title="Note for the provider (optional)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          placeholder="Eg: From PMC entrance, need to reach Camp by 9am."
          className="w-full rounded-md border border-border bg-surface p-2 text-body"
          rows={3}
        />
        <p className="text-caption text-text-muted">{note.length}/280</p>
      </Card>

      {/* UX-2 (adversarial review) — user-facing copy only; no
          "admin (bookkeeping-v1)" impl detail in the body. */}
      <Card tone={balanceOk ? 'trust' : 'warning'}>
        <p className="text-body">
          <span className="font-semibold">Escrow lock:</span> {formatRupees(quotedAmountPaise)}
        </p>
        <p className="mt-1 text-caption text-text-muted">
          Available in your Bharat OS account: {formatRupees(escrow.data?.availablePaise ?? 0)}
        </p>
        {!balanceOk && (
          <p className="mt-1 text-body">
            You need {formatRupees(quotedAmountPaise)} to lock this booking.
            Add funds to your account, then try again.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Action onClick={handleConfirm} disabled={!balanceOk || !pickupOk || create.isPending}>
          {create.isPending ? 'Locking…' : 'Lock escrow + send booking'}
        </Action>
        <Action variant="ghost" onClick={() => navigate(-1)}>Cancel</Action>
      </div>
    </main>
  );
}

function CitizenBookingsList() {
  const identity = useActiveIdentity();
  const bookings = useCitizenBookings(identity?.id);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <Link to="/citizen/services" className="text-caption text-text-muted underline">
        ← Services
      </Link>
      <h1 className="text-display font-semibold">My bookings</h1>
      {bookings.isPending && <p className="text-body text-text-muted">Loading…</p>}
      {!bookings.isPending && (bookings.data ?? []).length === 0 && (
        <Card>
          <p className="text-body text-text-muted">You have no bookings yet.</p>
        </Card>
      )}
      {(bookings.data ?? []).map((b) => (
        <BookingCard
          key={b.bookingId}
          booking={b}
          role="citizen"
          to={`/citizen/services/bookings/${encodeURIComponent(b.bookingId)}`}
        />
      ))}
    </main>
  );
}

function CitizenBookingDetail() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const identity = useActiveIdentity();
  const show = useToast((s) => s.show);
  const navigate = useNavigate();
  const bookingQuery = useBooking(bookingId, identity?.id);
  const transition = useBookingTransition();
  const [disputeOpen, setDisputeOpen] = useState(false);

  if (bookingQuery.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading…</p>
      </main>
    );
  }
  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card tone="warning">
          <p className="text-body">
            Could not load booking.{' '}
            <Link to="/citizen/services/bookings" className="underline">Back to bookings</Link>
          </p>
        </Card>
      </main>
    );
  }
  const b = bookingQuery.data;

  async function fire(action: 'cancel' | 'confirm-complete' | 'dispute', reason?: string) {
    if (!identity) return;
    try {
      const result = await transition.mutateAsync({
        bookingId: b.bookingId,
        action,
        actingRootIdentityId: identity.id,
        expectedSeq: b.seq,
        reason
      });
      show(`Booking ${result.booking.status.replace(/_/g, ' ')}.`, 'success');
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <Link to="/citizen/services/bookings" className="text-caption text-text-muted underline">
        ← My bookings
      </Link>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Booking
            </p>
            <h1 className="text-heading font-semibold">{formatRupees(b.rateSnapshot.quotedAmountPaise)}</h1>
            <p className="mt-1 text-body text-text-muted">
              {formatRateBasis(
                b.rateSnapshot.pricingBasis === 'per-hour'
                  ? b.rateSnapshot.ratePaisePerHour
                  : b.rateSnapshot.ratePaisePerService,
                b.rateSnapshot.pricingBasis
              )}
            </p>
          </div>
          <BookingStatusPill status={b.status} />
        </div>
      </Card>

      {b.status === 'provider_marked_complete' && (
        <Card title="Provider marked complete">
          <p className="text-body text-text-muted">
            Confirm the work happened to release payment, or file a
            dispute. If you do nothing for 24h it auto-releases.
          </p>
          <div className="mt-2">
            <AutoReleaseCountdown providerCompletedAt={b.providerCompletedAt} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Action onClick={() => fire('confirm-complete')} disabled={transition.isPending}>
              Confirm complete
            </Action>
            <Action variant="ghost" onClick={() => setDisputeOpen(true)}>
              Dispute
            </Action>
          </div>
        </Card>
      )}

      {(b.status === 'pre_authorized' || b.status === 'in_progress') && (
        <Card title="Cancel or dispute">
          <p className="text-body text-text-muted">
            Cancelling refunds your escrow. Dispute holds escrow until an
            operator adjudicates.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Action variant="ghost" onClick={() => fire('cancel')} disabled={transition.isPending}>
              Cancel booking
            </Action>
            {b.status === 'in_progress' && (
              <Action variant="ghost" onClick={() => setDisputeOpen(true)}>
                File dispute
              </Action>
            )}
          </div>
        </Card>
      )}

      {b.pickupPoint && b.pickupPoint.lat != null && (
        <Card title="Pickup">
          <p className="text-body text-text">
            {b.pickupPoint.address || 'Pinned location'}
          </p>
          <p className="mt-1 text-caption text-text-muted">
            {b.pickupPoint.lat.toFixed(4)}, {b.pickupPoint.lng?.toFixed(4)}
          </p>
        </Card>
      )}

      {b.citizenNote && (
        <Card title="Your note">
          <p className="text-body">&ldquo;{b.citizenNote}&rdquo;</p>
        </Card>
      )}

      <DisputeFileSheet
        open={disputeOpen}
        busy={transition.isPending}
        onClose={() => setDisputeOpen(false)}
        onFile={async (reason) => {
          setDisputeOpen(false);
          await fire('dispute', reason);
          navigate('/citizen/services/bookings');
        }}
      />
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
        <Route path="book/:providerIdentityId" element={<BookingComposer />} />
        <Route path="bookings" element={<CitizenBookingsList />} />
        <Route path="bookings/:bookingId" element={<CitizenBookingDetail />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
      <Tabs items={TABS} />
    </>
  );
}
