import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Action, Badge, Card, Field, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useCreateProviderIdentity,
  useProviderIdentities,
  type ProviderRoleKind
} from '@/lib/hooks';
import { EARN_ROLES } from '@/lib/earn-roles';

// Phase 12.0 — generic provider-onboarding flow. Per-role wizard
// ships in Phase 12.2 (Aadhaar e-KYC + role-specific docs +
// SLM dynamic-form). v1 collects the substrate-required minimum
// (display name + rate + brief description) and saves a draft
// providerIdentity. Activation requires operator KYC attestation
// (Phase 12.2 adapter); the draft sits visible to its owner only.
//
// §15: nothing about this flow self-attests KYC. The "ready to
// submit" message is honest about the gap.

const PROVIDER_ROLE_LABELS: Record<ProviderRoleKind, string> = {
  'cab-driver': 'Cab / auto driver',
  'personal-driver': 'Personal driver',
  labourers: 'Daily-wage labourer',
  'household-help': 'Maid / cook (household help)',
  kirana: 'Kirana / shop owner',
  'skilled-trades': 'Skilled trade'
};

const ROLE_RATE_LABEL: Record<ProviderRoleKind, { hourly: string; perService: string }> = {
  'cab-driver': { hourly: 'Hourly rate (₹/hr)', perService: 'Minimum fare (₹)' },
  'personal-driver': { hourly: 'Hourly rate (₹/hr)', perService: 'Full-day rate (₹)' },
  labourers: { hourly: 'Hourly rate (₹/hr)', perService: 'Day rate (₹)' },
  'household-help': { hourly: 'Hourly rate (₹/hr)', perService: 'Monthly rate (₹)' },
  kirana: { hourly: '', perService: 'Average order minimum (₹)' },
  'skilled-trades': { hourly: 'Hourly rate (₹/hr)', perService: 'Per-visit rate (₹)' }
};

export function ProviderOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const identity = useActiveIdentity();
  const roleParam = searchParams.get('role') as ProviderRoleKind | null;
  const role = roleParam && roleParam in PROVIDER_ROLE_LABELS ? roleParam : null;
  const roleMeta = useMemo(
    () => EARN_ROLES.find((r) => r.providerRoleKind === role),
    [role]
  );
  const show = useToast((s) => s.show);
  const existing = useProviderIdentities(identity?.id);
  const create = useCreateProviderIdentity();

  const [displayName, setDisplayName] = useState('');
  const [areaSummary, setAreaSummary] = useState('');
  const [hourlyRupees, setHourlyRupees] = useState('');
  const [perServiceRupees, setPerServiceRupees] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (identity && !displayName) setDisplayName(identity.displayName ?? '');
  }, [identity, displayName]);

  const alreadyHasForRole = useMemo(
    () => existing.data?.some((p) => p.roleKind === role),
    [existing.data, role]
  );

  if (!identity) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-12 pt-6 space-y-4">
        <Card tone="warning">
          <p className="text-body">
            Pick a persona first. <Link to="/" className="underline">Back to home</Link>.
          </p>
        </Card>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-12 pt-6 space-y-4">
        <Card tone="warning">
          <p className="text-body">
            Missing or unknown role. <Link to="/worker" className="underline">Back to earn home</Link>.
          </p>
        </Card>
      </main>
    );
  }

  const rateLabels = ROLE_RATE_LABEL[role];

  function handleSubmit() {
    if (!displayName.trim()) {
      show('Display name is required.', 'error');
      return;
    }
    const hourly = Math.max(0, Math.round(Number(hourlyRupees || '0') * 100));
    const perService = Math.max(0, Math.round(Number(perServiceRupees || '0') * 100));
    if (hourly === 0 && perService === 0) {
      show('Set at least one rate so citizens know what to expect.', 'error');
      return;
    }
    create.mutate(
      {
        rootIdentityId: identity!.id,
        roleKind: role!,
        displayName: displayName.trim(),
        ratePaisePerHour: hourly,
        ratePaisePerService: perService,
        serviceArea: areaSummary.trim()
          ? { summary: areaSummary.trim() }
          : null,
        description: description.trim() || null
      },
      {
        onSuccess: ({ providerIdentity }) => {
          show(`Draft provider profile created (${providerIdentity.status}).`, 'success');
          navigate('/worker');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-12 pt-6 space-y-4">
      <header>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Provider onboarding · Phase 12.0
        </p>
        <h1 className="text-display font-semibold">
          {PROVIDER_ROLE_LABELS[role]}
        </h1>
        {roleMeta?.description && (
          <p className="mt-2 text-body text-text-muted">{roleMeta.description}</p>
        )}
      </header>

      <Card tone="trust">
        <p className="text-body">
          <span className="font-semibold">Bharat OS does not take a cut.</span>{' '}
          Citizens pay you directly via UPI when they book. Bharat OS only
          provides the substrate, signature, and Trust Passport.
        </p>
      </Card>

      {alreadyHasForRole && (
        <Card tone="warning">
          <p className="text-body">
            You already have a {PROVIDER_ROLE_LABELS[role]} profile on this
            identity. Creating another will leave both as separate drafts —
            consider editing the existing one instead (per-profile edit ships
            in Phase 12.2).
          </p>
        </Card>
      )}

      <Card title="Profile basics">
        <div className="space-y-3">
          <Field
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What citizens will see"
          />
          <Field
            label="Service area (in your own words)"
            value={areaSummary}
            onChange={(e) => setAreaSummary(e.target.value)}
            placeholder="Eg: Pune Camp & Kothrud, within 10 km of station"
            helper="Phase 12.1a will replace this free text with a proper geo polygon."
          />
          {rateLabels.hourly && (
            <Field
              label={rateLabels.hourly}
              type="number"
              inputMode="numeric"
              value={hourlyRupees}
              onChange={(e) => setHourlyRupees(e.target.value)}
              placeholder="0"
              helper="Whole rupees. Saved internally in paise."
            />
          )}
          <Field
            label={rateLabels.perService}
            type="number"
            inputMode="numeric"
            value={perServiceRupees}
            onChange={(e) => setPerServiceRupees(e.target.value)}
            placeholder="0"
          />
          <Field
            label="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you offer, languages spoken, anything else citizens should know"
          />
        </div>
      </Card>

      <Card tone="governance">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          What happens next
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-body text-text">
          <li>This creates a <Badge variant="pending">draft</Badge> profile.</li>
          <li>
            Bharat OS operator reviews your KYC (Aadhaar + role-specific docs).
            Per-role wizard with on-device dynamic forms ships in Phase 12.2 —
            today an operator does it manually.
          </li>
          <li>
            Once attested + activated, your profile shows up in the citizen
            marketplace (Phase 12.1a) and you can accept bookings.
          </li>
        </ol>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Action onClick={handleSubmit} disabled={create.isPending}>
          {create.isPending ? 'Creating draft…' : 'Create draft profile'}
        </Action>
        <Action variant="ghost" onClick={() => navigate('/worker')}>
          Cancel
        </Action>
      </div>
    </main>
  );
}
