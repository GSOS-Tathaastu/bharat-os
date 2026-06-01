import { useState } from 'react';
import { Action, Badge, Card, Evidence, Field, Sheet, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useCreateMemoryRecord,
  useMemoryRecords,
  useReadMemoryRecord,
  type MemorySensitivity,
  type MemorySummary
} from '@/lib/hooks';
import { useSlmPiiRedactor, type PiiScanSpan } from '@/lib/use-slm-pii-redactor';
import { PiiReviewSheet } from '@/components/PiiReviewSheet';
import { CooldownCountdown } from '@/components/CooldownCountdown';
import { scanWithRegex } from '@/lib/pii-detectors';

// Phase 12.0.2 — /app/citizen/notes — personal memory records.
//
// Citizens save short text notes that are encrypted with their
// vault key on the server. Plaintext reads go through the consent
// gate (memory.read + consent.record). The list view shows only
// metadata (label, sensitivity, createdAt); tapping a note opens
// the read flow that decrypts the body.
//
// §15: the substrate is pointer-not-payload everywhere — the list
// query returns `memorySummary` only; plaintext crosses the wire
// only inside the consent-gated `/read` response.

const SENSITIVITY_BADGE: Record<MemorySensitivity, { tone: 'trust' | 'pending' | 'warning' | 'error'; label: string }> = {
  public: { tone: 'trust', label: 'Public' },
  personal: { tone: 'pending', label: 'Personal' },
  sensitive: { tone: 'warning', label: 'Sensitive' }
};

export function CitizenNotes() {
  const identity = useActiveIdentity();
  const { data: notes = [], isPending } = useMemoryRecords(identity?.id);
  const create = useCreateMemoryRecord();
  const read = useReadMemoryRecord();
  const show = useToast((s) => s.show);

  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [sensitivity, setSensitivity] = useState<MemorySensitivity>('personal');

  const [openNote, setOpenNote] = useState<MemorySummary | null>(null);
  const [openPlaintext, setOpenPlaintext] = useState<string | null>(null);

  // Phase 13.1 — on-device PII redactor on the note body.
  const piiRedactor = useSlmPiiRedactor({ identityId: identity?.id });
  const [piiSheetOpen, setPiiSheetOpen] = useState(false);
  // Phase 13.2 adversarial fix MF-2 — auto-scan opt-in (see
  // CitizenHome.tsx for rationale).
  const [piiAutoscanEnabled, setPiiAutoscanEnabled] = useState(false);
  async function handleCheckPii() {
    setPiiAutoscanEnabled(true);
    const result = await piiRedactor.scan(text);
    if (result) setPiiSheetOpen(true);
  }
  function handlePiiApply(maskedText: string, appliedSpans: PiiScanSpan[]) {
    setText(maskedText);
    if (piiRedactor.lastResult) {
      piiRedactor.markApplied(appliedSpans, piiRedactor.lastResult);
    }
    setPiiAutoscanEnabled(true);
  }
  function handlePiiSheetClose() {
    piiRedactor.markAcknowledged();
    setPiiSheetOpen(false);
  }

  function handleCreate() {
    if (!identity || !text.trim()) {
      show('Write something to save.', 'error');
      return;
    }
    // Phase 13.2 — transparent PII pre-flight on Save.
    // MF-2: auto-scan is opt-in; first-time citizens skip the
    // pre-flight to avoid surprise modals.
    if (piiRedactor.hasPendingPiiAgainst(text)) {
      setPiiSheetOpen(true);
      return;
    }
    const alreadyAcked =
      piiRedactor.acknowledgedSinceScan &&
      piiRedactor.lastResult &&
      piiRedactor.lastResult.scannedText === text;
    if (piiAutoscanEnabled && !alreadyAcked) {
      const preflightSpans = scanWithRegex(text);
      if (preflightSpans.length > 0) {
        void piiRedactor.scan(text);
        setPiiSheetOpen(true);
        return;
      }
    }
    create.mutate(
      {
        identityId: identity.id,
        text: text.trim(),
        label: label.trim() || undefined,
        sensitivity
      },
      {
        onSuccess: () => {
          setText('');
          setLabel('');
          setSensitivity('personal');
          setCreateOpen(false);
          piiRedactor.reset();
          show('Note saved + encrypted on this profile.', 'success');
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function handleOpenNote(note: MemorySummary) {
    setOpenNote(note);
    setOpenPlaintext(null);
    if (!identity) return;
    read.mutate(
      { recordId: note.recordId, identityId: identity.id },
      {
        onSuccess: (res) => {
          // /api/memory-records/:id/read returns the decrypted body
          // as `plaintext` when the consent gate approves. When the
          // gate denies, approved=false + plaintext=null and the
          // shell shows the consent-needed state.
          if (res.approved && res.plaintext) {
            setOpenPlaintext(res.plaintext);
          } else if (res.approved) {
            setOpenPlaintext('(empty note)');
          } else {
            setOpenPlaintext(null);
          }
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  if (!identity) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
        <p className="text-body text-text-muted">Pick a persona first.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            Your notes
          </p>
          <h1 className="text-display font-semibold">Memory</h1>
          <p className="mt-1 text-body text-text-muted">
            Encrypted on this profile. Reads need your consent. Nothing leaves
            your device without you saying so.
          </p>
        </div>
        <Action onClick={() => setCreateOpen(true)}>+ New note</Action>
      </header>

      {isPending ? (
        <Card>
          <p className="text-body text-text-muted">Loading…</p>
        </Card>
      ) : notes.length === 0 ? (
        <Card tone="trust">
          <p className="text-body font-semibold">No notes yet.</p>
          <p className="mt-1 text-body text-text-muted">
            Tap + New note above to save your first thought. Notes are encrypted
            with your vault key; even Bharat OS operators cannot read them
            without your consent.
          </p>
          <Evidence title="What gets stored?">
            The plaintext is encrypted with your vault key on the server. Only
            metadata (label, sensitivity, created date) crosses the wire on the
            list query. To read a note, your client calls the read endpoint
            with a memory.read consent — every read is logged in your audit
            ledger.
          </Evidence>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const badge = SENSITIVITY_BADGE[(note.sensitivity ?? 'personal') as MemorySensitivity];
            return (
              <li key={note.recordId}>
                <button
                  type="button"
                  onClick={() => handleOpenNote(note)}
                  className="w-full rounded-md border-2 border-border bg-white p-3 text-left transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text truncate">
                        {note.label?.trim() || '(untitled note)'}
                      </p>
                      <p className="mt-1 text-caption text-text-muted">
                        {note.plaintextBytes ?? 0} bytes · saved{' '}
                        {new Date(note.createdAt).toLocaleString('en-IN')}
                      </p>
                      {note.tags && note.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {note.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-sm bg-surface-2 px-2 py-0.5 text-xs text-text-muted"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge variant={badge.tone}>{badge.label}</Badge>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create sheet */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New note">
        <div className="space-y-3">
          <Field
            label="Title (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What is this about?"
          />
          <div>
            <p className="mb-1 text-caption font-semibold text-text">Note</p>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write anything — health notes, addresses, ideas. Encrypted before storage."
              className="w-full resize-none rounded-sm border border-border bg-white px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <p className="mb-1 text-caption font-semibold text-text">Sensitivity</p>
            <div className="flex gap-2">
              {(['personal', 'sensitive', 'public'] as MemorySensitivity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSensitivity(s)}
                  className={
                    'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold capitalize transition-colors ' +
                    (sensitivity === s
                      ? 'border-primary bg-primary-50 text-primary'
                      : 'border-border bg-white text-text-muted hover:border-primary')
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1 text-caption text-text-muted">
              Sensitive notes require a stricter consent purpose to read. Public
              ones can be shared with third parties under your control.
            </p>
          </div>
          {/* Phase 13.1 — Check for PII chip on the note body. Regex
              floor works without SLM; SLM augments when installed. */}
          {text.trim().length > 2 && (
            <div className="flex flex-wrap items-center gap-2">
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
                    : piiRedactor.hasSlm
                      ? '🛡 Check for PII before saving'
                      : '🛡 Check for PII (patterns only)'}
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
          <div className="flex gap-2">
            <Action onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? 'Encrypting + saving…' : 'Save note'}
            </Action>
            <Action variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Action>
          </div>
        </div>
      </Sheet>
      {/* Phase 13.1 adversarial fix M4 — render PiiReviewSheet as a
          SIBLING of the create-note Sheet (not nested children).
          Nesting would have fired both Sheets' Escape listeners on
          a single press (citizen loses the typed note) AND the
          inner Sheet's unmount would re-enable body scroll while
          the outer was still open. */}
      {/* SF-3 — Notes flow saves locally, doesn't send. */}
      <PiiReviewSheet
        open={piiSheetOpen}
        onClose={handlePiiSheetClose}
        currentText={text}
        result={piiRedactor.lastResult}
        onApply={handlePiiApply}
        title="Check for PII before saving"
      />

      {/* Read sheet */}
      <Sheet
        open={openNote !== null}
        onClose={() => {
          setOpenNote(null);
          setOpenPlaintext(null);
        }}
        title={openNote?.label?.trim() || '(untitled note)'}
      >
        {openNote && (
          <div className="space-y-3">
            <p className="text-caption text-text-muted">
              Saved {new Date(openNote.createdAt).toLocaleString('en-IN')} ·{' '}
              {SENSITIVITY_BADGE[(openNote.sensitivity ?? 'personal') as MemorySensitivity].label}
            </p>
            {read.isPending ? (
              <Card>
                <p className="text-body text-text-muted">Decrypting + checking consent…</p>
              </Card>
            ) : openPlaintext !== null ? (
              <Card tone="trust">
                <p className="whitespace-pre-wrap text-body">{openPlaintext}</p>
              </Card>
            ) : (
              <Card tone="warning">
                <p className="text-body">
                  Could not read this note. Check Trust → Permissions to see
                  whether your memory.read consent is active.
                </p>
              </Card>
            )}
            <Action
              variant="ghost"
              onClick={() => {
                setOpenNote(null);
                setOpenPlaintext(null);
              }}
            >
              Close
            </Action>
          </div>
        )}
      </Sheet>
    </main>
  );
}
