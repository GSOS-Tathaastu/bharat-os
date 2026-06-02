// Phase 13.4 — SLM-H SkillAgentPanel.
//
// Sibling of DocSummariserPanel on /labs. After the citizen runs a
// doc summary whose docKind is supported by an installed skill
// (v1: only electricity_bill), this panel offers an "Explain my
// bill" CTA. On tap, runs the skill on-device via the shared
// wllama runtime, streams the structured guidance back, and
// renders chips with HEADLINE + ASSESSMENT + TARIFF + DEVIATION +
// EXPECTED RANGE + 2-5 typed action buttons.
//
// Subscribes to the last-doc-summary bridge so it doesn't need to
// be prop-drilled. Honest empty state: if no SLM installed OR no
// recent summary OR last summary is not electricity_bill, the
// panel hides.
//
// §15 bindings:
//   • Runs the on-device skill via shared wllama. No fetch().
//   • Reads from the in-memory bridge ONLY when the snapshot is
//     owned by the current identity (cross-identity flip protection).
//   • Renders only allowlist action verbs — drift coerces to safe
//     defaults at parser layer.
//   • Honest hide on null parse.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Action, Badge, Card } from '@/components/ui';
import { useLastDocSummaryBridge } from '@/lib/last-doc-summary-bridge';
import { useSlmSkillAgent } from '@/lib/use-slm-skill-agent';
import {
  ELECTRICITY_BILL_EXPLAINER,
  type ElectricityBillFields
} from '@/lib/skills/electricity-bill-explainer';
import { type SkillResult } from '@/lib/skill-agent';
import { SkillActionLink } from '@/components/SkillActionLink';

interface SkillAgentPanelProps {
  identityId: string | null | undefined;
}

const DEVIATION_VARIANT: Record<
  ElectricityBillFields['deviationFlag'],
  'trust' | 'pending' | 'error'
> = {
  under_expected: 'trust',
  on_track: 'trust',
  over_expected: 'pending',
  far_over_expected: 'error'
};

const DEVIATION_LABEL: Record<ElectricityBillFields['deviationFlag'], string> = {
  under_expected: 'Lower than expected',
  on_track: 'Within expected range',
  over_expected: 'Above expected range',
  far_over_expected: 'Far above expected range'
};

const TARIFF_LABEL: Record<ElectricityBillFields['tariffTier'], string> = {
  domestic_low: 'Domestic — low',
  domestic_mid: 'Domestic — mid',
  domestic_high: 'Domestic — high',
  commercial: 'Commercial',
  industrial: 'Industrial',
  unknown: 'Tier unknown'
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

function formatRupees(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function SkillAgentPanel({ identityId }: SkillAgentPanelProps) {
  const { status, run, hasSlm, partialText, reset } = useSlmSkillAgent({
    identityId,
    skill: ELECTRICITY_BILL_EXPLAINER
  });
  const snapshot = useLastDocSummaryBridge((s) => s.snapshot);
  const [lastResult, setLastResult] = useState<{
    parsed: SkillResult<ElectricityBillFields> | null;
    rawCompletion: string;
    generationMs: number;
  } | null>(null);
  // Phase 13.4 SF-4 — synchronous in-flight guard mirrors Phase
  // 13.0.2 MF-2: the disabled-button check catches re-renders but
  // a same-tick double click can still arrive twice. The ref flips
  // before any state write so the second call short-circuits.
  const runningRef = useRef(false);

  // Owner-scoped read of the snapshot. If the bridge is empty or
  // belongs to a different identity, we treat it as no snapshot.
  const ownedSnapshot = useMemo(() => {
    if (!snapshot || !identityId) return null;
    if (snapshot.ownerIdentityId !== identityId) return null;
    return snapshot;
  }, [snapshot, identityId]);

  // Drop any prior result when the snapshot changes — the chip
  // block should never linger over a different bill.
  useEffect(() => {
    setLastResult(null);
    reset();
  }, [ownedSnapshot?.parsed.fields.title, ownedSnapshot?.parsed.fields.tldr, reset]);

  // Honest empty state — render NOTHING when no SLM is installed
  // OR no electricity_bill summary is on the bridge.
  if (!hasSlm) return null;
  if (!ownedSnapshot) return null;
  if (ownedSnapshot.docKind !== 'electricity_bill') return null;

  const isBusy = status.kind === 'loading' || status.kind === 'running';
  const isCoolingDown = status.kind === 'cooling-down';
  const isError = status.kind === 'error';

  const busyLabel = (() => {
    if (status.kind === 'loading') return `Loading model… ${status.progress}%`;
    if (status.kind === 'running') {
      if (status.streamedChars === 0) return 'Thinking on-device…';
      return `Streaming… ${status.streamedChars.toLocaleString()} chars`;
    }
    return null;
  })();

  async function handleRun() {
    if (!ownedSnapshot) return;
    if (runningRef.current) return;
    runningRef.current = true;
    setLastResult(null);
    const input = {
      docSummaryTitle: ownedSnapshot.parsed.fields.title,
      docSummaryTldr: ownedSnapshot.parsed.fields.tldr,
      docSummaryBullets: ownedSnapshot.parsed.fields.bullets,
      tierHint: 'domestic_mid' as const
    };
    try {
      const out = await run(input);
      if (out) setLastResult(out);
    } finally {
      runningRef.current = false;
    }
  }

  const parsed = lastResult?.parsed?.fields ?? null;

  return (
    <Card
      title="On-device skill agent · Electricity bill explainer"
      subtitle="Phase 13.4 SLM-H · composes your last document summary into a plain-language assessment + concrete next-step actions, all on this device."
      actions={<Badge variant="trust">SLM-H · v1</Badge>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-trust-700">
          Stays on this device · 0 bytes uploaded
        </span>
      </div>

      <p className="mb-3 text-body text-text">
        Reading your last bill summary:{' '}
        <span className="font-semibold">{ownedSnapshot.parsed.fields.title}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Action
          variant="trust"
          onClick={handleRun}
          disabled={isBusy || isCoolingDown}
        >
          {isBusy ? 'Working…' : 'Explain my bill'}
        </Action>
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
            <Badge variant={DEVIATION_VARIANT[parsed.deviationFlag]}>
              {DEVIATION_LABEL[parsed.deviationFlag]}
            </Badge>
            <Badge variant="neutral">{TARIFF_LABEL[parsed.tariffTier]}</Badge>
            <Badge variant="neutral">
              Confidence {Math.round(parsed.confidence * 100)}%
            </Badge>
          </div>
          <p className="text-heading font-semibold text-text">{parsed.headline}</p>
          {parsed.assessment && (
            <p className="mt-1 text-body text-text">{parsed.assessment}</p>
          )}
          {parsed.expectedRangeMaxPaise > 0 && (
            <p className="mt-2 text-caption text-text-muted">
              Expected range for this tier:{' '}
              {formatRupees(parsed.expectedRangeMinPaise)} –{' '}
              {formatRupees(parsed.expectedRangeMaxPaise)}
            </p>
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
            shape. Showing the raw output below — tap Explain to retry.
          </p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-text">
            {lastResult.rawCompletion}
          </pre>
        </div>
      )}

      <details className="mt-3 text-caption text-text-muted">
        <summary className="cursor-pointer font-semibold">How this works</summary>
        <p className="mt-2">
          This skill agent reads the structured summary your on-device SLM
          produced for your last electricity bill (Phase 13.0 SLM-E) and
          runs a second on-device pass through the same SLM with a
          skill-specific prompt. Output is constrained to a fixed action
          vocabulary (file a dispute / request a meter recheck / switch
          tariff plan / etc.) — drift gets coerced to safe defaults at the
          parser. The whole exchange stays on this device — open DevTools
          → Network and try it. v1 is informational; tapping a suggestion
          today doesn't yet launch the action — wiring lands in a future
          Phase 13.4.x.
        </p>
      </details>
    </Card>
  );
}
