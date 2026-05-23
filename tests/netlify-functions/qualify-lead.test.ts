import { describe, it, expect, beforeEach, vi } from "vitest";

const inserts: unknown[] = [];

vi.mock("../../netlify/functions/_lib/supabase", () => {
  const client = {
    from(_table: string) {
      const q: any = {};
      q.insert = (row: unknown) => {
        inserts.push(row);
        return q;
      };
      q.select = () => q;
      q.single = async () => ({ data: { id: "submission-1" }, error: null });
      q.eq = () => Promise.resolve({ data: [], error: null });
      q.update = () => q;
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

describe("qualify-lead handler", () => {
  let handler: (req: Request, ctx: any) => Promise<Response>;
  beforeEach(async () => {
    inserts.length = 0;
    handler = (await import("../../netlify/functions/qualify-lead")).default;
  });

  it("rejects non-POST", async () => {
    const res = await handler(new Request("https://x/q", { method: "GET" }), {} as any);
    expect(res.status).toBe(405);
  });

  it("rejects missing answers", async () => {
    const res = await handler(
      new Request("https://x/q", {
        method: "POST",
        headers: { authorization: "Bearer j", "content-type": "application/json" },
        body: "{}",
      }),
      {} as any,
    );
    expect(res.status).toBe(400);
  });

  it("returns score + package without persisting when unauthenticated", async () => {
    const res = await handler(
      new Request("https://x/q", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: { has_website: true, growth_goal: "expand into new markets" } }),
      }),
      {} as any,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.persisted).toBe(false);
    expect(body.recommended_package).toMatch(/basic|growth|premium/);
    expect(inserts).toHaveLength(0);
  });

  it("persists a submission when authenticated", async () => {
    const res = await handler(
      new Request("https://x/q", {
        method: "POST",
        headers: { authorization: "Bearer j", "content-type": "application/json" },
        body: JSON.stringify({
          answers: {
            has_website: true,
            has_team: true,
            monthly_revenue: 50000,
            growth_goal: "expand into new markets",
            uses_crm: "yes",
          },
        }),
      }),
      {} as any,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.persisted).toBe(true);
    expect(body.submission_id).toBe("submission-1");
    expect(inserts).toHaveLength(1);
  });
});
