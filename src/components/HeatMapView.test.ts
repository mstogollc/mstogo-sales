import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MARKER_SIZE_DESKTOP, MARKER_SIZE_MOBILE, MARKER_SIZE_PRINT } from "./HeatMapView";

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

  it("prints markers smaller than the on-screen size so roads stay visible", () => {
    // On paper the road map is the message; a smaller dot keeps streets around
    // each grid point readable. Guard that print size stays below the screen
    // size but is still big enough to show a rank label.
    expect(MARKER_SIZE_PRINT).toBeLessThan(MARKER_SIZE_DESKTOP);
    expect(MARKER_SIZE_PRINT).toBeGreaterThanOrEqual(14);
  });
});

describe("print map reflow wiring (offset / cutoff fix)", () => {
  // The printed map was offset with edge markers clipped because Leaflet kept
  // pixel positions from the on-screen container size. The component must
  // re-measure and re-fit on print. Assert the source wires those handlers.
  const viewSrc = readFileSync(
    fileURLToPath(new URL("./HeatMapView.tsx", import.meta.url)),
    "utf8",
  );

  it("re-measures the map before printing", () => {
    expect(viewSrc).toContain("beforeprint");
    expect(viewSrc).toContain("invalidateSize");
  });

  it("re-fits the points so no grid marker is left outside the print viewport", () => {
    expect(viewSrc).toContain("fitToPointsRef");
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
    const rule = printBlock.slice(at, at + 500);
    expect(rule).toMatch(/background:\s*transparent\s*!important/);
    expect(rule).toMatch(/border:\s*0\s*!important/);
    expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
  });

  it("strips the dark halo baked onto the marker span itself in print", () => {
    // The remaining gray halo the rep saw is the inline box-shadow/ring on the
    // marker span (not the Leaflet wrapper). Print must kill that shadow so the
    // colored dot doesn't obscure the roads around it. !important is required to
    // override the inline style.
    // The same selector also appears in a visibility-only reveal rule, so target
    // the dedicated block by the text-shadow declaration that only this rule has.
    const at = printBlock.indexOf("text-shadow: none !important");
    expect(at).toBeGreaterThan(-1);
    const ruleStart = printBlock.lastIndexOf(".heat-pin-icon span {", at);
    expect(ruleStart).toBeGreaterThan(-1);
    const rule = printBlock.slice(ruleStart, at + 60);
    expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
    expect(rule).toMatch(/text-shadow:\s*none\s*!important/);
  });
});

describe("print map is centered and not clipped", () => {
  const stylesSrc = readFileSync(
    fileURLToPath(new URL("../styles.css", import.meta.url)),
    "utf8",
  );
  const printBlock = stylesSrc.slice(stylesSrc.indexOf("@media print"));

  it("centers the printable map on the page", () => {
    const at = printBlock.indexOf(".heatmap-printable-map {");
    expect(at).toBeGreaterThan(-1);
    const rule = printBlock.slice(at, at + 300);
    // auto side margins center the block within the page content box.
    expect(rule).toMatch(/margin:\s*0\s+auto/);
  });

  it("lets edge markers overflow the map box instead of clipping them", () => {
    const at = printBlock.indexOf(".heatmap-printable-map .heatmap-map {");
    expect(at).toBeGreaterThan(-1);
    const rule = printBlock.slice(at, at + 600);
    expect(rule).toMatch(/overflow:\s*visible/);
  });
});
