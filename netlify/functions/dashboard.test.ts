import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the supabase helper module before importing the handler.
vi.mock("./_lib/supabase", () => {
  const client = {
    from(_table: string) {
      const q: any = {};
      q.select = (_cols?: string, opts?: { count?: "exact"; head?: boolean }) => {
        if (opts?.head) return Promise.resolve({ count: 0, data: null, error: null });
        return q;
      };
      q.order = () => q;
      q.limit = () => Promise.resolve({ data: [], error: null });
      q.then = (resolve: any) => resolve({ data: [], error: null });
      return q;
    },
  };
  return {
    currentUser: async (req: Request) =>
      req.headers.get("authorization")
        ? { id: "u1", email: "rep@example.com", jwt: "j", client }
        : null,
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
    handler = (await import("./dashboard")).default;
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
});
