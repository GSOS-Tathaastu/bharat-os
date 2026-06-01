// Phase 13.1 — SLM-F PII review sheet.
//
// Bottom sheet that opens when the citizen taps the "Check for PII"
// chip on CitizenIntent or CitizenNotes. Renders the merged span
// list (regex pre-checked-as-mask, SLM unchecked-suggestion). The
// citizen toggles spans, taps Apply, and the sheet calls onApply
// with the masked text — caller rewrites the textarea BEFORE the
// existing handleSend / handleCreate runs.
//
// §15 bindings:
//   - "Stays on this device · 0 bytes uploaded" badge always
//     visible.
//   - MF-3 byte-match staleness — if the text has drifted since
//     the scan was kicked off, the sheet disables Apply and shows
//     "Text changed — re-scan" so the citizen never applies stale
//     offsets.
//   - Apply rewrites text only when the citizen explicitly accepts.
//   - Honest-hide: when zero spans are found, the sheet renders
//     "No Indian PII detected" without claiming the SLM "proved"
//     it.
//   - Honest framing for the SLM pass: SLM-discovered spans show
//     a "model suggested" badge so the citizen knows the regex
//     layer is the trust anchor.

import { useMemo, useState } from 'react';
import { Action, Badge, Sheet } from '@/components/ui';
import {
  applyMask,
  PII_KIND_LABEL,
  PII_KIND_MASK,
  type RegexSpan
} from '@/lib/pii-detectors';
import type { SlmSpan } from '@/lib/pii-redactor';
import type { PiiScanSpan, SlmPiiScanResult } from '@/lib/use-slm-pii-redactor';

interface PiiReviewSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The current textarea value. If it differs from
   * `result.scannedText`, the sheet disables Apply.
   */
  currentText: string;
  result: SlmPiiScanResult | null;
  /** Phase 13.2 adversarial fix MF-1 — the sheet passes the
   *  citizen-selected span set out to the caller so the buildAnnotation
   *  envelope can report maskedCount honestly (not the detected
   *  superset). */
  onApply: (maskedText: string, appliedSpans: PiiScanSpan[]) => void;
  /** Phase 13.2 adversarial fix SF-3 — title override so the Notes
   *  surface can say "before saving" instead of "before sending". */
  title?: string;
}

function spanKey(span: PiiScanSpan): string {
  return `${span.source}:${span.kind}:${span.start}:${span.end}`;
}

function isRegex(span: PiiScanSpan): span is RegexSpan {
  return span.source === 'regex';
}

function isSlm(span: PiiScanSpan): span is SlmSpan {
  return span.source === 'slm';
}

export function PiiReviewSheet({
  open,
  onClose,
  currentText,
  result,
  onApply,
  title = 'Check for PII before sending'
}: PiiReviewSheetProps) {
  // Selection state: maps spanKey → checked. Regex spans default
  // to true (pre-checked as "will mask"); SLM spans default to
  // false ("suggested, citizen reviews").
  const initialSelection = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (!result) return out;
    for (const span of result.mergedSpans) {
      out[spanKey(span)] = isRegex(span);
    }
    return out;
  }, [result]);

  const [selected, setSelected] = useState<Record<string, boolean>>(initialSelection);
  // Phase 13.1 adversarial fix M3 — re-seed selection on every
  // fresh `result` object, not on keyset-equality. The hook
  // returns a NEW lastResult reference on each scan, so identity
  // comparison is the correct re-seed trigger. The earlier
  // keyset-equality short-circuit left stale ticks in place
  // when a re-scan returned the same (kind,start,end) keys —
  // citizen would have applied a DIFFERENT span set than the
  // pre-checked default shown in the sheet.
  const [prevResult, setPrevResult] = useState(result);
  if (result !== prevResult) {
    setPrevResult(result);
    setSelected(initialSelection);
  }

  const isStale = !!result && result.scannedText !== currentText;

  const selectedSpans: PiiScanSpan[] = useMemo(() => {
    if (!result) return [];
    return result.mergedSpans.filter((s) => selected[spanKey(s)]);
  }, [result, selected]);

  const previewMasked = useMemo(() => {
    if (!result) return '';
    if (isStale) return '';
    // Phase 13.2 adversarial fix SF-9 — applyMask widens to accept
    // any { start, end, kind, raw } shape; PiiScanSpan satisfies it
    // by structural shape, no cast needed.
    return applyMask(currentText, selectedSpans);
  }, [result, currentText, selectedSpans, isStale]);

  function handleToggle(key: string) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleMaskAll() {
    if (!result) return;
    const next: Record<string, boolean> = {};
    for (const span of result.mergedSpans) next[spanKey(span)] = true;
    setSelected(next);
  }

  function handleKeepAll() {
    if (!result) return;
    const next: Record<string, boolean> = {};
    for (const span of result.mergedSpans) next[spanKey(span)] = false;
    setSelected(next);
  }

  function handleApply() {
    if (isStale || !result) return;
    onApply(previewMasked, selectedSpans);
    onClose();
  }

  if (!result) return null;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="trust">Stays on this device · 0 bytes uploaded</Badge>
          {result.modelPackId && (
            <Badge variant="neutral">
              Regex + on-device model
              {result.generationMs != null && ` · ${(result.generationMs / 1000).toFixed(1)}s`}
            </Badge>
          )}
          {!result.modelPackId && (
            <Badge variant="neutral">Regex only (no SLM installed)</Badge>
          )}
        </div>

        {isStale && (
          <div className="rounded-sm border border-orange-100 bg-orange-50 p-3 text-caption text-orange-700">
            Text changed since the scan — re-run the chip before applying.
          </div>
        )}

        {result.mergedSpans.length === 0 ? (
          <p className="text-body text-text">
            No Indian PII detected. You can send as-is.
          </p>
        ) : (
          <>
            <p className="text-caption text-text-muted">
              {result.mergedSpans.length} potential PII span
              {result.mergedSpans.length === 1 ? '' : 's'} found.
              Tick the ones you want to mask before sending. Regex
              hits are pre-checked; on-device model suggestions are
              not.
            </p>

            <div className="flex gap-2">
              <Action variant="ghost" size="sm" onClick={handleMaskAll} disabled={isStale}>
                Mask all
              </Action>
              <Action variant="ghost" size="sm" onClick={handleKeepAll} disabled={isStale}>
                Keep all
              </Action>
            </div>

            <ul className="space-y-2">
              {result.mergedSpans.map((span) => {
                const key = spanKey(span);
                const checked = selected[key] ?? false;
                // Phase 13.2 adversarial fix D10 — per-row preview
                // calls the per-kind mask shaper DIRECTLY. The
                // earlier `applyMask(span.raw, [{...span}])` call
                // failed because applyMask expects span.start/end
                // to be offsets into the supplied text (which here
                // was span.raw of length === span.end-span.start,
                // not the original text). Spans were silently
                // dropped on the text.slice mismatch guard and the
                // row rendered the raw value as "masked".
                const masked = checked
                  ? PII_KIND_MASK[span.kind](span.raw)
                  : span.raw;
                return (
                  <li
                    key={key}
                    className="rounded-sm border border-border bg-white p-3"
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggle(key)}
                        disabled={isStale}
                        className="mt-1 h-4 w-4 cursor-pointer"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant={isRegex(span) ? 'trust' : 'pending'}>
                            {PII_KIND_LABEL[span.kind]}
                          </Badge>
                          {isSlm(span) && (
                            <Badge variant="neutral">
                              On-device model suggested · {Math.round(span.confidence * 100)}%
                            </Badge>
                          )}
                        </span>
                        <span className="mt-1 block text-body text-text">
                          <span className="font-mono">{span.raw}</span>
                          {checked && (
                            <>
                              {' → '}
                              <span className="font-mono text-trust-700">
                                {masked}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {!isStale && (
              <details className="rounded-sm border border-border bg-surface p-3">
                <summary className="cursor-pointer text-caption font-semibold text-text">
                  Preview the rewritten text
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-caption text-text">
                  {previewMasked}
                </pre>
              </details>
            )}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Action
            variant="trust"
            onClick={handleApply}
            disabled={isStale || result.mergedSpans.length === 0}
          >
            {result.mergedSpans.length === 0
              ? 'Nothing to mask'
              : `Apply (${selectedSpans.length} span${selectedSpans.length === 1 ? '' : 's'})`}
          </Action>
          <Action variant="ghost" onClick={onClose}>
            Cancel
          </Action>
        </div>
      </div>
    </Sheet>
  );
}
