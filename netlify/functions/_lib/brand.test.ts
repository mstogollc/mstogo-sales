import { describe, it, expect } from "vitest";
import {
  MS2GO_BRAND,
  recommendPackage,
  WEBSITE_BUILD,
  START_TODAY,
} from "./brand";

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

describe("MS2GO website-build pricing (the original Founding Partner numbers)", () => {
  it("prices the one-time website build at $5,000 standard, $2,500 intro, $1,250 deposit", () => {
    expect(WEBSITE_BUILD.standard).toBe(5000);
    expect(WEBSITE_BUILD.introductory).toBe(2500);
    expect(WEBSITE_BUILD.deposit).toBe(1250);
    // The deposit is exactly half the introductory price.
    expect(WEBSITE_BUILD.deposit).toBe(WEBSITE_BUILD.introductory / 2);
  });

  it("no longer encodes a separate $2,000 directory charge in the Start Today math", () => {
    // Directories are now included in every monthly package, so the day-one math
    // must not reintroduce a separate directory line item or the old $6,500 total.
    expect(Object.values(START_TODAY)).not.toContain(6500);
    expect("websitePlusDirectory" in START_TODAY).toBe(false);
    expect("fullPackage" in START_TODAY).toBe(false);
  });

  it("computes Start Today math without a directory charge: website $2,500 + first month Premium $2,000 = $4,500", () => {
    expect(START_TODAY.premiumFirstMonth).toBe(2000);
    expect(START_TODAY.websitePlusPremium).toBe(4500);
    expect(WEBSITE_BUILD.introductory + START_TODAY.premiumFirstMonth).toBe(START_TODAY.websitePlusPremium);
  });
});
