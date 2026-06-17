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

describe("print marker box is stripped (no gray square behind printed pins)", () => {
  // The printed map showed a gray/white square behind every colored pin because
  // print color rendering re-painted Leaflet's default .leaflet-div-icon wrapper
  // (white fill + gray border). The print stylesheet must strip that wrapper to
  // transparent with no border, scoped to the printable heat map, so only the
  // colored circle prints. These assertions guard that fix from regressing.
  const stylesSrc = readFileSync(
    fileURLToPath(new URL("../styles.css", import.meta.url)),
    "utf8",
  );

  const printBlock = stylesSrc.slice(stylesSrc.indexOf("@media print"));

  it("targets the Leaflet div-icon wrapper inside the printable map in print", () => {
    expect(printBlock).toMatch(/\.heatmap-printable-map \.leaflet-div-icon/);
  });

  it("forces the printed marker wrapper to a transparent, borderless box", () => {
    // Pull the rule block that strips the wrapper and assert it neutralizes the
    // default gray box (transparent background, no border, no box-shadow).
    const at = printBlock.indexOf(".heatmap-printable-map .leaflet-marker-icon");
    expect(at).toBeGreaterThan(-1);
    const rule = printBlock.slice(at, at + 400);
    expect(rule).toMatch(/background:\s*transparent\s*!important/);
    expect(rule).toMatch(/border:\s*0\s*!important/);
    expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
  });
});
