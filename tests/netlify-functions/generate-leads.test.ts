import { describe, it, expect, beforeEach, afterEach } from "vitest";
import handler, {
  fitScore,
  packageFor,
  industryToSearchPhrase,
  isInMarket,
  isServiceBusiness,
  classifyGeo,
  filterRawItems,
  matchesIndustry,
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

describe("classifyGeo / Gulfport MS Dental scenario", () => {
  const ctx = {
    cityLower: "gulfport",
    stateAbbr: "MS",
    stateName: "Mississippi",
    radiusMiles: 45,
    center: { lat: 30.3674, lng: -89.0928 },
  };

  it("accepts an item with MS region and Gulfport coords", () => {
    expect(
      classifyGeo(
        {
          title: "Gulf Coast Family Dentistry",
          address_info: { region: "MS", city: "Gulfport", country_code: "US" },
          latitude: 30.37,
          longitude: -89.09,
        },
        ctx,
      ),
    ).toBe("in");
  });

  it("accepts items whose region is the full state name", () => {
    expect(
      classifyGeo(
        {
          title: "Coastal Smiles Dental",
          address_info: { region: "Mississippi", city: "Gulfport", country_code: "US" },
        },
        ctx,
      ),
    ).toBe("in");
  });

  it("accepts items where region is empty but the address string carries the state+zip", () => {
    expect(
      classifyGeo(
        {
          title: "Gulfport Dental Care",
          address: "1234 Main St, Gulfport, MS 39501",
        },
        ctx,
      ),
    ).toBe("in");
  });

  it("accepts nearby Biloxi address inside the 45mi radius even without explicit MS region", () => {
    expect(
      classifyGeo(
        {
          title: "Biloxi Smiles",
          address_info: { city: "Biloxi", address: "100 Howard Ave, Biloxi MS" },
          latitude: 30.396,
          longitude: -88.885,
        },
        ctx,
      ),
    ).toBe("in");
  });

  it("rejects an out-of-radius item with valid MS region (Jackson is >100mi from Gulfport)", () => {
    expect(
      classifyGeo(
        {
          title: "Jackson Dental Group",
          address_info: { region: "MS", city: "Jackson", country_code: "US" },
          latitude: 32.2988,
          longitude: -90.1848,
        },
        ctx,
      ),
    ).toBe("out");
  });

  it("rejects items in a different state even when coords are within radius", () => {
    expect(
      classifyGeo(
        {
          title: "Mobile Dentistry",
          address_info: { region: "AL", country_code: "US" },
          latitude: 30.5,
          longitude: -88.5,
        },
        ctx,
      ),
    ).toBe("out");
  });

  it("does NOT falsely reject an item just because its street contains another state's name", () => {
    expect(
      classifyGeo(
        {
          title: "Washington Ave Dental",
          address: "2200 Washington Ave, Gulfport, MS 39507",
        },
        ctx,
      ),
    ).toBe("in");
  });

  it("returns no_geo when item has no usable address fields at all", () => {
    expect(classifyGeo({ title: "Mystery Dental" }, ctx)).toBe("no_geo");
  });

  it("filterRawItems keeps no_geo items when city+state was provided by the caller", () => {
    const items = [
      { title: "Gulfport Dental Care", address: "1234 Main St, Gulfport, MS 39501" },
      { title: "Coastal Smiles Dental", address_info: { region: "MS", city: "Gulfport", country_code: "US" } },
      {
        title: "Mobile Dentistry",
        address_info: { region: "AL", country_code: "US" },
        latitude: 30.5,
        longitude: -88.5,
      },
      { title: "Generic Dental", address: "" },
    ];
    const result = filterRawItems(items, {
      ...ctx,
      industry: "Dental",
      includeNoGeoWhenCityStateProvided: true,
    });
    expect(result.kept.length).toBeGreaterThanOrEqual(3);
    expect(result.rejectedOutOfState).toBe(1);
  });

  it("filterRawItems counts industry mismatches separately for Dental queries", () => {
    const items = [
      { title: "Gulfport Family Dentistry", address: "1 Pine St, Gulfport, MS 39501" },
      { title: "Coast Auto Repair", address: "2 Oak St, Gulfport, MS 39501", category: "Auto repair" },
    ];
    const result = filterRawItems(items, {
      ...ctx,
      industry: "Dental",
      includeNoGeoWhenCityStateProvided: true,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.rejectedIndustryMismatch).toBe(1);
  });

  it("filterRawItems counts retail rejections separately for service queries", () => {
    const items = [
      { title: "Coast Dental Supply", category: "Dental supply store" },
      { title: "Coast Family Dentistry", address: "1 Pine St, Gulfport, MS 39501" },
    ];
    const result = filterRawItems(items, {
      ...ctx,
      industry: "Dental",
      includeNoGeoWhenCityStateProvided: true,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.rejectedRetail).toBe(1);
  });

  it("reproduces the live bug fix: 75 raw varied-format Gulfport dentals yield nonzero kept", () => {
    const rawItems = [
      { title: "Gulfport Family Dentistry", address: "1234 Main St, Gulfport, MS 39501" },
      { title: "Coastal Smiles Dental", address_info: { region: "MS", city: "Gulfport", country_code: "US" } },
      { title: "Dr. Smith DDS", address_info: { region: "Mississippi", city: "Gulfport" } },
      { title: "Biloxi Bay Dentistry", latitude: 30.396, longitude: -88.885, address_info: { city: "Biloxi" } },
      { title: "Ocean Springs Smile Center", address_info: { region: "MS", city: "Ocean Springs" }, latitude: 30.41, longitude: -88.83 },
      { title: "Long Beach Dentistry", address: "100 Beach Blvd, Long Beach, MS 39560" },
      { title: "Washington Ave Dental", address: "2200 Washington Ave, Gulfport, MS 39507" },
      { title: "Pascagoula Pediatric Dentistry", address_info: { region: "MS", city: "Pascagoula" }, latitude: 30.366, longitude: -88.556 },
    ];
    const result = filterRawItems(rawItems, {
      cityLower: "gulfport",
      stateAbbr: "MS",
      stateName: "Mississippi",
      radiusMiles: 45,
      center: { lat: 30.3674, lng: -89.0928 },
      industry: "Dental",
      includeNoGeoWhenCityStateProvided: true,
    });
    expect(result.kept.length).toBeGreaterThan(0);
    expect(result.rejectedOutOfState).toBe(0);
  });

  it("does not falsely reject in-state items when address contains numbered street that looks like a state abbr (e.g. 'in 100')", () => {
    expect(
      classifyGeo(
        {
          title: "Test Dental",
          address: "100 In Way, Gulfport, MS 39501",
        },
        ctx,
      ),
    ).toBe("in");
  });
});

describe("matchesIndustry", () => {
  it("accepts dental clinics for a Dental query", () => {
    expect(matchesIndustry({ title: "Coast Family Dentistry", category: "Dentist" }, "Dental")).toBe(true);
  });

  it("rejects auto-repair shop for a Dental query", () => {
    expect(matchesIndustry({ title: "Coast Auto Repair", category: "Auto repair" }, "Dental")).toBe(false);
  });

  it("does not constrain non-professional industries", () => {
    expect(matchesIndustry({ title: "ABC Roofing" }, "Roofing")).toBe(true);
  });
});

describe("isInMarket back-compat (legacy boolean wrapper)", () => {
  it("returns true for Gulfport MS dental with state-name region (was previously rejected)", () => {
    const ok = isInMarket(
      {
        title: "Coastal Smiles Dental",
        address_info: { region: "Mississippi", city: "Gulfport", country_code: "US" },
      },
      {
        cityLower: "gulfport",
        stateAbbr: "MS",
        stateName: "Mississippi",
        radiusMiles: 45,
        center: { lat: 30.3674, lng: -89.0928 },
      },
    );
    expect(ok).toBe(true);
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
