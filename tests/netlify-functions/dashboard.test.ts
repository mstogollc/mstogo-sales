import { describe, it, expect, beforeEach, vi } from "vitest";

type ClientShape = "ok" | "missing-table" | "other-error";

function buildClient(shape: ClientShape) {
  return {
    from(_table: string) {
      const q: any = {};
      q.select = (_cols?: string, opts?: { count?: "exact"; head?: boolean }) => {
        if (shape === "missing-table") {
          const err = {
            code: "PGRST205",
            message:
              "Could not find the table 'public.outreach_activity' in the schema cache",
          };
          if (opts?.head) {
            return Promise.resolve({ count: null, data: null, error: err });
          }
          // chainable that resolves with the error
          q._error = err;
          return q;
        }
        if (shape === "other-error") {
          const err = { code: "42P01", message: "permission denied" };
          if (opts?.head) {
            return Promise.resolve({ count: null, data: null, error: err });
          }
          q._error = err;
          return q;
        }
        if (opts?.head) return Promise.resolve({ count: 0, data: null, error: null });
        return q;
      };
      q.order = () => q;
      q.limit = () => Promise.resolve({ data: [], error: q._error ?? null });
      q.then = (resolve: any) => resolve({ data: [], error: q._error ?? null });
      return q;
    },
  };
}

vi.mock("../../netlify/functions/_lib/supabase", () => {
  return {
    currentUser: async (req: Request) => {
      if (!req.headers.get("authorization")) return null;
      const shape = (req.headers.get("x-test-shape") as ClientShape) ?? "ok";
      return {
        id: "u1",
        email: "rep@example.com",
        jwt: "j",
        client: buildClient(shape),
      };
    },
    tryPersist: async (_l: string, fn: () => Promise<unknown>) => fn(),
    serviceClient: () => null,
    userClient: () => null,
    extractBearer: () => null,
    isSupabaseConfigured: () => true,
  };
});

const ctx: any = {};

describe("dashboard handler", () => {
  let handler: (req: Request, ctx: any) => Promise<Response>;
  beforeEach(async () => {
    handler = (await import("../../netlify/functions/dashboard")).default;
  });

  it("rejects non-GET", async () => {
    const res = await handler(new Request("https://x/dashboard", { method: "POST" }), ctx);
    expect(res.status).toBe(405);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await handler(new Request("https://x/dashboard", { method: "GET" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns zero counts and empty arrays for an authenticated user", async () => {
    const res = await handler(
      new Request("https://x/dashboard", { method: "GET", headers: { authorization: "Bearer j" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.counts).toEqual({ leads: 0, prospects: 0, proposals: 0, sales: 0 });
    expect(body.user.email).toBe("rep@example.com");
    expect(Array.isArray(body.recent_activity)).toBe(true);
  });

  it("returns 503 crm_setup_required when PostgREST reports a missing table", async () => {
    const res = await handler(
      new Request("https://x/dashboard", {
        method: "GET",
        headers: { authorization: "Bearer j", "x-test-shape": "missing-table" },
      }),
      ctx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.error).toBe("crm_setup_required");
    expect(body.code).toBe("PGRST205");
    expect(body.user.email).toBe("rep@example.com");
    expect(typeof body.detail).toBe("string");
  });

  it("returns 400 for unrelated PostgREST errors", async () => {
    const res = await handler(
      new Request("https://x/dashboard", {
        method: "GET",
        headers: { authorization: "Bearer j", "x-test-shape": "other-error" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("permission denied");
  });
});

describe("isSchemaCacheMissError", () => {
  it("detects PGRST205 by code and by message", async () => {
    const mod = await import("../../netlify/functions/dashboard");
    const fn = (mod as unknown as { isSchemaCacheMissError: (e: unknown) => boolean })
      .isSchemaCacheMissError;
    expect(fn({ code: "PGRST205" })).toBe(true);
    expect(fn({ message: "Could not find the table 'public.outreach_activity' in the schema cache" })).toBe(true);
    expect(fn({ message: "could not find table foo" })).toBe(true);
    expect(fn({ code: "42P01", message: "permission denied" })).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn(undefined)).toBe(false);
  });
});
