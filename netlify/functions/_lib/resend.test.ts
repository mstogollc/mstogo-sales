import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sendEmail, proposalEmailHtml } from "./resend";

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
    process.env.MS2GO_FROM_EMAIL = "sales@mstogo.com";
    process.env.MS2GO_REPLY_TO = "joe@mstogo.com";
    let capturedBody = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return jsonResponse({ id: "email_123" });
    }) as unknown as typeof fetch;
    const result = await sendEmail(
      { to: ["lead@example.com"], subject: "hi", text: "body", html: "<p>body</p>" },
      fakeFetch,
    );
    expect(result.status).toBe("sent");
    if (result.status === "sent") expect(result.id).toBe("email_123");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.from).toBe("sales@mstogo.com");
    expect(parsed.reply_to).toBe("joe@mstogo.com");
    expect(parsed.to).toEqual(["lead@example.com"]);
    expect(parsed.html).toBe("<p>body</p>");
  });

  it("defaults the from-address to the verified mstogo.com sending domain", async () => {
    process.env.RESEND_API_KEY = "re-test";
    // No MS2GO_FROM_EMAIL override — must fall back to the branded default,
    // which has to be on the real verified domain (mstogo.com) or Resend
    // rejects the send and nothing actually mails.
    let capturedBody = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return jsonResponse({ id: "email_456" });
    }) as unknown as typeof fetch;
    const result = await sendEmail({ to: "lead@example.com", subject: "hi", text: "body" }, fakeFetch);
    expect(result.status).toBe("sent");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.from).toMatch(/@mstogo\.com$/);
  });

  it("surfaces errors as error result", async () => {
    process.env.RESEND_API_KEY = "re-test";
    const fakeFetch = (async () => jsonResponse({ message: "domain not verified" }, 403)) as unknown as typeof fetch;
    const result = await sendEmail({ to: "x@y.com", subject: "hi", text: "body" }, fakeFetch);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toContain("domain");
  });
});

describe("proposalEmailHtml()", () => {
  const proposal = "Your MS2GO Growth Proposal\n\nDay one: $3,250 to start.";

  it("wraps the proposal in branded HTML and preserves the copy verbatim", () => {
    const html = proposalEmailHtml({ proposalText: proposal, businessName: "Joe's Pizza" });
    expect(html).toContain("MS2GO");
    expect(html).toContain("Growth Proposal");
    expect(html).toContain("Joe's Pizza"); // business name appears in the intro
    // Proposal pricing/structure is carried through untouched.
    expect(html).toContain("$3,250 to start.");
    // Newlines become <br /> so the layout survives in HTML clients.
    expect(html).toContain("<br />");
    // Signed by the primary rep so it reads as a real person, not a system.
    expect(html).toContain("Joe Pearce");
  });

  it("greets the contact by name when provided, otherwise uses a neutral hello", () => {
    expect(proposalEmailHtml({ proposalText: proposal, contactName: "Maria" })).toContain("Hi Maria,");
    expect(proposalEmailHtml({ proposalText: proposal })).toContain("Hello,");
  });

  it("escapes HTML in the proposal and prospect fields to prevent injection", () => {
    const html = proposalEmailHtml({
      proposalText: "Price <b>jump</b> & save",
      businessName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Price &lt;b&gt;jump&lt;/b&gt; &amp; save");
  });
});
