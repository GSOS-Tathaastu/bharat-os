// Phase 13.4.2 — SLM-H PmKisanStatusPanel.
//
// Standalone panel on /labs. Citizen types a free-form
// description of their PM-KISAN concern (status check / missing
// payment / eligibility doubt); on-device SLM emits structured
// guidance about the likely blocker among the four canonical
// causes + next-step actions.
//
// Same shape as ConsumerComplaintPanel (no bridge dependency,
// free-form input, synchronous runningRef guard, honest empty
// state).
//
// §15 bindings: standalone surface; nothing crosses the network.
// Citizen description lives in component state until panel
// unmount.

import { useRef, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import { useSlmSkillAgent } from '@/lib/use-slm-skill-agent';
import {
  PM_KISAN_STATUS_CHECKER,
  type PmKisanFields,
  type PmKisanInput
} from '@/lib/skills/pm-kisan-status-checker';
import { type SkillResult } from '@/lib/skill-agent';
import { SkillActionLink } from '@/components/SkillActionLink';

interface PmKisanStatusPanelProps {
  identityId: string | null | undefined;
}

const SCHEME_STATUS_LABEL: Record<PmKisanFields['schemeStatus'], string> = {
  likely_active: 'Likely active',
  likely_inactive: 'Likely inactive',
  eligibility_uncertain: 'Eligibility uncertain',
  unknown: 'Status unclear'
};

const SCHEME_STATUS_VARIANT: Record<
  PmKisanFields['schemeStatus'],
  'trust' | 'pending' | 'error' | 'neutral'
> = {
  likely_active: 'trust',
  likely_inactive: 'error',
  eligibility_uncertain: 'pending',
  unknown: 'neutral'
};

const LIKELY_BLOCKER_LABEL: Record<PmKisanFields['likelyBlocker'], string> = {
  ekyc_pending: 'eKYC pending',
  bank_aadhaar_unseeded: 'Bank not Aadhaar-seeded',
  land_record_mismatch: 'Land record mismatch',
  ineligible_landholding: 'Possibly ineligible by landholding',
  none: 'No blocker visible',
  unknown: 'Blocker unclear'
};

const LIKELY_BLOCKER_VARIANT: Record<
  PmKisanFields['likelyBlocker'],
  'trust' | 'pending' | 'error' | 'neutral'
> = {
  ekyc_pending: 'error',
  bank_aadhaar_unseeded: 'error',
  land_record_mismatch: 'error',
  ineligible_landholding: 'pending',
  none: 'trust',
  unknown: 'neutral'
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

const MAX_CONCERN_CHARS = 2400;
const MIN_GATE_CHARS = 30;

function todayIso(): string {
  // YYYY-MM-DD slice of `new Date().toISOString()`. The skill
  // input takes a date string so the prompt builder stays pure
  // (tests pass a fixed date for byte-stability).
  return new Date().toISOString().slice(0, 10);
}

export function PmKisanStatusPanel({ identityId }: PmKisanStatusPanelProps) {
  const { status, run, hasSlm, partialText } = useSlmSkillAgent({
    identityId,
    skill: PM_KISAN_STATUS_CHECKER
  });
  const [concernText, setConcernText] = useState<string>('');
  const [lastResult, setLastResult] = useState<{
    parsed: SkillResult<PmKisanFields> | null;
    rawCompletion: string;
    generationMs: number;
  } | null>(null);
  const runningRef = useRef(false);

  if (!hasSlm) return null;

  const isBusy = status.kind === 'loading' || status.kind === 'running';
  const isCoolingDown = status.kind === 'cooling-down';
  const isError = status.kind === 'error';
  const overCap = concernText.length > MAX_CONCERN_CHARS;

  const busyLabel = (() => {
    if (status.kind === 'loading') return `Loading model… ${status.progress}%`;
    if (status.kind === 'running') {
      if (status.streamedChars === 0) return 'Checking on-device…';
      return `Streaming… ${status.streamedChars.toLocaleString()} chars`;
    }
    return null;
  })();

  async function handleRun() {
    if (runningRef.current) return;
    if (concernText.trim().length < MIN_GATE_CHARS) return;
    runningRef.current = true;
    setLastResult(null);
    const input: PmKisanInput = {
      concernText,
      currentDateIso: todayIso()
    };
    try {
      const out = await run(input);
      if (out) setLastResult(out);
    } finally {
      runningRef.current = false;
    }
  }

  function handleTrySample() {
    setConcernText(PM_KISAN_STATUS_CHECKER.sampleInput().concernText);
    setLastResult(null);
  }

  function handleClear() {
    setConcernText('');
    setLastResult(null);
  }

  const parsed = lastResult?.parsed?.fields ?? null;

  return (
    <Card
      title="On-device skill agent · PM-KISAN status checker"
      subtitle="Phase 13.4.2 SLM-H · describe your PM-KISAN concern; we surface the likely blocker among the four common causes and concrete next steps, all on this device."
      actions={<Badge variant="trust">SLM-H · v1</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          Stays on this device · 0 bytes uploaded
        </span>
      </div>

      <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-text-muted">
        Describe your PM-KISAN concern
      </label>
      <textarea
        value={concernText}
        onChange={(e) => {
          setConcernText(e.target.value);
          if (lastResult) setLastResult(null);
        }}
        rows={5}
        placeholder="Example: I am a marginal farmer from Maharashtra. I received the first two PM-KISAN installments last year but the third one in December never came. My Aadhaar is linked to my bank account."
        className="block w-full rounded-sm border border-border bg-white p-2 text-body focus:border-primary focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className={'text-caption ' + (overCap ? 'text-orange-700' : 'text-text-muted')}>
          {concernText.length.toLocaleString()} / {MAX_CONCERN_CHARS.toLocaleString()} chars
          {overCap && ` · truncated to first ${MAX_CONCERN_CHARS.toLocaleString()} chars for v1`}
        </p>
        <div className="flex gap-2">
          <Action variant="ghost" size="sm" onClick={handleTrySample} disabled={isBusy}>
            Try sample
          </Action>
          {concernText.length > 0 && (
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
          disabled={isBusy || isCoolingDown || concernText.trim().length < MIN_GATE_CHARS}
        >
          {isBusy ? 'Working…' : 'Check my status'}
        </Action>
        {concernText.trim().length > 0 && concernText.trim().length < MIN_GATE_CHARS && (
          <span className="text-caption text-text-muted">
            Add a few more details ({MIN_GATE_CHARS}+ characters) so the model can give useful guidance.
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
            <Badge variant={RISK_VARIANT[parsed.riskFlag]}>{RISK_LABEL[parsed.riskFlag]}</Badge>
            <Badge variant={SCHEME_STATUS_VARIANT[parsed.schemeStatus]}>
              {SCHEME_STATUS_LABEL[parsed.schemeStatus]}
            </Badge>
            <Badge variant={LIKELY_BLOCKER_VARIANT[parsed.likelyBlocker]}>
              {LIKELY_BLOCKER_LABEL[parsed.likelyBlocker]}
            </Badge>
            <Badge variant="neutral">
              Confidence {Math.round(parsed.confidence * 100)}%
            </Badge>
          </div>
          <p className="text-heading font-semibold text-text">{parsed.headline}</p>
          {parsed.assessment && (
            <p className="mt-1 text-body text-text">{parsed.assessment}</p>
          )}
          <p className="mt-2 text-caption text-text-muted">
            Next installment window: {parsed.nextInstallmentWindow}
          </p>
          {parsed.keyChecks.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Things to verify
              </p>
              <ul className="list-disc pl-5 text-body text-text">
                {parsed.keyChecks.map((check, i) => (
                  <li key={i}>{check}</li>
                ))}
              </ul>
            </>
          )}
          {parsed.actions.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Suggested next steps
              </p>
              <ul className="list-disc pl-5 text-body text-text">
                {parsed.actions.map((verb) => (
                  <li key={verb}>
                    <SkillActionLink verb={verb} />
                  </li>
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
            shape. Showing the raw output below — tap Check to retry.
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-text">
            {lastResult.rawCompletion}
          </pre>
        </div>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          PM-KISAN disburses ₹6,000 per year in three ₹2,000 installments
          per Indian-fiscal cycle. Most missed payments come down to four
          things: eKYC pending, bank account not Aadhaar-seeded, land
          records mismatching the PM-KISAN registration, or ineligibility
          by landholding. This skill reads your description and surfaces
          the most likely blocker plus what to do next. v1 is
          informational — the live pmkisan.gov.in beneficiary-status check
          lands in a future Phase 13.4.x once the partner / scraping path
          is decided.
        </p>
      </details>
    </Card>
  );
}
