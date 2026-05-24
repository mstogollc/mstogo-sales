import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import createLinkHandler from "../../netlify/functions/plaid-create-link-token";
import exchangeHandler from "../../netlify/functions/plaid-exchange-token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = {} as any;

const ORIGINAL = {
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
  PLAID_SECRET: process.env.PLAID_SECRET,
  PLAID_ENV: process.env.PLAID_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL) as Array<[string, string | undefined]>) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  process.env.PLAID_CLIENT_ID = "cid_test";
  process.env.PLAID_SECRET = "sec_test";
  process.env.PLAID_ENV = "sandbox";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("plaid-create-link-token function", () => {
  it("returns 405 for non-POST", async () => {
    const res = await createLinkHandler(new Request("https://x/", { method: "GET" }), ctx);
    expect(res.status).toBe(405);
  });

  it("requires an authenticated user (or client_user_id)", async () => {
    const res = await createLinkHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.error).toBe("authentication_required");
  });

  it("calls Plaid /link/token/create and returns link_token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse(200, {
          link_token: "link-sandbox-xyz",
          expiration: "2026-12-31T00:00:00Z",
        }),
      );
    const res = await createLinkHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_user_id: "rep_42" }),
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.link_token).toBe("link-sandbox-xyz");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.plaid.com/link/token/create");
    const sent = JSON.parse(init.body as string);
    expect(sent.products).toEqual(["auth", "identity"]);
    expect(sent.country_codes).toEqual(["US"]);
    expect(sent.language).toBe("en");
    expect(sent.user.client_user_id).toBe("rep_42");
  });

  it("returns 500 with plaid_not_configured when credentials missing", async () => {
    delete process.env.PLAID_CLIENT_ID;
    const res = await createLinkHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_user_id: "rep_42" }),
      }),
      ctx,
    );
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error).toBe("plaid_not_configured");
  });

  it("surfaces Plaid API errors as plaid_link_token_failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        error_message: "bad",
        error_code: "INVALID_API_KEYS",
        error_type: "INVALID_INPUT",
      }),
    );
    const res = await createLinkHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_user_id: "u" }),
      }),
      ctx,
    );
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error).toBe("plaid_link_token_failed");
    expect(body.error_code).toBe("INVALID_API_KEYS");
  });
});

describe("plaid-exchange-token function", () => {
  it("rejects non-POST", async () => {
    const res = await exchangeHandler(new Request("https://x/", { method: "GET" }), ctx);
    expect(res.status).toBe(405);
  });

  it("rejects when public_token missing", async () => {
    const res = await exchangeHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("missing_public_token");
  });

  it("exchanges, fetches auth+identity, and returns a safe summary (no access_token, no raw routing)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/item/public_token/exchange")) {
        return jsonResponse(200, { access_token: "access-sandbox-SECRET", item_id: "item_1" });
      }
      if (url.endsWith("/auth/get")) {
        return jsonResponse(200, {
          accounts: [
            {
              account_id: "a1",
              name: "Plaid Checking",
              mask: "0000",
              type: "depository",
              subtype: "checking",
            },
          ],
          numbers: {
            ach: [{ account_id: "a1", account: "1111222233330000", routing: "011401533" }],
          },
          item: { institution_id: "ins_109508" },
        });
      }
      if (url.endsWith("/identity/get")) {
        return jsonResponse(200, {
          accounts: [{ account_id: "a1", owners: [{ names: ["Alberta Bobbeth Charleson"] }] }],
          item: { institution_id: "ins_109508" },
        });
      }
      if (url.endsWith("/institutions/get_by_id")) {
        return jsonResponse(200, {
          institution: { institution_id: "ins_109508", name: "Plaid Test Bank" },
        });
      }
      return jsonResponse(404, { error_message: "unknown" });
    });

    const res = await exchangeHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public_token: "public-sandbox-abc" }),
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("access-sandbox-SECRET");
    expect(text).not.toContain("1111222233330000");
    expect(text).not.toContain("011401533");

    const body = JSON.parse(text);
    expect(body.persisted).toBe(false);
    expect(body.summary.item_id).toBe("item_1");
    expect(body.summary.institution_name).toBe("Plaid Test Bank");
    expect(body.summary.accounts[0].mask).toBe("0000");
    expect(body.summary.accounts[0].has_ach).toBe(true);

    // /institutions/get_by_id and /identity/get were both attempted
    const urls = fetchMock.mock.calls.map(([u]) => (typeof u === "string" ? u : (u as Request).url));
    expect(urls.some((u) => u.endsWith("/auth/get"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/identity/get"))).toBe(true);
  });

  it("continues even if identity/get fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/item/public_token/exchange")) {
        return jsonResponse(200, { access_token: "a", item_id: "item_1" });
      }
      if (url.endsWith("/auth/get")) {
        return jsonResponse(200, {
          accounts: [{ account_id: "a1", mask: "1234", type: "depository", subtype: "checking" }],
          numbers: { ach: [{ account_id: "a1", account: "x", routing: "y" }] },
          item: { institution_id: "ins_1" },
        });
      }
      if (url.endsWith("/identity/get")) {
        return jsonResponse(400, {
          error_message: "no identity",
          error_code: "PRODUCT_NOT_READY",
          error_type: "ITEM_ERROR",
        });
      }
      return jsonResponse(404, { error_message: "unknown" });
    });

    const res = await exchangeHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public_token: "p" }),
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const summary = body.summary as { owner_match: string };
    expect(summary.owner_match).toBe("unknown");
  });

  it("returns plaid_exchange_failed on exchange API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, {
        error_message: "bad token",
        error_code: "INVALID_PUBLIC_TOKEN",
        error_type: "INVALID_INPUT",
      }),
    );
    const res = await exchangeHandler(
      new Request("https://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public_token: "bad" }),
      }),
      ctx,
    );
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error).toBe("plaid_exchange_failed");
    expect(body.error_code).toBe("INVALID_PUBLIC_TOKEN");
  });
});
