import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sendEmail } from "./resend";

const ORIGINAL = process.env.RESEND_API_KEY;
const ORIGINAL_FROM = process.env.MS2GO_FROM_EMAIL;
const ORIGINAL_REPLY = process.env.MS2GO_REPLY_TO;

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.MS2GO_FROM_EMAIL;
  delete process.env.MS2GO_REPLY_TO;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL;
  if (ORIGINAL_FROM === undefined) delete process.env.MS2GO_FROM_EMAIL;
  else process.env.MS2GO_FROM_EMAIL = ORIGINAL_FROM;
  if (ORIGINAL_REPLY === undefined) delete process.env.MS2GO_REPLY_TO;
  else process.env.MS2GO_REPLY_TO = ORIGINAL_REPLY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("sendEmail()", () => {
  it("queues locally when RESEND_API_KEY is missing", async () => {
    const result = await sendEmail(
      { to: "x@y.com", subject: "hi", text: "body" },
      (async () => jsonResponse({})) as typeof fetch,
    );
    expect(result.status).toBe("queued_local");
  });

  it("sends when configured and uses MS2GO_FROM_EMAIL when present", async () => {
    process.env.RESEND_API_KEY = "re-test";
    process.env.MS2GO_FROM_EMAIL = "sales@ms2go.com";
    process.env.MS2GO_REPLY_TO = "joe@mstogo.com";
    let capturedBody = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return jsonResponse({ id: "email_123" });
    }) as unknown as typeof fetch;
    const result = await sendEmail(
      { to: ["lead@example.com"], subject: "hi", text: "body" },
      fakeFetch,
    );
    expect(result.status).toBe("sent");
    if (result.status === "sent") expect(result.id).toBe("email_123");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.from).toBe("sales@ms2go.com");
    expect(parsed.reply_to).toBe("joe@mstogo.com");
    expect(parsed.to).toEqual(["lead@example.com"]);
  });

  it("surfaces errors as error result", async () => {
    process.env.RESEND_API_KEY = "re-test";
    const fakeFetch = (async () => jsonResponse({ message: "domain not verified" }, 403)) as unknown as typeof fetch;
    const result = await sendEmail({ to: "x@y.com", subject: "hi", text: "body" }, fakeFetch);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("domain");
  });
});
