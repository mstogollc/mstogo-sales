import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildVerificationSummary,
  compareOwnerName,
  createLinkToken,
  exchangePublicToken,
  getAuth,
  getIdentity,
  plaidBaseUrl,
  PlaidApiError,
  resolvePlaidEnv,
  type AuthResponse,
  type IdentityResponse,
} from "./plaid";

const CREDS = { clientId: "cid_test", secret: "sec_test", env: "sandbox" as const };

const ORIGINAL = {
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
  PLAID_SECRET: process.env.PLAID_SECRET,
  PLAID_ENV: process.env.PLAID_ENV,
};

beforeEach(() => {
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PLAID_ENV;
});

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL) as Array<[keyof typeof ORIGINAL, string | undefined]>) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function mockFetchOnce(response: { status?: number; body: unknown }): typeof fetch {
  return (async () => {
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function captureFetch(response: { status?: number; body: unknown }): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = (async (input: unknown, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("resolvePlaidEnv()", () => {
  it("returns sandbox by default", () => {
    expect(resolvePlaidEnv(undefined)).toBe("sandbox");
    expect(resolvePlaidEnv("")).toBe("sandbox");
    expect(resolvePlaidEnv("garbage")).toBe("sandbox");
  });
  it("recognizes valid environments case-insensitively", () => {
    expect(resolvePlaidEnv("Production")).toBe("production");
    expect(resolvePlaidEnv("DEVELOPMENT")).toBe("development");
    expect(resolvePlaidEnv(" sandbox ")).toBe("sandbox");
  });
});

describe("plaidBaseUrl()", () => {
  it("maps environments to the right Plaid host", () => {
    expect(plaidBaseUrl("sandbox")).toBe("https://sandbox.plaid.com");
    expect(plaidBaseUrl("development")).toBe("https://development.plaid.com");
    expect(plaidBaseUrl("production")).toBe("https://production.plaid.com");
  });
});

describe("createLinkToken()", () => {
  it("posts the expected body including auth + identity products and US/en", async () => {
    const { fetchImpl, calls } = captureFetch({
      body: { link_token: "link-sandbox-abc", expiration: "2026-01-01T00:00:00Z" },
    });
    const res = await createLinkToken(
      { userId: "rep_1", legalName: "Joe Pearce", email: "joe@example.com" },
      { credentials: CREDS, fetchImpl },
    );
    expect(res.link_token).toBe("link-sandbox-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sandbox.plaid.com/link/token/create");
    const body = calls[0].body as Record<string, unknown>;
    expect(body.client_id).toBe("cid_test");
    expect(body.secret).toBe("sec_test");
    expect(body.products).toEqual(["auth", "identity"]);
    expect(body.country_codes).toEqual(["US"]);
    expect(body.language).toBe("en");
    expect((body.user as Record<string, unknown>).client_user_id).toBe("rep_1");
    expect((body.user as Record<string, unknown>).legal_name).toBe("Joe Pearce");
  });

  it("includes redirect_uri only when supplied", async () => {
    const { fetchImpl, calls } = captureFetch({
      body: { link_token: "x", expiration: "y" },
    });
    await createLinkToken({ userId: "u" }, { credentials: CREDS, fetchImpl });
    expect((calls[0].body as Record<string, unknown>).redirect_uri).toBeUndefined();
    calls.length = 0;

    const second = captureFetch({ body: { link_token: "x", expiration: "y" } });
    await createLinkToken(
      { userId: "u", redirectUri: "https://app.example.com/cb" },
      { credentials: CREDS, fetchImpl: second.fetchImpl },
    );
    expect((second.calls[0].body as Record<string, unknown>).redirect_uri).toBe(
      "https://app.example.com/cb",
    );
  });

  it("throws PlaidApiError with parsed error fields on non-2xx", async () => {
    const fetchImpl = mockFetchOnce({
      status: 400,
      body: {
        error_message: "invalid client_id",
        error_code: "INVALID_API_KEYS",
        error_type: "INVALID_INPUT",
        request_id: "req_123",
      },
    });
    await expect(
      createLinkToken({ userId: "u" }, { credentials: CREDS, fetchImpl }),
    ).rejects.toMatchObject({
      name: "PlaidApiError",
      status: 400,
      errorCode: "INVALID_API_KEYS",
      errorType: "INVALID_INPUT",
      requestId: "req_123",
    });
  });
});

describe("exchangePublicToken()", () => {
  it("posts the public_token to /item/public_token/exchange", async () => {
    const { fetchImpl, calls } = captureFetch({
      body: { access_token: "access-sandbox-xyz", item_id: "item_1" },
    });
    const res = await exchangePublicToken("public-sandbox-pub", { credentials: CREDS, fetchImpl });
    expect(res.access_token).toBe("access-sandbox-xyz");
    expect(res.item_id).toBe("item_1");
    expect(calls[0].url).toBe("https://sandbox.plaid.com/item/public_token/exchange");
    expect((calls[0].body as Record<string, unknown>).public_token).toBe("public-sandbox-pub");
  });
});

describe("getAuth() / getIdentity()", () => {
  it("calls the right endpoint and forwards the access_token", async () => {
    const auth = captureFetch({
      body: {
        accounts: [],
        numbers: { ach: [] },
        item: { institution_id: "ins_1" },
      },
    });
    await getAuth("access_X", { credentials: CREDS, fetchImpl: auth.fetchImpl });
    expect(auth.calls[0].url).toBe("https://sandbox.plaid.com/auth/get");
    expect((auth.calls[0].body as Record<string, unknown>).access_token).toBe("access_X");

    const ident = captureFetch({ body: { accounts: [], item: {} } });
    await getIdentity("access_X", { credentials: CREDS, fetchImpl: ident.fetchImpl });
    expect(ident.calls[0].url).toBe("https://sandbox.plaid.com/identity/get");
  });
});

describe("compareOwnerName()", () => {
  it("returns unknown when expected or owner list is empty", () => {
    expect(compareOwnerName(null, [])).toBe("unknown");
    expect(compareOwnerName("Joe Pearce", [])).toBe("unknown");
    expect(compareOwnerName("", ["Joe Pearce"])).toBe("unknown");
  });
  it("returns match for exact name match (case/punct insensitive)", () => {
    expect(compareOwnerName("Joe Pearce", ["JOE PEARCE"])).toBe("match");
    expect(compareOwnerName("Joe Pearce", ["Joe Pearce, Jr."])).toBe("partial");
  });
  it("returns partial when both name tokens overlap with a different ordering", () => {
    expect(compareOwnerName("Jane Smith", ["Smith Jane Marie"])).toBe("partial");
  });
  it("returns mismatch when only a single token overlaps", () => {
    expect(compareOwnerName("Jane Smith", ["J. Smith"])).toBe("mismatch");
  });
  it("returns mismatch when no overlap", () => {
    expect(compareOwnerName("Jane Smith", ["Bob Lee"])).toBe("mismatch");
  });
});

describe("buildVerificationSummary()", () => {
  const auth: AuthResponse = {
    accounts: [
      { account_id: "a1", name: "Checking", mask: "1234", type: "depository", subtype: "checking" },
      { account_id: "a2", name: "Savings", mask: "9999", type: "depository", subtype: "savings" },
    ],
    numbers: {
      ach: [{ account_id: "a1", account: "secret", routing: "secret" }],
    },
    item: { institution_id: "ins_99" },
  };
  const identity: IdentityResponse = {
    accounts: [
      {
        account_id: "a1",
        owners: [{ names: ["Joe Pearce"] }],
      },
    ],
    item: { institution_id: "ins_99" },
  };

  it("flags ACH-eligible accounts and never echoes raw routing/account numbers", () => {
    const summary = buildVerificationSummary({
      itemId: "item_1",
      auth,
      identity,
      institutionName: "Plaid Test Bank",
      expectedOwnerName: "Joe Pearce",
    });
    expect(summary.item_id).toBe("item_1");
    expect(summary.institution_name).toBe("Plaid Test Bank");
    expect(summary.accounts).toHaveLength(2);
    const checking = summary.accounts.find((a) => a.account_id === "a1")!;
    expect(checking.has_ach).toBe(true);
    expect(checking.mask).toBe("1234");
    const savings = summary.accounts.find((a) => a.account_id === "a2")!;
    expect(savings.has_ach).toBe(false);
    // Make sure no secret numbers leak into the summary string.
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(summary.owner_match).toBe("match");
    expect(summary.status).toBe("verified");
  });

  it("marks needs_review when owner names do not match", () => {
    const summary = buildVerificationSummary({
      itemId: "item_1",
      auth,
      identity,
      expectedOwnerName: "Different Person",
    });
    expect(summary.owner_match).toBe("mismatch");
    expect(summary.status).toBe("needs_review");
  });

  it("treats unknown owner with ACH-eligible account as verified", () => {
    const summary = buildVerificationSummary({
      itemId: "item_1",
      auth,
      identity: null,
      expectedOwnerName: null,
    });
    expect(summary.owner_match).toBe("unknown");
    expect(summary.status).toBe("verified");
  });

  it("marks unverified when no ACH numbers are returned", () => {
    const summary = buildVerificationSummary({
      itemId: "item_1",
      auth: { ...auth, numbers: { ach: [] } },
      identity,
      expectedOwnerName: "Joe Pearce",
    });
    expect(summary.status).toBe("unverified");
  });
});

describe("PlaidApiError", () => {
  it("is identifiable via instanceof and exposes status", () => {
    const e = new PlaidApiError("nope", { status: 500, errorCode: "X" });
    expect(e).toBeInstanceOf(PlaidApiError);
    expect(e.status).toBe(500);
    expect(e.errorCode).toBe("X");
  });
});
