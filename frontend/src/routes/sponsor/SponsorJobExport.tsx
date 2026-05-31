import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Action, Badge, Card, Evidence, useToast } from '@/components/ui';
import { useSponsorJobExport, useSponsorJobs, type JobExportResult } from '@/lib/hooks';

type Verdict = 'verified' | 'unverified' | 'mismatch' | 'fetch_failed';

const VERDICT_TONE: Record<Verdict, 'trust' | 'warning' | 'default'> = {
  verified: 'trust',
  unverified: 'warning',
  // Card has no `error` tone; the badge below carries the red signal.
  mismatch: 'default',
  fetch_failed: 'warning'
};

const VERDICT_BADGE: Record<Verdict, 'trust' | 'warning' | 'error' | 'neutral'> = {
  verified: 'trust',
  unverified: 'warning',
  mismatch: 'error',
  fetch_failed: 'neutral'
};

function classify(result: JobExportResult | null): Verdict {
  if (!result) return 'unverified';
  if (result.verifyFetchFailed) return 'fetch_failed';
  if (!result.signerPublicRecord || !result.verdict) return 'unverified';
  return result.verdict.ok ? 'verified' : 'mismatch';
}

export function SponsorJobExport() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: jobs = [] } = useSponsorJobs();
  const job = jobs.find((j) => j.jobId === jobId);
  const exportJob = useSponsorJobExport();
  const show = useToast((s) => s.show);
  const [result, setResult] = useState<JobExportResult | null>(null);

  function handleDownload() {
    if (!jobId) return;
    exportJob.mutate(
      { jobId },
      {
        onSuccess: (res) => {
          setResult(res);
          // Trigger download.
          const url = URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          show('Bundle downloaded.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  if (!jobId || !job) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
        <Card tone="warning">
          <p className="text-body">Job not found.</p>
          <Link to="/sponsor/jobs" className="mt-2 inline-block">
            <Action size="sm">Back to jobs</Action>
          </Link>
        </Card>
      </main>
    );
  }

  const verdict = classify(result);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Signed audit bundle
          </p>
          <h1 className="text-display font-semibold">
            {job.description?.trim() || `${job.taskKind} · ${job.language}`}
          </h1>
        </div>
        <Link to={`/sponsor/jobs/${encodeURIComponent(job.jobId)}`}>
          <Action variant="ghost" size="sm">
            ← Job
          </Action>
        </Link>
      </header>

      <Card tone="trust">
        <p className="text-body">
          Phase 10.5 — downloads an NDJSON file with one accepted-submission
          line per row + a trailer line carrying SHA-256 of the body + an
          Ed25519 signature from the Bharat OS audit signer. Worker identity is
          hashed per (job, worker) so cross-job correlation is prevented.
        </p>
        <Action className="mt-3" onClick={handleDownload} disabled={exportJob.isPending}>
          {exportJob.isPending ? 'Preparing…' : 'Download signed NDJSON'}
        </Action>
      </Card>

      {result && (
        <Card
          tone={VERDICT_TONE[verdict]}
          title="Verification"
          actions={<Badge variant={VERDICT_BADGE[verdict]}>{verdict.replace('_', ' ')}</Badge>}
        >
          <ul className="space-y-1 text-body">
            <li>
              <span className="font-mono text-text-muted">Submissions:</span>{' '}
              {result.verdict?.submissionCount ?? '?'}
            </li>
            <li>
              <span className="font-mono text-text-muted">contentSha256:</span>{' '}
              <span className="break-all font-mono text-caption">
                {result.contentSha256 ?? '?'}
              </span>
            </li>
            {result.signerPublicRecord && (
              <li>
                <span className="font-mono text-text-muted">Signer id:</span>{' '}
                <span className="font-mono text-caption">
                  {result.signerPublicRecord.id.replace(/^bos:person:/, '')}
                </span>
              </li>
            )}
            {result.verdict?.reason && (
              <li>
                <span className="font-mono text-text-muted">Reason:</span>{' '}
                <span className="font-mono">{result.verdict.reason}</span>
              </li>
            )}
          </ul>
          {verdict === 'fetch_failed' && (
            <div className="mt-3">
              <Action size="sm" variant="secondary" onClick={handleDownload} disabled={exportJob.isPending}>
                Retry verification
              </Action>
              <p className="mt-2 text-caption text-text-muted">
                The bundle on disk is fine; only the audit-signer public key
                fetch failed.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card title="What do these verdicts mean?">
        <ul className="space-y-2 text-body">
          <li>
            <Badge variant="trust">verified</Badge>{' '}
            SHA-256 over the body matches the trailer + Ed25519 signature
            checks out against the audit-signer public key. Trust the bundle.
          </li>
          <li>
            <Badge variant="warning">unverified</Badge>{' '}
            Signer details are incomplete or the verifier ran but had no
            public key to check against. The bundle is structurally valid;
            cryptographic guarantees are not asserted.
          </li>
          <li>
            <Badge variant="error">mismatch</Badge>{' '}
            Either the body hash differs from the trailer's contentSha256, or
            the Ed25519 signature failed. Do NOT trust this bundle — re-download
            and if the verdict persists, contact your Bharat OS contact.
          </li>
          <li>
            <Badge variant="neutral">fetch failed</Badge>{' '}
            <span className="font-mono">/api/audit-signer/public-key</span>{' '}
            couldn't be reached (transient network / 5xx). The bundle on disk is
            fine; press "Retry verification" once the endpoint is back.
          </li>
        </ul>
      </Card>

      <Evidence title="How to verify outside Bharat OS?">
        Run <span className="font-mono">verifyLabelingExportLines(lines,
          signerPublic)</span> from <span className="font-mono">@bharat-os/labeling-export
        </span> (server-side reference at <span className="font-mono">
          src/phase1/labeling-export.mjs
        </span>
        ) against the downloaded file + the audit signer's public key from{' '}
        <a className="underline" href="/api/audit-signer/public-key" target="_blank" rel="noreferrer">
          /api/audit-signer/public-key
        </a>
        . The ledger event <span className="font-mono">labeling_export.signed</span>{' '}
        anchors the content SHA-256 server-side; a sponsor cannot later
        present a different "authoritative" bundle.
      </Evidence>
    </main>
  );
}
