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

export type HeatLevel = "green" | "blue" | "yellow" | "red";

/**
 * Translate a Map Pack rank into a sales-friendly heat level on a 4-color scale.
 * Mirrors the detailed local-ranking grid tools reps are used to seeing:
 *   green  = 1–3   (in the local 3-pack — owning the spot)
 *   blue   = 4–7   (just outside the pack — close, easy to push in)
 *   yellow = 8–15  (page-1-ish but buried — visible only to diggers)
 *   red    = 16+ / not found (effectively invisible at that spot)
 */
export function rankToHeat(rank: number | null | undefined): HeatLevel {
  if (rank == null || rank <= 0) return "red";
  if (rank <= 3) return "green";
  if (rank <= 7) return "blue";
  if (rank <= 15) return "yellow";
  return "red";
}

function visibleRanks(ranks: Array<number | null | undefined>): number[] {
  return ranks.filter((r): r is number => typeof r === "number" && r > 0);
}

/** Average visible rank across cells, ignoring unranked points. */
export function averageRank(ranks: Array<number | null | undefined>): number | null {
  const visible = visibleRanks(ranks);
  if (visible.length === 0) return null;
  const sum = visible.reduce((a, b) => a + b, 0);
  return Math.round((sum / visible.length) * 10) / 10;
}

/** Best (lowest, i.e. strongest) visible rank, or null if never ranked. */
export function bestRank(ranks: Array<number | null | undefined>): number | null {
  const visible = visibleRanks(ranks);
  return visible.length === 0 ? null : Math.min(...visible);
}

/** Worst (highest) visible rank, or null if never ranked. */
export function worstRank(ranks: Array<number | null | undefined>): number | null {
  const visible = visibleRanks(ranks);
  return visible.length === 0 ? null : Math.max(...visible);
}

/** Share of cells where the business appears in the top-3 local pack. */
export function topThreeShare(ranks: Array<number | null | undefined>): number {
  if (ranks.length === 0) return 0;
  const inPack = ranks.filter((r) => typeof r === "number" && r > 0 && r <= 3).length;
  return Math.round((inPack / ranks.length) * 100);
}

/** Share of cells where the business appears in the top-10 results. */
export function topTenShare(ranks: Array<number | null | undefined>): number {
  if (ranks.length === 0) return 0;
  const inTop = ranks.filter((r) => typeof r === "number" && r > 0 && r <= 10).length;
  return Math.round((inTop / ranks.length) * 100);
}

/**
 * Share of cells that are weak/opportunity zones — where the business is buried
 * (rank 16+) or not found at all. These are the red areas a rep should sell against.
 */
export function weakZoneShare(ranks: Array<number | null | undefined>): number {
  if (ranks.length === 0) return 0;
  const weak = ranks.filter((r) => rankToHeat(r) === "red").length;
  return Math.round((weak / ranks.length) * 100);
}
