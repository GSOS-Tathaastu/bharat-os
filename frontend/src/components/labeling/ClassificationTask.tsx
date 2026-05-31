import { Action, Card } from '@/components/ui';
import type { LabelingTaskProps } from './types';

interface ClassificationOption {
  value: string;
  label: string;
  description?: string;
}

interface ClassificationBody {
  prompt?: string;
  text: string;
  options: ClassificationOption[];
}

export function ClassificationTask({ item, submitting, onSubmit }: LabelingTaskProps) {
  const body = item.body as ClassificationBody;
  if (!body?.text || !Array.isArray(body.options) || body.options.length === 0) {
    return (
      <Card>
        <p className="text-body text-error">
          Malformed classification item: missing text or options.
        </p>
      </Card>
    );
  }
  return (
    <>
      {body.prompt && (
        <Card>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Question
          </p>
          <p className="mt-1 text-body">{body.prompt}</p>
        </Card>
      )}
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Text to classify
        </p>
        <p className="mt-1 whitespace-pre-wrap text-body">{body.text}</p>
      </Card>
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Pick the best category
        </p>
        <div className="mt-3 grid gap-2">
          {body.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={submitting}
              onClick={() => onSubmit({ value: opt.value })}
              className="rounded-md border-2 border-border bg-white p-3 text-left transition-colors hover:border-trust hover:bg-trust-50 disabled:opacity-50"
            >
              <span className="block font-semibold text-text">{opt.label}</span>
              {opt.description && (
                <span className="mt-1 block text-caption text-text-muted">{opt.description}</span>
              )}
            </button>
          ))}
        </div>
        <Action
          variant="ghost"
          size="sm"
          className="mt-3"
          disabled={submitting}
          onClick={() => onSubmit({ value: 'skip' })}
        >
          Skip this item
        </Action>
      </Card>
    </>
  );
}
