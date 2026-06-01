// Phase 13.0 — SLM-E DocSummariserPanel
//
// Citizen-facing card on /labs. Pastes a document, taps Summarise,
// watches the on-device SLM stream a TITLE / TLDR / 3 bullets back
// token by token. The document never leaves the browser.
//
// Renders nothing when the citizen has no SLM installed (honest
// empty state binding — no upsell, no greyed-out CTA).

import { useMemo, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import {
  DOC_INPUT_CHAR_CAP,
  DOC_KIND_LABEL,
  DOC_KINDS,
  SAMPLE_FIXTURES,
  type DocKind,
  type ParsedDocSummary
} from '@/lib/doc-summariser';
import { useSlmDocSummariser } from '@/lib/use-slm-doc-summariser';

interface DocSummariserPanelProps {
  identityId: string | null | undefined;
}

const RISK_VARIANT: Record<ParsedDocSummary['fields']['riskFlag'], 'trust' | 'pending' | 'error'> = {
  none: 'trust',
  attention: 'pending',
  urgent: 'error'
};

const RISK_LABEL: Record<ParsedDocSummary['fields']['riskFlag'], string> = {
  none: 'Looks routine',
  attention: 'Worth a closer look',
  urgent: 'Act soon'
};

export function DocSummariserPanel({ identityId }: DocSummariserPanelProps) {
  const [docKind, setDocKind] = useState<DocKind>('electricity_bill');
  const [docText, setDocText] = useState<string>('');
  const [lastResult, setLastResult] = useState<{
    parsed: ParsedDocSummary | null;
    rawCompletion: string;
    generationMs: number;
  } | null>(null);

  const { status, summarise, reset, partialText, hasSlm } = useSlmDocSummariser({ identityId });

  const overCap = docText.length > DOC_INPUT_CHAR_CAP;
  const charCounter = `${docText.length.toLocaleString()} / ${DOC_INPUT_CHAR_CAP.toLocaleString()} chars`;

  const isBusy =
    status.kind === 'loading' || status.kind === 'summarising';
  const isReady = status.kind === 'ready';
  const isCoolingDown = status.kind === 'cooling-down';
  const isError = status.kind === 'error';

  const busyLabel = useMemo(() => {
    if (status.kind === 'loading') return `Loading model… ${status.progress}%`;
    if (status.kind === 'summarising') {
      if (status.streamedChars === 0) return 'Summarising on-device…';
      return `Streaming… ${status.streamedChars.toLocaleString()} chars`;
    }
    return null;
  }, [status]);

  // Phase 13.0 adversarial fix MF-2 — honest framing for the
  // 'no_blob' case (the pack was installed but OPFS bytes are
  // gone, eg cleared by browser storage pressure / private mode).
  // Without this branch, the panel would render null after a
  // successful install, leaving the citizen without a hint.
  if (status.kind === 'unavailable' && status.reason === 'no_blob') {
    return (
      <Card
        title="On-device document summariser"
        subtitle="Phase 13.0 SLM-E"
        actions={<Badge variant="warning">Reinstall needed</Badge>}
      >
        <p className="text-body text-text">
          Your installed model pack is missing from this browser's
          storage. Scroll up and reinstall the pack to use the
          summariser again — your other summaries are unaffected.
        </p>
      </Card>
    );
  }

  // Honest empty state — render NOTHING when no SLM is installed.
  // Matches SLM-D booking-advisor binding (hide, don't upsell).
  if (!hasSlm) return null;

  async function handleSummarise() {
    // Phase 13.0 adversarial fix MF-3 — clear any stale chip
    // BEFORE awaiting so the new generation's streamed <pre> is
    // the only visible output during summarisation.
    setLastResult(null);
    const out = await summarise(docKind, docText);
    if (out) setLastResult(out);
  }

  function handleTrySample() {
    setDocText(SAMPLE_FIXTURES[docKind]);
    setLastResult(null);
    reset();
  }

  function handleClear() {
    setDocText('');
    setLastResult(null);
    reset();
  }

  return (
    <Card
      title="On-device document summariser"
      subtitle="Phase 13.0 SLM-E · paste an Indian-paperwork document and let your installed SLM summarise it on this device."
      actions={<Badge variant="trust">SLM-E · v1</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          Stays on this device · 0 bytes uploaded
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Document kind">
        {DOC_KINDS.map((kind) => {
          const active = docKind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isBusy}
              onClick={() => setDocKind(kind)}
              className={
                'rounded-full border px-3 py-1 text-caption font-semibold transition-colors disabled:opacity-60 ' +
                (active
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-white text-text-muted hover:text-text')
              }
            >
              {DOC_KIND_LABEL[kind]}
            </button>
          );
        })}
      </div>

      <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-muted">
        Paste the document text
      </label>
      <textarea
        value={docText}
        onChange={(e) => setDocText(e.target.value)}
        rows={8}
        placeholder="Paste your electricity bill / Form 16 / T&Cs / insurance policy / lender contract here."
        className="block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p
          className={
            'text-caption ' + (overCap ? 'text-orange-700' : 'text-text-muted')
          }
        >
          {charCounter}
          {overCap && ` · truncated to first ${DOC_INPUT_CHAR_CAP.toLocaleString()} chars for v1`}
        </p>
        <div className="flex gap-2">
          <Action
            variant="ghost"
            size="sm"
            onClick={handleTrySample}
            disabled={isBusy}
          >
            Try sample
          </Action>
          {docText.length > 0 && (
            <Action
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isBusy}
            >
              Clear
            </Action>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Action
          variant="trust"
          onClick={handleSummarise}
          disabled={isBusy || isCoolingDown || docText.trim().length === 0}
        >
          {isBusy ? 'Working…' : 'Summarise on my phone'}
        </Action>
        {busyLabel && (
          <span className="text-caption text-text-muted">{busyLabel}</span>
        )}
        {isCoolingDown && (
          <span className="text-caption text-orange-700">
            Cooling down — retry in {Math.ceil(status.retryInMs / 1000)}s.
          </span>
        )}
        {isError && (
          <span className="text-caption text-error">{status.message}</span>
        )}
      </div>

      {/* Streamed text — live token-by-token during generation.
          Phase 13.0 adversarial fix MF-3 — keep visible after ready
          so the on-device pitch beat survives the chip-render
          transition. The audience sees the structured chip mount
          NEXT TO the raw tokens that produced it. */}
      {partialText.length > 0 && (status.kind === 'summarising' || isReady) && (
        <div className="mt-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-trust-700">
            Generated locally on this device · 0 bytes uploaded
          </p>
          <pre className="max-h-48 overflow-auto rounded-sm border border-border bg-surface p-2 text-caption whitespace-pre-wrap text-text">
            {partialText}
          </pre>
        </div>
      )}

      {/* Structured chip block — visible after parser succeeds. */}
      {isReady && lastResult?.parsed && (
        <SummaryChipBlock
          parsed={lastResult.parsed}
          generationMs={lastResult.generationMs}
        />
      )}

      {/* Honest framing: SLM returned a completion but parser
          couldn't shape it. Show the raw text so the citizen still
          benefits, and hide the structured chip honestly. */}
      {isReady && lastResult && !lastResult.parsed && lastResult.rawCompletion && (
        <div className="mt-3 rounded-sm border border-orange-100 bg-orange-50 p-3 text-caption text-orange-700">
          <p className="font-semibold">
            The model returned a summary but it didn't match the expected
            shape. Showing the raw output below — tap Summarise to retry.
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-text">
            {lastResult.rawCompletion}
          </pre>
        </div>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">
          How this works
        </summary>
        <p className="mt-2">
          When you tap Summarise, the document text is passed to the SLM
          pack you installed in this browser via the Phase 9.0c
          llama.cpp-WASM runtime. Generation streams locally, the raw
          completion is parsed into TITLE / TLDR / bullets / language /
          confidence / risk-flag, and the structured output renders here.
          Nothing about the document or the summary touches the network —
          open DevTools → Network and try it.
        </p>
      </details>
    </Card>
  );
}

interface SummaryChipBlockProps {
  parsed: ParsedDocSummary;
  generationMs: number;
}

function SummaryChipBlock({ parsed, generationMs }: SummaryChipBlockProps) {
  const { fields } = parsed;
  return (
    <div className="mt-3 rounded-md border border-trust-100 bg-trust-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={RISK_VARIANT[fields.riskFlag]}>
          {RISK_LABEL[fields.riskFlag]}
        </Badge>
        <Badge variant="neutral">{fields.language}</Badge>
        <Badge variant="neutral">
          Confidence {Math.round(fields.confidence * 100)}%
        </Badge>
        <span className="text-caption text-text-muted">
          {(generationMs / 1000).toFixed(1)}s · {DOC_KIND_LABEL[fields.docKind]}
        </span>
      </div>
      <p className="text-heading font-semibold text-text">{fields.title}</p>
      <p className="mt-1 text-body text-text">{fields.tldr}</p>
      {fields.bullets.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-body text-text">
          {fields.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
