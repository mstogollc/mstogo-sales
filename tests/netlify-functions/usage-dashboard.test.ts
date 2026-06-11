import { describe, it, expect, beforeEach, vi } from "vitest";

type Role = "rep" | "manager" | "super_admin";

const SAMPLE_EVENTS = [
  {
    id: "e1",
    rep_id: "a",
    rep_email: "a@x.com",
    rep_name: "Rep A",
    action_type: "dataforseo_lead_search",
    provider: "DataForSEO",
    units: 1,
    metadata: { city: "Gulfport", state: "MS" },
    created_at: new Date().toISOString(),
  },
  {
    id: "e2",
    rep_id: "a",
    rep_email: "a@x.com",
    rep_name: "Rep A",
    action_type: "ai_email_draft",
    provider: "OpenAI/LLM",
    units: 1,
    metadata: {},
    created_at: new Date().toISOString(),
  },
];

function buildClient(role: Role) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role }, error: null }),
            }),
          }),
        };
      }
      // usage_events query chain: select -> order -> limit -> (gte) -> await
      const q: any = {};
      q.select = () => q;
      q.order = () => q;
      q.gte = () => q;
      q.lte = () => q;
      q.limit = () => q;
      q.then = (resolve: any) => resolve({ data: SAMPLE_EVENTS, error: null });
      return q;
    },
  };
}

let currentRole: Role = "super_admin";

vi.mock("../../netlify/functions/_lib/supabase", () => {
  return {
    currentUser: async (req: Request) => {
      if (!req.headers.get("authorization")) return null;
      return {
        id: "u1",
        email: "admin@example.com",
        jwt: "j",
        client: buildClient(currentRole),
      };
    },
    serviceClient: () => null,
  };
});

const ctx: any = {};

describe("usage-dashboard handler", () => {
  let handler: (req: Request, ctx: any) => Promise<Response>;
  beforeEach(async () => {
    handler = (await import("../../netlify/functions/usage-dashboard")).default;
  });

  it("rejects non-GET", async () => {
    const res = await handler(
      new Request("https://x/usage-dashboard", { method: "POST" }),
      ctx,
    );
    expect(res.status).toBe(405);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await handler(
      new Request("https://x/usage-dashboard", { method: "GET" }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a plain rep", async () => {
    currentRole = "rep";
    const res = await handler(
      new Request("https://x/usage-dashboard", {
        method: "GET",
        headers: { authorization: "Bearer j" },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns aggregated data for a super admin", async () => {
    currentRole = "super_admin";
    const res = await handler(
      new Request("https://x/usage-dashboard?range=7d", {
        method: "GET",
        headers: { authorization: "Bearer j" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.summary.totalActions).toBe(2);
    expect(body.summary.leadSearches).toBe(1);
    expect(body.summary.aiGenerations).toBe(1);
    expect(body.byRep[0].repEmail).toBe("a@x.com");
    expect(body.range).toBe("7d");
  });

  it("allows managers", async () => {
    currentRole = "manager";
    const res = await handler(
      new Request("https://x/usage-dashboard", {
        method: "GET",
        headers: { authorization: "Bearer j" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
  });
});

describe("rangeStart", () => {
  it("computes boundaries and null for all", async () => {
    const mod = await import("../../netlify/functions/usage-dashboard");
    const fn = (mod as unknown as {
      rangeStart: (r: string, now: Date) => string | null;
    }).rangeStart;
    const now = new Date("2026-06-05T12:00:00.000Z");
    expect(fn("all", now)).toBeNull();
    expect(fn("today", now)).toContain("2026-06-05");
    // 7d back from Jun 5 = May 29
    expect(fn("7d", now)).toContain("2026-05-29");
    expect(fn("30d", now)).toContain("2026-05-06");
  });
});
