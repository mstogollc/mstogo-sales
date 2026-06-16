import type { HeatCell, HeatLevel } from "../api";

/**
 * Translate a Map Pack rank into the 4-color heat level. Mirrors the server's
 * `rankToHeat` (netlify/functions/_lib/geo-grid.ts) so the frontend can color a
 * dot from a raw rank even if a cell ever arrives without a `level` field.
 *   green  = 1–3   (in the local 3-pack)
 *   blue   = 4–7   (just outside the pack)
 *   yellow = 8–15  (page-1-ish but buried)
 *   red    = 16+ / not found (effectively invisible)
 */
export function rankToLevel(rank: number | null | undefined): HeatLevel {
  if (rank == null || rank <= 0) return "red";
  if (rank <= 3) return "green";
  if (rank <= 7) return "blue";
  if (rank <= 15) return "yellow";
  return "red";
}

/** Marker fill color per level, sourced from the MS2GO brand palette. */
export const LEVEL_COLOR: Record<HeatLevel, string> = {
  green: "#1f9d55",
  blue: "#0b5fff",
  yellow: "#e6a700",
  red: "#d8362b",
};

export const LEVEL_COPY: Record<HeatLevel, { label: string; range: string }> = {
  green: { label: "Owning it", range: "Ranks 1–3" },
  blue: { label: "Just outside", range: "Ranks 4–7" },
  yellow: { label: "Buried", range: "Ranks 8–15" },
  red: { label: "Invisible", range: "16+ / not found" },
};

export const LEVEL_ORDER: HeatLevel[] = ["green", "blue", "yellow", "red"];

export interface MapPoint {
  lat: number;
  lng: number;
  rank: number | null;
  level: HeatLevel;
  label: string;
  marker: string;
  title: string;
}

function hasValidCoords(cell: HeatCell): boolean {
  return (
    typeof cell.lat === "number" &&
    typeof cell.lng === "number" &&
    Number.isFinite(cell.lat) &&
    Number.isFinite(cell.lng) &&
    Math.abs(cell.lat) <= 90 &&
    Math.abs(cell.lng) <= 180 &&
    !(cell.lat === 0 && cell.lng === 0)
  );
}

/** Short label shown on/next to a dot. Unranked spots read as a dash. */
export function pointLabel(rank: number | null | undefined): string {
  if (rank == null || rank <= 0) return "—";
  return String(rank);
}

/**
 * Text shown inside a map marker. A real rank prints its number; an unranked
 * spot prints "NF" (not found) so the red marker still reads clearly at a glance.
 */
export function markerLabel(rank: number | null | undefined): string {
  if (rank == null || rank <= 0) return "NF";
  return String(rank);
}

/** Human-readable tooltip text for a cell. */
export function pointTitle(rank: number | null | undefined): string {
  if (rank == null || rank <= 0) {
    return "Not found / invisible in the local results at this spot";
  }
  const level = rankToLevel(rank);
  return `Ranks #${rank} here · ${LEVEL_COPY[level].label}`;
}

/**
 * Convert raw API cells into plottable map points. Only cells with real
 * coordinates are kept — this is what guarantees the "no fake data" rule: if the
 * API returns nothing plottable, the result is an empty array and no dots show.
 * Each point's level is taken from the cell when present, otherwise derived from
 * the rank, so a dot is always colored consistently with its rank.
 */
export function toMapPoints(cells: HeatCell[] | null | undefined): MapPoint[] {
  if (!Array.isArray(cells)) return [];
  return cells.filter(hasValidCoords).map((cell) => {
    const level = cell.level ?? rankToLevel(cell.rank);
    return {
      lat: cell.lat,
      lng: cell.lng,
      rank: cell.rank,
      level,
      label: pointLabel(cell.rank),
      marker: markerLabel(cell.rank),
      title: pointTitle(cell.rank),
    };
  });
}

export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Bounding box covering all points, or null when there are none. */
export function boundsOf(points: MapPoint[]): LatLngBounds | null {
  if (points.length === 0) return null;
  let south = points[0].lat;
  let north = points[0].lat;
  let west = points[0].lng;
  let east = points[0].lng;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  return { south, west, north, east };
}
