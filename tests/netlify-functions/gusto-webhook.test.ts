import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import handler from "../../netlify/functions/gusto-webhook";
import { GUSTO_ACK } from "../../netlify/functions/_lib/gusto";

const ORIGINAL_SECRET = process.env.GUSTO_WEBHOOK_SECRET;

beforeEach(() => {
  delete process.env.GUSTO_WEBHOOK_SECRET;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.GUSTO_WEBHOOK_SECRET;
  else process.env.GUSTO_WEBHOOK_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = {} as any;

describe("gusto-webhook function", () => {
  it("acknowledges GET probes", async () => {
    const res = await handler(new Request("https://example.com/", { method: "GET" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(GUSTO_ACK);
  });

  it("acknowledges a JSON test event", async () => {
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_type: "test" }),
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(GUSTO_ACK);
  });

  it("acknowledges an unparseable JSON body without raising", async () => {
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(GUSTO_ACK);
  });

  it("parses urlencoded payload field", async () => {
    const body = new URLSearchParams({
      payload: JSON.stringify({ event_type: "employee.created", resource_uuid: "u-1" }),
    }).toString();
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(GUSTO_ACK);
  });

  it("verifies signature when secret is set", async () => {
    process.env.GUSTO_WEBHOOK_SECRET = "topsecret";
    const body = JSON.stringify({ event_type: "employee.updated" });
    const sig = createHmac("sha256", "topsecret").update(body).digest("hex");
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gusto-signature": sig,
        },
        body,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(GUSTO_ACK);
  });

  it("rejects non-POST/GET methods with 405 but still returns ack body", async () => {
    const res = await handler(new Request("https://example.com/", { method: "PUT" }), ctx);
    expect(res.status).toBe(405);
    expect(await res.text()).toBe(GUSTO_ACK);
  });
});
