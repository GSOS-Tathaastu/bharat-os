// Phase 13.5.1 — SponsorDataOffers page.
//
// Sponsor-facing surface for browsing + purchasing citizen data
// offers. Bearer-token gated. Composes the substrate landed in
// Phase 13.5 (citizen-side publishing) with the new sponsor-side
// browse + purchase endpoints.
//
// §15 bindings preserved:
//   • Bearer-token auth on every read + write.
//   • Sponsor purpose declared per-purchase; BE rejects 403 if
//     the declared purpose isn't in the offer's allowlist.
//   • Insufficient escrow returns 409 with availablePaise +
//     requiredPaise so the UI can surface the gap honestly.
//   • Per-purchase row carries POINTER + count-only meta;
//     never the data point bytes (delivery flow lands in 13.5.2).

import { useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  useSponsorBrowseDataOffers,
  useSponsorPurchaseDataOffer,
  useSponsorDataOfferPurchases,
  useSponsorSelf
} from '@/lib/hooks';
import {
  DATA_POINT_KIND_LABEL,
  SPONSOR_PURPOSE_LABEL,
  SPONSOR_PURPOSES,
  formatRupees,
  type DataPointKind,
  type SponsorPurpose,
  type CitizenDataOffer
} from '@/lib/citizen-data-offer';
import type { ApiError } from '@/lib/api';

const ALL_PURPOSE_FILTER = '__all__';

export function SponsorDataOffers() {
  const [purposeFilter, setPurposeFilter] = useState<SponsorPurpose | typeof ALL_PURPOSE_FILTER>(
    ALL_PURPOSE_FILTER
  );
  // For purpose-narrowed browse, we still let citizens decide which
  // purpose they want to declare per-purchase (any allowed by the
  // offer). The filter is just a discovery aid.
  const browse = useSponsorBrowseDataOffers(
    purposeFilter === ALL_PURPOSE_FILTER ? undefined : purposeFilter
  );
  const purchases = useSponsorDataOfferPurchases();
  const self = useSponsorSelf();

  const offers = browse.data?.offers ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Citizen data marketplace
          </p>
          <h1 className="text-display font-semibold">Browse data offers</h1>
          <p className="mt-1 text-body text-text-muted">
            Buy directly from citizens. Per-data-point payouts. Citizen-signed
            consent. Phase 13.5.1.
          </p>
        </div>
        {self.data && (
          <div className="rounded-md border border-border bg-white px-3 py-2 text-caption">
            <p className="text-text-muted">Escrow available</p>
            <p className="font-semibold text-text">
              {formatRupees(
                Math.max(
                  0,
                  self.data.escrowBalancePaise - self.data.escrowLockedPaise
                )
              )}
            </p>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPurposeFilter(ALL_PURPOSE_FILTER)}
          className={
            'rounded-sm border-2 px-3 py-1 text-caption font-semibold ' +
            (purposeFilter === ALL_PURPOSE_FILTER
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-white text-text-muted hover:border-primary')
          }
        >
          All purposes
        </button>
        {SPONSOR_PURPOSES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPurposeFilter(p)}
            className={
              'rounded-sm border-2 px-3 py-1 text-caption font-semibold ' +
              (purposeFilter === p
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-white text-text-muted hover:border-primary')
            }
          >
            {SPONSOR_PURPOSE_LABEL[p]}
          </button>
        ))}
      </div>

      {browse.isPending ? (
        <p className="text-body text-text-muted">Loading offers…</p>
      ) : offers.length === 0 ? (
        <Card title="No offers match" subtitle="Try a different purpose filter">
          <p className="text-body text-text">
            No active citizen data offers match the selected purpose right now.
            Offers expire after their TTL, get exhausted at maxSales, or get
            paused / revoked by the citizen — all honest history.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer) => (
            <OfferRow key={offer.offerId} offer={offer} />
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-2 text-heading font-semibold text-text">Recent purchases</h2>
        {purchases.isPending ? (
          <p className="text-body text-text-muted">Loading purchase history…</p>
        ) : (purchases.data ?? []).length === 0 ? (
          <p className="text-body text-text-muted">
            No purchases yet. When you buy against an offer, the per-data-point
            row lands here with the citizen's at-sale-time signature.
          </p>
        ) : (
          <ul className="space-y-2">
            {(purchases.data ?? []).map((p) => (
              <li key={p.purchaseId} className="rounded-md border border-border bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="trust">Purchased</Badge>
                  <span className="text-caption text-text-muted">
                    {formatRupees(p.pricePerSalePaise)} ·{' '}
                    {SPONSOR_PURPOSE_LABEL[p.sponsorPurpose as SponsorPurpose] ??
                      p.sponsorPurpose}{' '}
                    · {p.purchasedAt.slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1 text-caption text-text-muted">
                  Offer: <span className="font-mono">{p.offerId}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function OfferRow({ offer }: { offer: CitizenDataOffer }) {
  const purchase = useSponsorPurchaseDataOffer();
  const [picked, setPicked] = useState<SponsorPurpose | null>(
    (offer.sponsorPurposeAllowlist[0] as SponsorPurpose) ?? null
  );
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  async function handlePurchase() {
    if (!picked) return;
    setPurchaseError(null);
    try {
      await purchase.mutateAsync({ offerId: offer.offerId, sponsorPurpose: picked });
    } catch (err) {
      const code = (err as ApiError).code;
      const body = (err as ApiError & { body?: unknown }).body as
        | { error?: { availablePaise?: number; requiredPaise?: number } }
        | undefined;
      if (code === 'insufficient_escrow') {
        const available = body?.error?.availablePaise;
        const required = body?.error?.requiredPaise;
        setPurchaseError(
          `Not enough escrow. Available ${typeof available === 'number' ? formatRupees(available) : '—'} · required ${typeof required === 'number' ? formatRupees(required) : '—'}.`
        );
      } else if (code === 'offer_not_active' || code === 'offer_expired' || code === 'offer_exhausted') {
        setPurchaseError("This offer is no longer available. Refresh the list.");
      } else if (code === 'purpose_not_allowlisted') {
        setPurchaseError('Pick a purpose that the citizen has allowlisted on this offer.');
      } else if (code === 'invalid_purpose') {
        setPurchaseError('Invalid sponsor purpose.');
      } else {
        setPurchaseError("Couldn't purchase — try again in a moment.");
      }
    }
  }

  return (
    <li className="rounded-md border border-border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="trust">Active</Badge>
        <Badge variant="neutral">
          {DATA_POINT_KIND_LABEL[offer.dataPointKind as DataPointKind] ?? offer.dataPointKind}
        </Badge>
        <span className="text-caption text-text-muted">
          {formatRupees(offer.pricePerSalePaise)} / sale · {offer.salesCount}/{offer.maxSales}{' '}
          sold · expires {offer.expiresAt.slice(0, 10)}
        </span>
      </div>
      <p className="mb-2 text-caption text-text-muted">
        Allowed purposes:{' '}
        {offer.sponsorPurposeAllowlist
          .map((p) => SPONSOR_PURPOSE_LABEL[p as SponsorPurpose] ?? p)
          .join(', ')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={picked ?? ''}
          onChange={(e) => setPicked(e.target.value as SponsorPurpose)}
          className="rounded-sm border border-border bg-white px-2 py-1 text-caption"
        >
          {offer.sponsorPurposeAllowlist.map((p) => (
            <option key={p} value={p}>
              {SPONSOR_PURPOSE_LABEL[p as SponsorPurpose] ?? p}
            </option>
          ))}
        </select>
        <Action
          variant="trust"
          size="sm"
          onClick={handlePurchase}
          disabled={purchase.isPending || !picked}
        >
          {purchase.isPending ? 'Purchasing…' : `Buy one (${formatRupees(offer.pricePerSalePaise)})`}
        </Action>
      </div>
      {purchaseError && (
        <p className="mt-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
          {purchaseError}
        </p>
      )}
    </li>
  );
}
