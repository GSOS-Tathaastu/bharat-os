// Phase 12.0.4 — voice intent input using the browser's Web Speech API.
//
// §15: speech recognition happens on the device (Chrome / Edge use the
// platform engine; Safari uses Apple Speech). Bharat OS never sends
// the audio to a server — we receive only the recognised text via the
// browser API. Phase 12.1b SLM-A will replace this with a true
// on-device vernacular model that handles 22+ Indic languages
// natively; v1 uses whatever the browser provides (typically en-IN +
// Hindi for Chrome).

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
export interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceIntentSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export interface VoiceIntentCallbacks {
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  /** Defaults to 'en-IN' (Indian English). For Hindi pass 'hi-IN'. */
  lang?: string;
}

export class VoiceIntentSession {
  private recognition: SpeechRecognition | null = null;

  constructor(private callbacks: VoiceIntentCallbacks) {}

  start(): boolean {
    const SR = getSpeechRecognition();
    if (!SR) {
      this.callbacks.onError?.('Voice input is not supported in this browser.');
      return false;
    }
    const recognition = new SR();
    recognition.lang = this.callbacks.lang ?? 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (interim) this.callbacks.onInterim?.(interim);
      if (final) this.callbacks.onFinal?.(final);
    };
    recognition.onerror = (event) => {
      this.callbacks.onError?.(event.error || event.message || 'Voice input failed.');
    };
    recognition.onend = () => {
      this.callbacks.onEnd?.();
      this.recognition = null;
    };
    try {
      recognition.start();
      this.recognition = recognition;
      return true;
    } catch (err) {
      this.callbacks.onError?.((err as Error).message);
      return false;
    }
  }

  stop() {
    this.recognition?.stop();
  }

  abort() {
    this.recognition?.abort();
    this.recognition = null;
  }
}
