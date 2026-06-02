// Phase 13.4.1 — SLM-H ConsumerComplaintPanel.
//
// Sibling of SkillAgentPanel on /labs. The citizen types a
// free-form description of their grievance; tapping "Draft my
// complaint" runs the consumer-complaint-drafter skill on-device
// via the shared wllama runtime. Renders DRAFT_SUBJECT +
// FORUM_LEVEL + RELIEF_KIND + ESTIMATED_PROCESSING_DAYS +
// KEY_FACTS + 1-5 typed next-step actions.
//
// §15 bindings:
//   • Runs on-device via shared wllama. No fetch().
//   • Citizen description never leaves device (no autosave,
//     no posting to BE — paste lives in component state).
//   • Renders only allowlist action verbs; drift coerces to
//     safe defaults at parser layer.
//   • Honest hide on no SLM installed.
//   • Honest hide on null parse (chip block omitted; raw
//     completion shown if any).

import { useRef, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import { useSlmSkillAgent } from '@/lib/use-slm-skill-agent';
import {
  CONSUMER_COMPLAINT_DRAFTER,
  type ConsumerComplaintFields,
  type ConsumerComplaintInput
} from '@/lib/skills/consumer-complaint-drafter';
import {
  ACTION_LABEL,
  type SkillActionVerb,
  type SkillResult
} from '@/lib/skill-agent';

interface ConsumerComplaintPanelProps {
  identityId: string | null | undefined;
}

const FORUM_LEVEL_LABEL: Record<ConsumerComplaintFields['forumLevel'], string> = {
  district: 'District Consumer Disputes Redressal Commission',
  state: 'State Commission',
  national: 'National Commission'
};

const FORUM_LEVEL_VARIANT: Record<
  ConsumerComplaintFields['forumLevel'],
  'trust' | 'pending' | 'error'
> = {
  district: 'trust',
  state: 'pending',
  national: 'error'
};

const RELIEF_LABEL: Record<ConsumerComplaintFields['reliefKind'], string> = {
  refund: 'Refund',
  replacement: 'Replacement',
  service_redo: 'Service redo',
  compensation: 'Compensation',
  apology: 'Formal apology',
  mixed: 'Mixed relief'
};

const RISK_VARIANT: Record<'none' | 'attention' | 'urgent', 'trust' | 'pending' | 'error'> = {
  none: 'trust',
  attention: 'pending',
  urgent: 'error'
};

const RISK_LABEL: Record<'none' | 'attention' | 'urgent', string> = {
  none: 'Looks routine',
  attention: 'Worth a closer look',
  urgent: 'Act soon'
};

const MAX_COMPLAINT_CHARS = 2400;

export function ConsumerComplaintPanel({ identityId }: ConsumerComplaintPanelProps) {
  const { status, run, hasSlm, partialText } = useSlmSkillAgent({
    identityId,
    skill: CONSUMER_COMPLAINT_DRAFTER
  });
  const [complaintText, setComplaintText] = useState<string>('');
  const [lastResult, setLastResult] = useState<{
    parsed: SkillResult<ConsumerComplaintFields> | null;
    rawCompletion: string;
    generationMs: number;
  } | null>(null);
  // Phase 13.4 SF-4 — synchronous in-flight guard (same pattern as
  // SkillAgentPanel) so same-tick double clicks short-circuit.
  const runningRef = useRef(false);

  // Honest empty state — render NOTHING when no SLM is installed.
  if (!hasSlm) return null;

  const isBusy = status.kind === 'loading' || status.kind === 'running';
  const isCoolingDown = status.kind === 'cooling-down';
  const isError = status.kind === 'error';
  const overCap = complaintText.length > MAX_COMPLAINT_CHARS;

  const busyLabel = (() => {
    if (status.kind === 'loading') return `Loading model… ${status.progress}%`;
    if (status.kind === 'running') {
      if (status.streamedChars === 0) return 'Drafting on-device…';
      return `Streaming… ${status.streamedChars.toLocaleString()} chars`;
    }
    return null;
  })();

  async function handleRun() {
    if (runningRef.current) return;
    if (complaintText.trim().length < 40) return;
    runningRef.current = true;
    setLastResult(null);
    const input: ConsumerComplaintInput = { complaintText };
    try {
      const out = await run(input);
      if (out) setLastResult(out);
    } finally {
      runningRef.current = false;
    }
  }

  function handleTrySample() {
    setComplaintText(CONSUMER_COMPLAINT_DRAFTER.sampleInput().complaintText);
    setLastResult(null);
  }

  function handleClear() {
    setComplaintText('');
    setLastResult(null);
  }

  const parsed = lastResult?.parsed?.fields ?? null;

  return (
    <Card
      title="On-device skill agent · Consumer complaint drafter"
      subtitle="Phase 13.4.1 SLM-H · describe a product or service grievance; we draft a Consumer Protection Act 2019 complaint outline on this device."
      actions={<Badge variant="trust">SLM-H · v1</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          Stays on this device · 0 bytes uploaded
        </span>
      </div>

      <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-muted">
        Describe your grievance
      </label>
      <textarea
        value={complaintText}
        onChange={(e) => {
          setComplaintText(e.target.value);
          if (lastResult) setLastResult(null);
        }}
        rows={6}
        placeholder="Example: I bought a refrigerator 4 months ago for ₹38,000. It stopped cooling after 6 weeks. The retailer has refused 3 service requests. I want a refund or a replacement."
        className="block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className={'text-caption ' + (overCap ? 'text-orange-700' : 'text-text-muted')}>
          {complaintText.length.toLocaleString()} / {MAX_COMPLAINT_CHARS.toLocaleString()} chars
          {overCap && ` · truncated to first ${MAX_COMPLAINT_CHARS.toLocaleString()} chars for v1`}
        </p>
        <div className="flex gap-2">
          <Action variant="ghost" size="sm" onClick={handleTrySample} disabled={isBusy}>
            Try sample
          </Action>
          {complaintText.length > 0 && (
            <Action variant="ghost" size="sm" onClick={handleClear} disabled={isBusy}>
              Clear
            </Action>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Action
          variant="trust"
          onClick={handleRun}
          disabled={isBusy || isCoolingDown || complaintText.trim().length < 40}
        >
          {isBusy ? 'Working…' : 'Draft my complaint'}
        </Action>
        {complaintText.trim().length > 0 && complaintText.trim().length < 40 && (
          <span className="text-caption text-text-muted">
            Add a few more details (40+ characters) so the model can draft a useful complaint.
          </span>
        )}
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

      {partialText.length > 0 && (status.kind === 'running' || status.kind === 'ready') && (
        <div className="mt-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-trust-700">
            Generated locally on this device · 0 bytes uploaded
          </p>
          <pre className="max-h-48 overflow-auto rounded-sm border border-border bg-surface p-2 text-caption whitespace-pre-wrap text-text">
            {partialText}
          </pre>
        </div>
      )}

      {status.kind === 'ready' && parsed && (
        <div className="mt-3 rounded-md border border-trust-100 bg-trust-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={RISK_VARIANT[parsed.riskFlag]}>
              {RISK_LABEL[parsed.riskFlag]}
            </Badge>
            <Badge variant={FORUM_LEVEL_VARIANT[parsed.forumLevel]}>
              {FORUM_LEVEL_LABEL[parsed.forumLevel]}
            </Badge>
            <Badge variant="neutral">{RELIEF_LABEL[parsed.reliefKind]}</Badge>
            <Badge variant="neutral">
              Confidence {Math.round(parsed.confidence * 100)}%
            </Badge>
          </div>
          <p className="text-heading font-semibold text-text">{parsed.headline}</p>
          {parsed.assessment && (
            <p className="mt-1 text-body text-text">{parsed.assessment}</p>
          )}
          <div className="mt-3 rounded-sm border border-border bg-white p-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Draft subject
            </p>
            <p className="mt-1 text-body text-text">{parsed.draftSubject}</p>
          </div>
          {parsed.keyFacts.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Key facts your complaint must include
              </p>
              <ul className="list-disc pl-5 text-body text-text">
                {parsed.keyFacts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-caption text-text-muted">
            Estimated CPA 2019 processing time at this forum:{' '}
            <span className="font-semibold">
              ~{parsed.estimatedProcessingDays} days
            </span>
            . Actual timelines vary by region and case load.
          </p>
          {parsed.actions.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Suggested next steps
              </p>
              <ul className="list-disc pl-5 text-body text-text">
                {parsed.actions.map((verb: SkillActionVerb) => (
                  <li key={verb}>{ACTION_LABEL[verb]}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {status.kind === 'ready' && lastResult && !lastResult.parsed && lastResult.rawCompletion && (
        <div className="mt-3 rounded-sm border border-orange-100 bg-orange-50 p-3 text-caption text-orange-700">
          <p className="font-semibold">
            The model returned a response but it didn't match the expected
            shape. Showing the raw output below — tap Draft to retry.
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-text">
            {lastResult.rawCompletion}
          </pre>
        </div>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          This skill agent reads your description of a grievance and runs the
          on-device SLM with a Consumer Protection Act 2019-shaped prompt.
          Forum-level routing uses the CPA 2019 jurisdictional tiers
          (District ≤ ₹50 lakh; State ₹50 lakh – ₹2 crore; National &gt;
          ₹2 crore). Action verbs come from a fixed allowlist —
          drift gets coerced at parser layer. Everything stays on this
          device. v1 surfaces guidance only; the action verbs are
          informational and do NOT yet launch the filing flow (that lands in
          a future Phase 13.4.x).
        </p>
      </details>
    </Card>
  );
}
