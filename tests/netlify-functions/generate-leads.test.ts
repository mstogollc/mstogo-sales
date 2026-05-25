import { describe, it, expect, beforeEach, afterEach } from "vitest";
import handler, {
  fitScore,
  packageFor,
  industryToSearchPhrase,
  isInMarket,
  isServiceBusiness,
} from "../../netlify/functions/generate-leads";

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("https://example.com/api/generate-leads", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("generate-leads pure helpers", () => {
  it("scores established prospects higher than unknown ones", () => {
    expect(fitScore(4.8, 200, true)).toBeGreaterThan(fitScore(0, 0, false));
  });

  it("packages by score thresholds", () => {
    expect(packageFor(85)).toBe("Premium");
    expect(packageFor(70)).toBe("Growth");
    expect(packageFor(40)).toBe("Basic");
  });

  it("maps natural-language industries to DataForSEO search phrases", () => {
    expect(industryToSearchPhrase("Roofing")).toBe("roofing contractor");
    expect(industryToSearchPhrase("HVAC & Cooling")).toBe("hvac contractor");
    expect(industryToSearchPhrase("Plumbing")).toBe("plumbing contractor");
    expect(industryToSearchPhrase("Unknown Niche")).toBe("Unknown Niche");
  });

  it("rejects out-of-state listings even when coords are nearby", () => {
    const item = {
      title: "Borderline Roofing",
      address_info: { region: "TN", country_code: "US" },
      latitude: 34.99,
      longitude: -86.6,
    };
    const inMarket = isInMarket(item, {
      cityLower: "huntsville",
      stateAbbr: "AL",
      stateName: "Alabama",
      radiusMiles: 50,
      center: { lat: 34.7304, lng: -86.5861 },
    });
    expect(inMarket).toBe(false);
  });

  it("accepts in-market AL contractor via coords", () => {
    const item = {
      title: "Huntsville Roofers",
      address_info: { region: "AL", city: "Huntsville", country_code: "US", address: "100 Main St, Huntsville, AL" },
      latitude: 34.74,
      longitude: -86.6,
    };
    const inMarket = isInMarket(item, {
      cityLower: "huntsville",
      stateAbbr: "AL",
      stateName: "Alabama",
      radiusMiles: 25,
      center: { lat: 34.7304, lng: -86.5861 },
    });
    expect(inMarket).toBe(true);
  });

  it("filters out retail/supply stores but keeps service contractors", () => {
    expect(isServiceBusiness({ title: "ABC Roofing Supply" })).toBe(false);
    expect(isServiceBusiness({ title: "ABC Roofing Contractors" })).toBe(true);
    expect(
      isServiceBusiness({
        title: "Smith HVAC Service",
        additional_categories: ["HVAC contractor", "Heating supply"],
      }),
    ).toBe(true);
  });
});

describe("generate-leads handler", () => {
  const savedLogin = process.env.DATAFORSEO_LOGIN;
  const savedPassword = process.env.DATAFORSEO_PASSWORD;

  beforeEach(() => {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  });

  afterEach(() => {
    if (savedLogin) process.env.DATAFORSEO_LOGIN = savedLogin;
    else delete process.env.DATAFORSEO_LOGIN;
    if (savedPassword) process.env.DATAFORSEO_PASSWORD = savedPassword;
    else delete process.env.DATAFORSEO_PASSWORD;
  });

  it("405s on non-POST", async () => {
    const res = await handler(makeRequest({}, "GET"), {} as never);
    expect(res.status).toBe(405);
  });

  it("400s on missing city/industry", async () => {
    const res = await handler(makeRequest({ city: "" }), {} as never);
    expect(res.status).toBe(400);
  });

  it("returns setup_required when DataForSEO env is missing", async () => {
    const res = await handler(makeRequest({ city: "Huntsville", state: "AL", industry: "Roofing" }), {} as never);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; missing: string[]; leads: unknown[] };
    expect(data.status).toBe("setup_required");
    expect(data.missing).toEqual(expect.arrayContaining(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]));
    expect(data.leads).toEqual([]);
  });
});
