import { afterEach, beforeAll, describe, expect, it } from "vitest";

// The store guards on `typeof window`. Provide a minimal sessionStorage-backed
// window so we can exercise the persistence path under the default node env
// (no jsdom dependency required).
beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

let setActiveProspect: typeof import("./prospect").setActiveProspect;
let updateActiveProspect: typeof import("./prospect").updateActiveProspect;
let resolveProspectFacts: typeof import("./prospect").resolveProspectFacts;
let missingKeyFacts: typeof import("./prospect").missingKeyFacts;

beforeAll(async () => {
  const mod = await import("./prospect");
  setActiveProspect = mod.setActiveProspect;
  updateActiveProspect = mod.updateActiveProspect;
  resolveProspectFacts = mod.resolveProspectFacts;
  missingKeyFacts = mod.missingKeyFacts;
});

function stored() {
  const raw = (globalThis as unknown as { window: { sessionStorage: { getItem: (k: string) => string | null } } }).window.sessionStorage.getItem(
    "ms2go.activeProspect",
  );
  return raw ? JSON.parse(raw) : null;
}

afterEach(() => {
  setActiveProspect(null);
});

describe("active prospect store", () => {
  it("persists a selected prospect to sessionStorage", () => {
    setActiveProspect({ businessName: "Gulfport Dental", industry: "Dental", state: "MS" });
    expect(stored()).toMatchObject({
      businessName: "Gulfport Dental",
      industry: "Dental",
      state: "MS",
    });
  });

  it("merges fields without dropping existing ones", () => {
    setActiveProspect({ businessName: "Acme Roofing", city: "Huntsville" });
    updateActiveProspect({ linkedinUrl: "https://www.linkedin.com/company/acme" });
    expect(stored()).toMatchObject({
      businessName: "Acme Roofing",
      city: "Huntsville",
      linkedinUrl: "https://www.linkedin.com/company/acme",
    });
  });

  it("clears storage when set to null", () => {
    setActiveProspect({ businessName: "Temp" });
    setActiveProspect(null);
    expect(stored()).toBeNull();
  });
});

describe("resolveProspectFacts", () => {
  it("keeps the selected prospect city as the source of truth", () => {
    const facts = resolveProspectFacts(
      { businessName: "Gulfport Dental", city: "Gulfport", state: "MS" },
      // Analysis disagrees on the city — the selected prospect must win.
      { lead: { city: "Biloxi", state: "MS" } },
    );
    expect(facts.city).toBe("Gulfport");
    expect(facts.businessName).toBe("Gulfport Dental");
  });

  it("fills gaps from analysis without inventing a city", () => {
    const facts = resolveProspectFacts(
      { businessName: "Acme Roofing" },
      { placeProfile: { internationalPhone: "+1 555 0100", primaryCategory: "Roofing" } },
    );
    expect(facts.phone).toBe("+1 555 0100");
    expect(facts.industry).toBe("Roofing");
    // Neither source knew the city, so it stays undefined — not guessed.
    expect(facts.city).toBeUndefined();
  });

  it("does not fall back to demo/analysis data when an active prospect exists", () => {
    const facts = resolveProspectFacts(
      { businessName: "Bayou Plumbing", city: "Biloxi", website: "bayouplumbing.com" },
      { lead: { businessName: "Demo Co", city: "Demoville", website: "example.com" } },
    );
    expect(facts.businessName).toBe("Bayou Plumbing");
    expect(facts.city).toBe("Biloxi");
    expect(facts.website).toBe("bayouplumbing.com");
  });

  it("ignores blank/whitespace prospect fields and falls through to analysis", () => {
    const facts = resolveProspectFacts(
      { businessName: "Reef Cafe", city: "   " },
      { lead: { city: "Pensacola" } },
    );
    expect(facts.city).toBe("Pensacola");
  });
});

describe("missingKeyFacts", () => {
  it("flags a missing city for the review cue", () => {
    expect(missingKeyFacts({ businessName: "Acme" })).toContain("city");
  });

  it("returns nothing when city and state are present", () => {
    expect(missingKeyFacts({ city: "Gulfport", state: "MS" })).toEqual([]);
  });
});
