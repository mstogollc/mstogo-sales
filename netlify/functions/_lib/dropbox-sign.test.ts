import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  DROPBOX_SIGN_ACK,
  extractJsonField,
  parseDropboxSignPayload,
  summarizeEvent,
  verifyEventHash,
} from "./dropbox-sign";

describe("DROPBOX_SIGN_ACK", () => {
  it("is the exact string Dropbox Sign expects", () => {
    expect(DROPBOX_SIGN_ACK).toBe("Hello API Event Received");
  });
});

describe("extractJsonField()", () => {
  it("returns the body unchanged for application/json", () => {
    const body = '{"event":{"event_type":"callback_test"}}';
    expect(extractJsonField(body, "application/json")).toBe(body);
  });

  it("extracts the `json` field from urlencoded bodies", () => {
    const json = '{"event":{"event_type":"callback_test"}}';
    const body = `json=${encodeURIComponent(json)}`;
    expect(extractJsonField(body, "application/x-www-form-urlencoded")).toBe(json);
  });

  it("extracts the `json` part from multipart/form-data", () => {
    const boundary = "----WebKitFormBoundary123";
    const json = '{"event":{"event_type":"callback_test"}}';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="json"\r\n\r\n` +
      `${json}\r\n` +
      `--${boundary}--\r\n`;
    const ct = `multipart/form-data; boundary=${boundary}`;
    expect(extractJsonField(body, ct)).toBe(json);
  });
});

describe("parseDropboxSignPayload()", () => {
  it("rejects empty bodies", () => {
    expect(parseDropboxSignPayload("", "application/json")).toEqual({
      ok: false,
      reason: "empty_body",
    });
  });

  it("rejects invalid JSON", () => {
    const result = parseDropboxSignPayload("not-json", "application/json");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_json");
  });

  it("parses a valid callback_test payload (json)", () => {
    const payload = { event: { event_type: "callback_test", event_time: "1700000000" } };
    const result = parseDropboxSignPayload(JSON.stringify(payload), "application/json");
    expect(result.ok).toBe(true);
    expect(result.payload?.event?.event_type).toBe("callback_test");
  });

  it("parses a multipart form-encoded callback payload", () => {
    const boundary = "boundary42";
    const payload = {
      event: { event_type: "signature_request_signed", event_time: "1700000001" },
      signature_request: { signature_request_id: "sr_abc123" },
    };
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="json"\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--\r\n`;
    const result = parseDropboxSignPayload(body, `multipart/form-data; boundary=${boundary}`);
    expect(result.ok).toBe(true);
    expect(result.payload?.signature_request).toEqual({ signature_request_id: "sr_abc123" });
  });
});

describe("verifyEventHash()", () => {
  it("returns false when no API key is provided", () => {
    expect(
      verifyEventHash({ event_type: "x", event_time: "1", event_hash: "abc" }, { apiKey: "" }),
    ).toBe(false);
  });

  it("verifies a correctly signed event", () => {
    const apiKey = "test-api-key";
    const event_time = "1700000000";
    const event_type = "signature_request_signed";
    const event_hash = createHmac("sha256", apiKey)
      .update(`${event_time}${event_type}`)
      .digest("hex");
    expect(verifyEventHash({ event_type, event_time, event_hash }, { apiKey })).toBe(true);
  });

  it("rejects a tampered event", () => {
    const apiKey = "test-api-key";
    expect(
      verifyEventHash(
        { event_type: "x", event_time: "1", event_hash: "deadbeef" },
        { apiKey },
      ),
    ).toBe(false);
  });
});

describe("summarizeEvent()", () => {
  it("pulls identifying ids from the payload", () => {
    const summary = summarizeEvent(
      {
        event: { event_type: "signature_request_signed", event_time: "1700000000" },
        signature_request: { signature_request_id: "sr_123" },
        account: { account_id: "acc_456" },
      },
      true,
    );
    expect(summary.event_type).toBe("signature_request_signed");
    expect(summary.signature_request_id).toBe("sr_123");
    expect(summary.account_id).toBe("acc_456");
    expect(summary.verified).toBe(true);
  });

  it("falls back to unknown when event_type is missing", () => {
    const summary = summarizeEvent({}, null);
    expect(summary.event_type).toBe("unknown");
    expect(summary.verified).toBeNull();
  });
});
