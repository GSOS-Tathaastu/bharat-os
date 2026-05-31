import { useEffect, useRef, useState } from 'react';
import { Action, Card } from '@/components/ui';
import { readSlmBlob } from '@/lib/opfs';
import { loadSlmRuntime, type SlmRuntime } from '@/lib/slm-runtime';
import {
  buildHintPrompt,
  HINT_MAX_TOKENS,
  HINT_TEMPERATURE,
  parseHintCompletion
} from '@/lib/labeling-slm-hint';
import { useActiveIdentity, useInstalledSlms } from '@/lib/hooks';
import type { LabelingJobItem } from '@/lib/hooks';

interface SlmHintCardProps {
  item: LabelingJobItem;
  /** Worker accepts the suggestion — submit through the normal path. */
  onAccept: (labelValue: unknown) => void;
  /** Disabled when a submission is already in flight. */
  submitting: boolean;
}

/**
 * Phase 10.6 — pre-labeling hint card. Gated on the worker having
 * at least one installed SLM (Phase 9.0b record + OPFS bytes).
 *
 * Lazy: nothing happens until the worker taps the "Suggest" button.
 * On tap we lazy-load the wllama runtime (same path Labs uses),
 * prompt it with `buildHintPrompt(taskKind, item.body)`, stream the
 * completion, and run `parseHintCompletion` to turn the SLM's free
 * text back into a typed `labelValue`. The worker then either
 * accepts (submits via `onAccept`) or discards (next button cycle
 * regenerates).
 *
 * Renders nothing when:
 *   • the worker has no installed SLM (clean degradation), or
 *   • the task body doesn't fit any of the v1 prompt templates.
 *
 * §15: the prompt + completion never leave the device. We never
 * auto-submit. The worker always sees the suggestion before
 * confirming.
 */
export function SlmHintCard({ item, onAccept, submitting }: SlmHintCardProps) {
  const identity = useActiveIdentity();
  const installed = useInstalledSlms(identity?.id);
  const firstInstall = installed.data?.[0];
  const [busy, setBusy] = useState<'idle' | 'loading' | 'generating'>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [hintLabel, setHintLabel] = useState<unknown | null>(null);
  const [rawCompletion, setRawCompletion] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<SlmRuntime | null>(null);

  // Reset suggestion when the item changes — old hint isn't valid
  // for the new question.
  useEffect(() => {
    setHintLabel(null);
    setRawCompletion('');
    setError(null);
  }, [item.itemId]);

  // Free WASM memory when the worker leaves the session.
  useEffect(
    () => () => {
      if (runtimeRef.current) {
        void runtimeRef.current.unload();
        runtimeRef.current = null;
      }
    },
    []
  );

  if (!firstInstall) return null;

  const prompt = buildHintPrompt(item.taskKind, item.body);
  if (!prompt) return null;

  async function ensureRuntime(): Promise<SlmRuntime | null> {
    if (runtimeRef.current) return runtimeRef.current;
    if (!firstInstall) return null;
    const blob = await readSlmBlob(firstInstall.modelPackId);
    if (!blob) {
      setError('Model bytes not in OPFS. Reinstall the pack from Labs.');
      return null;
    }
    setBusy('loading');
    setLoadProgress(0);
    try {
      const runtime = await loadSlmRuntime({
        ggufBytes: blob,
        onProgress: (loaded, total) => {
          setLoadProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
        }
      });
      runtimeRef.current = runtime;
      return runtime;
    } catch (err) {
      setError(`Could not load runtime: ${(err as Error).message}`);
      return null;
    } finally {
      setBusy('idle');
    }
  }

  async function handleSuggest() {
    if (!prompt) return;
    setError(null);
    setHintLabel(null);
    setRawCompletion('');
    const runtime = await ensureRuntime();
    if (!runtime) return;
    setBusy('generating');
    try {
      const text = await runtime.generate({
        prompt,
        maxTokens: HINT_MAX_TOKENS,
        temperature: HINT_TEMPERATURE,
        onToken: (_token, partial) => setRawCompletion(partial)
      });
      setRawCompletion(text);
      const parsed = parseHintCompletion(item.taskKind, item.body, text);
      if (parsed) {
        setHintLabel(parsed);
      } else {
        setError('Could not parse the SLM suggestion. Label by hand.');
      }
    } catch (err) {
      setError(`Suggestion failed: ${(err as Error).message}`);
    } finally {
      setBusy('idle');
    }
  }

  const family = firstInstall.modelPackId.replace(/^bos:slm-model-pack:/, '');

  return (
    <Card tone="trust">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
        On-device suggestion
      </p>
      <p className="mt-1 text-caption text-text-muted">
        Your installed {family} can suggest a label. Runs in the browser; never
        leaves your device.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Action
          size="sm"
          variant="secondary"
          disabled={busy !== 'idle' || submitting}
          onClick={handleSuggest}
        >
          {busy === 'loading'
            ? `Loading runtime… ${loadProgress}%`
            : busy === 'generating'
              ? 'Thinking…'
              : hintLabel
                ? 'Suggest again'
                : 'Suggest a label'}
        </Action>
        {hintLabel !== null && (
          <Action
            size="sm"
            disabled={submitting}
            onClick={() => onAccept(hintLabel)}
          >
            Use this suggestion
          </Action>
        )}
      </div>
      {rawCompletion && (
        <pre className="mt-3 max-h-32 overflow-auto rounded-sm border border-trust-100 bg-white p-2 text-caption text-text whitespace-pre-wrap">
          {rawCompletion}
        </pre>
      )}
      {error && <p className="mt-2 text-caption text-error">{error}</p>}
    </Card>
  );
}
