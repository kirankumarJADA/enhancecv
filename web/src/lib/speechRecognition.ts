// Curevo AI — Voice & Speech Recognition Abstraction (Phase 9J)
//
// 100% Client-Side & Privacy-First.
// Audio is processed locally in the user's browser via the Web Speech API.
// No voice or audio data is ever transmitted or stored on remote servers.

export interface SpeechRecognitionResultPayload {
  interimTranscript: string;
  finalTranscript: string;
}

export type VoiceState = 'idle' | 'listening' | 'error' | 'unsupported';

export interface VoiceTranscriberOptions {
  onTranscript: (payload: SpeechRecognitionResultPayload) => void;
  onStateChange?: (state: VoiceState) => void;
  onError?: (errorMessage: string) => void;
  language?: string;
}

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

export class VoiceTranscriber {
  private recognition: any = null;
  private state: VoiceState = 'idle';
  private options: VoiceTranscriberOptions;
  private currentFinal = '';

  constructor(options: VoiceTranscriberOptions) {
    this.options = options;
  }

  getState(): VoiceState {
    return this.state;
  }

  isListening(): boolean {
    return this.state === 'listening';
  }

  start(initialText = ''): boolean {
    if (!isSpeechRecognitionSupported()) {
      this.state = 'unsupported';
      this.options.onStateChange?.('unsupported');
      this.options.onError?.('Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
      return false;
    }

    if (this.state === 'listening') {
      return true;
    }

    try {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.options.language || 'en-US';

      this.currentFinal = initialText;

      this.recognition.onstart = () => {
        this.state = 'listening';
        this.options.onStateChange?.('listening');
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.currentFinal += (this.currentFinal ? ' ' : '') + transcriptChunk.trim();
          } else {
            interim += transcriptChunk;
          }
        }

        this.options.onTranscript({
          interimTranscript: interim.trim(),
          finalTranscript: this.currentFinal.trim(),
        });
      };

      this.recognition.onerror = (event: any) => {
        let message = 'An error occurred during speech recognition.';
        if (event.error === 'not-allowed') {
          message = 'Microphone permission denied. Please allow microphone access in your browser settings.';
        } else if (event.error === 'no-speech') {
          message = 'No speech detected. Please try speaking into your microphone.';
        } else if (event.error === 'network') {
          message = 'Network error during voice transcription.';
        }
        this.state = 'error';
        this.options.onStateChange?.('error');
        this.options.onError?.(message);
      };

      this.recognition.onend = () => {
        if (this.state === 'listening') {
          this.state = 'idle';
          this.options.onStateChange?.('idle');
        }
      };

      this.recognition.start();
      return true;
    } catch (err: any) {
      this.state = 'error';
      this.options.onStateChange?.('error');
      this.options.onError?.(err?.message || 'Failed to start speech recognition.');
      return false;
    }
  }

  stop(): void {
    if (this.recognition && this.state === 'listening') {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }
    this.state = 'idle';
    this.options.onStateChange?.('idle');
  }

  abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Safe ignore
      }
    }
    this.state = 'idle';
    this.options.onStateChange?.('idle');
  }
}

// ---------------------------------------------------------------------------
// SpeechSynthesis (Read Aloud) Helpers
// ---------------------------------------------------------------------------

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function getActiveUtterance(): SpeechSynthesisUtterance | null {
  return activeUtterance;
}

export function speakQuestion(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: string) => void
): boolean {
  if (!isSpeechSynthesisSupported()) {
    onError?.('Text-to-speech is not supported in this browser.');
    return false;
  }

  stopSpeaking();

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      activeUtterance = utterance;
      onStart?.();
    };

    utterance.onend = () => {
      activeUtterance = null;
      onEnd?.();
    };

    utterance.onerror = (e) => {
      activeUtterance = null;
      onError?.(e.error || 'Failed to read aloud.');
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err: any) {
    onError?.(err?.message || 'Speech synthesis failed.');
    return false;
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Safe ignore
    }
  }
  activeUtterance = null;
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking;
}
