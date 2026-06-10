import { describe, it, expect } from "vitest";
import { MS2GO_BRAND, recommendPackage } from "./brand";

describe("MS2GO brand pricing", () => {
  it("exposes Basic $300, Growth $750, Premium $2000", () => {
    const prices = Object.fromEntries(MS2GO_BRAND.packages.map((p) => [p.tier, p.price]));
    expect(prices.Basic).toBe(300);
    expect(prices.Growth).toBe(750);
    expect(prices.Premium).toBe(2000);
  });

  it("defaults Joe Pearce as primary rep", () => {
    expect(MS2GO_BRAND.primaryRep.name).toBe("Joe Pearce");
  });

  it("recommends Growth when overall is red or yellow", () => {
    expect(recommendPackage({ overall: "red" }).tier).toBe("Growth");
    expect(recommendPackage({ overall: "yellow" }).tier).toBe("Growth");
  });

  it("recommends Premium when established and reviewCount is high", () => {
    expect(recommendPackage({ overall: "green", reviewCount: 500 }).tier).toBe("Premium");
  });

  it("recommends Basic for healthy small operators", () => {
    expect(recommendPackage({ overall: "green", reviewCount: 30 }).tier).toBe("Basic");
  });
});
