import { describe, expect, it } from "vitest";
import {
  buildGeoGrid,
  rankToHeat,
  averageRank,
  bestRank,
  worstRank,
  topThreeShare,
  topTenShare,
  weakZoneShare,
} from "./geo-grid";

describe("buildGeoGrid", () => {
  it("builds a size*size grid centered on the point", () => {
    const center = { lat: 30.36, lng: -89.09 };
    const grid = buildGeoGrid(center, 5, 1);
    expect(grid).toHaveLength(25);
    const middle = grid.find((c) => c.row === 2 && c.col === 2)!;
    expect(middle.lat).toBeCloseTo(center.lat, 5);
    expect(middle.lng).toBeCloseTo(center.lng, 5);
  });

  it("places row 0 north of the center and clamps absurd sizes", () => {
    const center = { lat: 30, lng: -89 };
    const grid = buildGeoGrid(center, 3, 2);
    const north = grid.find((c) => c.row === 0 && c.col === 1)!;
    const south = grid.find((c) => c.row === 2 && c.col === 1)!;
    expect(north.lat).toBeGreaterThan(center.lat);
    expect(south.lat).toBeLessThan(center.lat);
    expect(buildGeoGrid(center, 99, 1)).toHaveLength(81); // clamped to 9
  });
});

describe("rankToHeat", () => {
  it("maps ranks to the 4-color scale at every boundary", () => {
    // green: 1–3
    expect(rankToHeat(1)).toBe("green");
    expect(rankToHeat(3)).toBe("green");
    // blue: 4–7
    expect(rankToHeat(4)).toBe("blue");
    expect(rankToHeat(7)).toBe("blue");
    // yellow: 8–15
    expect(rankToHeat(8)).toBe("yellow");
    expect(rankToHeat(15)).toBe("yellow");
    // red: 16+ and unranked
    expect(rankToHeat(16)).toBe("red");
    expect(rankToHeat(50)).toBe("red");
    expect(rankToHeat(null)).toBe("red");
    expect(rankToHeat(undefined)).toBe("red");
    expect(rankToHeat(0)).toBe("red");
    expect(rankToHeat(-1)).toBe("red");
  });
});

describe("averageRank", () => {
  it("ignores unranked cells", () => {
    expect(averageRank([1, 3, null, 5])).toBe(3);
    expect(averageRank([null, null])).toBeNull();
  });
});

describe("bestRank / worstRank", () => {
  it("returns the strongest and weakest visible rank", () => {
    expect(bestRank([5, 2, null, 9])).toBe(2);
    expect(worstRank([5, 2, null, 9])).toBe(9);
  });
  it("returns null when nothing ranks", () => {
    expect(bestRank([null, 0, undefined])).toBeNull();
    expect(worstRank([null, 0, undefined])).toBeNull();
  });
});

describe("topThreeShare", () => {
  it("computes share of top-3 cells as a percentage", () => {
    expect(topThreeShare([1, 2, 3, 10])).toBe(75);
    expect(topThreeShare([null, 11, 12])).toBe(0);
    expect(topThreeShare([])).toBe(0);
  });
});

describe("topTenShare", () => {
  it("computes share of top-10 cells as a percentage", () => {
    expect(topTenShare([1, 5, 10, 11])).toBe(75);
    expect(topTenShare([null, 16, 20])).toBe(0);
    expect(topTenShare([])).toBe(0);
  });
});

describe("weakZoneShare", () => {
  it("counts red cells (16+ or unranked) as opportunity zones", () => {
    // 16 and null are red; 3 and 8 are not.
    expect(weakZoneShare([3, 8, 16, null])).toBe(50);
    expect(weakZoneShare([1, 2, 3])).toBe(0);
    expect(weakZoneShare([])).toBe(0);
  });
});
