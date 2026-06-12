import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchDataForSeoSnapshot, normalizeDomain } from "./dataforseo";

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

// Aggregate-only shape (metrics, no keyword items).
function overview(count: number, etv: number) {
  return {
    tasks: [
      {
        status_code: 20000,
        result: [
          { total_count: count, metrics: { organic: { count, etv }, paid: { count: 0 } } },
        ],
      },
    ],
  };
}

// Realistic ranked_keywords/live shape: aggregate metrics + per-keyword items.
function rankedKeywords(opts: {
  count: number;
  etv: number;
  items: Array<{ keyword: string; rank: number; volume?: number }>;
}) {
  return {
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            total_count: opts.count,
            items_count: opts.items.length,
            metrics: {
              organic: { count: opts.count, etv: opts.etv, pos_1: 10, pos_2_3: 24, pos_4_10: 96 },
              paid: { count: 0 },
            },
            items: opts.items.map((it) => ({
              keyword_data: {
                keyword: it.keyword,
                keyword_info: { search_volume: it.volume },
              },
              ranked_serp_element: { serp_item: { rank_absolute: it.rank, rank_group: it.rank } },
            })),
          },
        ],
      },
    ],
  };
}

describe("normalizeDomain", () => {
  it("strips scheme, www, path and query", () => {
    expect(
      normalizeDomain(
        "https://www.alderpestcontrol.com/huntsville-al-pest-control/?utm_source=gbp",
      ),
    ).toBe("alderpestcontrol.com");
  });
  it("handles bare domains and casing", () => {
    expect(normalizeDomain("AdlerPestControl.com")).toBe("adlerpestcontrol.com");
  });
  it("returns undefined for blank input", () => {
    expect(normalizeDomain("")).toBeUndefined();
    expect(normalizeDomain(undefined)).toBeUndefined();
  });
});

describe("fetchDataForSeoSnapshot", () => {
  it("reports not_configured when creds missing", async () => {
    delete process.env.DATAFORSEO_LOGIN;
    const snap = await fetchDataForSeoSnapshot("example.com", async () => makeResponse({}));
    expect(snap.status).toBe("not_configured");
    expect(snap.configured).toBe(false);
  });

  it("returns available with real metrics", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "alderpestcontrol.com",
      async () => makeResponse(overview(858, 2899.96)),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(858);
    expect(Math.round(snap.organicTrafficEstimate ?? 0)).toBe(2900);
  });

  it("treats true zero from the API as available zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "adlerpestcontrol.com",
      async () => makeResponse(overview(0, 0)),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(0);
  });

  it("does NOT report zero when the API errors (unavailable, not zero)", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () => makeResponse({ error: "denied" }, 403),
    );
    expect(snap.status).toBe("unavailable");
    expect(snap.organicKeywordCount).toBeUndefined();
    expect(snap.organicTrafficEstimate).toBeUndefined();
    expect(snap.rankSignals?.[0].level).toBe("yellow");
  });

  it("treats a task-level subscription error as unavailable, not zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () =>
        makeResponse({
          status_code: 20000,
          tasks: [{ status_code: 40200, status_message: "Access denied." }],
        }),
    );
    expect(snap.status).toBe("unavailable");
    expect(snap.organicKeywordCount).toBeUndefined();
  });

  it("treats an empty result set as unavailable, not zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () => makeResponse({ tasks: [{ status_code: 20000, result: [] }] }),
    );
    expect(snap.status).toBe("unavailable");
  });

  it("calls the ranked_keywords endpoint", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return makeResponse(overview(858, 2899.96));
    }) as unknown as typeof fetch;
    await fetchDataForSeoSnapshot("alderpestcontrol.com", fetchImpl);
    expect(calledUrl).toContain("/dataforseo_labs/google/ranked_keywords/live");
  });

  it("parses real ranked_keywords metrics and keyword rows (Alder)", async () => {
    const snap = await fetchDataForSeoSnapshot("alderpestcontrol.com", async () =>
      makeResponse(
        rankedKeywords({
          count: 858,
          etv: 2899.96,
          items: [
            { keyword: "pest control huntsville", rank: 3, volume: 1300 },
            { keyword: "exterminator huntsville al", rank: 5, volume: 720 },
          ],
        }),
      ),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(858);
    expect(Math.round(snap.organicTrafficEstimate ?? 0)).toBe(2900);
    expect(snap.topKeywords).toEqual([
      { keyword: "pest control huntsville", position: 3, searchVolume: 1300 },
      { keyword: "exterminator huntsville al", position: 5, searchVolume: 720 },
    ]);
    // 858 keywords + ~2900 visits → both signals should be green.
    expect(snap.rankSignals?.every((s) => s.level === "green")).toBe(true);
  });

  it("never emits blank keyword / zero-position garbage rows", async () => {
    const snap = await fetchDataForSeoSnapshot("alderpestcontrol.com", async () =>
      makeResponse(
        rankedKeywords({
          count: 858,
          etv: 2899.96,
          items: [
            { keyword: "", rank: 0 },
            { keyword: "   ", rank: 4 },
            { keyword: "pest control huntsville", rank: 0 },
            { keyword: "real keyword", rank: 2, volume: 100 },
          ],
        }),
      ),
    );
    expect(snap.topKeywords).toEqual([
      { keyword: "real keyword", position: 2, searchVolume: 100 },
    ]);
    expect(snap.topKeywords?.some((k) => k.keyword === "")).toBe(false);
    expect(snap.topKeywords?.some((k) => k.position === 0)).toBe(false);
  });

  // The production failure: a result object whose only item is the blank
  // placeholder and which carries no organic metrics. This must be reported as
  // unavailable, not a false "zero footprint".
  it("treats a present-but-empty result (blank item, no metrics) as unavailable", async () => {
    const snap = await fetchDataForSeoSnapshot("alderpestcontrol.com", async () =>
      makeResponse({
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    keyword_data: { keyword: "" },
                    ranked_serp_element: { serp_item: { rank_absolute: 0 } },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(snap.status).toBe("unavailable");
    expect(snap.organicKeywordCount).toBeUndefined();
    expect(snap.topKeywords).toBeUndefined();
  });

  it("falls back to total_count when organic.count is absent", async () => {
    const snap = await fetchDataForSeoSnapshot("alderpestcontrol.com", async () =>
      makeResponse({
        tasks: [
          {
            status_code: 20000,
            result: [{ total_count: 858, metrics: { organic: { etv: 2899.96 } } }],
          },
        ],
      }),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(858);
  });
});
