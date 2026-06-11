import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeMetadata,
  summarizeUsage,
  actorFromUser,
  type UsageEventRow,
} from "./usage";

function row(partial: Partial<UsageEventRow>): UsageEventRow {
  return {
    id: partial.id ?? Math.random().toString(36),
    rep_id: partial.rep_id ?? null,
    rep_email: partial.rep_email ?? null,
    rep_name: partial.rep_name ?? null,
    action_type: partial.action_type ?? "lead_search",
    provider: partial.provider ?? "DataForSEO",
    units: partial.units ?? 1,
    metadata: partial.metadata ?? {},
    created_at: partial.created_at ?? new Date().toISOString(),
  };
}

describe("sanitizeMetadata", () => {
  it("returns {} for undefined", () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
  });

  it("strips secret-looking keys", () => {
    const out = sanitizeMetadata({
      city: "Gulfport",
      apiKey: "sk-123",
      access_token: "abc",
      password: "hunter2",
      authorization: "Bearer x",
      jwt: "e.y.z",
      credential: "c",
    });
    expect(out).toEqual({ city: "Gulfport" });
  });

  it("drops nested objects and nullish values, keeps primitives", () => {
    const out = sanitizeMetadata({
      industry: "Dental",
      resultCount: 12,
      ok: true,
      nothing: null,
      undef: undefined,
      nested: { a: 1 },
    });
    expect(out).toEqual({ industry: "Dental", resultCount: 12, ok: true });
  });

  it("truncates long strings and caps arrays", () => {
    const out = sanitizeMetadata({
      long: "x".repeat(500),
      list: Array.from({ length: 100 }, (_, i) => i),
    });
    expect((out.long as string).length).toBe(200);
    expect((out.list as number[]).length).toBe(25);
  });
});

describe("actorFromUser", () => {
  it("returns nulls for anonymous", () => {
    expect(actorFromUser(null)).toEqual({ id: null, email: null, name: null });
  });

  it("maps id + email from a CurrentUser", () => {
    const actor = actorFromUser({
      id: "u1",
      email: "rep@example.com",
      jwt: "j",
      // client unused by actorFromUser
      client: {} as never,
    });
    expect(actor.id).toBe("u1");
    expect(actor.email).toBe("rep@example.com");
  });
});

describe("summarizeUsage", () => {
  it("returns zeroed summary for no events", () => {
    const d = summarizeUsage([]);
    expect(d.summary.totalActions).toBe(0);
    expect(d.byRep).toEqual([]);
    expect(d.byProvider).toEqual([]);
    expect(d.recent).toEqual([]);
  });

  it("buckets actions into the right summary counters", () => {
    const events = [
      row({ action_type: "dataforseo_lead_search" }),
      row({ action_type: "lead_search" }),
      row({ action_type: "ai_email_draft", provider: "OpenAI/LLM" }),
      row({ action_type: "ai_proposal_generation", provider: "OpenAI/LLM" }),
      row({ action_type: "ai_business_brief", provider: "OpenAI/LLM" }),
      row({ action_type: "heat_map_scan", units: 25 }),
      row({ action_type: "demo_website_request", provider: "Netlify" }),
      row({ action_type: "resend_email_send", provider: "Resend", units: 2 }),
    ];
    const d = summarizeUsage(events);
    expect(d.summary.totalActions).toBe(8);
    expect(d.summary.leadSearches).toBe(2);
    expect(d.summary.aiGenerations).toBe(3);
    expect(d.summary.heatMapScans).toBe(1);
    expect(d.summary.demoRequests).toBe(1);
    expect(d.summary.emailsSent).toBe(1);
    expect(d.summary.totalUnits).toBe(1 + 1 + 1 + 1 + 1 + 25 + 1 + 2);
  });

  it("groups by rep and by provider, sorted by event count desc", () => {
    const events = [
      row({ rep_id: "a", rep_email: "a@x.com", provider: "DataForSEO" }),
      row({ rep_id: "a", rep_email: "a@x.com", provider: "OpenAI/LLM" }),
      row({ rep_id: "b", rep_email: "b@x.com", provider: "DataForSEO" }),
    ];
    const d = summarizeUsage(events);
    expect(d.byRep[0].repId).toBe("a");
    expect(d.byRep[0].eventCount).toBe(2);
    expect(d.byRep[1].repId).toBe("b");
    expect(d.byProvider[0].provider).toBe("DataForSEO");
    expect(d.byProvider[0].eventCount).toBe(2);
  });

  it("attributes unattributed (null rep) events without crashing", () => {
    const d = summarizeUsage([row({ rep_id: null, rep_email: null })]);
    expect(d.byRep).toHaveLength(1);
    expect(d.byRep[0].repId).toBeNull();
  });
});

describe("logUsage (best-effort)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false and never throws when service client is unavailable", async () => {
    vi.doMock("./supabase", () => ({ serviceClient: () => null }));
    const { logUsage } = await import("./usage");
    const result = await logUsage(
      { id: "u1", email: "r@x.com" },
      { actionType: "lead_search", provider: "DataForSEO" },
    );
    expect(result).toBe(false);
  });

  it("returns false (not throws) when the insert errors", async () => {
    vi.doMock("./supabase", () => ({
      serviceClient: () => ({
        from: () => ({
          insert: async () => ({ error: { message: "boom" } }),
        }),
      }),
    }));
    const { logUsage } = await import("./usage");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await logUsage(
      { id: "u1", email: "r@x.com" },
      { actionType: "lead_search", provider: "DataForSEO" },
    );
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns true on a clean insert and forwards a sanitized row", async () => {
    let captured: Record<string, unknown> | null = null;
    vi.doMock("./supabase", () => ({
      serviceClient: () => ({
        from: () => ({
          insert: async (rowArg: Record<string, unknown>) => {
            captured = rowArg;
            return { error: null };
          },
        }),
      }),
    }));
    const { logUsage } = await import("./usage");
    const result = await logUsage(
      { id: "u1", email: "r@x.com", name: "Rep One" },
      {
        actionType: "heat_map_scan",
        provider: "DataForSEO",
        units: 25,
        metadata: { city: "Gulfport", apiKey: "sk-leak" },
      },
    );
    expect(result).toBe(true);
    expect(captured!.rep_id).toBe("u1");
    expect(captured!.action_type).toBe("heat_map_scan");
    expect(captured!.units).toBe(25);
    expect(captured!.metadata).toEqual({ city: "Gulfport" });
  });
});
