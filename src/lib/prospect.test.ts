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

beforeAll(async () => {
  const mod = await import("./prospect");
  setActiveProspect = mod.setActiveProspect;
  updateActiveProspect = mod.updateActiveProspect;
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
