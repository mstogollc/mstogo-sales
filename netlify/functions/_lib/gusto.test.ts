import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  isTestEvent,
  parseGustoPayload,
  summarizeGustoEvent,
  verifyGustoSignature,
} from "./gusto";

describe("parseGustoPayload", () => {
  it("rejects empty body", () => {
    expect(parseGustoPayload("", "application/json").ok).toBe(false);
  });

  it("parses JSON body", () => {
    const r = parseGustoPayload(
      JSON.stringify({ event_type: "employee.created", resource_uuid: "u-1" }),
      "application/json",
    );
    expect(r.ok).toBe(true);
    expect(r.payload?.event_type).toBe("employee.created");
  });

  it("parses urlencoded payload field as JSON", () => {
    const body = new URLSearchParams({ payload: JSON.stringify({ event_type: "test" }) }).toString();
    const r = parseGustoPayload(body, "application/x-www-form-urlencoded");
    expect(r.ok).toBe(true);
    expect(r.payload?.event_type).toBe("test");
  });

  it("falls back to flat form fields when no JSON payload field", () => {
    const body = new URLSearchParams({ event_type: "ping", resource_uuid: "abc" }).toString();
    const r = parseGustoPayload(body, "application/x-www-form-urlencoded");
    expect(r.ok).toBe(true);
    expect(r.payload?.event_type).toBe("ping");
    expect(r.payload?.resource_uuid).toBe("abc");
  });

  it("flags invalid JSON", () => {
    const r = parseGustoPayload("not-json", "application/json");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_json");
  });
});

describe("summarizeGustoEvent", () => {
  it("returns event_type and verified flag", () => {
    const s = summarizeGustoEvent({ event_type: "employee.updated", resource_uuid: "z" }, true);
    expect(s.event_type).toBe("employee.updated");
    expect(s.resource_uuid).toBe("z");
    expect(s.verified).toBe(true);
  });

  it("uses 'unknown' when event_type missing", () => {
    expect(summarizeGustoEvent({}, null).event_type).toBe("unknown");
  });
});

describe("verifyGustoSignature", () => {
  it("returns true for matching HMAC sha256", () => {
    const secret = "s3cret";
    const body = '{"event_type":"test"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyGustoSignature(body, { secret, signature: sig })).toBe(true);
  });

  it("accepts sha256= prefix", () => {
    const secret = "s3cret";
    const body = "x";
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyGustoSignature(body, { secret, signature: sig })).toBe(true);
  });

  it("returns false when secret missing", () => {
    expect(verifyGustoSignature("x", { secret: undefined, signature: "abc" })).toBe(false);
  });

  it("returns false when signature missing", () => {
    expect(verifyGustoSignature("x", { secret: "s", signature: null })).toBe(false);
  });

  it("returns false on mismatch", () => {
    expect(verifyGustoSignature("x", { secret: "s", signature: "deadbeef" })).toBe(false);
  });
});

describe("isTestEvent", () => {
  it("detects common test event names", () => {
    expect(isTestEvent({ event_type: "test" })).toBe(true);
    expect(isTestEvent({ event_type: "Webhook.Test" })).toBe(true);
    expect(isTestEvent({ event_type: "verification" })).toBe(true);
  });

  it("returns false otherwise", () => {
    expect(isTestEvent({ event_type: "employee.created" })).toBe(false);
    expect(isTestEvent(undefined)).toBe(false);
  });
});
