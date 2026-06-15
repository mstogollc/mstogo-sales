import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  transcriptFromEvent,
  type SpeechRecognitionInstance,
} from "./voiceInput";

interface UseVoiceInputOptions {
  // Called with each chunk of recognized speech. Callers append it to the
  // active field themselves so existing text is never wiped.
  onTranscript: (text: string) => void;
  lang?: string;
}

interface UseVoiceInput {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

// Reusable browser-native speech-to-text. No auto-recording — the rep must call
// start()/toggle() explicitly, and listening stays true until they stop or the
// browser ends the session.
export function useVoiceInput({ onTranscript, lang = "en-US" }: UseVoiceInputOptions): UseVoiceInput {
  const [supported] = useState(isSpeechRecognitionSupported);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!supported || recognitionRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = transcriptFromEvent(event);
      if (text.trim()) onTranscriptRef.current(text);
    };
    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow mic access to use Typeless."
          : "Voice input stopped. Please try again.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [supported, lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Stop any active session if the field unmounts mid-dictation.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, error, start, stop, toggle };
}
