import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKER_SIZE_DESKTOP, MARKER_SIZE_MOBILE } from "./HeatMapView";

describe("map marker sizing", () => {
  // The markers were once large enough to cover the streets around each grid
  // point. Sales asked for them ~half size so the road map stays readable, so
  // these bounds guard against an accidental regression back to oversized pins.
  it("keeps desktop markers small enough to see the streets around each point", () => {
    expect(MARKER_SIZE_DESKTOP).toBeGreaterThanOrEqual(22);
    expect(MARKER_SIZE_DESKTOP).toBeLessThanOrEqual(28);
  });

  it("keeps mobile markers in the compact range", () => {
    expect(MARKER_SIZE_MOBILE).toBeGreaterThanOrEqual(20);
    expect(MARKER_SIZE_MOBILE).toBeLessThanOrEqual(24);
  });

  it("never draws mobile markers larger than desktop", () => {
    expect(MARKER_SIZE_MOBILE).toBeLessThanOrEqual(MARKER_SIZE_DESKTOP);
  });
});

describe("printable heat map wiring", () => {
  // Vitest runs in a node environment (no DOM), so rather than render the
  // component we assert the source wires the live Leaflet map into the printed
  // page: the map wrap must carry the .heatmap-printable-map class that the
  // print stylesheet reveals, and the print-only heading must be present.
  const heatMapSrc = readFileSync(
    fileURLToPath(new URL("./MapPackHeatMap.tsx", import.meta.url)),
    "utf8",
  );

  it("tags the live map wrap as printable", () => {
    expect(heatMapSrc).toContain("heatmap-printable-map");
  });

  it("includes a print-only map heading", () => {
    expect(heatMapSrc).toContain("heatmap-print-map-heading");
  });

  it("tells the rep to wait for the map before printing", () => {
    expect(heatMapSrc).toContain("Wait for the map to finish loading before printing.");
  });
});
