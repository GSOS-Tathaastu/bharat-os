import { useState } from 'react';
import { Action, Card } from '@/components/ui';
import type { LabelingTaskProps } from './types';

interface SafetyCategory {
  value: string;
  label: string;
  description?: string;
}

interface SafetyLabelBody {
  prompt?: string;
  text: string;
  categories: SafetyCategory[];
  multiSelect?: boolean;
}

export function SafetyLabelTask({ item, submitting, onSubmit }: LabelingTaskProps) {
  const body = item.body as SafetyLabelBody;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!body?.text || !Array.isArray(body.categories) || body.categories.length === 0) {
    return (
      <Card>
        <p className="text-body text-error">
          Malformed safety_label item: missing text or categories.
        </p>
      </Card>
    );
  }

  function toggle(value: string) {
    const next = new Set(picked);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setPicked(next);
  }

  return (
    <>
      {body.prompt && (
        <Card>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Task
          </p>
          <p className="mt-1 text-body">{body.prompt}</p>
        </Card>
      )}
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Content
        </p>
        <p className="mt-1 whitespace-pre-wrap text-body">{body.text}</p>
      </Card>
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Which harms apply? (Pick all that fit; none means safe.)
        </p>
        <div className="mt-3 grid gap-2">
          {body.categories.map((cat) => {
            const isPicked = picked.has(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggle(cat.value)}
                disabled={submitting}
                className={
                  'flex items-start gap-3 rounded-md border-2 p-3 text-left transition-colors disabled:opacity-50 ' +
                  (isPicked
                    ? 'border-trust bg-trust-50'
                    : 'border-border bg-white hover:border-trust')
                }
              >
                <span
                  aria-hidden
                  className={
                    'mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors ' +
                    (isPicked ? 'border-trust bg-trust text-white' : 'border-border bg-white')
                  }
                >
                  {isPicked ? '✓' : ''}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{cat.label}</span>
                  {cat.description && (
                    <span className="mt-1 block text-caption text-text-muted">{cat.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <Action
            variant="trust"
            disabled={submitting}
            onClick={() => onSubmit({ values: Array.from(picked) })}
          >
            {picked.size === 0 ? 'Mark as safe' : `Submit ${picked.size} label${picked.size > 1 ? 's' : ''}`}
          </Action>
          <Action
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => onSubmit({ values: 'skip' })}
          >
            Skip this item
          </Action>
        </div>
      </Card>
    </>
  );
}
