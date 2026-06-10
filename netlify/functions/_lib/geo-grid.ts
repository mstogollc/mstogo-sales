export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GridCell extends GeoPoint {
  /** 0-based row / column within the grid (row 0 = north). */
  row: number;
  col: number;
}

/**
 * Build an odd-sized (size × size) square grid of geo points centered on a
 * business, spaced `stepMiles` apart. Used for Map Pack heat mapping: each cell
 * is a location from which we check where the business ranks in the local pack.
 */
export function buildGeoGrid(center: GeoPoint, size: number, stepMiles: number): GridCell[] {
  const safeSize = Math.max(1, Math.min(9, Math.floor(size)));
  const half = Math.floor(safeSize / 2);
  // Approximate degrees-per-mile. Longitude shrinks with latitude.
  const milesPerDegLat = 69;
  const milesPerDegLng = Math.max(1, 69 * Math.cos((center.lat * Math.PI) / 180));
  const cells: GridCell[] = [];
  for (let row = 0; row < safeSize; row++) {
    for (let col = 0; col < safeSize; col++) {
      const northOffset = (half - row) * stepMiles; // row 0 is northmost
      const eastOffset = (col - half) * stepMiles;
      cells.push({
        row,
        col,
        lat: center.lat + northOffset / milesPerDegLat,
        lng: center.lng + eastOffset / milesPerDegLng,
      });
    }
  }
  return cells;
}

export type HeatLevel = "green" | "yellow" | "red";

/**
 * Translate a Map Pack rank into a sales-friendly heat level.
 * 1–3 (in the pack) = green, 4–10 (page-1-ish) = yellow, 11+/unranked = red.
 */
export function rankToHeat(rank: number | null | undefined): HeatLevel {
  if (rank == null || rank <= 0 || rank > 20) return "red";
  if (rank <= 3) return "green";
  if (rank <= 10) return "yellow";
  return "red";
}

/** Average visible rank across cells, ignoring unranked points. */
export function averageRank(ranks: Array<number | null | undefined>): number | null {
  const visible = ranks.filter((r): r is number => typeof r === "number" && r > 0);
  if (visible.length === 0) return null;
  const sum = visible.reduce((a, b) => a + b, 0);
  return Math.round((sum / visible.length) * 10) / 10;
}

/** Share of cells where the business appears in the top-3 local pack. */
export function topThreeShare(ranks: Array<number | null | undefined>): number {
  if (ranks.length === 0) return 0;
  const inPack = ranks.filter((r) => typeof r === "number" && r > 0 && r <= 3).length;
  return Math.round((inPack / ranks.length) * 100);
}
