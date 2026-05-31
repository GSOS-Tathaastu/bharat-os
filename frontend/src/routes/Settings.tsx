import { useState } from 'react';
import { Action, Card, Field, Sheet, useToast } from '@/components/ui';
import { useIdentityStore } from '@/lib/identity-store';
import { useNavigate } from 'react-router-dom';
import {
  useActiveIdentity,
  useAuditSignerPublicKey,
  useDownloadMyData,
  useEraseIdentity
} from '@/lib/hooks';

export function SettingsPage() {
  const clear = useIdentityStore((s) => s.clear);
  const navigate = useNavigate();
  const identity = useActiveIdentity();
  const downloadMyData = useDownloadMyData();
  const eraseIdentity = useEraseIdentity();
  const auditSigner = useAuditSignerPublicKey();
  const show = useToast((s) => s.show);

  const [eraseOpen, setEraseOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

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
          setTimeout(() => navigate('/'), 600);
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
          does not affect any server state.
        </p>
        <Action
          variant="secondary"
          onClick={() => {
            clear();
            navigate('/');
          }}
        >
          Forget persona on this device
        </Action>
      </Card>

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
            and audit-ledger entries that mention you are removed. Bundle
            exports already shared with verifiers are not affected (they
            already left). DPDP §12(3) cascade — verified end-to-end.
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
