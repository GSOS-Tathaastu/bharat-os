// Phase 13.6.1 — OnDeviceInferenceAnimation
//
// A purely-cosmetic landing-page animation that simulates the
// on-device SLM streaming a document summary token-by-token.
//
// Honest-by-construction:
// - It is LABELED as "Illustration of /labs" so we don't claim it's
//   a live model call.
// - The text it streams is a real example of what the Phase 13.0
//   document summariser actually produces on the labs surface.
// - There is no network call. There is no model load. It's a
//   tween-based simulation aimed at giving a non-technical viewer
//   a felt sense of "tokens stream on-device".
//
// Pause-on-hover so a reader can actually read the output.

import { useEffect, useRef, useState } from 'react';

const SCRIPT: Array<{ role: 'system' | 'output'; text: string }> = [
  { role: 'system', text: '> Loaded model: phi-3-mini.gguf (Q4_K_M) · 2.3 GB on OPFS' },
  { role: 'system', text: '> Input: Electricity bill PDF · 1 page · 1.4 KB extracted text' },
  { role: 'system', text: '> Prompt: doc-summary v1 · streaming on-device · 0 bytes over network' },
  { role: 'system', text: '' },
  {
    role: 'output',
    text:
      '## Electricity bill summary\n\n' +
      '- Provider: TPDDL · billing month May 2026\n' +
      '- Amount due: ₹2,956 by 24 May 2026\n' +
      '- Consumption: 308 units (avg 9.9/day)\n' +
      '- ↑ 12% vs Apr; check fan load + standby draw\n' +
      '- Pay via UPI: 91234567890@tpddl'
  },
  { role: 'system', text: '' },
  { role: 'system', text: '> Done · 187 tokens · 11.3 t/s on M2 Air · 0 network requests' }
];

const STREAM_DELAY_MS = 16;
const LINE_PAUSE_MS = 220;
const RESTART_DELAY_MS = 4500;

interface OnDeviceInferenceAnimationProps {
  pauseOnHover?: boolean;
}

export function OnDeviceInferenceAnimation({
  pauseOnHover = true
}: OnDeviceInferenceAnimationProps) {
  const [rendered, setRendered] = useState<string>('');
  const [done, setDone] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function waitWhilePaused(then: () => void) {
      if (cancelled) {
        return;
      }
      if (pausedRef.current) {
        timeoutId = setTimeout(() => waitWhilePaused(then), 100);
        return;
      }
      then();
    }

    async function run() {
      setRendered('');
      setDone(false);
      let acc = '';
      for (const segment of SCRIPT) {
        const prefix =
          segment.role === 'output' || segment.text === '' ? '' : '';
        const target = (acc.length > 0 ? '\n' : '') + prefix + segment.text;
        for (const ch of target) {
          if (cancelled) {
            return;
          }
          await new Promise<void>((resolve) => {
            waitWhilePaused(() => {
              timeoutId = setTimeout(resolve, STREAM_DELAY_MS);
            });
          });
          acc += ch;
          setRendered(acc);
        }
        await new Promise<void>((resolve) => {
          timeoutId = setTimeout(resolve, LINE_PAUSE_MS);
        });
      }
      if (cancelled) {
        return;
      }
      setDone(true);
      await new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, RESTART_DELAY_MS);
      });
      if (!cancelled) {
        run();
      }
    }

    run();
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <div
      data-testid="on-device-inference-animation"
      role="img"
      aria-label="Illustration: streaming on-device SLM output, looped"
      className="rounded-md border border-border bg-gray-900 text-white shadow-sm"
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2 text-caption">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-trust-300"></span>
          <span className="font-mono text-gray-300">/labs · doc-summary · on-device</span>
        </div>
        <span className="text-gray-400">{done ? 'Done' : paused ? 'Paused' : 'Streaming'}</span>
      </div>
      <pre className="m-0 max-h-72 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 font-mono text-caption leading-relaxed text-gray-100">
        {rendered}
        {!done && <span className="ml-0.5 inline-block w-2 animate-pulse bg-gray-200">&nbsp;</span>}
      </pre>
      <div className="border-t border-gray-700 px-3 py-2 text-caption text-gray-400">
        Illustration of <code className="text-gray-200">/labs</code> · the real surface runs the
        same flow live in your browser
      </div>
    </div>
  );
}
