import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { getEnv } from "./_lib/env";
import {
  buildGeoGrid,
  rankToHeat,
  averageRank,
  topThreeShare,
  type GeoPoint,
  type HeatLevel,
} from "./_lib/geo-grid";

interface HeatMapBody {
  businessName?: string;
  keyword?: string;
  city?: string;
  state?: string;
  address?: string;
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
  keyword?: string;
  center?: GeoPoint;
  gridSize: number;
  stepMiles: number;
  cells: HeatCell[];
  averageRank: number | null;
  topThreeShare: number;
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
  const gridSize = Math.max(3, Math.min(7, Math.floor(body.gridSize ?? 5)));
  const stepMiles = Math.max(0.25, Math.min(10, body.stepMiles ?? 1));
  const keyword = (body.keyword || body.businessName || "").trim();

  const base: HeatMapResult = {
    configured: false,
    status: "setup_required",
    message:
      "Map Pack Heat Map is ready to turn on. Once Google Places and DataForSEO are connected for this workspace, every search will plot exactly where this business ranks across the neighborhood.",
    businessName: body.businessName,
    keyword: keyword || undefined,
    gridSize,
    stepMiles,
    cells: [],
    averageRank: null,
    topThreeShare: 0,
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
    keyword: keyword || undefined,
    center,
    gridSize,
    stepMiles,
    cells,
    averageRank: avg,
    topThreeShare: share,
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
  return ok(result as unknown as Record<string, unknown>);
};
