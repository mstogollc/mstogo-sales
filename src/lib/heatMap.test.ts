import { describe, expect, it } from "vitest";
import type { HeatCell } from "../api";
import {
  boundsOf,
  markerLabel,
  markerTextColor,
  pointLabel,
  pointTitle,
  rankToLevel,
  toMapPoints,
} from "./heatMap";

function cell(partial: Partial<HeatCell>): HeatCell {
  return {
    row: 0,
    col: 0,
    lat: 34.73,
    lng: -86.58,
    rank: 1,
    level: "green",
    ...partial,
  };
}

describe("rankToLevel", () => {
  it("buckets ranks 1-3 as green", () => {
    expect(rankToLevel(1)).toBe("green");
    expect(rankToLevel(3)).toBe("green");
  });
  it("buckets ranks 4-7 as blue", () => {
    expect(rankToLevel(4)).toBe("blue");
    expect(rankToLevel(7)).toBe("blue");
  });
  it("buckets ranks 8-15 as yellow", () => {
    expect(rankToLevel(8)).toBe("yellow");
    expect(rankToLevel(15)).toBe("yellow");
  });
  it("buckets 16+ and not-found as red", () => {
    expect(rankToLevel(16)).toBe("red");
    expect(rankToLevel(99)).toBe("red");
    expect(rankToLevel(null)).toBe("red");
    expect(rankToLevel(0)).toBe("red");
    expect(rankToLevel(undefined)).toBe("red");
  });
});

describe("pointLabel / pointTitle", () => {
  it("labels ranked points with the number", () => {
    expect(pointLabel(5)).toBe("5");
    expect(pointTitle(5)).toContain("#5");
  });
  it("labels unranked points as a dash and invisible title", () => {
    expect(pointLabel(null)).toBe("—");
    expect(pointLabel(0)).toBe("—");
    expect(pointTitle(null).toLowerCase()).toContain("not found");
  });
});

describe("markerLabel", () => {
  it("shows the rank number for ranked points", () => {
    expect(markerLabel(1)).toBe("1");
    expect(markerLabel(12)).toBe("12");
  });
  it("shows NF for unranked / not-found points", () => {
    expect(markerLabel(null)).toBe("NF");
    expect(markerLabel(0)).toBe("NF");
    expect(markerLabel(undefined)).toBe("NF");
  });
});

describe("markerTextColor", () => {
  it("uses dark text on the light yellow fill for contrast", () => {
    expect(markerTextColor("yellow")).toBe("#1a1a1a");
  });
  it("uses white text on the darker green/blue/red fills", () => {
    expect(markerTextColor("green")).toBe("#ffffff");
    expect(markerTextColor("blue")).toBe("#ffffff");
    expect(markerTextColor("red")).toBe("#ffffff");
  });
});

describe("toMapPoints", () => {
  it("keeps only cells with valid coordinates", () => {
    const cells: HeatCell[] = [
      cell({ lat: 34.73, lng: -86.58, rank: 2 }),
      cell({ lat: Number.NaN, lng: -86.58, rank: 3 }),
      cell({ lat: 0, lng: 0, rank: 4 }),
      cell({ lat: 200, lng: -86.58, rank: 5 }),
    ];
    const points = toMapPoints(cells);
    expect(points).toHaveLength(1);
    expect(points[0].rank).toBe(2);
  });

  it("returns an empty array for null/empty input (no fake data)", () => {
    expect(toMapPoints(null)).toEqual([]);
    expect(toMapPoints(undefined)).toEqual([]);
    expect(toMapPoints([])).toEqual([]);
  });

  it("derives level from rank when the cell level is missing", () => {
    const c = cell({ rank: 9 });
    // simulate a cell with no explicit level
    delete (c as Partial<HeatCell>).level;
    const points = toMapPoints([c]);
    expect(points[0].level).toBe("yellow");
  });

  it("preserves an explicit cell level", () => {
    const points = toMapPoints([cell({ rank: 2, level: "green" })]);
    expect(points[0].level).toBe("green");
  });

  it("carries a label, marker text and title for each point", () => {
    const points = toMapPoints([cell({ rank: null, lat: 34.7, lng: -86.6 })]);
    expect(points[0].label).toBe("—");
    expect(points[0].marker).toBe("NF");
    expect(points[0].title.toLowerCase()).toContain("invisible");
  });

  it("carries the rank number as marker text for ranked points", () => {
    const points = toMapPoints([cell({ rank: 6, lat: 34.7, lng: -86.6 })]);
    expect(points[0].marker).toBe("6");
  });

  // Mirrors the live "Adler Pest Control, Madison AL, 5x5" report: the business
  // ranks nowhere, so the API returns 25 not-found cells. Every one of them must
  // still become a plottable red NF marker — null-rank cells are never hidden.
  it("plots all 25 cells of an all-red / not-found 5x5 grid as red NF points", () => {
    const center = { lat: 34.6993, lng: -86.7483 }; // Madison, AL
    const cells: HeatCell[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        cells.push(
          cell({
            row,
            col,
            lat: center.lat + (row - 2) * 0.014,
            lng: center.lng + (col - 2) * 0.017,
            rank: null,
            level: "red",
          }),
        );
      }
    }

    const points = toMapPoints(cells);
    expect(points).toHaveLength(25);
    expect(points.every((p) => p.level === "red")).toBe(true);
    expect(points.every((p) => p.marker === "NF")).toBe(true);
    expect(points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
  });
});

describe("boundsOf", () => {
  it("returns null with no points", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("covers all points", () => {
    const points = toMapPoints([
      cell({ lat: 34.7, lng: -86.6, rank: 1 }),
      cell({ lat: 34.9, lng: -86.4, rank: 2 }),
      cell({ lat: 34.5, lng: -86.8, rank: 3 }),
    ]);
    const b = boundsOf(points)!;
    expect(b.south).toBeCloseTo(34.5);
    expect(b.north).toBeCloseTo(34.9);
    expect(b.west).toBeCloseTo(-86.8);
    expect(b.east).toBeCloseTo(-86.4);
  });
});
