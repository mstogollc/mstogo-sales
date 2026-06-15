// Browser-native voice input ("Typeless") helpers built on the Web Speech API.
// SpeechRecognition is unprefixed in some browsers and webkit-prefixed in others
// (Chrome, Edge, Safari). Firefox does not support it at all.

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// Append newly dictated text to whatever the rep already typed, without wiping
// existing content. Adds a single space between the prior text and the new
// speech so words never run together, and trims redundant whitespace.
export function appendDictation(existing: string, dictated: string): string {
  const addition = dictated.trim().replace(/\s+/g, " ");
  if (!addition) return existing;
  const base = existing.replace(/\s+$/, "");
  if (!base) return addition;
  return `${base} ${addition}`;
}

// Pull the best (final or latest) transcript out of a recognition event,
// concatenating every result delivered in this batch.
export function transcriptFromEvent(event: SpeechRecognitionEventLike): string {
  let out = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (result && result.length > 0) {
      out += result[0].transcript;
    }
  }
  return out;
}
