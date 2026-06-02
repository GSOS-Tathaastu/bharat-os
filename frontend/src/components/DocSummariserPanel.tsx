// Phase 13.0 — SLM-E DocSummariserPanel
//
// Citizen-facing card on /labs. Pastes a document, taps Summarise,
// watches the on-device SLM stream a TITLE / TLDR / 3 bullets back
// token by token. The document never leaves the browser.
//
// Renders nothing when the citizen has no SLM installed (honest
// empty state binding — no upsell, no greyed-out CTA).

import { useMemo, useRef, useState } from 'react';
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
import {
  extractPdfText,
  classifyPdfError,
  MAX_PDF_BYTES,
  type PdfExtractErrorCode
} from '@/lib/pdf-text-extract';
import { useCreateMemoryRecord } from '@/lib/hooks';
import type { ApiError } from '@/lib/api';
import {
  buildDocSummarySource,
  renderSummaryPlaintext,
  type DocPdfFingerprintInput
} from '@/lib/doc-summary-source';
// Phase 13.4 — publish the last successful summary to the bridge
// so the sibling SkillAgentPanel can read it without prop drilling.
import { useLastDocSummaryBridge } from '@/lib/last-doc-summary-bridge';

// Phase 13.0.2 adversarial fix SF-5 — citizen-safe copy keyed on
// BE error code. The raw err.message is reserved for the DEV
// console.warn below; the user never sees verbatim server errors
// (which the BE today returns scrubbed but the FE shouldn't trust
// going forward). 'invalid_doc_summary_source' is the only known
// 400 path; everything else collapses to a generic line.
const SAVE_ERROR_COPY: Record<string, string> = {
  invalid_doc_summary_source:
    "Couldn't save — the summary shape this device produced didn't pass the on-device guard. Try Summarise again.",
  unauthenticated: 'Sign in again to save summaries to your notes.',
  forbidden: 'This identity isn’t allowed to save notes here.'
};
const SAVE_ERROR_FALLBACK = "Couldn't save just now. Try again in a moment.";
const DOC_KIND_DATE_LEN = 10; // YYYY-MM-DD slice of generatedAt

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
  // Phase 13.0.1 adversarial fix MF-1 — PDF state hooks MUST be
  // declared BEFORE any conditional early return below, otherwise a
  // mount where `hasSlm` flips false→true (the literal install-pack
  // demo flow) triggers React 19's "Rendered more hooks than during
  // the previous render" crash. Cost of holding these refs while
  // unavailable is zero.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<PdfExtractErrorCode | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  // Phase 13.0.1 adversarial fix SF-1 — generation counter for
  // race-safe concurrent picks. Two rapid picks would otherwise see
  // a slower extract overwrite a faster one. We bump on entry and
  // gate every state-write on still being the latest generation.
  const pickGenRef = useRef(0);
  // Phase 13.0.2 adversarial fix MF-2 — synchronous in-flight guard
  // for handleSaveSummary. The disabled-button check is the happy
  // path defence but doesn't survive a double-click that lands in
  // the same React batch (both clicks see saveState.kind ==='idle'
  // and both fire the mutation). The ref flips before any state
  // write so the second call short-circuits even within a single
  // React tick.
  const savingRef = useRef(false);

  const { status, summarise, reset, partialText, hasSlm, modelPackId } = useSlmDocSummariser({ identityId });
  // Phase 13.0.2 — Save summary state. `lastPdfFingerprint` is
  // captured at PDF-pick time and lives across re-renders until a
  // fresh paste or sample clears it. `saveState` drives the button
  // copy + the post-save acknowledgement chip.
  const [lastPdfFingerprint, setLastPdfFingerprint] = useState<DocPdfFingerprintInput | null>(null);
  const [saveState, setSaveState] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; recordId: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const createMemoryRecord = useCreateMemoryRecord();

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
    setSaveState({ kind: 'idle' });
    // Phase 13.4 — clear the bridge BEFORE we start a new run so a
    // SkillAgentPanel reading from the bridge can't accidentally
    // render guidance against the prior summary while the new one
    // is mid-stream.
    useLastDocSummaryBridge.getState().clear();
    const out = await summarise(docKind, docText);
    if (out) {
      setLastResult(out);
      // Phase 13.4 — publish the parsed summary to the bridge so
      // SkillAgentPanel can compose. Only when parse succeeded
      // (a null parse means honest-hide on this panel and on
      // skill panels too).
      if (out.parsed && identityId) {
        useLastDocSummaryBridge.getState().setSnapshot({
          ownerIdentityId: identityId,
          docKind,
          parsed: out.parsed,
          capturedAt: new Date().toISOString()
        });
      }
    }
  }

  function handleTrySample() {
    setDocText(SAMPLE_FIXTURES[docKind]);
    setLastResult(null);
    setPdfError(null);
    setPdfNotice(null);
    setLastPdfFingerprint(null);
    setSaveState({ kind: 'idle' });
    // Phase 13.4 — clear the SLM-H bridge so a stale snapshot
    // can't drive the SkillAgentPanel chip block.
    useLastDocSummaryBridge.getState().clear();
    reset();
  }

  function handleClear() {
    setDocText('');
    setLastResult(null);
    setPdfError(null);
    setPdfNotice(null);
    setLastPdfFingerprint(null);
    setSaveState({ kind: 'idle' });
    useLastDocSummaryBridge.getState().clear();
    reset();
  }

  function handleSaveSummary() {
    if (!identityId || !lastResult?.parsed || !modelPackId) return;
    // Phase 13.0.2 MF-2 — synchronous in-flight guard. The button's
    // `disabled` clause catches re-renders but a same-tick double
    // click can still arrive here twice; the ref flips before any
    // state write so the second call short-circuits.
    if (savingRef.current) return;
    if (saveState.kind === 'saving') return;
    savingRef.current = true;
    setSaveState({ kind: 'saving' });
    const source = buildDocSummarySource({
      parsed: lastResult.parsed,
      modelPackId,
      pdf: lastPdfFingerprint,
      now: new Date().toISOString()
    });
    // Phase 13.0.2 MF-3 — citizen-readable cleartext label MUST NOT
    // be the parsed document title (titles can carry PII such as
    // consumer numbers or counterparty names). The label that
    // surfaces in the unencrypted MemoryRecord row is `<kind> ·
    // <yyyy-mm-dd>` — purely meta. The title itself lives in the
    // encrypted body and only renders after a memory.read consent.
    const cleartextLabel = `${DOC_KIND_LABEL[source.docKind]} · ${source.generatedAt.slice(0, DOC_KIND_DATE_LEN)}`;
    createMemoryRecord.mutate(
      {
        identityId,
        text: renderSummaryPlaintext(lastResult.parsed),
        label: cleartextLabel,
        sensitivity: 'sensitive',
        // Phase 13.0.2 SF-6 — drop docKind from the unencrypted tag
        // set. docKind already lives on the doc.summarised ledger
        // event (a separate consent-gated surface); duplicating it
        // here would create a second cleartext channel that leaks
        // even when the citizen revokes memory.read.
        tags: ['document_summary'],
        source: source as unknown as Record<string, unknown>
      },
      {
        onSuccess: (data) => {
          savingRef.current = false;
          setSaveState({ kind: 'saved', recordId: data.memory.recordId });
        },
        onError: (err: Error) => {
          savingRef.current = false;
          // Phase 13.0.2 SF-5 — never echo raw server text. Keyed
          // copy map drives the user-visible message; the verbatim
          // err.message goes to the dev console only.
          const code = (err as ApiError).code;
          const copy = (code && SAVE_ERROR_COPY[code]) || SAVE_ERROR_FALLBACK;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[doc-summariser] save failed', { code, message: err.message });
          }
          setSaveState({ kind: 'error', message: copy });
        }
      }
    );
  }

  async function handlePickPdf(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Always clear the input so picking the SAME file twice re-fires.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    // Phase 13.0.1 SF-1 — bump the pick-generation; any earlier
    // in-flight extract's writes are now stale and will no-op.
    const myGen = ++pickGenRef.current;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    try {
      const result = await extractPdfText(file);
      if (myGen !== pickGenRef.current) return; // stale pick
      // Phase 13.0.1 SF-3 — only nuke the prior summary AFTER a
      // successful extract. A failed pick (encrypted / corrupt /
      // image-only / etc.) preserves whatever the citizen already
      // had on screen.
      setLastResult(null);
      setSaveState({ kind: 'idle' });
      reset();
      setDocText(result.text);
      // Phase 13.0.2 — capture the count-only PDF provenance so a
      // later Save attaches it to the doc-summary source envelope.
      setLastPdfFingerprint({
        pages: result.pageCount,
        truncatedReason: result.truncatedReason
      });
      // Phase 13.0.1 SF-5 — render the notice by the precise
      // truncation reason rather than a single contradictory
      // "Read N of N pages — truncated".
      setPdfNotice(buildExtractNotice(result));
    } catch (err) {
      if (myGen !== pickGenRef.current) return; // stale pick
      setPdfError(classifyPdfError(err));
    } finally {
      if (myGen === pickGenRef.current) setPdfBusy(false);
    }
  }

  const PDF_ERROR_MESSAGE: Record<PdfExtractErrorCode, string> = {
    unsupported_mime: 'That file is not a PDF. Pick a .pdf to extract its text on this device.',
    too_large: `That PDF is over the ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB limit. Paste the text instead.`,
    encrypted: 'This PDF is password-protected. Open it in your PDF viewer, copy the text, and paste here.',
    corrupt: "Couldn't read this PDF. It may be damaged. Try opening it in your PDF viewer first.",
    no_text_layer: 'This PDF has no readable text layer — likely a scanned image. Paste the text instead.'
  };

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
              onClick={() => {
                if (kind === docKind) return;
                setDocKind(kind);
                // Phase 13.4 SF-1 — pill change signals "I'm moving
                // on from the previous doc". Clear the SLM-H bridge
                // so the SkillAgentPanel doesn't render guidance
                // against a stale summary for a different doc kind.
                useLastDocSummaryBridge.getState().clear();
              }}
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
        Paste or pick a PDF
      </label>
      {/* Phase 13.0.1 — PDF picker. Extraction runs entirely
          in-browser via pdfjs; the blob never leaves this device. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handlePickPdf}
          disabled={pdfBusy || isBusy}
          className="block text-caption text-text-muted file:mr-2 file:rounded-sm file:border-0 file:bg-trust-50 file:px-3 file:py-1 file:text-caption file:font-semibold file:text-trust-700 hover:file:bg-trust-100 disabled:opacity-50"
        />
        {pdfBusy && (
          <span className="text-caption text-text-muted">Reading PDF on this device…</span>
        )}
        {!pdfBusy && pdfNotice && !pdfError && (
          <span className="text-caption text-trust-700">{pdfNotice}</span>
        )}
      </div>
      {pdfError && (
        <p className="mb-2 rounded-sm border border-orange-100 bg-orange-50 p-2 text-caption text-orange-700">
          {PDF_ERROR_MESSAGE[pdfError]}
        </p>
      )}
      <textarea
        value={docText}
        onChange={(e) => {
          setDocText(e.target.value);
          // Phase 13.0.2 — manual edits invalidate the PDF
          // provenance so a later Save can't claim the text came
          // from the prior PDF pick.
          // SF-4 — keep the citizen informed instead of silently
          // dropping the pdfNotice. A visible warning is the right
          // posture because the edit changes the meaning of the
          // upcoming Save (the saved bytes are now the typed text,
          // not the extracted PDF text).
          if (lastPdfFingerprint) {
            setLastPdfFingerprint(null);
            setPdfNotice(
              'Edited after PDF pick — this summary will be saved as pasted text, not as the PDF you picked.'
            );
          }
          // Phase 13.0.2 MF-2 — when transitioning OUT of 'saved'
          // we also nuke the prior chip block + reset the SLM hook
          // so the Save button + Badge can't linger over text that
          // no longer matches the saved record. The honest UI is:
          // edit → chip gone → fresh Summarise → fresh Save.
          if (saveState.kind === 'saved') {
            setSaveState({ kind: 'idle' });
            setLastResult(null);
            reset();
          }
        }}
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
            disabled={isBusy || pdfBusy}
          >
            Try sample
          </Action>
          {docText.length > 0 && (
            <Action
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isBusy || pdfBusy}
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
          /* Phase 13.0.1 SF-6 — gate Summarise on pdfBusy so the
             citizen can't fire a summary against pre-pick textarea
             content mid-extract. */
          disabled={isBusy || isCoolingDown || pdfBusy || docText.trim().length === 0}
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
        <>
          <SummaryChipBlock
            parsed={lastResult.parsed}
            generationMs={lastResult.generationMs}
          />
          {/* Phase 13.0.2 — Save summary to a consent-gated
              MemoryRecord. The body is encrypted at rest; the
              audit ledger gets a pointer-not-payload
              doc.summarised event with count-only meta. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Action
              variant="secondary"
              onClick={handleSaveSummary}
              disabled={
                !identityId ||
                !modelPackId ||
                saveState.kind === 'saving' ||
                saveState.kind === 'saved'
              }
            >
              {saveState.kind === 'saving'
                ? 'Encrypting + saving…'
                : saveState.kind === 'saved'
                  ? 'Saved'
                  : 'Save summary to my notes'}
            </Action>
            {saveState.kind === 'saved' && (
              <Badge variant="trust">
                {/* Phase 13.0.2 MF-3 — tighter copy. The cleartext
                    label IS visible in the notes list (it carries
                    <kind> · <date> only, no body); only the body
                    needs an active memory.read consent to surface. */}
                Saved as a sensitive note · body readable from /citizen/notes under your active memory.read consent.
              </Badge>
            )}
            {saveState.kind === 'error' && (
              <span className="text-caption text-error">{saveState.message}</span>
            )}
          </div>
        </>
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
          You can either paste the document text or pick a PDF —
          extraction runs in this browser via pdfjs and the PDF blob is
          never uploaded. When you tap Summarise the text is passed to
          the SLM pack you installed in this browser via the Phase 9.0c
          llama.cpp-WASM runtime. Generation streams locally, the raw
          completion is parsed into TITLE / TLDR / bullets / language /
          confidence / risk-flag, and the structured output renders here.
          Nothing about the document or the summary touches the network
          — open DevTools → Network and try it. Image-only / scanned PDFs
          have no text layer to extract; paste them instead.
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

// Phase 13.0.1 SF-5 — branch the citizen-facing notice by the
// precise truncation reason so a single-page char-clamp doesn't say
// "Read 1 of 1 page — truncated" (contradictory) and a multi-page
// page-clamp doesn't hide the page math.
function buildExtractNotice(result: {
  pagesExtracted: number;
  pageCount: number;
  truncatedReason: 'pages' | 'chars' | 'both' | null;
}): string {
  const { pagesExtracted, pageCount, truncatedReason } = result;
  const plural = (n: number) => (n === 1 ? '' : 's');
  if (truncatedReason === 'chars') {
    return `Read all ${pageCount} page${plural(pageCount)} — kept the first ${DOC_INPUT_CHAR_CAP.toLocaleString()} characters to fit the on-device model.`;
  }
  if (truncatedReason === 'pages') {
    return `Read ${pagesExtracted} of ${pageCount} pages on this device — the rest were skipped to fit the on-device model.`;
  }
  if (truncatedReason === 'both') {
    return `Read ${pagesExtracted} of ${pageCount} pages and kept the first ${DOC_INPUT_CHAR_CAP.toLocaleString()} characters — truncated twice to fit the on-device model.`;
  }
  return `Read ${pagesExtracted} page${plural(pagesExtracted)} on this device.`;
}
