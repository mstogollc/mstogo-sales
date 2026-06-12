import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveSeoSnapshot } from "../analyze-lead";
import type { PlaceProfile } from "./places";

const ORIGINAL_LOGIN = process.env.DATAFORSEO_LOGIN;
const ORIGINAL_PASSWORD = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = "login";
  process.env.DATAFORSEO_PASSWORD = "password";
});

afterEach(() => {
  if (ORIGINAL_LOGIN === undefined) delete process.env.DATAFORSEO_LOGIN;
  else process.env.DATAFORSEO_LOGIN = ORIGINAL_LOGIN;
  if (ORIGINAL_PASSWORD === undefined) delete process.env.DATAFORSEO_PASSWORD;
  else process.env.DATAFORSEO_PASSWORD = ORIGINAL_PASSWORD;
});

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function overview(count: number, etv: number) {
  return {
    tasks: [
      {
        status_code: 20000,
        result: [{ metrics: { organic: { count, etv }, paid: { count: 0 } } }],
      },
    ],
  };
}

// Stubs the DataForSEO domain_rank_overview endpoint per requested target.
function dfsFetchByDomain(byDomain: Record<string, unknown>): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as Array<{ target: string }>;
    const target = payload[0]?.target ?? "";
    const body = byDomain[target];
    if (body === undefined) return makeResponse(overview(0, 0));
    return makeResponse(body);
  }) as unknown as typeof fetch;
}

const alderPlace: PlaceProfile = {
  matched: true,
  name: "Alder Pest Control",
  rating: 4.9,
  userRatingCount: 1672,
  website: "https://www.alderpestcontrol.com/huntsville-al-pest-control/?utm_source=gbp",
  websiteDomain: "alderpestcontrol.com",
  signals: [],
  overall: "green",
  summary: "",
};

describe("resolveSeoSnapshot (Adler/Alder regression)", () => {
  it("falls back to the verified Google website when the typed domain has no footprint", async () => {
    const fetchImpl = dfsFetchByDomain({
      "adlerpestcontrol.com": overview(0, 0),
      "alderpestcontrol.com": overview(858, 2899.96),
    });

    const { seo, resolution } = await resolveSeoSnapshot(
      "adlerpestcontrol.com",
      alderPlace,
      fetchImpl,
    );

    // Final report uses the verified domain and shows the real footprint.
    expect(seo.domain).toBe("alderpestcontrol.com");
    expect(seo.status).toBe("available");
    expect(seo.organicKeywordCount).toBe(858);
    expect(seo.organicKeywordCount).not.toBe(0);

    // Resolution surfaces the mismatch in a sales-friendly way.
    expect(resolution.usedVerified).toBe(true);
    expect(resolution.mismatch).toBe(true);
    expect(resolution.enteredDomain).toBe("adlerpestcontrol.com");
    expect(resolution.verifiedDomain).toBe("alderpestcontrol.com");
    expect(resolution.notice).toMatch(/verified Google listing/i);
  });

  it("keeps the typed domain when it already has a footprint", async () => {
    const fetchImpl = dfsFetchByDomain({
      "alderpestcontrol.com": overview(858, 2899.96),
    });
    const { seo, resolution } = await resolveSeoSnapshot(
      "alderpestcontrol.com",
      alderPlace,
      fetchImpl,
    );
    expect(seo.domain).toBe("alderpestcontrol.com");
    expect(resolution.usedVerified).toBe(false);
    expect(resolution.mismatch).toBe(false);
  });

  it("never reports false zero when both domains are unavailable", async () => {
    const fetchImpl = (async () => makeResponse({ error: "denied" }, 403)) as unknown as typeof fetch;
    const { seo, resolution } = await resolveSeoSnapshot(
      "adlerpestcontrol.com",
      alderPlace,
      fetchImpl,
    );
    expect(seo.status).toBe("unavailable");
    expect(seo.organicKeywordCount).toBeUndefined();
    expect(resolution.mismatch).toBe(true);
  });
});
