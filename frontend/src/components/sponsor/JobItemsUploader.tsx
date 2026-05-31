import { useMemo, useState } from 'react';
import { Action, Card, Evidence, useToast } from '@/components/ui';
import { useUploadSponsorJobItems, type LabelingJobFull } from '@/lib/hooks';

interface JobItemsUploaderProps {
  job: LabelingJobFull;
}

interface ParseError {
  lineNum: number;
  error: string;
  snippet: string;
}

interface ParseResult {
  good: Array<{ body: unknown; goldenAnswer?: unknown }>;
  malformed: number;
  errors: ParseError[];
  pasteRejected?: 'too_large';
}

const MAX_PASTE_BYTES = 10_000_000; // 10 MB

function shortSnippet(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed;
}

function parseItems(text: string): ParseResult {
  // Strip UTF-8 BOM if the clipboard included one (very common on
  // Windows + many editors). JSON.parse throws on a leading BOM.
  const noBom = text.replace(/^﻿/, '');
  const trimmed = noBom.trim();
  if (!trimmed) return { good: [], malformed: 0, errors: [] };
  // Hard cap: refuse pastes >10MB rather than freezing the tab on
  // JSON.parse over a 1 GB string.
  if (trimmed.length > MAX_PASTE_BYTES) {
    return { good: [], malformed: 0, errors: [], pasteRejected: 'too_large' };
  }
  // Try JSON array first.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const good: ParseResult['good'] = [];
        const errors: ParseError[] = [];
        arr.forEach((entry, i) => {
          if (entry && typeof entry === 'object' && 'body' in entry) {
            good.push(entry as { body: unknown; goldenAnswer?: unknown });
          } else {
            errors.push({
              lineNum: i + 1,
              error: 'missing required field "body"',
              snippet: shortSnippet(JSON.stringify(entry))
            });
          }
        });
        return { good, malformed: errors.length, errors };
      }
    } catch (err) {
      // fall through to JSONL parsing
      return {
        good: [],
        malformed: 1,
        errors: [{ lineNum: 1, error: `JSON array parse error: ${(err as Error).message}`, snippet: shortSnippet(trimmed) }]
      };
    }
  }
  // Single JSON object pasted (very natural "try one row first").
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && 'body' in obj) {
        return { good: [obj as { body: unknown; goldenAnswer?: unknown }], malformed: 0, errors: [] };
      }
      return {
        good: [],
        malformed: 1,
        errors: [{ lineNum: 1, error: 'missing required field "body"', snippet: shortSnippet(trimmed) }]
      };
    } catch (_err) {
      // fall through to JSONL — may still parse line-by-line.
    }
  }
  // Otherwise treat as JSONL.
  const lines = trimmed.split(/\r?\n/);
  const good: ParseResult['good'] = [];
  const errors: ParseError[] = [];
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && 'body' in obj) {
        good.push(obj as { body: unknown; goldenAnswer?: unknown });
      } else {
        errors.push({
          lineNum: idx + 1,
          error: 'missing required field "body"',
          snippet: shortSnippet(line)
        });
      }
    } catch (err) {
      errors.push({
        lineNum: idx + 1,
        error: (err as Error).message,
        snippet: shortSnippet(line)
      });
    }
  });
  return { good, malformed: errors.length, errors };
}

export function JobItemsUploader({ job }: JobItemsUploaderProps) {
  const upload = useUploadSponsorJobItems();
  const show = useToast((s) => s.show);
  const [text, setText] = useState('');
  const { good, malformed, errors, pasteRejected } = useMemo(() => parseItems(text), [text]);

  const itemsRemaining = Math.max(0, job.itemCount - job.itemsUploaded);
  const wouldOverflow = good.length > itemsRemaining;
  const tooLarge = pasteRejected === 'too_large';
  const canSubmit = good.length > 0 && !wouldOverflow && !tooLarge && !upload.isPending;

  function handleUpload() {
    if (!canSubmit) return;
    if (malformed > 0) {
      const ok = window.confirm(
        `${malformed} of ${good.length + malformed} entries are malformed and will be skipped by the server. Proceed?`
      );
      if (!ok) return;
    }
    upload.mutate(
      { jobId: job.jobId, items: good },
      {
        onSuccess: (res) => {
          setText('');
          show(`Uploaded ${res.itemsCreated} items.`, 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  return (
    <Card
      title="Upload items"
      subtitle={`${job.itemsUploaded}/${job.itemCount} uploaded · ${itemsRemaining} remaining`}
    >
      <p className="text-body text-text-muted mb-3">
        Paste JSONL (one entry per line) or a JSON array. Each entry:{' '}
        <span className="font-mono">{`{body, goldenAnswer?}`}</span>. The body
        shape is task-kind specific — see the seed-demo for examples.
      </p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`{"body":{"prompt":"…","options":[…]},"goldenAnswer":{"value":"…"}}`}
        className="w-full resize-y rounded-sm border border-border bg-white px-3 py-2 font-mono text-caption text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      {tooLarge && (
        <p className="mt-3 rounded-sm bg-error-50 px-3 py-2 text-caption text-error">
          Paste exceeds 10 MB — split into smaller batches before uploading.
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-surface-2 p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Parsed
          </p>
          <p className="mt-1 text-body">{good.length} valid · {malformed} malformed</p>
          {wouldOverflow && (
            <p className="mt-1 text-caption text-error">
              Exceeds remaining slot ({itemsRemaining}) — trim before upload.
            </p>
          )}
          {errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-caption text-text-muted">
                See first {Math.min(5, errors.length)} parse errors
              </summary>
              <ul className="mt-2 space-y-1 text-caption">
                {errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="font-mono text-error">
                    Line {err.lineNum}: {err.error}
                    <div className="mt-0.5 text-text-muted">{err.snippet}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="rounded-sm border border-border bg-surface-2 p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            After upload
          </p>
          <p className="mt-1 text-body">
            {job.itemsUploaded + good.length}/{job.itemCount} items
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Action onClick={handleUpload} disabled={!canSubmit}>
          {upload.isPending ? 'Uploading…' : `Upload ${good.length} items`}
        </Action>
        <Action variant="ghost" onClick={() => setText('')} disabled={upload.isPending}>
          Clear
        </Action>
      </div>
      <Evidence title="What does the server do with malformed entries?">
        The Phase 10.1 upload endpoint silently skips malformed entries
        (returns <span className="font-mono">itemsCreated</span> = the count
        that actually persisted). We pre-count locally and warn before
        submitting so you can fix or proceed honestly.
      </Evidence>
    </Card>
  );
}
