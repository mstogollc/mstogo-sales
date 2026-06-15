import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { getEnv } from "./_lib/env";
import { currentUser } from "./_lib/supabase";
import { actorFromUser, logUsage } from "./_lib/usage";
import {
  buildGeoGrid,
  rankToHeat,
  averageRank,
  bestRank,
  worstRank,
  topThreeShare,
  topTenShare,
  weakZoneShare,
  type GeoPoint,
  type HeatLevel,
} from "./_lib/geo-grid";

interface HeatMapBody {
  businessName?: string;
  website?: string;
  keyword?: string;
  city?: string;
  state?: string;
  address?: string;
  competitor?: string;
  lat?: number;
  lng?: number;
  gridSize?: number;
  stepMiles?: number;
}

interface HeatCell {
  row: number;
  col: number;
  lat: number;
  lng: number;
  rank: number | null;
  level: HeatLevel;
}

interface HeatMapResult {
  configured: boolean;
  status: "ok" | "setup_required" | "needs_location" | "unavailable";
  message: string;
  businessName?: string;
  website?: string;
  keyword?: string;
  competitor?: string;
  center?: GeoPoint;
  gridSize: number;
  stepMiles: number;
  cells: HeatCell[];
  /** Aggregate ranking metrics across the grid. Null when never ranked. */
  averageRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  topThreeShare: number;
  topTenShare: number;
  /** Share of grid that is red (buried / not found) — the opportunity zones. */
  weakZoneShare: number;
  /** Short, plain-English points a rep can read straight to a prospect. */
  talkingPoints: string[];
}

/**
 * Build plain-English sales talking points from the grid metrics. These never
 * reference internals — they explain what the colors mean and how MS2GO helps.
 */
function buildTalkingPoints(args: {
  topThreeShare: number;
  topTenShare: number;
  weakZoneShare: number;
  bestRank: number | null;
}): string[] {
  const points: string[] = [];
  const { topThreeShare: top3, topTenShare: top10, weakZoneShare: weak, bestRank: best } = args;

  if (top3 >= 1) {
    points.push(
      `This business already lands in Google's local 3-pack across ${top3}% of the area (the green zones) — proof the location can rank, and a base MS2GO can expand.`,
    );
  } else if (best != null) {
    points.push(
      `The best this business does anywhere on the map is #${best}, and it never breaks into the top-3 local pack — the green zones competitors are taking instead.`,
    );
  } else {
    points.push(
      "This business doesn't appear in the local pack anywhere across the area — every searcher nearby is being handed to a competitor right now.",
    );
  }

  if (weak > 0) {
    points.push(
      `${weak}% of the neighborhood is a red zone — searchers there don't see this business at all. That's the gap MS2GO closes by building out local map-pack coverage.`,
    );
  }

  if (top10 > top3) {
    points.push(
      `In the blue and yellow zones the business is close but buried (ranks 4–15) — small reach, reviews, and listing work from MS2GO can push those spots up into the green pack.`,
    );
  }

  points.push(
    "Greener map = more calls. MS2GO grows the green/blue coverage so this business is the one nearby customers see first.",
  );

  return points;
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

async function geocode(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<GeoPoint | null> {
  try {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "places.location",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      places?: Array<{ location?: { latitude?: number; longitude?: number } }>;
    };
    const loc = body.places?.[0]?.location;
    if (typeof loc?.latitude === "number" && typeof loc?.longitude === "number") {
      return { lat: loc.latitude, lng: loc.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

async function rankAtPoint(
  args: { businessName: string; keyword: string; point: GeoPoint; login: string; password: string },
  fetchImpl: typeof fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(
      "https://api.dataforseo.com/v3/serp/google/maps/live/advanced",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: authHeader(args.login, args.password),
        },
        body: JSON.stringify([
          {
            keyword: args.keyword,
            language_code: "en",
            location_coordinate: `${args.point.lat},${args.point.lng},14z`,
            depth: 20,
          },
        ]),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      tasks?: Array<{
        result?: Array<{
          items?: Array<{ rank_absolute?: number; title?: string }>;
        }>;
      }>;
    };
    const items = body.tasks?.[0]?.result?.[0]?.items ?? [];
    const target = args.businessName.toLowerCase();
    for (const item of items) {
      if ((item.title ?? "").toLowerCase().includes(target)) {
        return item.rank_absolute ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function runHeatMap(
  body: HeatMapBody,
  fetchImpl: typeof fetch = fetch,
): Promise<HeatMapResult> {
  // Snap grid size to the offered odd presets (3×3, 5×5, 7×7).
  const requested = Math.floor(body.gridSize ?? 5);
  const gridSize = requested <= 3 ? 3 : requested >= 7 ? 7 : 5;
  const stepMiles = Math.max(0.25, Math.min(10, body.stepMiles ?? 1));
  const keyword = (body.keyword || body.businessName || "").trim();

  const base: HeatMapResult = {
    configured: false,
    status: "setup_required",
    message:
      "Map Pack Heat Map is ready to turn on. Once Google Places and DataForSEO are connected for this workspace, every search will plot exactly where this business ranks across the neighborhood.",
    businessName: body.businessName,
    website: body.website,
    keyword: keyword || undefined,
    competitor: body.competitor,
    gridSize,
    stepMiles,
    cells: [],
    averageRank: null,
    bestRank: null,
    worstRank: null,
    topThreeShare: 0,
    topTenShare: 0,
    weakZoneShare: 0,
    talkingPoints: [],
  };

  const placesKey = getEnv("GOOGLE_PLACES_API_KEY");
  const dfsLogin = getEnv("DATAFORSEO_LOGIN");
  const dfsPassword = getEnv("DATAFORSEO_PASSWORD");

  if (!placesKey || !dfsLogin || !dfsPassword) {
    return base;
  }

  if (!body.businessName?.trim()) {
    return {
      ...base,
      configured: true,
      status: "needs_location",
      message: "Add the business name (and city/state) to plot its local ranking grid.",
    };
  }

  // Resolve the grid center: explicit coordinates win, otherwise geocode.
  let center: GeoPoint | null =
    typeof body.lat === "number" && typeof body.lng === "number"
      ? { lat: body.lat, lng: body.lng }
      : null;

  if (!center) {
    const locationQuery = [body.businessName, body.address, body.city, body.state]
      .filter((p) => p && p.trim())
      .join(" ");
    center = await geocode(locationQuery, placesKey, fetchImpl);
  }

  if (!center) {
    return {
      ...base,
      configured: true,
      status: "needs_location",
      message:
        "We couldn't pin this business on the map yet. Add a city and state (or a full address) and run it again.",
    };
  }

  const grid = buildGeoGrid(center, gridSize, stepMiles);
  const ranks = await Promise.all(
    grid.map((cell) =>
      rankAtPoint(
        { businessName: body.businessName!, keyword: keyword || body.businessName!, point: cell, login: dfsLogin, password: dfsPassword },
        fetchImpl,
      ),
    ),
  );

  const cells: HeatCell[] = grid.map((cell, i) => ({
    row: cell.row,
    col: cell.col,
    lat: cell.lat,
    lng: cell.lng,
    rank: ranks[i],
    level: rankToHeat(ranks[i]),
  }));

  const avg = averageRank(ranks);
  const share = topThreeShare(ranks);
  const top10 = topTenShare(ranks);
  const weak = weakZoneShare(ranks);
  const best = bestRank(ranks);
  const worst = worstRank(ranks);

  return {
    configured: true,
    status: "ok",
    message:
      share >= 60
        ? "Strong local pack coverage. This business owns most of the neighborhood — protect and expand it."
        : share > 0
          ? "Mixed local pack coverage. There's clear room to climb in the cooler zones on the map."
          : "This business isn't showing in the local pack across the area — a wide-open opportunity to win Map Pack visibility.",
    businessName: body.businessName,
    website: body.website,
    keyword: keyword || undefined,
    competitor: body.competitor,
    center,
    gridSize,
    stepMiles,
    cells,
    averageRank: avg,
    bestRank: best,
    worstRank: worst,
    topThreeShare: share,
    topTenShare: top10,
    weakZoneShare: weak,
    talkingPoints: buildTalkingPoints({
      topThreeShare: share,
      topTenShare: top10,
      weakZoneShare: weak,
      bestRank: best,
    }),
  };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: HeatMapBody;
  try {
    body = await readJson<HeatMapBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const result = await runHeatMap(body);

  // Only a status "ok" run actually fired the upstream SERP grid (cost).
  // setup_required / needs_location runs are free and not logged.
  if (result.status === "ok") {
    const me = await currentUser(req);
    await logUsage(actorFromUser(me), {
      actionType: "heat_map_scan",
      provider: "DataForSEO",
      units: result.cells.length,
      metadata: {
        city: body.city,
        state: body.state,
        gridSize: result.gridSize,
        stepMiles: result.stepMiles,
        topThreeShare: result.topThreeShare,
      },
    });
  }

  return ok(result as unknown as Record<string, unknown>);
};
