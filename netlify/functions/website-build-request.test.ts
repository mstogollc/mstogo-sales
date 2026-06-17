import { describe, it, expect, beforeEach } from "vitest";
import handler from "./website-build-request";

const ctx = {} as never;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function post(body: unknown): Request {
  return new Request("https://portal.mstogo.com/api/website-build-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("website-build-request handler", () => {
  beforeEach(() => {
    // No Supabase env in tests => currentUser() resolves to null (anonymous).
    // The request is still validated and a usage event is attempted (best-effort).
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("rejects unsupported methods with 405", async () => {
    const res = await handler(new Request("https://x/api/website-build-request", { method: "DELETE" }), ctx);
    expect(res.status).toBe(405);
  });

  it("rejects an invalid JSON body", async () => {
    const req = new Request("https://x/api/website-build-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("invalid_json_body");
  });

  it("requires a business name", async () => {
    const res = await handler(post({ city: "Gulfport" }), ctx);
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("missing_business_name");
  });

  it("accepts a valid request and reports the requested status (anonymous, unpersisted)", async () => {
    const res = await handler(post({ businessName: "Joe's Pizza", city: "Gulfport", state: "MS" }), ctx);
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.status).toBe("requested");
    expect(data.persisted).toBe(false);
    expect(data.request).toBeNull();
  });

  it("preserves the no-website choice on a valid request", async () => {
    const res = await handler(
      post({ businessName: "New Salon", noWebsite: true, currentWebsite: "ignored.example.com" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await body(res)).status).toBe("requested");
  });
});
