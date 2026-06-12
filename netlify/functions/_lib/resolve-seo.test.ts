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
    expect(seo.domain).not.toBe("adlerpestcontrol.com");
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

  // Live failure mode: the typed domain returns a *successful empty* result
  // (status available, zero footprint), while the verified-domain retry is
  // temporarily unavailable. We must still pivot to the verified domain rather
  // than reporting the typo's false zero.
  it("uses the verified domain even when its retry is unavailable, never the typo's false zero", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const target = (JSON.parse(String(init?.body)) as Array<{ target: string }>)[0]?.target;
      if (target === "adlerpestcontrol.com") return makeResponse(overview(0, 0));
      return makeResponse({ error: "rate_limited" }, 429);
    }) as unknown as typeof fetch;

    const { seo, resolution } = await resolveSeoSnapshot(
      "adlerpestcontrol.com",
      alderPlace,
      fetchImpl,
    );

    expect(seo.domain).toBe("alderpestcontrol.com");
    expect(seo.domain).not.toBe("adlerpestcontrol.com");
    expect(seo.status).toBe("unavailable");
    // Crucially: not presented as a real zero footprint.
    expect(seo.organicKeywordCount).toBeUndefined();
    expect(resolution.usedVerified).toBe(true);
    expect(resolution.notice).toMatch(/verified Google listing/i);
  });

  // The verified domain is the source of truth even when it, too, is an
  // honest zero — we still report the verified domain, not the typo.
  it("uses the verified domain when both come back as available zero", async () => {
    const fetchImpl = dfsFetchByDomain({
      "adlerpestcontrol.com": overview(0, 0),
      "alderpestcontrol.com": overview(0, 0),
    });
    const { seo, resolution } = await resolveSeoSnapshot(
      "adlerpestcontrol.com",
      alderPlace,
      fetchImpl,
    );
    expect(seo.domain).toBe("alderpestcontrol.com");
    expect(seo.status).toBe("available");
    expect(resolution.usedVerified).toBe(true);
  });

  // No Places match (or no verified domain) means there is nothing to pivot to,
  // so the typed domain's honest result stands.
  it("keeps the typed domain when Places has no verified website", async () => {
    const fetchImpl = dfsFetchByDomain({ "adlerpestcontrol.com": overview(0, 0) });
    const noWebsitePlace: PlaceProfile = { ...alderPlace, website: undefined, websiteDomain: undefined };
    const { seo, resolution } = await resolveSeoSnapshot(
      "adlerpestcontrol.com",
      noWebsitePlace,
      fetchImpl,
    );
    expect(seo.domain).toBe("adlerpestcontrol.com");
    expect(resolution.usedVerified).toBe(false);
  });
});
