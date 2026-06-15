import { type FC } from "react";
import { useVoiceInput } from "../lib/useVoiceInput";
import { appendDictation } from "../lib/voiceInput";

interface Props {
  // Current field value and its setter — dictation is appended, never replaces.
  value: string;
  onChange: (next: string) => void;
}

// "Typeless" — sales reps tap to speak instead of type into long-form fields.
// Browser-native (Web Speech API), no paid service, no auto-recording.
export const TypelessButton: FC<Props> = ({ value, onChange }) => {
  const { supported, listening, error, toggle } = useVoiceInput({
    onTranscript: (text) => onChange(appendDictation(value, text)),
  });

  if (!supported) {
    return (
      <div className="typeless">
        <button
          type="button"
          className="typeless-button"
          disabled
          title="Voice input is not supported in this browser"
          aria-label="Voice input is not supported in this browser"
        >
          <span className="typeless-dot" aria-hidden="true" />
          Typeless unavailable
        </button>
        <span className="typeless-hint">Voice input is not supported in this browser.</span>
      </div>
    );
  }

  return (
    <div className="typeless">
      <button
        type="button"
        className={`typeless-button${listening ? " is-listening" : ""}`}
        onClick={toggle}
        aria-pressed={listening}
      >
        <span className="typeless-dot" aria-hidden="true" />
        {listening ? "Listening… tap to stop" : "Typeless — start voice input"}
      </button>
      {listening && <span className="typeless-hint">Speak naturally — your words are added to the field.</span>}
      {error && <span className="typeless-hint typeless-error">{error}</span>}
    </div>
  );
};
