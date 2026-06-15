import { afterEach, describe, expect, it } from "vitest";
import {
  appendDictation,
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  transcriptFromEvent,
  type SpeechRecognitionEventLike,
} from "./voiceInput";

function clearWindow() {
  delete (globalThis as { window?: unknown }).window;
}

afterEach(clearWindow);

describe("appendDictation", () => {
  it("returns the dictated text when the field is empty", () => {
    expect(appendDictation("", "call the owner back")).toBe("call the owner back");
  });

  it("appends with a single space, preserving existing content", () => {
    expect(appendDictation("Follow up Monday.", "they want a quote")).toBe(
      "Follow up Monday. they want a quote",
    );
  });

  it("does not double-space when the field already ends in whitespace", () => {
    expect(appendDictation("first line\n", "second thought")).toBe("first line second thought");
  });

  it("collapses internal whitespace in the dictation and ignores empty speech", () => {
    expect(appendDictation("notes", "  urgent   lead  ")).toBe("notes urgent lead");
    expect(appendDictation("notes", "   ")).toBe("notes");
  });
});

describe("transcriptFromEvent", () => {
  it("concatenates every result from the batch starting at resultIndex", () => {
    const event: SpeechRecognitionEventLike = {
      resultIndex: 0,
      results: {
        length: 2,
        0: { length: 1, isFinal: true, 0: { transcript: "hello " } },
        1: { length: 1, isFinal: true, 0: { transcript: "world" } },
      },
    };
    expect(transcriptFromEvent(event)).toBe("hello world");
  });
});

describe("support detection", () => {
  it("reports unsupported when there is no window or no SpeechRecognition", () => {
    clearWindow();
    expect(getSpeechRecognitionCtor()).toBeNull();
    expect(isSpeechRecognitionSupported()).toBe(false);

    (globalThis as { window?: unknown }).window = {};
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("detects the unprefixed and webkit-prefixed constructors", () => {
    class FakeRecognition {}
    (globalThis as { window?: unknown }).window = { SpeechRecognition: FakeRecognition };
    expect(isSpeechRecognitionSupported()).toBe(true);
    expect(getSpeechRecognitionCtor()).toBe(FakeRecognition);

    (globalThis as { window?: unknown }).window = { webkitSpeechRecognition: FakeRecognition };
    expect(isSpeechRecognitionSupported()).toBe(true);
    expect(getSpeechRecognitionCtor()).toBe(FakeRecognition);
  });
});
