// Phase 13.5 — CitizenDataOffersPanel
//
// Citizen-facing surface for publishing + managing data offers.
// The citizen marks specific data point KINDS (intents / doc
// summaries / PII redactions / skill runs / mesh contributions)
// as available for sponsor purchase at a per-data-point price,
// for specific purposes (model training / evaluation / safety
// benchmark / etc.), with a maximum sale count and an expiry.
//
// v1 ships the publish + list + revoke + pause loop. The sponsor
// browse + purchase flow lands in Phase 13.5.1; until then,
// salesCount stays at 0 — the panel demos the citizen-control
// invariants without the payment flow.
//
// §15 bindings:
//   • Citizen sees what's being sold, to whom (purpose), for how
//     much, BEFORE any transfer. Like every other consent grant.
//   • Citizen can revoke or pause. Outstanding sponsor purchases
//     (when 13.5.1 lands) carry the at-sale-time signature; later
//     revocation invalidates further use.
//   • Bharat OS never sells data without the citizen's explicit
//     publish action. The BE refuses any POST that doesn't match
//     the publisherId in the path (auth-bound to the active
//     identity).
//   • Honest empty state: when no offers, show the publish form
//     with a one-line explanation of what's being offered.

import { useMemo, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  useCitizenDataOffers,
  useCreateCitizenDataOffer,
  useRevokeCitizenDataOffer,
  usePauseCitizenDataOffer
} from '@/lib/hooks';
import {
  DATA_POINT_KINDS,
  DATA_POINT_KIND_LABEL,
  DATA_POINT_KIND_DESCRIPTION,
  SPONSOR_PURPOSES,
  SPONSOR_PURPOSE_LABEL,
  DEFAULT_OFFER_TTL_DAYS,
  defaultExpiresAt,
  formatRupees,
  type DataPointKind,
  type SponsorPurpose,
  type CitizenDataOffer
} from '@/lib/citizen-data-offer';
import type { ApiError } from '@/lib/api';

interface CitizenDataOffersPanelProps {
  identityId: string | null | undefined;
}

const STATUS_VARIANT: Record<
  CitizenDataOffer['status'],
  'trust' | 'pending' | 'error' | 'neutral'
> = {
  active: 'trust',
  paused: 'pending',
  revoked: 'error',
  exhausted: 'neutral'
};

const STATUS_LABEL: Record<CitizenDataOffer['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  revoked: 'Revoked',
  exhausted: 'Sold out'
};

// Default form values per spec — ₹50 per sale, 100 max sales,
// model_training purpose, 30-day TTL.
const DEFAULT_PRICE_RUPEES = 50;
const DEFAULT_MAX_SALES = 100;

export function CitizenDataOffersPanel({ identityId }: CitizenDataOffersPanelProps) {
  const offersQuery = useCitizenDataOffers(identityId);
  const createMut = useCreateCitizenDataOffer();
  const revokeMut = useRevokeCitizenDataOffer();
  const pauseMut = usePauseCitizenDataOffer();

  const [formKind, setFormKind] = useState<DataPointKind>('intent_text');
  const [formPriceRupees, setFormPriceRupees] = useState<number>(DEFAULT_PRICE_RUPEES);
  const [formMaxSales, setFormMaxSales] = useState<number>(DEFAULT_MAX_SALES);
  const [formPurposes, setFormPurposes] = useState<Set<SponsorPurpose>>(
    new Set<SponsorPurpose>(['model_training'])
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);

  const offers = useMemo(() => {
    const all = offersQuery.data?.offers ?? [];
    return [...all].sort((a, b) =>
      String(b.publishedAt).localeCompare(String(a.publishedAt))
    );
  }, [offersQuery.data]);

  function togglePurpose(p: SponsorPurpose) {
    setFormPurposes((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleCreate() {
    if (!identityId) return;
    if (formPurposes.size < 1) {
      setFormError('Pick at least one sponsor purpose.');
      return;
    }
    if (formPriceRupees < 1) {
      setFormError('Price must be at least ₹1 per sale.');
      return;
    }
    if (formMaxSales < 1) {
      setFormError('Max sales must be at least 1.');
      return;
    }
    setFormError(null);
    try {
      await createMut.mutateAsync({
        identityId,
        dataPointKind: formKind,
        pricePerSalePaise: Math.round(formPriceRupees * 100),
        maxSales: formMaxSales,
        sponsorPurposeAllowlist: [...formPurposes].sort() as SponsorPurpose[],
        expiresAt: defaultExpiresAt(DEFAULT_OFFER_TTL_DAYS)
      });
      setShowForm(false);
    } catch (err) {
      const code = (err as ApiError).code;
      if (code === 'duplicate_offer') {
        setFormError(
          'You already have an identical active offer. Revoke it first, or change the price / purposes.'
        );
      } else if (code === 'invalid_citizen_data_offer') {
        setFormError((err as ApiError).message || 'The offer was rejected by the server.');
      } else {
        setFormError("Couldn't publish — try again in a moment.");
      }
    }
  }

  async function handleRevoke(offer: CitizenDataOffer) {
    if (!identityId) return;
    await revokeMut.mutateAsync({
      identityId,
      offerId: offer.offerId,
      reason: 'citizen-initiated revocation'
    });
  }

  async function handlePause(offer: CitizenDataOffer) {
    if (!identityId) return;
    await pauseMut.mutateAsync({ identityId, offerId: offer.offerId });
  }

  if (!identityId) return null;

  return (
    <Card
      title="Sell your own data"
      subtitle="Phase 13.5 · publish a per-data-point sale offer to Bharat OS sponsors. Per-data-point consent. Revocable. Paid into your mesh balance."
      actions={<Badge variant="trust">Citizen revenue</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          Stays on this device until you publish · revocable
        </span>
      </div>

      {!showForm && (
        <Action variant="trust" onClick={() => setShowForm(true)}>
          Publish a new data offer
        </Action>
      )}

      {showForm && (
        <div className="mt-2 rounded-sm border border-border bg-surface p-3">
          <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-muted">
            What kind of data are you offering?
          </label>
          <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Data point kind">
            {DATA_POINT_KINDS.map((kind) => {
              const active = formKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFormKind(kind)}
                  className={
                    'rounded-full border px-3 py-1 text-caption font-semibold transition-colors ' +
                    (active
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text-muted hover:text-text')
                  }
                >
                  {DATA_POINT_KIND_LABEL[kind]}
                </button>
              );
            })}
          </div>
          <p className="mb-3 text-caption text-text-muted">
            {DATA_POINT_KIND_DESCRIPTION[formKind]}
          </p>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Price per sale (₹)
              </span>
              <input
                type="number"
                min={1}
                max={100_000}
                value={formPriceRupees}
                onChange={(e) =>
                  setFormPriceRupees(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
                Max sales
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={formMaxSales}
                onChange={(e) =>
                  setFormMaxSales(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                }
                className="mt-1 block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-muted">
            Which purposes may sponsors use this for?
          </label>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SPONSOR_PURPOSES.map((p) => {
              const active = formPurposes.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePurpose(p)}
                  className={
                    'rounded-full border px-3 py-1 text-caption font-semibold transition-colors ' +
                    (active
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text-muted hover:text-text')
                  }
                >
                  {SPONSOR_PURPOSE_LABEL[p]}
                </button>
              );
            })}
          </div>

          <p className="mb-3 text-caption text-text-muted">
            Offer expires in {DEFAULT_OFFER_TTL_DAYS} days · you can revoke at any time.
          </p>

          {formError && (
            <p className="mb-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <Action
              variant="trust"
              onClick={handleCreate}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? 'Publishing…' : 'Publish offer'}
            </Action>
            <Action
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
            >
              Cancel
            </Action>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
            Your published offers ({offers.length})
          </p>
          <ul className="space-y-2">
            {offers.map((offer) => (
              <li
                key={offer.offerId}
                className="rounded-sm border border-border bg-white p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[offer.status]}>
                    {STATUS_LABEL[offer.status]}
                  </Badge>
                  <Badge variant="neutral">
                    {DATA_POINT_KIND_LABEL[offer.dataPointKind]}
                  </Badge>
                  <span className="text-caption text-text-muted">
                    {formatRupees(offer.pricePerSalePaise)} / sale
                  </span>
                </div>
                <p className="text-body text-text">
                  {offer.salesCount} of {offer.maxSales} sales · expires{' '}
                  {offer.expiresAt.slice(0, 10)}
                </p>
                <p className="mt-1 text-caption text-text-muted">
                  Purposes:{' '}
                  {offer.sponsorPurposeAllowlist
                    .map((p) => SPONSOR_PURPOSE_LABEL[p as SponsorPurpose] ?? p)
                    .join(', ')}
                </p>
                {offer.status === 'active' && (
                  <div className="mt-2 flex gap-2">
                    <Action
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePause(offer)}
                      disabled={pauseMut.isPending}
                    >
                      Pause
                    </Action>
                    <Action
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(offer)}
                      disabled={revokeMut.isPending}
                    >
                      Revoke
                    </Action>
                  </div>
                )}
                {offer.status === 'paused' && (
                  <Action
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(offer)}
                    disabled={revokeMut.isPending}
                  >
                    Revoke
                  </Action>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {offers.length === 0 && !showForm && (
        <p className="mt-3 text-caption text-text-muted">
          You haven't published any data offers yet. Sponsors will be able to
          purchase from you once you do — paid into your mesh balance.
        </p>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          You decide WHAT kind of your data is available (intents you've
          submitted; on-device document summaries; PII-redacted text;
          skill-agent runs; federated learning contributions), at what PRICE
          per sale, for how many SALES at most, and for which sponsor
          PURPOSES. Sponsors who match your purpose list can purchase
          against your offer; each purchase pays into your mesh balance.
          You can pause or revoke any offer at any time — paused offers
          stop accepting new purchases; revoked offers can never be
          purchased again. v1 ships the publish + manage loop; the
          sponsor-side purchase flow lands in Phase 13.5.1.
        </p>
      </details>
    </Card>
  );
}
