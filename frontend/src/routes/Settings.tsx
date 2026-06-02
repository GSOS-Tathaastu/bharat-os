import { useEffect, useState } from 'react';
import { Action, Badge, Card, Evidence, Field, Sheet, useToast } from '@/components/ui';
import { useIdentityStore } from '@/lib/identity-store';
import { useProfileStore } from '@/lib/profile-store';
import { PersonalizationCard } from '@/components/PersonalizationCard';
import { useNavigate } from 'react-router-dom';
import {
  useActiveIdentity,
  useAuditSignerPublicKey,
  useDownloadMyData,
  useDpdpGrievance,
  useEraseIdentity,
  usePushPublicKey,
  usePushSubscriptions,
  useSubscribePush,
  useUnsubscribePush,
  useVaultSnapshot
} from '@/lib/hooks';
import {
  currentPushSubscription,
  registerAppServiceWorker,
  subscribeToPush,
  unsubscribeFromPush
} from '@/lib/push';

export function SettingsPage() {
  const clear = useIdentityStore((s) => s.clear);
  // Phase 13.3 — DPDP cascade: the personalization profile is
  // wiped at the same tick as the persona forget / account erase.
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const navigate = useNavigate();
  const identity = useActiveIdentity();
  const downloadMyData = useDownloadMyData();
  const eraseIdentity = useEraseIdentity();
  const auditSigner = useAuditSignerPublicKey();
  // Phase 12.0.4 additions.
  const pushPublicKey = usePushPublicKey();
  const { data: pushSubs = [] } = usePushSubscriptions(identity?.id);
  const subscribe = useSubscribePush();
  const unsubscribeMutation = useUnsubscribePush();
  const grievance = useDpdpGrievance();
  const vaultSnapshot = useVaultSnapshot();
  const show = useToast((s) => s.show);

  const [eraseOpen, setEraseOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [browserPushPermission, setBrowserPushPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState<boolean | null>(null);

  // Register service worker eagerly on first Settings open (no-op if
  // already registered).
  useEffect(() => {
    registerAppServiceWorker().then(() => {
      currentPushSubscription().then((sub) => setHasBrowserSubscription(!!sub));
    });
  }, []);

  function handleDownload() {
    if (!identity) return;
    downloadMyData.mutate(
      { identityId: identity.id },
      {
        onSuccess: (size: number) => show(`Downloaded ${Math.round(size / 1024)} KB`, 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function handleErase() {
    if (!identity) return;
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      show('Type DELETE in the box to confirm.', 'error');
      return;
    }
    eraseIdentity.mutate(
      { identityId: identity.id },
      {
        onSuccess: () => {
          show('Account erased. Goodbye.', 'success');
          clear();
          clearProfile();
          setTimeout(() => navigate('/'), 600);
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  async function handleSubscribePush() {
    if (!identity || !pushPublicKey.data?.publicKey) return;
    try {
      const sub = await subscribeToPush({ vapidPublicKey: pushPublicKey.data.publicKey });
      if (!sub) {
        show('Browser denied notification permission. Enable in browser settings.', 'error');
        setBrowserPushPermission(Notification.permission);
        return;
      }
      await subscribe.mutateAsync({
        identityId: identity.id,
        endpoint: sub.endpoint,
        keys: sub.keys,
        permission: 'granted',
        source: 'app',
        userAgent: navigator.userAgent,
        storeDeliveryKeys: true
      });
      setBrowserPushPermission('granted');
      setHasBrowserSubscription(true);
      show('Push notifications enabled.', 'success');
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  async function handleUnsubscribePush() {
    if (!identity) return;
    try {
      const subRecord = pushSubs[0];
      await unsubscribeFromPush();
      if (subRecord) {
        await unsubscribeMutation.mutateAsync({
          identityId: identity.id,
          subscriptionId: subRecord.subscriptionId
        });
      }
      setHasBrowserSubscription(false);
      show('Push notifications disabled.', 'success');
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  function handleExportBundle() {
    if (!identity) return;
    vaultSnapshot.mutate(
      { identityId: identity.id },
      {
        onSuccess: (snapshot) => {
          const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
            type: 'application/json'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bharat-os-account-${identity.displayName.replace(/\s+/g, '-').toLowerCase()}-${new Date()
            .toISOString()
            .slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          show('Account bundle downloaded. Store it like a password manager backup.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <h1 className="text-display font-semibold">Settings</h1>

      <Card title="Identity">
        <p className="text-body text-text-muted mb-3">
          Persona is stored locally on this device only. Switching personas
          does not affect any server state. Forgetting also clears your
          on-device personalization preferences for this persona.
        </p>
        <Action
          variant="secondary"
          onClick={() => {
            clear();
            clearProfile();
            navigate('/');
          }}
        >
          Forget persona on this device
        </Action>
      </Card>

      {/* Phase 13.3 SLM-G — on-device personalization profile. */}
      <PersonalizationCard identityId={identity?.id} />

      <Card title="Your data rights (DPDP §12)" tone="governance">
        <p className="text-body text-text-muted mb-3">
          Download all your data, or request permanent erasure.
        </p>
        <div className="flex flex-wrap gap-2">
          <Action variant="secondary" onClick={handleDownload} disabled={downloadMyData.isPending}>
            {downloadMyData.isPending ? 'Preparing…' : 'Download my data'}
          </Action>
          <Action variant="destructive" onClick={() => setEraseOpen(true)}>
            Delete my account
          </Action>
        </div>
      </Card>

      {/* Phase 12.0.4 — Push notifications opt-in. */}
      <Card title="Push notifications" tone="trust">
        {pushPublicKey.isPending ? (
          <p className="text-body text-text-muted">Checking server configuration…</p>
        ) : !pushPublicKey.data ? (
          <p className="text-body text-text-muted">
            Push is not configured on this server. Your operator can enable it by
            setting <span className="font-mono">BHARAT_OS_VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT</span>.
          </p>
        ) : browserPushPermission === 'unsupported' ? (
          <p className="text-body text-text-muted">
            This browser does not support push notifications.
          </p>
        ) : browserPushPermission === 'denied' ? (
          <p className="text-body text-error">
            You blocked notifications for Bharat OS in this browser. Unblock in
            your browser's site settings, then refresh.
          </p>
        ) : hasBrowserSubscription || pushSubs.length > 0 ? (
          <>
            <p className="text-body text-text-muted mb-3">
              You will receive alerts for cash-outs, SIM-swap detection, sponsor
              review verdicts, and matched jobs.{' '}
              <Badge variant="trust">enabled</Badge>
            </p>
            <Action variant="ghost" onClick={handleUnsubscribePush}>
              Disable push
            </Action>
          </>
        ) : (
          <>
            <p className="text-body text-text-muted mb-3">
              Bharat OS uses real Web Push to alert you about cash-outs,
              account-recovery attempts, and matched jobs. Notifications come
              through your browser; we never SMS-spam.
            </p>
            <Action onClick={handleSubscribePush} disabled={subscribe.isPending}>
              {subscribe.isPending ? 'Subscribing…' : 'Enable push notifications'}
            </Action>
          </>
        )}
      </Card>

      {/* Phase 12.0.4 — Export account bundle (vault snapshot). */}
      <Card title="Export account bundle" tone="governance">
        <p className="text-body text-text-muted mb-3">
          Download a signed JSON file with your identity, vault key, and
          metadata references. Use it to restore your account on a new
          device or device-pair-by-file.
        </p>
        <Action variant="secondary" onClick={handleExportBundle} disabled={vaultSnapshot.isPending}>
          {vaultSnapshot.isPending ? 'Preparing bundle…' : 'Download bundle (.json)'}
        </Action>
        <Evidence title="What is in the bundle?">
          Your Ed25519 public + private keys (in PEM), your vault key (used to
          decrypt your memory records), your display name, your verified
          attestations, and references to your memory records. Treat this file
          like a password manager export — encrypt it, store it offline, never
          share it. Phase 2b Android moves the private key to the device
          hardware keystore so re-export will not be needed.
        </Evidence>
      </Card>

      <Card title="Notifications">
        <p className="text-body text-text-muted">
          Push for recovery alerts, cash-out updates, and job alerts. Available
          via /shell/ today; moving to /app/ post-MVP.
        </p>
      </Card>

      <Card title="Audit signer (Phase 10.5)" tone="trust">
        <p className="text-body text-text-muted mb-3">
          Every labeling job ships sponsors a signed audit bundle. The same
          Ed25519 key signs every bundle so sponsors can verify they got the
          real one. Anyone can fetch the public key here.
        </p>
        {auditSigner.isPending ? (
          <p className="text-caption text-text-muted">Loading…</p>
        ) : auditSigner.error ? (
          <p className="text-caption text-error">Could not load audit signer.</p>
        ) : auditSigner.data ? (
          <div className="space-y-1 text-caption text-text-muted">
            <p>
              <span className="font-mono text-text">id</span>:{' '}
              <span className="font-mono break-all">{auditSigner.data.id}</span>
            </p>
            <p>
              <span className="font-mono text-text">created</span>:{' '}
              <span className="font-mono">{auditSigner.data.createdAt}</span>
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-text">Public key (Ed25519, PEM)</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded border border-border bg-surface-2 p-2 text-xs">
                {auditSigner.data.publicKeyPem}
              </pre>
            </details>
          </div>
        ) : null}
      </Card>

      {/* Phase 12.0.4 — DPDP grievance contact (§12(4)). */}
      <Card title="Data Protection Officer (DPDP §12(4))" tone="governance">
        <p className="text-body text-text-muted mb-3">
          If Bharat OS has mishandled your data, you have the right to raise a
          grievance under the Digital Personal Data Protection Act, 2023.
        </p>
        {grievance.isPending ? (
          <p className="text-caption text-text-muted">Loading…</p>
        ) : grievance.data?.contact ? (
          <ul className="space-y-1 text-body">
            {grievance.data.contact.name && (
              <li>
                <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                  DPO:
                </span>{' '}
                {grievance.data.contact.name}
              </li>
            )}
            {grievance.data.contact.email && (
              <li>
                <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                  Email:
                </span>{' '}
                <a
                  className="underline text-primary"
                  href={`mailto:${grievance.data.contact.email}`}
                >
                  {grievance.data.contact.email}
                </a>
              </li>
            )}
            {grievance.data.contact.postal && (
              <li>
                <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                  Postal:
                </span>{' '}
                <span className="whitespace-pre-line">{grievance.data.contact.postal}</span>
              </li>
            )}
            {grievance.data.contact.responseSlaDays != null && (
              <li>
                <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                  Response within:
                </span>{' '}
                {grievance.data.contact.responseSlaDays} days
              </li>
            )}
            {grievance.data.contact.grievanceEscalation && (
              <li className="mt-3 text-caption text-text-muted">
                Escalation:{' '}
                <a
                  className="underline"
                  href={grievance.data.contact.grievanceEscalation.split(' ')[0]}
                  target="_blank"
                  rel="noreferrer"
                >
                  {grievance.data.contact.grievanceEscalation}
                </a>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-caption text-text-muted">DPO contact not configured.</p>
        )}
      </Card>

      <Card title="Developer">
        <p className="text-body text-text-muted mb-3">
          Open the developer shell for the full set of debugging surfaces.
        </p>
        <Action variant="ghost" onClick={() => (window.location.href = '/shell/')}>
          Open /shell/
        </Action>
      </Card>

      <Sheet
        open={eraseOpen}
        onClose={() => {
          setEraseOpen(false);
          setConfirmText('');
        }}
        title="Permanently erase your account"
      >
        <Card tone="warning" className="border-error">
          <p className="text-body font-semibold text-error">This cannot be undone.</p>
          <p className="mt-1 text-caption text-text-muted">
            All your earnings logs, mesh events, consent grants, attestations,
            audit-ledger entries that mention you, and on-device
            personalization preferences are removed. Bundle exports already
            shared with verifiers are not affected (they already left).
            DPDP §12(3) cascade — verified end-to-end.
          </p>
        </Card>
        <div className="mt-3">
          <Field
            label="Type DELETE to confirm"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Action
            variant="destructive"
            onClick={handleErase}
            disabled={confirmText.trim().toUpperCase() !== 'DELETE' || eraseIdentity.isPending}
          >
            {eraseIdentity.isPending ? 'Erasing…' : 'Erase my account permanently'}
          </Action>
          <Action
            variant="ghost"
            onClick={() => {
              setEraseOpen(false);
              setConfirmText('');
            }}
          >
            Cancel
          </Action>
        </div>
      </Sheet>
    </main>
  );
}
