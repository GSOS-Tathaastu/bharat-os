import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Action, Badge, Card, Evidence, Field, Sheet, Tabs, useToast } from '@/components/ui';
import { ConsentGrantSheet } from '@/components/ConsentGrantSheet';
import { DailyBriefCard } from '@/components/DailyBriefCard';
import { CitizenNotes } from '@/routes/CitizenNotes';
import {
  useActiveIdentity,
  useConsents,
  useCreateFlagReport,
  useDailyBrief,
  useGrantConsent,
  useRecentOrchestrations,
  useRevokeConsent,
  useSendIntent,
  type ConsentArtifact,
  type Orchestration
} from '@/lib/hooks';
import { isVoiceIntentSupported, VoiceIntentSession } from '@/lib/voice-intent';
import { useSlmIntentParser } from '@/lib/use-slm-intent-parser';
import { useSlmPiiRedactor } from '@/lib/use-slm-pii-redactor';
import { PiiReviewSheet } from '@/components/PiiReviewSheet';
import { CooldownCountdown } from '@/components/CooldownCountdown';
import { actionTypeFriendlyLabel, type ParsedIntent } from '@/lib/intent-parser';
import { useSmartSendIntent } from '@/lib/use-send-intent-smart';
import { OfflineQueuePill } from '@/components/OfflineQueuePill';
import { QueuedIntentsPanel } from '@/components/QueuedIntentsPanel';

const ACTION_TYPE_LABEL: Record<string, string> = {
  service_booking: 'Service booking (Bharat OS marketplace)',
  scheme_delivery: 'Government scheme delivery',
  regulated_onboarding: 'Regulated onboarding',
  health_record_read: 'Health record read',
  labor_match_post: 'Labor matching',
  mesh_storage: 'Mesh storage',
  trust_attestation: 'Trust Passport attestation',
  daily_brief: 'On-device daily brief'
};

const ACTION_TYPE_PURPOSE: Record<string, string> = {
  service_booking: 'Book a service for me through the Bharat OS marketplace.',
  scheme_delivery: 'Help me access a government scheme I am eligible for.',
  regulated_onboarding: 'Complete a regulated onboarding flow on my behalf.',
  health_record_read: 'Read my health record summary for this purpose.',
  labor_match_post: 'Post a labor request and match me with workers.',
  trust_attestation: 'Mint a selective-disclosure attestation about me.',
  daily_brief: 'Compose my on-device daily brief.',
  mesh_storage: 'Store this payload on my mesh node.'
};

const TABS = [
  { to: '/citizen/home', label: 'Home', icon: '🏠' },
  { to: '/citizen/notes', label: 'Notes', icon: '📝' },
  { to: '/citizen/trust', label: 'Trust', icon: '🛡' },
  { to: '/labs', label: 'Labs', icon: '🧪' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

// Phase 12.1a.1 — some suggestions are now first-party marketplace
// shortcuts. Tapping them routes to /citizen/services/role/<role>
// directly, not into the intent textarea — because the marketplace
// substrate can answer immediately without going through the
// orchestrator's intent-parse path. Suggestions WITHOUT a target
// path still populate the textarea (existing behaviour).
const SUGGESTIONS: Array<{ text: string; target?: string }> = [
  { text: 'Book a cab', target: '/citizen/services/role/cab-driver' },
  { text: 'Hire household help', target: '/citizen/services/role/household-help' },
  { text: 'Apply for a small loan' },
  { text: 'Find a doctor near me' },
  { text: 'Pay my electricity bill' },
  { text: 'Share my health record with Lakshmi clinic' }
];

function CitizenIntent() {
  const identity = useActiveIdentity();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [lastOutcome, setLastOutcome] = useState<Orchestration | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const sendIntent = useSendIntent();
  // Phase 12.1b.2 — smart send wraps the legacy mutation: on
  // offline OR network failure, the intent is enqueued in IDB and
  // a "queued" outcome is returned; on online + success, the
  // orchestration lands as usual.
  const smartSend = useSmartSendIntent();
  const grantConsent = useGrantConsent();
  const { data: recent = [] } = useRecentOrchestrations(identity?.id);
  const { data: briefData } = useDailyBrief(identity?.id);
  const createFlag = useCreateFlagReport();
  const show = useToast((s) => s.show);

  // Phase 12.0.4 — voice intent input. Browser SpeechRecognition is
  // device-local; nothing leaves until the citizen taps Send. Phase
  // 12.1b SLM-A will replace this with a true on-device vernacular
  // model handling 22+ Indic languages.
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const voiceSupported = isVoiceIntentSupported();
  const voiceRef = useRef<VoiceIntentSession | null>(null);

  useEffect(
    () => () => {
      voiceRef.current?.abort();
    },
    []
  );

  function startVoice() {
    if (listening) {
      voiceRef.current?.stop();
      return;
    }
    setInterim('');
    const session = new VoiceIntentSession({
      lang: 'en-IN',
      onInterim: (t) => setInterim(t),
      onFinal: (finalText) => {
        setText((prev) => {
          const sep = prev && !prev.endsWith(' ') ? ' ' : '';
          return (prev + sep + finalText).trim();
        });
        setInterim('');
      },
      onError: (msg) => {
        setListening(false);
        setInterim('');
        show(`Voice input: ${msg}`, 'error');
      },
      onEnd: () => {
        setListening(false);
        setInterim('');
      }
    });
    if (session.start()) {
      voiceRef.current = session;
      setListening(true);
    }
  }

  // Phase 12.0.4 — flag report state.
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagSubject, setFlagSubject] = useState<{ id: string; label: string } | null>(null);
  const [flagCategory, setFlagCategory] = useState('abuse');
  const [flagDescription, setFlagDescription] = useState('');

  function openFlag(subjectId: string, subjectLabel: string) {
    setFlagSubject({ id: subjectId, label: subjectLabel });
    setFlagCategory('abuse');
    setFlagDescription('');
    setFlagOpen(true);
  }

  function handleSubmitFlag() {
    if (!identity || !flagSubject) return;
    if (flagDescription.trim().length < 10) {
      show('Tell us what happened in at least 10 characters.', 'error');
      return;
    }
    createFlag.mutate(
      {
        reporterId: identity.id,
        subjectId: flagSubject.id,
        category: flagCategory,
        description: flagDescription.trim()
      },
      {
        onSuccess: () => {
          setFlagOpen(false);
          setFlagSubject(null);
          setFlagDescription('');
          show('Report filed. An operator will review under §9A.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  // Phase 12.0.2 — when the citizen taps "Review + grant" on the
  // daily brief card, route through the existing ConsentGrantSheet
  // by promoting the brief's orchestration to lastOutcome.
  function handleGrantBriefConsent() {
    if (!briefData?.orchestration) return;
    setLastOutcome(briefData.orchestration);
    setGrantOpen(true);
  }

  // Phase 12.1b.1 — on-device SLM intent parser. Citizens with no
  // SLM installed never see the chip; citizens with one installed
  // get a "we understood: …" preview before tapping Send.
  const slmParser = useSlmIntentParser({ identityId: identity?.id });
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);

  // Phase 13.1 — on-device PII redactor. Regex-primary +
  // SLM-secondary. The chip is available even without SLM
  // installed (regex floor); the sheet opens with the merged
  // span list and lets the citizen pick what to mask BEFORE
  // handleSend runs.
  const piiRedactor = useSlmPiiRedactor({ identityId: identity?.id });
  const [piiSheetOpen, setPiiSheetOpen] = useState(false);
  async function handleCheckPii() {
    const result = await piiRedactor.scan(text);
    if (result) setPiiSheetOpen(true);
  }
  function handlePiiApply(maskedText: string) {
    setText(maskedText);
    piiRedactor.markApplied();
    // The annotation gate already invalidates on any text change,
    // so a setText after Apply clears any stale SLM-A annotation
    // via the existing onChange handler in the textarea (line ~348
    // — `if (parsedFromText != null && next !== parsedFromText)`).
    // We replicate that here because setText() doesn't fire onChange.
    if (parsedFromText != null && maskedText !== parsedFromText) {
      setParsedIntent(null);
      setParsedFromText(null);
      slmParser.reset();
    }
  }

  // Phase 12.1b.1 — keep a reference to the EXACT text the user
  // parsed so the annotation gate matches it byte-for-byte. Any
  // textarea edit clears parsedIntent before handleSend can attach
  // a stale annotation (MF-1 + MF-3 adversarial fix).
  const [parsedFromText, setParsedFromText] = useState<string | null>(null);

  async function handleParseWithSlm() {
    setParsedIntent(null);
    slmParser.reset();
    const snapshot = text;
    const result = await slmParser.parse(snapshot);
    if (result?.parsed) {
      setParsedIntent(result.parsed);
      setParsedFromText(snapshot);
    }
  }

  function handleSend(intentText: string = text) {
    if (!identity || !intentText.trim()) {
      show('Type or pick what you want to do.', 'error');
      return;
    }
    // Phase 13.1 adversarial fix M6 — Send foot-gun gate. The chip
    // promised "Check for PII before sending"; if the citizen
    // scanned, saw N spans, dismissed the sheet, and now hits Send,
    // surface a confirm so the trust theatre is honest.
    if (
      piiRedactor.hasPendingPii &&
      piiRedactor.lastResult &&
      piiRedactor.lastResult.scannedText === intentText
    ) {
      const n = piiRedactor.lastResult.mergedSpans.length;
      const ok = window.confirm(
        `You found ${n} potential PII item${n === 1 ? '' : 's'} but haven't masked any of them. Send anyway?`
      );
      if (!ok) {
        setPiiSheetOpen(true);
        return;
      }
    }
    // MF-1 (adversarial fix) — don't attach a stale annotation when:
    //   • voice interim is still pending (user sees text + interim
    //     but we only parsed text)
    //   • the sent text doesn't match the text the chip was built
    //     from (any edit invalidates the annotation)
    const interimPending = listening && interim.trim().length > 0;
    const annotation =
      parsedIntent && !interimPending && parsedFromText != null && intentText === parsedFromText
        ? {
            actionType: parsedIntent.actionType,
            confidence: parsedIntent.confidence,
            detectedLanguage: parsedIntent.detectedLanguage,
            rationale: parsedIntent.rationale,
            modelPackId: slmParser.modelPackId,
            entities: parsedIntent.entities,
            generatedAt: new Date().toISOString()
          }
        : null;
    // Phase 12.1b.2 — smart send: queues to IDB if offline, posts
    // with Idempotency-Key if online. The drainer in App.tsx replays
    // queued items on the next online event.
    (async () => {
      try {
        const result = await smartSend.send({
          identityId: identity.id,
          intentText,
          intentAnnotation: annotation,
          locale: 'en-IN'
        });
        if (result.kind === 'sent') {
          setLastOutcome(result.orchestration);
          if (parsedFromText == null || text.trim() !== parsedFromText.trim()) {
            setParsedIntent(null);
            setParsedFromText(null);
            slmParser.reset();
          }
          // Phase 13.1 adversarial fix S12 — clear stale PII scan
          // state so the chip doesn't keep showing "Found N — review"
          // against text that has already been dispatched.
          piiRedactor.reset();
        } else if (result.kind === 'queued') {
          // SF-3 (adversarial fix) — present-progressive copy that
          // mirrors the QueuedIntentsPanel "queued — not yet on
          // Bharat OS" phrasing so the citizen has one mental model.
          show(
            result.reason === 'offline'
              ? "Saving offline — will send when you're back online."
              : 'Connection blip — saving locally, will retry shortly.',
            'success'
          );
          setText('');
          setParsedIntent(null);
          setParsedFromText(null);
          slmParser.reset();
          piiRedactor.reset();
        } else if (result.kind === 'queue_full') {
          show('Queue is full. Open the queue tab to clear old intents.', 'error');
        } else if (result.kind === 'crypto_unavailable') {
          show('Your browser blocked secure crypto. Open Bharat OS over HTTPS.', 'error');
        }
      } catch (err) {
        show((err as Error).message, 'error');
      }
    })();
  }

  async function handleGrant(scopes: string[], ttlDays: number) {
    if (!identity || !lastOutcome) return;
    const requirement = lastOutcome.consentRequirement;
    if (!requirement?.granteeId) return;
    const actionType = lastOutcome.actionRequest?.actionType;
    const purpose =
      (actionType && ACTION_TYPE_PURPOSE[actionType]) ??
      lastOutcome.intent?.intentText ??
      'Granted from /app/citizen/home';
    try {
      await grantConsent.mutateAsync({
        identityId: identity.id,
        granteeId: requirement.granteeId,
        scopes,
        purpose,
        ttlDays
      });
      setGrantOpen(false);
      // Phase 12.0.2 — also refresh the daily brief; granting a
      // memory.read consent unblocks the brief composition.
      qc.invalidateQueries({ queryKey: ['daily-brief', identity.id] });
      // Auto-re-send the same intent so the citizen sees the
      // blocked → planned/completed transition in one motion.
      // For the daily-brief flow there's no intent text to re-send;
      // the useDailyBrief query refetches via the invalidation above.
      const intentToRetry = lastOutcome.intent?.intentText ?? '';
      if (intentToRetry.trim()) {
        setAutoRetrying(true);
        handleSend(intentToRetry);
        setAutoRetrying(false);
      } else {
        // Pure consent-grant (daily brief case); clear the outcome
        // card so the citizen sees the refreshed brief, not the
        // stale "blocked" card.
        setLastOutcome(null);
        show('Consent granted. Your brief is composing.', 'success');
      }
    } catch (err) {
      show((err as Error).message, 'error');
    }
  }

  const sendBusy = sendIntent.isPending || autoRetrying;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
      <section>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
        </p>
        <h1 className="text-display font-semibold">
          What can Bharat OS do for you today?
        </h1>
      </section>

      <DailyBriefCard onGrantConsent={handleGrantBriefConsent} />

      {/* Phase 12.1b.2 — offline queue + connectivity status pill */}
      <OfflineQueuePill identityId={identity?.id ?? null} />

      <Card>
        <div className="relative">
          <textarea
            rows={3}
            value={text + (listening && interim ? ` ${interim}` : '')}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              // MF-3 (adversarial fix) — invalidate the parsed chip
              // immediately when the user edits the textarea so a
              // stale annotation cannot be attached to a different
              // intent.
              if (parsedFromText != null && next !== parsedFromText) {
                setParsedIntent(null);
                setParsedFromText(null);
                slmParser.reset();
              }
            }}
            placeholder="Speak in any language. Hindi · Marathi · Bhojpuri · Tamil · Bengali · English."
            className={
              'w-full resize-none rounded-sm border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:outline-none focus:ring-2 ' +
              (listening
                ? 'border-error focus:border-error focus:ring-orange-100'
                : 'border-border focus:border-primary focus:ring-primary-100')
            }
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={startVoice}
              className={
                'absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ' +
                (listening
                  ? 'border-error bg-error-50 text-error animate-pulse'
                  : 'border-border bg-white text-text-muted hover:border-primary hover:text-primary')
              }
              aria-label={listening ? 'Stop listening' : 'Speak your intent'}
              title={listening ? 'Stop listening' : 'Speak your intent'}
            >
              {listening ? '⏹' : '🎤'}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              type="button"
              onClick={() => (s.target ? navigate(s.target) : setText(s.text))}
              className="rounded-sm border border-border bg-white px-3 py-1 text-caption text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              {s.text}
              {s.target && <span aria-hidden className="ml-1">→</span>}
            </button>
          ))}
        </div>
        {/* Phase 12.1b.1 — on-device SLM intent parser pre-flight.
            Hidden when no SLM installed; shown as a soft chip when
            ready. NEVER auto-sends — the citizen taps Send.
            Copy intentionally non-technical (MF-4 adversarial fix). */}
        {(slmParser.status.kind === 'ready' ||
          slmParser.status.kind === 'loading' ||
          slmParser.status.kind === 'parsing' ||
          slmParser.status.kind === 'error') && text.trim().length > 0 && text.trim().length <= 2 && (
          <p className="mt-2 text-caption text-text-muted">
            Type a bit more so I can understand it for you.
          </p>
        )}
        {(slmParser.status.kind === 'ready' ||
          slmParser.status.kind === 'loading' ||
          slmParser.status.kind === 'parsing' ||
          slmParser.status.kind === 'error') && text.trim().length > 2 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleParseWithSlm}
              disabled={slmParser.status.kind === 'loading' || slmParser.status.kind === 'parsing'}
              className="rounded-sm border border-primary bg-primary-50 px-3 py-1 text-caption font-semibold text-primary transition-colors hover:bg-primary-100 disabled:opacity-50"
            >
              {slmParser.status.kind === 'loading'
                ? `Loading on-device model ${slmParser.status.progress}%…`
                : slmParser.status.kind === 'parsing'
                  ? 'Understanding on-device…'
                  : '✨ Check my understanding'}
            </button>
            {parsedIntent && (
              <Badge variant="trust">
                <span title="How sure the on-device model is. You decide if it matches.">
                  We understood: {actionTypeFriendlyLabel(parsedIntent.actionType)}
                  {parsedIntent.detectedLanguage && ` · ${parsedIntent.detectedLanguage}`}
                  {' · '}
                  confidence {Math.round(parsedIntent.confidence * 100)}%
                </span>
              </Badge>
            )}
            {parsedIntent && (
              <button
                type="button"
                onClick={() => { setParsedIntent(null); setParsedFromText(null); slmParser.reset(); }}
                className="text-caption text-text-muted underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
        {slmParser.status.kind === 'error' && (
          <p className="mt-2 text-caption text-text-muted">
            On-device model couldn&rsquo;t finish: {slmParser.status.message}.{' '}
            <button
              type="button"
              onClick={handleParseWithSlm}
              className="underline text-primary"
            >
              Retry
            </button>{' '}
            or send without it &mdash; your intent will still route.
          </p>
        )}
        {/* Phase 13.1 — Check for PII chip. Always visible when the
            citizen has typed something — regex floor works without
            SLM, SLM augments when installed. */}
        {text.trim().length > 2 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCheckPii}
              disabled={
                piiRedactor.status.kind === 'loading' ||
                piiRedactor.status.kind === 'scanning'
              }
              className="rounded-sm border border-trust-100 bg-trust-50 px-3 py-1 text-caption font-semibold text-trust-700 transition-colors hover:bg-trust-100 disabled:opacity-50"
            >
              {piiRedactor.status.kind === 'loading'
                ? `Loading on-device model ${piiRedactor.status.progress}%…`
                : piiRedactor.status.kind === 'scanning'
                  ? 'Scanning on-device…'
                  : '🛡 Check for PII before sending'}
            </button>
            {piiRedactor.lastResult && piiRedactor.lastResult.scannedText === text && (
              <Badge
                variant={
                  piiRedactor.lastResult.mergedSpans.length === 0
                    ? 'trust'
                    : 'pending'
                }
              >
                <button
                  type="button"
                  onClick={() => setPiiSheetOpen(true)}
                  className="cursor-pointer"
                >
                  {piiRedactor.lastResult.mergedSpans.length === 0
                    ? 'Looks clean'
                    : `Found ${piiRedactor.lastResult.mergedSpans.length} — review`}
                </button>
              </Badge>
            )}
            {piiRedactor.status.kind === 'cooling-down' && (
              <CooldownCountdown cooldownUntil={piiRedactor.status.cooldownUntil} />
            )}
            {piiRedactor.status.kind === 'error' && (
              <span className="text-caption text-error">
                {piiRedactor.status.message}
              </span>
            )}
          </div>
        )}
        <PiiReviewSheet
          open={piiSheetOpen}
          onClose={() => setPiiSheetOpen(false)}
          currentText={text}
          result={piiRedactor.lastResult}
          onApply={handlePiiApply}
        />

        <div className="mt-4 flex gap-2">
          <Action onClick={() => handleSend()} disabled={sendBusy}>
            {sendIntent.isPending ? 'Sending…' : autoRetrying ? 'Re-sending after consent…' : 'Send'}
          </Action>
          {lastOutcome && (
            <Action variant="ghost" onClick={() => setLastOutcome(null)}>
              Clear outcome
            </Action>
          )}
        </div>
        <Evidence title="What happens to my intent?">
          Bharat OS routes it through L4 policy → L6 skill preflight → L3 tool
          execution. Every step is signed and added to your audit ledger. No
          third party sees the intent unless you grant explicit consent.
        </Evidence>
      </Card>

      {/* Phase 12.1a.1 — Marketplace discovery shortcut. */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-heading font-semibold text-text">Browse providers near you</h2>
            <p className="mt-1 text-caption text-text-muted">
              Cabs · cooks · maids · daily-wage labour. Direct contact,
              no Bharat OS commission.
            </p>
          </div>
          <Action variant="ghost" onClick={() => navigate('/citizen/services')}>
            Browse →
          </Action>
        </div>
      </Card>

      {lastOutcome && (
        <OutcomeCard
          orchestration={lastOutcome}
          onGrantConsent={() => setGrantOpen(true)}
        />
      )}

      {lastOutcome?.consentRequirement?.scopes && lastOutcome.consentRequirement.granteeId && (
        <ConsentGrantSheet
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          scopes={lastOutcome.consentRequirement.scopes}
          granteeId={lastOutcome.consentRequirement.granteeId}
          purpose={
            (lastOutcome.actionRequest?.actionType &&
              ACTION_TYPE_PURPOSE[lastOutcome.actionRequest.actionType]) ??
            lastOutcome.intent?.intentText ??
            'Granted from /app/citizen/home'
          }
          granting={grantConsent.isPending}
          onGrant={handleGrant}
        />
      )}

      <Card title="Recent activity" subtitle="Latest intents on this profile">
        {recent.length === 0 ? (
          <p className="text-body text-text-muted">No activity yet. Try a suggestion above.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((o) => (
              <li key={o.orchestrationId} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">{o.intent?.intentText ?? '—'}</p>
                    <p className="text-caption text-text-muted">
                      {o.actionRequest?.actionType ?? '—'} ·{' '}
                      {new Date(o.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openFlag(
                        o.orchestrationId,
                        o.intent?.intentText ?? o.actionRequest?.actionType ?? 'orchestration'
                      )
                    }
                    className="shrink-0 rounded-sm border border-border bg-white px-2 py-1 text-caption text-text-muted hover:border-error hover:text-error"
                    aria-label="Report this activity"
                    title="Report this activity"
                  >
                    Report
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Phase 12.0.4 — §9A flag report sheet. */}
      <Sheet
        open={flagOpen}
        onClose={() => {
          setFlagOpen(false);
          setFlagSubject(null);
        }}
        title="Report this activity"
      >
        <div className="space-y-3">
          <p className="text-body text-text-muted">
            Operators review §9A reports. False reports are themselves a
            flaggable offence. Bharat OS surfaces resolutions in your audit
            ledger.
          </p>
          {flagSubject && (
            <Card>
              <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Subject
              </p>
              <p className="mt-1 text-body">{flagSubject.label}</p>
              <p className="text-caption font-mono text-text-muted">
                {flagSubject.id.replace(/^bos:[a-z-]+:/, '')}
              </p>
            </Card>
          )}
          <div>
            <p className="mb-1 text-caption font-semibold text-text">Category</p>
            <div className="flex flex-wrap gap-2">
              {['abuse', 'fraud', 'spam', 'safety', 'other'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFlagCategory(c)}
                  className={
                    'rounded-sm border-2 px-3 py-1 text-caption font-semibold capitalize ' +
                    (flagCategory === c
                      ? 'border-error bg-error-50 text-error'
                      : 'border-border bg-white text-text-muted hover:border-error')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-caption font-semibold text-text">What happened?</p>
            <textarea
              rows={4}
              value={flagDescription}
              onChange={(e) => setFlagDescription(e.target.value)}
              placeholder="At least 10 characters. Be factual."
              className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex gap-2">
            <Action variant="destructive" onClick={handleSubmitFlag} disabled={createFlag.isPending}>
              {createFlag.isPending ? 'Filing…' : 'File report'}
            </Action>
            <Action variant="ghost" onClick={() => setFlagOpen(false)}>
              Cancel
            </Action>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

interface OutcomeCardProps {
  orchestration: Orchestration;
  onGrantConsent?: () => void;
}

function OutcomeCard({ orchestration, onGrantConsent }: OutcomeCardProps) {
  const actionType = orchestration.actionRequest?.actionType;
  const label = (actionType && ACTION_TYPE_LABEL[actionType]) ?? 'Intent';
  const status = orchestration.status ?? 'planned';
  const tone =
    status === 'completed' ? 'trust' : status === 'blocked' ? 'warning' : 'governance';
  const badgeVariant =
    status === 'completed' ? 'trust' : status === 'blocked' ? 'warning' : 'pending';
  const message = orchestration.localizedResponse?.text;
  const consentRequirement = orchestration.consentRequirement;
  const failedPolicies = orchestration.failedPolicies ?? [];
  const plan = orchestration.plan ?? [];
  const consentBlocked =
    status === 'blocked' && Boolean(consentRequirement?.scopes?.length);

  return (
    <Card
      tone={tone}
      title={label}
      actions={<Badge variant={badgeVariant}>{status}</Badge>}
    >
      {message && <p className="text-body">{message}</p>}

      {consentBlocked && consentRequirement?.scopes && (
        <div className="mt-3 rounded-sm border border-orange-100 bg-white p-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Bharat OS needs your consent for
          </p>
          <ul className="mt-1 list-disc pl-5 text-body text-text">
            {consentRequirement.scopes.map((scope) => (
              <li key={scope} className="font-mono text-caption">
                {scope}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-muted">
            Granting is a signed, revocable artifact stored under your identity.
            Revoke any time from the Trust tab.
          </p>
          {onGrantConsent && (
            <div className="mt-3">
              <Action size="sm" onClick={onGrantConsent}>
                Review + grant consent
              </Action>
            </div>
          )}
        </div>
      )}

      {failedPolicies.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Policy gate
          </p>
          <ul className="mt-1 list-disc pl-5 text-caption text-text-muted">
            {failedPolicies.map((p) => (
              <li key={p} className="font-mono">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption font-semibold uppercase tracking-wide text-text-muted">
            Plan ({plan.length} steps)
          </summary>
          <ol className="mt-2 space-y-1 text-caption">
            {plan.map((step, i) => (
              <li key={`${step.step}-${i}`} className="flex gap-2">
                <span className="font-mono text-text-muted">
                  {step.layer ? `${step.layer} ·` : ''}
                </span>
                <span className="font-mono text-text">{step.step}</span>
                {step.status && (
                  <span className="font-mono text-text-muted">— {step.status}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      <p className="mt-3 text-caption text-text-muted">
        Audit reference:{' '}
        <span className="font-mono">
          {orchestration.orchestrationId.replace(/^bos:orchestration:/, '')}
        </span>
      </p>
    </Card>
  );
}

function CitizenTrust() {
  const identity = useActiveIdentity();
  const { data: consents = [], isPending } = useConsents(identity?.id);
  const revoke = useRevokeConsent();
  const show = useToast((s) => s.show);

  function handleRevoke(consent: ConsentArtifact) {
    if (!identity) return;
    revoke.mutate(
      { identityId: identity.id, consentId: consent.consentId },
      {
        onSuccess: () => show('Consent revoked.', 'success'),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  const active = consents.filter((c) => (c.lifecycle?.active ?? c.status === 'active'));
  const inactive = consents.filter((c) => !(c.lifecycle?.active ?? c.status === 'active'));

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <h1 className="text-display font-semibold">Your data, your control</h1>
      <p className="text-body text-text-muted">
        Every consent grant is signed by you and lives in the audit ledger. Revoke
        any active grant here.
      </p>

      <Card title={`Active consents (${active.length})`} tone="trust">
        {isPending ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-body text-text-muted">
            No active consents. Granting one happens when you confirm an intent
            from Home.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((c) => (
              <li key={c.consentId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-semibold">{c.purpose}</p>
                    <p className="mt-1 text-caption text-text-muted">
                      Granted to <span className="font-mono">{c.granteeId}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-sm bg-trust-50 px-2 py-0.5 font-mono text-caption text-trust-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-caption text-text-muted">
                      Expires {new Date(c.expiresAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <Action
                    variant="destructive"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => handleRevoke(c)}
                  >
                    Revoke
                  </Action>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {inactive.length > 0 && (
        <Card title={`History (${inactive.length})`}>
          <ul className="divide-y divide-border">
            {inactive.map((c) => (
              <li key={c.consentId} className="py-2 first:pt-0 last:pb-0">
                <p className="text-body">{c.purpose}</p>
                <p className="text-caption text-text-muted">
                  {c.status === 'revoked'
                    ? `Revoked${c.revokedAt ? ` ${new Date(c.revokedAt).toLocaleString('en-IN')}` : ''}${
                        c.revokeReason ? ` — ${c.revokeReason}` : ''
                      }`
                    : `Expired ${new Date(c.expiresAt).toLocaleString('en-IN')}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

// Phase 12.1b.2 — Queue panel route. Reads the identity-scoped
// offline queue + offers per-row Retry / Discard actions. Linked
// from the OfflineQueuePill when items exist.
function CitizenQueueRoute() {
  const identity = useActiveIdentity();
  if (!identity) return null;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header>
        <h1 className="text-display font-semibold">My queue</h1>
        <p className="mt-1 text-body text-text-muted">
          Intents waiting to send. Stored on this phone only.
        </p>
      </header>
      <QueuedIntentsPanel identityId={identity.id} />
    </main>
  );
}

export function CitizenHome() {
  return (
    <>
      <Routes>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<CitizenIntent />} />
        <Route path="notes" element={<CitizenNotes />} />
        <Route path="trust" element={<CitizenTrust />} />
        <Route path="queue" element={<CitizenQueueRoute />} />
        <Route path="*" element={<CitizenIntent />} />
      </Routes>
      <Tabs items={TABS} />
    </>
  );
}
