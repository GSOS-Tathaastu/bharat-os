// Phase 12.2.7 — LinkDigilockerCard.
//
// Citizen-facing surface for the Phase 12.2.6 DigiLocker
// substrate. Shown in the KYC L1 wizard as an optional
// pre-step: linking gets the citizen the stronger operator
// signal (🔏 signed-doc verification) instead of the manual
// cross-check path.
//
// Honest framing in stub mode — the badge explicitly says
// "demo mode" so an investor demoing the flow doesn't think
// the verification is real.
//
// Adversarial fixes applied:
//   - L2-1: window.confirm before Unlink (matches the rest of
//     the codebase's destructive-action discipline).
//   - L2-2: error branching surfaces network vs server-side
//     failure modes so the citizen knows whether to retry.
//   - L2-3: double-tap gate via mutation status (the BE upsert
//     is idempotent but ledger event would have fired twice).
//   - L2-4: status-error fallback so an API-down state doesn't
//     silently hide the card.

import { Action, Badge, Card } from '@/components/ui';
import type { ApiError } from '@/lib/api';
import {
  useDigilockerLinkStatus,
  useLinkDigilocker,
  useUnlinkDigilocker
} from '@/lib/use-digilocker-link';

interface Props {
  identityId: string;
}

function linkErrorMessage(error: unknown): string {
  if (!error) return 'Linking failed. You can still complete KYC without DigiLocker.';
  const apiErr = error as ApiError;
  if (apiErr?.code === 'invalid_or_expired_state') {
    return 'Link session expired. Tap Link DigiLocker again.';
  }
  if (apiErr?.status && apiErr.status >= 500) {
    return 'Couldn’t reach DigiLocker right now. Try again in a moment.';
  }
  if (apiErr?.status === 401 || apiErr?.code === 'missing_acting_identity') {
    return 'You need to be signed in to link DigiLocker.';
  }
  return 'Linking failed. You can still complete KYC without DigiLocker.';
}

export function LinkDigilockerCard({ identityId }: Props) {
  const status = useDigilockerLinkStatus(identityId);
  const link = useLinkDigilocker();
  const unlink = useUnlinkDigilocker();

  if (status.isPending) {
    return (
      <Card title="DigiLocker (optional)">
        <p className="text-body text-text-muted">Checking link status…</p>
      </Card>
    );
  }
  // Phase 12.2.7 adversarial fix L2-4 — status-error fallback.
  // Without this branch a network failure would silently hide
  // the card mid-render; the citizen wouldn't even know they
  // could link.
  if (status.isError) {
    return (
      <Card title="DigiLocker (optional)">
        <p className="text-body text-text-muted">
          Couldn’t check DigiLocker status. You can still complete
          KYC manually; the operator will cross-check your typed
          numbers against the document images.
        </p>
      </Card>
    );
  }

  const linked = status.data?.linked ?? false;
  const stubMode = (status.data?.mode || link.data?.mode) === 'stub';

  // Phase 12.2.7 adversarial fix L2-3 — double-tap gate. React
  // mutation isPending is a render-state; a fast double-tap
  // before re-render could fire mutate twice. BE saveDigiLockerLink
  // is idempotent but the ledger would record TWO
  // digilocker.link_saved events. Gate at the click handler.
  const canFireLink = link.status === 'idle' || link.status === 'error';
  const canFireUnlink = unlink.status === 'idle' || unlink.status === 'error';

  function handleLink() {
    if (!canFireLink) return;
    link.mutate({ rootIdentityId: identityId });
  }
  function handleUnlink() {
    if (!canFireUnlink) return;
    // Phase 12.2.7 adversarial fix L2-1 — confirm before
    // destructive action. Matches the codebase's existing
    // window.confirm posture (WorkerEarn, Labs, JobItemsUploader).
    const ok = window.confirm(
      'Unlink DigiLocker? The operator will fall back to manual cross-check of your typed numbers.'
    );
    if (!ok) return;
    unlink.mutate({ rootIdentityId: identityId });
  }

  return (
    <Card title="DigiLocker (optional)">
      <p className="text-body text-text-muted">
        Linking DigiLocker lets the operator verify your documents
        instantly via signed Government-of-India records, instead
        of cross-checking your typed numbers manually. You can
        skip this and still complete KYC.
      </p>

      {linked ? (
        <div className="mt-3 rounded-md border border-trust-100 bg-trust-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-body text-text">
              <Badge variant="trust">DigiLocker linked</Badge>{' '}
              {stubMode && (
                <span className="ml-1 text-caption text-text-muted">
                  (demo mode — substrate ready, partner credentials pending)
                </span>
              )}
            </span>
            <Action
              variant="ghost"
              size="sm"
              type="button"
              disabled={!canFireUnlink}
              onClick={handleUnlink}
            >
              {unlink.isPending ? 'Unlinking…' : 'Unlink'}
            </Action>
          </div>
          {status.data?.expiresAt && (
            <p className="mt-2 text-caption text-text-muted">
              Token valid until {new Date(status.data.expiresAt).toLocaleString()}.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <Action
            type="button"
            disabled={!canFireLink}
            onClick={handleLink}
          >
            {link.isPending ? 'Linking…' : 'Link DigiLocker'}
          </Action>
          {link.isError && (
            <p className="text-caption text-error">
              {linkErrorMessage(link.error)}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
