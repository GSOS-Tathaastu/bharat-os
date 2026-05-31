import { useState } from 'react';
import { Action, Card, Field } from '@/components/ui';
import type { LabelingTaskProps } from './types';

interface TranscriptionBody {
  audioUrl?: string;
  languageHint?: string;
  asrPreFill?: string;
  instruction?: string;
}

// Phase 10.3 — Transcription v1: audio player (browser-native <audio>) +
// editable textarea pre-filled with the sponsor-provided ASR hint.
// Indic ASR via /shell/ Phase 2a.5 isn't wired here; sponsor must
// pre-supply an ASR draft (or empty string) in body.asrPreFill.
// When audioUrl is missing or fails to load, the textarea still
// works — worker can transcribe from memory or skip.
export function TranscriptionTask({ item, submitting, onSubmit }: LabelingTaskProps) {
  const body = item.body as TranscriptionBody;
  const [transcript, setTranscript] = useState(body?.asrPreFill ?? '');
  const [audioError, setAudioError] = useState(false);

  return (
    <>
      <Card>
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Instruction
        </p>
        <p className="mt-1 text-body">
          {body.instruction ??
            `Listen to the clip and transcribe what you hear in ${body.languageHint ?? 'the source language'}.`}
        </p>
      </Card>
      <Card>
        {body.audioUrl ? (
          audioError ? (
            <p className="text-body text-error">
              Could not load the audio. Transcribe what you can — Skip if you need
              to.
            </p>
          ) : (
            <audio
              controls
              preload="metadata"
              src={body.audioUrl}
              onError={() => setAudioError(true)}
              className="w-full"
            />
          )
        ) : (
          <p className="text-body text-text-muted">
            No audio attached. (Sponsor seed-demo item — type any transcript to
            demonstrate the flow.)
          </p>
        )}
      </Card>
      <Card>
        <Field
          label="Transcript"
          helper={
            body.asrPreFill
              ? 'ASR pre-fill provided by sponsor; edit as needed.'
              : 'Type what you hear.'
          }
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="What did you hear?"
        />
        <div className="mt-4 flex gap-2">
          <Action
            variant="trust"
            disabled={submitting || transcript.trim().length === 0}
            onClick={() => onSubmit({ transcript: transcript.trim() })}
          >
            Submit transcript
          </Action>
          <Action
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={() => onSubmit({ transcript: 'skip' })}
          >
            Skip this item
          </Action>
        </div>
      </Card>
    </>
  );
}
