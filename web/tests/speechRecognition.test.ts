import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  VoiceTranscriber,
  speakQuestion,
  stopSpeaking,
} from '../src/lib/speechRecognition';

describe('Curevo AI — Voice & Speech Recognition (Phase 9J)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition;
    delete (globalThis as any).webkitSpeechRecognition;
    delete (globalThis as any).speechSynthesis;
    delete (globalThis as any).SpeechSynthesisUtterance;
    delete (globalThis as any).window;
  });

  it('detects lack of speech recognition support when window APIs are missing', () => {
    delete (globalThis as any).SpeechRecognition;
    delete (globalThis as any).webkitSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it('detects speech recognition support when webkitSpeechRecognition is available', () => {
    (globalThis as any).webkitSpeechRecognition = class MockRecognition {};
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('handles speech recognition transcription flow with mock SpeechRecognition', () => {
    let started = false;
    let stopped = false;

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        started = true;
        this.onstart?.();
      }
      stop() {
        stopped = true;
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }

    (globalThis as any).SpeechRecognition = MockSpeechRecognition;

    let transcriptResult = '';
    let stateResult = '';

    const transcriber = new VoiceTranscriber({
      onTranscript: ({ finalTranscript }) => {
        transcriptResult = finalTranscript;
      },
      onStateChange: (state) => {
        stateResult = state;
      },
    });

    const success = transcriber.start('Initial text');
    expect(success).toBe(true);
    expect(started).toBe(true);
    expect(stateResult).toBe('listening');
    expect(transcriber.isListening()).toBe(true);

    const recognitionInstance = (transcriber as any).recognition;

    // Simulate interim result
    const interimEvent = {
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: ' and delivered ahead of schedule.' }], { isFinal: false }),
      ],
    };
    recognitionInstance.onresult(interimEvent);

    // Simulate final result
    const finalEvent = {
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: ' and delivered ahead of schedule.' }], { isFinal: true }),
      ],
    };
    recognitionInstance.onresult(finalEvent);

    expect(transcriptResult).toBe('Initial text and delivered ahead of schedule.');

    transcriber.stop();
    expect(stopped).toBe(true);
    expect(stateResult).toBe('idle');
  });

  it('reports text-to-speech support and controls playback', () => {
    let spokenUtterance: any = null;
    let cancelCalled = false;

    (globalThis as any).SpeechSynthesisUtterance = class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    (globalThis as any).speechSynthesis = {
      speaking: false,
      speak: vi.fn((utt) => {
        spokenUtterance = utt;
      }),
      cancel: vi.fn(() => {
        cancelCalled = true;
      }),
    };

    expect(isSpeechSynthesisSupported()).toBe(true);

    let started = false;
    let ended = false;
    const ok = speakQuestion(
      'Tell me about a time you resolved a major cloud outage.',
      () => { started = true; },
      () => { ended = true; }
    );

    expect(ok).toBe(true);
    expect(spokenUtterance.text).toBe('Tell me about a time you resolved a major cloud outage.');

    // Trigger start
    spokenUtterance.onstart();
    expect(started).toBe(true);

    // Stop speaking
    stopSpeaking();
    expect(cancelCalled).toBe(true);
  });
});
