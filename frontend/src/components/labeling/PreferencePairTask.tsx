import { Action, Card } from '@/components/ui';
import type { LabelingTaskProps } from './types';

interface PreferencePairBody {
  prompt?: string;
  a: string;
  b: string;
}

export function PreferencePairTask({ item, submitting, onSubmit }: LabelingTaskProps) {
  const body = item.body as PreferencePairBody;
  if (!body?.a || !body?.b) {
    return (
      <Card>
        <p className="text-body text-error">Malformed preference_pair item: missing a/b.</p>
      </Card>
    );
  }
  return (
    <>
      {body.prompt && (
        <Card>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Prompt
          </p>
          <p className="mt-1 text-body">{body.prompt}</p>
        </Card>
      )}
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Which response is better?
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSubmit({ choice: 'a' })}
            className="rounded-md border-2 border-border bg-white p-3 text-left transition-colors hover:border-trust hover:bg-trust-50 disabled:opacity-50"
          >
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Option A
            </span>
            <span className="mt-2 block whitespace-pre-wrap text-body text-text">{body.a}</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSubmit({ choice: 'b' })}
            className="rounded-md border-2 border-border bg-white p-3 text-left transition-colors hover:border-trust hover:bg-trust-50 disabled:opacity-50"
          >
            <span className="block text-caption font-semibold uppercase tracking-wide text-text-muted">
              Option B
            </span>
            <span className="mt-2 block whitespace-pre-wrap text-body text-text">{body.b}</span>
          </button>
        </div>
        <Action
          variant="ghost"
          size="sm"
          className="mt-3"
          disabled={submitting}
          onClick={() => onSubmit({ choice: 'skip' })}
        >
          Skip this item
        </Action>
      </Card>
    </>
  );
}
