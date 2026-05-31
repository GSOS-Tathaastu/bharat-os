import { useMemo, useState } from 'react';
import { Action, Card } from '@/components/ui';
import type { LabelingTaskProps } from './types';

interface SpanAnnotationBody {
  text: string;
  instruction?: string;
  labelKind?: string; // optional free-form label for the highlighted span
}

// Phase 10.3 — span_annotation v1 uses WORD-level toggling (tap a word
// to include or exclude it). Character-level drag selection on touch
// is gnarly cross-platform; word-toggle is reliable on mobile + desktop
// + accessible via keyboard tabbing. Sponsors get token indices in
// their export.
export function SpanAnnotationTask({ item, submitting, onSubmit }: LabelingTaskProps) {
  const body = item.body as SpanAnnotationBody;
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // Split on whitespace, preserve the trailing whitespace so the
  // rendered text reads naturally.
  const tokens = useMemo(() => {
    const result: Array<{ word: string; trailing: string }> = [];
    const re = /(\S+)(\s*)/g;
    let match: RegExpExecArray | null;
    const text = body?.text ?? '';
    while ((match = re.exec(text)) !== null) {
      result.push({ word: match[1], trailing: match[2] });
    }
    return result;
  }, [body?.text]);

  if (!body?.text || tokens.length === 0) {
    return (
      <Card>
        <p className="text-body text-error">Malformed span_annotation item: empty text.</p>
      </Card>
    );
  }

  function toggle(idx: number) {
    const next = new Set(picked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setPicked(next);
  }

  return (
    <>
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Instruction
        </p>
        <p className="mt-1 text-body">
          {body.instruction ?? 'Tap each word that should be highlighted, then Submit.'}
        </p>
      </Card>
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Tap to toggle each word
        </p>
        <p className="mt-3 select-none text-body leading-loose">
          {tokens.map(({ word, trailing }, idx) => {
            const isPicked = picked.has(idx);
            return (
              <span key={idx}>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  disabled={submitting}
                  className={
                    'rounded-sm px-1 py-0.5 transition-colors disabled:opacity-50 ' +
                    (isPicked
                      ? 'bg-trust text-white'
                      : 'bg-transparent text-text hover:bg-trust-50')
                  }
                >
                  {word}
                </button>
                <span>{trailing}</span>
              </span>
            );
          })}
        </p>
        <div className="mt-4 flex gap-2">
          <Action
            variant="trust"
            disabled={submitting || picked.size === 0}
            onClick={() =>
              onSubmit({
                wordIndices: Array.from(picked).sort((a, b) => a - b),
                labelKind: body.labelKind ?? null
              })
            }
          >
            Submit {picked.size} word{picked.size === 1 ? '' : 's'}
          </Action>
          <Action
            variant="secondary"
            size="sm"
            disabled={submitting || picked.size === 0}
            onClick={() => setPicked(new Set())}
          >
            Clear
          </Action>
          <Action
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => onSubmit({ wordIndices: 'skip' })}
          >
            Skip this item
          </Action>
        </div>
      </Card>
    </>
  );
}
