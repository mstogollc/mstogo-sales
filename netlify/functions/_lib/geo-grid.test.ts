import { describe, expect, it } from "vitest";
import { buildGeoGrid, rankToHeat, averageRank, topThreeShare } from "./geo-grid";

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
  it("maps ranks to heat levels", () => {
    expect(rankToHeat(1)).toBe("green");
    expect(rankToHeat(3)).toBe("green");
    expect(rankToHeat(7)).toBe("yellow");
    expect(rankToHeat(15)).toBe("red");
    expect(rankToHeat(null)).toBe("red");
    expect(rankToHeat(0)).toBe("red");
  });
});

describe("averageRank", () => {
  it("ignores unranked cells", () => {
    expect(averageRank([1, 3, null, 5])).toBe(3);
    expect(averageRank([null, null])).toBeNull();
  });
});

describe("topThreeShare", () => {
  it("computes share of top-3 cells as a percentage", () => {
    expect(topThreeShare([1, 2, 3, 10])).toBe(75);
    expect(topThreeShare([null, 11, 12])).toBe(0);
    expect(topThreeShare([])).toBe(0);
  });
});
