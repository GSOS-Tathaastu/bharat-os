import { useState, useRef } from 'react';
import { Action, Card, Evidence, useToast } from '@/components/ui';
import { readSlmBlob } from '@/lib/opfs';
import { getSharedSlmRuntime, type SlmRuntime } from '@/lib/slm-runtime';
import { useActiveIdentity, useRecordMeshEvent } from '@/lib/hooks';

interface SlmTryPromptProps {
  modelPackId: string;
  family: string;
  onClose?: () => void;
}

// Rough token estimate — 4 chars per token is a reasonable
// approximation for English; for vernacular it's closer to 2-3 chars.
// Phase 9.0d records token counts for §13B inference payouts; the
// estimate is honest about being an estimate.
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

const SAMPLE_PROMPTS = [
  'Write a short greeting for a kirana shop owner in Hindi.',
  'Explain UPI in one sentence.',
  'Suggest a name for a federated learning round.'
];

export function SlmTryPrompt({ modelPackId, family, onClose }: SlmTryPromptProps) {
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState<'idle' | 'loading' | 'generating'>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [generationMs, setGenerationMs] = useState<number | null>(null);
  const [paisePaid, setPaisePaid] = useState<number | null>(null);
  const runtimeRef = useRef<SlmRuntime | null>(null);
  const show = useToast((s) => s.show);
  const identity = useActiveIdentity();
  const recordEvent = useRecordMeshEvent();

  async function ensureRuntime(): Promise<SlmRuntime | null> {
    if (runtimeRef.current) return runtimeRef.current;
    setBusy('loading');
    setLoadProgress(0);
    try {
      // Phase 13.0.0a — shared runtime; load happens at most once
      // across SlmTryPrompt + every SLM hook for the same packId.
      const runtime = await getSharedSlmRuntime(
        modelPackId,
        () => readSlmBlob(modelPackId),
        {
          logger: 'silent',
          onProgress: (loaded, total) => {
            setLoadProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
          }
        }
      );
      runtimeRef.current = runtime;
      return runtime;
    } catch (err) {
      if ((err as Error).message === 'no_blob') {
        show('Model bytes not in OPFS. Install the pack first.', 'error');
      } else {
        show(`Could not load runtime: ${(err as Error).message}`, 'error');
      }
      return null;
    } finally {
      setBusy('idle');
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      show('Type a prompt or pick a sample.', 'error');
      return;
    }
    const runtime = await ensureRuntime();
    if (!runtime) return;
    setOutput('');
    setBusy('generating');
    setGenerationMs(null);
    setPaisePaid(null);
    const startedAt = performance.now();
    try {
      const text = await runtime.generate({
        prompt: prompt.trim(),
        maxTokens: 128,
        onToken: (_token, partial) => setOutput(partial)
      });
      setOutput(text);
      setGenerationMs(Math.round(performance.now() - startedAt));

      // Phase 9.0d — record a real mesh-inference event for this
      // generation. Until now /mesh/balance reflected demo-seeded
      // events; this is the first time worker activity in /app/
      // produces real ledger ticks the cash-out flow can drain.
      if (identity) {
        const tokensServed = estimateTokens(prompt + text);
        recordEvent.mutate(
          {
            operatorId: identity.id,
            workloadType: 'inference',
            tokens: tokensServed
          },
          {
            onSuccess: (data) => {
              const evt = (data as { event?: { payoutPaise?: number } }).event;
              if (evt && typeof evt.payoutPaise === 'number') {
                setPaisePaid(evt.payoutPaise);
              }
            }
          }
        );
      }
    } catch (err) {
      show(`Generation failed: ${(err as Error).message}`, 'error');
    } finally {
      setBusy('idle');
    }
  }

  async function handleClose() {
    // Phase 13.0.0a — don't unload the shared runtime; other SLM
    // consumers may be using it. Pack uninstall in Labs.tsx calls
    // releaseSharedSlmRuntime explicitly.
    runtimeRef.current = null;
    onClose?.();
  }

  return (
    <Card
      title={`Try a prompt — ${family}`}
      subtitle="Runs entirely on your device. Prompt never leaves the browser."
      tone="trust"
      actions={
        <Action variant="ghost" size="sm" onClick={handleClose}>
          ✕ Close
        </Action>
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {SAMPLE_PROMPTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            className="rounded-sm border border-border bg-white px-2 py-1 text-caption text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask the on-device model anything…"
        className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Action onClick={handleGenerate} disabled={busy !== 'idle'}>
          {busy === 'loading'
            ? `Loading runtime… ${loadProgress}%`
            : busy === 'generating'
              ? 'Generating…'
              : 'Generate'}
        </Action>
      </div>
      {output && (
        <div className="mt-4 rounded-sm border border-trust-100 bg-white p-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
            Model output
          </p>
          <p className="whitespace-pre-wrap font-mono text-caption text-text">{output}</p>
          {generationMs !== null && (
            <p className="mt-2 text-caption text-text-muted">
              Generated in {generationMs} ms · {modelPackId.replace(/^bos:slm-model-pack:/, '')}
              {paisePaid !== null && paisePaid > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-trust-700">
                    +₹{(paisePaid / 100).toFixed(2)} earned
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      )}
      <Evidence title="How does on-device inference work?">
        The GGUF weights live in your browser's Origin Private File System.
        When you tap Generate, the WASM runtime (llama.cpp compiled to
        WebAssembly via @wllama/wllama) is lazy-loaded from a CDN, the
        model is loaded into WASM memory, and tokens stream back. Nothing
        about your prompt or the response is sent to a server.
      </Evidence>
    </Card>
  );
}
