import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import handler from "../../netlify/functions/dropbox-sign-callback";
import { DROPBOX_SIGN_ACK } from "../../netlify/functions/_lib/dropbox-sign";

const ORIGINAL_KEY = process.env.DROPBOX_SIGN_API_KEY;

beforeEach(() => {
  delete process.env.DROPBOX_SIGN_API_KEY;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DROPBOX_SIGN_API_KEY;
  else process.env.DROPBOX_SIGN_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = {} as any;

describe("dropbox-sign-callback function", () => {
  it("acknowledges a GET probe with the Dropbox Sign sentinel", async () => {
    const res = await handler(new Request("https://example.com/", { method: "GET" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DROPBOX_SIGN_ACK);
  });

  it("acknowledges a multipart callback_test event", async () => {
    const boundary = "abc123";
    const payload = { event: { event_type: "callback_test", event_time: "1700000000" } };
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="json"\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--\r\n`;
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        body,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DROPBOX_SIGN_ACK);
  });

  it("still acknowledges an unparseable body so Dropbox Sign won't retry forever", async () => {
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DROPBOX_SIGN_ACK);
  });

  it("handles an unknown event type without raising", async () => {
    const payload = { event: { event_type: "made_up_event_type", event_time: "1700000123" } };
    const res = await handler(
      new Request("https://example.com/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DROPBOX_SIGN_ACK);
  });

  it("rejects non-POST/GET methods with 405 but still returns the ack string", async () => {
    const res = await handler(
      new Request("https://example.com/", { method: "PUT" }),
      ctx,
    );
    expect(res.status).toBe(405);
    expect(await res.text()).toBe(DROPBOX_SIGN_ACK);
  });
});
