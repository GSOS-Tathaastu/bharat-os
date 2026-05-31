import { useState } from 'react';
import { Action, Badge, Card, Evidence, Field, Money, Sheet, Stat, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useCollectiveMemberships,
  useMintTrustAttestation,
  useTrustPassport,
  useMfiConsents,
  useIssueMfiConsent,
  useRevokeMfiConsent,
  type MfiConsent
} from '@/lib/hooks';

function currentFY(): string {
  const now = new Date();
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

function fyOptions(): string[] {
  const current = currentFY();
  const startYear = parseInt(current.split('-')[0], 10);
  return [`${startYear - 1}-${(startYear).toString().slice(-2)}`, current];
}

function classifyConsentStatus(c: MfiConsent): 'active' | 'revoked' | 'expired' | 'exhausted' {
  if (c.revokedAt) return 'revoked';
  if (new Date(c.expiresAt) < new Date()) return 'expired';
  if (c.readsRemaining <= 0) return 'exhausted';
  return 'active';
}

const STATUS_VARIANT: Record<string, 'trust' | 'error' | 'neutral' | 'warning'> = {
  active: 'trust',
  revoked: 'error',
  expired: 'neutral',
  exhausted: 'warning'
};

interface IssuedConsentInfo {
  consent: MfiConsent;
  shareUrl: string;
}

export function WorkerTrust() {
  const identity = useActiveIdentity();
  const { data: passport } = useTrustPassport(identity?.id);
  const { data: consents = [] } = useMfiConsents(identity?.id);
  // Phase 12.0.3 worker-sweep additions.
  const { data: memberships = [] } = useCollectiveMemberships(identity?.id);
  const mintAttestation = useMintTrustAttestation();
  const issueMfi = useIssueMfiConsent();
  const revokeMfi = useRevokeMfiConsent();
  const show = useToast((s) => s.show);

  const [open, setOpen] = useState(false);
  const [mfiName, setMfiName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [fy, setFy] = useState(currentFY());
  const [validityDays, setValidityDays] = useState(30);
  const [maxReads, setMaxReads] = useState(1);
  const [issued, setIssued] = useState<IssuedConsentInfo | null>(null);

  // Phase 12.0.3 — mint attestation sheet state.
  const [mintOpen, setMintOpen] = useState(false);
  const [mintReason, setMintReason] = useState('');
  const [mintResult, setMintResult] = useState<{ attestationId?: string; status: string } | null>(
    null
  );

  function handleMint() {
    if (!identity) return;
    if (mintReason.trim().length < 4) {
      show('Tell us what the attestation is for (>= 4 characters).', 'error');
      return;
    }
    mintAttestation.mutate(
      { identityId: identity.id, reason: mintReason.trim() },
      {
        onSuccess: (data) => {
          setMintResult({
            attestationId: data.attestation?.attestationId,
            status: data.orchestration.status ?? 'planned'
          });
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function resetForm() {
    setMfiName('');
    setPurpose('');
    setFy(currentFY());
    setValidityDays(30);
    setMaxReads(1);
    setIssued(null);
  }

  function handleIssue() {
    if (!identity) return;
    if (mfiName.trim().length < 2) {
      show('Enter the lender name.', 'error');
      return;
    }
    if (purpose.trim().length < 8) {
      show('Purpose must be at least 8 characters.', 'error');
      return;
    }
    issueMfi.mutate(
      {
        identityId: identity.id,
        mfiName: mfiName.trim(),
        purpose: purpose.trim(),
        financialYear: fy,
        ttlSeconds: validityDays * 86400,
        maxReads
      },
      {
        onSuccess: (data) => {
          setIssued({
            consent: data.consent,
            shareUrl: `${window.location.origin}/app/verify?consent=${encodeURIComponent(data.consent.consentId)}`
          });
          show('Consent issued.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function handleRevoke(consent: MfiConsent) {
    if (!identity) return;
    const reason = window.prompt(`Revoke ${consent.mfiName} consent? Reason:`);
    if (!reason || !reason.trim()) return;
    revokeMfi.mutate(
      { identityId: identity.id, consentId: consent.consentId, reason: reason.trim() },
      {
        onSuccess: () => show('Consent revoked.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  async function copyShareUrl() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.shareUrl);
      show('Share URL copied. Paste into WhatsApp / email to the lender.', 'success');
    } catch {
      show('Could not copy. Tap the URL to select it.', 'error');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <h1 className="text-display font-semibold">Trust Passport</h1>

      <Card tone="trust" title="Your verified profile" actions={<Badge variant="trust">{passport?.level ?? '—'}</Badge>}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Verified IDs" value={passport?.verifiedAttestationCount ?? 0} />
          <Stat label="Active consents" value={passport?.activeConsentCount ?? 0} />
          <Stat label="Network standing" value={passport?.netContributionScore ?? '—'} />
        </div>
        <Evidence title="What is a Trust Passport?">
          A pointer-not-payload summary of who has attested to you, what consent
          grants are live, and your net contribution to the mesh. Verifiers
          read this signed snapshot — they never see your raw data.
        </Evidence>
      </Card>

      {/* Phase 12.0.3 — Trust Passport attestation mint button. */}
      <Card
        title="Mint a verified attestation about yourself"
        subtitle="A landlord, employer, or service can verify it via /verify/ without seeing your raw data."
        actions={<Action onClick={() => setMintOpen(true)}>Mint attestation</Action>}
      >
        <p className="text-body text-text-muted">
          Pick what to disclose (income band, verified phone, mesh standing).
          Bharat OS signs a single-use envelope tied to your reason. The
          verifier reads the signature; they never see the underlying numbers
          or your identity ID.
        </p>
      </Card>

      {/* Phase 12.0.3 — collective memberships. Surfaced as a list
          beneath the Trust Passport so the citizen sees every sangha,
          cooperative, or blessed-collective that has attested to them. */}
      {memberships.length > 0 && (
        <Card
          title="Collective memberships"
          subtitle={`${memberships.length} active`}
          tone="trust"
        >
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
              <li
                key={m.membershipId}
                className="rounded-sm border border-trust-100 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">{m.collectiveName}</p>
                    <p className="text-caption text-text-muted">
                      <span className="capitalize">{m.memberRole.replace(/_/g, ' ')}</span>
                      {m.region ? ` · ${m.region}` : ''}
                      {m.joinedAt ? ` · joined ${new Date(m.joinedAt).toLocaleDateString('en-IN')}` : ''}
                    </p>
                    <p className="text-caption text-text-muted">
                      Expires {new Date(m.expiresAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <Badge variant="trust">{m.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <Evidence title="Who signs these?">
            Each collective signs with its own Bharat OS identity key —
            cooperative society, sangha, blessed-collective. Verifiers can
            check the signature against the collective's public record.
            Revoke from the collective side; revocations cascade in your
            audit ledger.
          </Evidence>
        </Card>
      )}

      <Card
        title="Share income with a lender (MFI)"
        subtitle="Issue a one-time signed bundle."
        actions={<Action onClick={() => setOpen(true)}>Issue consent</Action>}
      >
        <p className="text-body text-text-muted">
          Bharat OS hands a named MFI a signed summary of your earnings,
          portable attestations, and verified memberships. You issue the
          consent; they read it ONCE; it burns. The MFI never sees raw entries.
        </p>
      </Card>

      {consents.length > 0 && (
        <Card title="Issued consents" subtitle={`${consents.length} total`}>
          <ul className="flex flex-col gap-2">
            {consents.map((c) => {
              const status = classifyConsentStatus(c);
              return (
                <li key={c.consentId} className="rounded-sm border border-border bg-white p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text">{c.mfiName}</p>
                      <p className="truncate text-caption text-text-muted">
                        {c.purpose} · FY {c.financialYear}
                      </p>
                      <p className="text-caption text-text-muted">
                        {c.readsRemaining}/{c.maxReads} reads · expires {new Date(c.expiresAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                  </div>
                  {status === 'active' && (
                    <Action
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(c)}
                      disabled={revokeMfi.isPending}
                    >
                      Revoke
                    </Action>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title={issued ? 'Consent issued' : 'Issue MFI consent'}
      >
        {!issued ? (
          <div className="flex flex-col gap-3">
            <Field
              label="Lender / MFI name"
              placeholder="e.g. Bajaj Finserv"
              value={mfiName}
              onChange={(e) => setMfiName(e.target.value)}
              maxLength={80}
            />
            <Field
              label="Purpose"
              placeholder="e.g. Personal loan application"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              maxLength={200}
              helper="At least 8 characters."
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="fy" className="text-caption font-semibold text-text">
                Financial Year
              </label>
              <select
                id="fy"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="h-10 rounded-sm border border-border bg-white px-3 text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                {fyOptions().map((opt) => (
                  <option key={opt} value={opt}>FY {opt}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="valid" className="text-caption font-semibold text-text">
                Valid for
              </label>
              <select
                id="valid"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="h-10 rounded-sm border border-border bg-white px-3 text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                {[7, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="reads" className="text-caption font-semibold text-text">
                Max reads
              </label>
              <select
                id="reads"
                value={maxReads}
                onChange={(e) => setMaxReads(Number(e.target.value))}
                className="h-10 rounded-sm border border-border bg-white px-3 text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                {[1, 3, 5, 10].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <Action onClick={handleIssue} disabled={issueMfi.isPending}>
                {issueMfi.isPending ? 'Issuing…' : 'Issue signed consent'}
              </Action>
              <Action
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Action>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Card tone="warning">
              <p className="text-body font-semibold">Share this URL with {issued.consent.mfiName} privately.</p>
              <p className="text-caption text-text-muted mt-1">
                Anyone with this URL can read your bundle {issued.consent.maxReads}{' '}
                time{issued.consent.maxReads > 1 ? 's' : ''} before it expires.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={issued.shareUrl}
                  className="flex-1 h-10 rounded-sm border border-border bg-white px-3 font-mono text-caption text-text"
                />
                <Action size="md" onClick={copyShareUrl}>Copy</Action>
              </div>
            </Card>
            <Action
              variant="secondary"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Done
            </Action>
          </div>
        )}
      </Sheet>

      {/* Phase 12.0.3 — mint Trust Passport attestation sheet. */}
      <Sheet
        open={mintOpen}
        onClose={() => {
          setMintOpen(false);
          setMintReason('');
          setMintResult(null);
        }}
        title={mintResult ? 'Attestation minted' : 'Mint Trust Passport attestation'}
      >
        {!mintResult ? (
          <div className="flex flex-col gap-3">
            <p className="text-body text-text-muted">
              Trust Passport attestations are signed envelopes a third party
              can verify via{' '}
              <a className="underline" href="/verify/" target="_blank" rel="noreferrer">
                /verify/
              </a>{' '}
              without seeing your raw data.
            </p>
            <Field
              label="What is this for?"
              placeholder="e.g. Rental application — Mumbai 2BHK"
              value={mintReason}
              onChange={(e) => setMintReason(e.target.value)}
              maxLength={120}
              helper="Will appear on the signed envelope. Minimum 4 characters."
            />
            <div className="rounded-sm border border-trust-100 bg-trust-50 p-3 text-caption text-text-muted">
              The substrate exposes only what you have already disclosed elsewhere — verified
              phone, income band, mesh standing, active consent count. Raw numbers and identity
              IDs never leave your profile.
            </div>
            <div className="flex gap-2">
              <Action onClick={handleMint} disabled={mintAttestation.isPending}>
                {mintAttestation.isPending ? 'Signing…' : 'Mint + sign attestation'}
              </Action>
              <Action variant="ghost" onClick={() => setMintOpen(false)}>
                Cancel
              </Action>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Card tone={mintResult.status === 'completed' ? 'trust' : 'governance'}>
              <p className="text-body font-semibold">
                {mintResult.status === 'completed'
                  ? 'Attestation envelope signed.'
                  : 'Attestation planned.'}
              </p>
              {mintResult.attestationId && (
                <p className="mt-2 text-caption font-mono text-text-muted">
                  ID: {mintResult.attestationId.replace(/^bos:attestation:/, '')}
                </p>
              )}
              <p className="mt-2 text-caption text-text-muted">
                Verifier flow: paste the attestation ID into{' '}
                <a className="underline" href="/verify/" target="_blank" rel="noreferrer">
                  /verify/
                </a>{' '}
                — Bharat OS reads the signature and presents the disclosed fields. Your
                identity ID and raw numbers are never returned.
              </p>
            </Card>
            <Action
              variant="secondary"
              onClick={() => {
                setMintOpen(false);
                setMintReason('');
                setMintResult(null);
              }}
            >
              Done
            </Action>
          </div>
        )}
      </Sheet>
    </main>
  );
}
