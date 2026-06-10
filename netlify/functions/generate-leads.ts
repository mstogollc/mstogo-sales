import type { Context } from "@netlify/functions";
import { badRequest, json, methodNotAllowed, ok, readJson } from "./_lib/http";
import { getEnv } from "./_lib/env";
import { currentUser, tryPersist } from "./_lib/supabase";

/**
 * POST /api/generate-leads
 *
 * Live lead search backed by DataForSEO Business Listings. If credentials
 * are missing the function returns a setup-required payload so the UI can
 * show a clear notice rather than silently failing. When a Supabase
 * session is attached the resulting leads are persisted to public.leads
 * on a best-effort basis (RLS-respecting; failures never break the
 * primary response).
 */

interface GenerateLeadsBody {
  city?: string;
  state?: string;
  industry?: string;
  industries?: string[];
  radiusMiles?: number;
  maxCount?: number;
  excludedCategories?: string[];
  persist?: boolean;
}

export interface GeneratedLead {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  state: string;
  hasWebsite: boolean;
  website?: string;
  phone?: string;
  address?: string;
  reviewsCount: number;
  rating: number;
  fitScore: number;
  recommendedPackage: "Basic" | "Growth" | "Premium";
  signal: string;
  source: "dataforseo";
}

const CITY_CENTERS: Record<string, { lat: number; lng: number; state: string }> = {
  huntsville: { lat: 34.7304, lng: -86.5861, state: "AL" },
  madison: { lat: 34.6993, lng: -86.7483, state: "AL" },
  decatur: { lat: 34.6059, lng: -86.9833, state: "AL" },
  athens: { lat: 34.8025, lng: -86.9722, state: "AL" },
  florence: { lat: 34.7998, lng: -87.6773, state: "AL" },
  "muscle shoals": { lat: 34.7448, lng: -87.6675, state: "AL" },
  gulfport: { lat: 30.3674, lng: -89.0928, state: "MS" },
  biloxi: { lat: 30.3960, lng: -88.8853, state: "MS" },
  "ocean springs": { lat: 30.4133, lng: -88.8284, state: "MS" },
  "bay st louis": { lat: 30.3088, lng: -89.3300, state: "MS" },
  "long beach": { lat: 30.3505, lng: -89.1528, state: "MS" },
  pascagoula: { lat: 30.3658, lng: -88.5561, state: "MS" },
  hattiesburg: { lat: 31.3271, lng: -89.2903, state: "MS" },
  jackson: { lat: 32.2988, lng: -90.1848, state: "MS" },
};

const NORTH_AL_NEARBY_CITIES = [
  "huntsville", "madison", "decatur", "athens", "florence", "muscle shoals",
  "hartselle", "meridianville", "harvest", "new market", "owens cross roads",
  "gurley", "toney", "ardmore", "killen", "tuscumbia", "sheffield",
  "russellville", "moulton",
];

const RETAIL_SUPPLY_TOKENS = [
  "supply", "supplies", "wholesale", "wholesaler", "distributor", "distribution",
  "store", "showroom", "parts", "lumber", "hardware", "rental", "rentals",
  "outlet", "depot", "warehouse", "retailer", "retail", "dealer", "dealership",
  "mart", "market",
];

const SERVICE_KEEP_TOKENS = [
  "contractor", "service", "services", "repair", "installation", "installer",
  "plumber", "plumbing", "electrician", "electrical", "roofer", "roofing",
  "hvac", "heating", "cooling", "landscaping", "remodeling", "construction",
  "dentist", "dental", "clinic", "physician", "doctor", "medical", "chiropractor",
  "veterinarian", "veterinary", "law", "attorney", "accountant", "agency",
  "salon", "studio", "advisor", "consultant",
];

const US_STATES: Array<{ name: string; abbr: string }> = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" }, { name: "Arizona", abbr: "AZ" },
  { name: "Arkansas", abbr: "AR" }, { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" }, { name: "Florida", abbr: "FL" },
  { name: "Georgia", abbr: "GA" }, { name: "Hawaii", abbr: "HI" }, { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" }, { name: "Indiana", abbr: "IN" }, { name: "Iowa", abbr: "IA" },
  { name: "Kansas", abbr: "KS" }, { name: "Kentucky", abbr: "KY" }, { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" }, { name: "Maryland", abbr: "MD" }, { name: "Massachusetts", abbr: "MA" },
  { name: "Michigan", abbr: "MI" }, { name: "Minnesota", abbr: "MN" }, { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" }, { name: "Montana", abbr: "MT" }, { name: "Nebraska", abbr: "NE" },
  { name: "Nevada", abbr: "NV" }, { name: "New Hampshire", abbr: "NH" }, { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" }, { name: "New York", abbr: "NY" }, { name: "North Carolina", abbr: "NC" },
  { name: "North Dakota", abbr: "ND" }, { name: "Ohio", abbr: "OH" }, { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" }, { name: "Pennsylvania", abbr: "PA" }, { name: "Rhode Island", abbr: "RI" },
  { name: "South Carolina", abbr: "SC" }, { name: "South Dakota", abbr: "SD" }, { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" }, { name: "Utah", abbr: "UT" }, { name: "Vermont", abbr: "VT" },
  { name: "Virginia", abbr: "VA" }, { name: "Washington", abbr: "WA" }, { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" }, { name: "Wyoming", abbr: "WY" },
];

export function industryToSearchPhrase(industry: string): string {
  const i = industry.toLowerCase();
  if (i.includes("general contractor") || i.includes("home builder")) return "general contractor";
  if (i.includes("roof")) return "roofing contractor";
  if (i.includes("hvac")) return "hvac contractor";
  if (i.includes("plumb")) return "plumbing contractor";
  if (i.includes("electric")) return "electrician";
  if (i.includes("landscap") || i.includes("lawn")) return "landscaping";
  if (i.includes("pest")) return "pest control";
  if (i.includes("pool") || (i.includes("spa") && !i.includes("salon"))) return "pool and spa service";
  if (i.includes("clean")) return "cleaning service";
  if (i.includes("auto repair") || i.includes("auto detail")) return "auto repair";
  if (i.includes("tow")) return "towing service";
  if (i.includes("real estate")) return "real estate agency";
  if (i.includes("property management")) return "property management";
  if (i.includes("storage")) return "self storage";
  if (i.includes("moving") || i.includes("junk")) return "moving company";
  if (i.includes("medical") || i.includes("dental")) return "dentist";
  if (i.includes("chiropractic") || i.includes("physical therapy")) return "chiropractor";
  if (i.includes("veterinary") || i.includes("animal")) return "veterinarian";
  if (i.includes("law")) return "law firm";
  if (i.includes("account") || i.includes("bookkeep")) return "accountant";
  if (i.includes("insurance")) return "insurance agency";
  if (i.includes("financial")) return "financial advisor";
  if (i.includes("fitness") || i.includes("trainer")) return "fitness studio";
  if (i.includes("salon") || i.includes("barber") || i.includes("spa")) return "hair salon";
  if (i.includes("photograph") || i.includes("video")) return "photographer";
  if (i.includes("event") || i.includes("wedding") || i.includes("dj")) return "event services";
  if (i.includes("concrete") || i.includes("painting") || i.includes("flooring")) return "contractor";
  if (i.includes("solar") || i.includes("energy")) return "solar installer";
  if (i.includes("security") || i.includes("alarm")) return "security services";
  return industry.trim();
}

export function fitScore(rating: number, reviews: number, hasWebsite: boolean): number {
  let score = 50;
  score += Math.min(25, Math.round(reviews / 10));
  score += Math.round((rating - 3.5) * 10);
  if (!hasWebsite) score += 10;
  return Math.max(0, Math.min(100, score));
}

export function packageFor(score: number): GeneratedLead["recommendedPackage"] {
  if (score >= 80) return "Premium";
  if (score >= 65) return "Growth";
  return "Basic";
}

function signalFor(hasWebsite: boolean, reviews: number, score: number): string {
  if (!hasWebsite) return "No website — fast win for Basic + intro build";
  if (reviews < 25) return "Thin reviews — directory + social will move them";
  if (score >= 85) return "Strong signals — push Premium";
  return "Decent presence — Growth fits";
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

interface DfsItem {
  title?: string;
  url?: string;
  phone?: string;
  address?: string;
  address_info?: {
    address?: string;
    city?: string;
    region?: string;
    country_code?: string;
    zip?: string;
  };
  latitude?: number;
  longitude?: number;
  rating?: { value?: number; votes_count?: number };
  additional_categories?: string[];
  category?: string;
}

export type GeoDecision = "in" | "out" | "no_geo";

function normalizeRegion(region: string): { abbr: string | null; name: string | null } {
  const r = region.trim().toLowerCase();
  if (!r) return { abbr: null, name: null };
  for (const s of US_STATES) {
    if (r === s.abbr.toLowerCase()) return { abbr: s.abbr, name: s.name };
    if (r === s.name.toLowerCase()) return { abbr: s.abbr, name: s.name };
  }
  return { abbr: null, name: null };
}

function addrHasOtherState(addr: string, targetAbbr: string): string | null {
  if (!addr) return null;
  for (const s of US_STATES) {
    if (s.abbr === targetAbbr) continue;
    const abbrPattern = new RegExp(`(?:^|[,\\s])${s.abbr.toLowerCase()}(?=[\\s,]+\\d{5}(?:-\\d{4})?\\b)`, "i");
    if (abbrPattern.test(addr)) return s.abbr;
  }
  return null;
}

/**
 * Classify a DataForSEO item against the requested market. Returns a
 * tri-state result so callers can distinguish definitive out-of-state
 * rejections from items that lack enough geo data to judge.
 *
 * Rules:
 *  - If country is set and not US → "out".
 *  - If coordinates exist and center is known → distance check first;
 *    state mismatch only rejects when region clearly resolves to another
 *    state (we don't over-reject on stray address tokens).
 *  - If region resolves to the target state → "in".
 *  - If region resolves to another state → "out".
 *  - If address clearly contains "<other-state-abbr> <zip>" trailing
 *    pattern → "out".
 *  - If address or city field mentions the requested city/state → "in".
 *  - Otherwise → "no_geo" (caller decides whether to include with lower
 *    confidence when the query is city+state and provider already
 *    returned a city-scoped result set).
 */
export function classifyGeo(
  item: DfsItem,
  ctx: {
    cityLower: string;
    stateAbbr: string;
    stateName: string;
    radiusMiles: number;
    center: { lat: number; lng: number } | null;
  },
): GeoDecision {
  const country = (item.address_info?.country_code ?? "").toUpperCase();
  if (country && country !== "US") return "out";

  const addr = (
    item.address_info?.address ||
    item.address ||
    [item.address_info?.city, item.address_info?.region, item.address_info?.zip].filter(Boolean).join(", ")
  ).toLowerCase();
  const region = item.address_info?.region ?? "";
  const cityField = (item.address_info?.city ?? "").toLowerCase();
  const stateAbbrLower = ctx.stateAbbr.toLowerCase();
  const stateNameLower = ctx.stateName.toLowerCase();

  const normalized = normalizeRegion(region);

  const hasCoords =
    typeof item.latitude === "number" &&
    typeof item.longitude === "number" &&
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude);

  if (ctx.center && hasCoords) {
    const d = milesBetween(ctx.center, { lat: item.latitude!, lng: item.longitude! });
    if (d > ctx.radiusMiles) return "out";
    if (ctx.stateAbbr && normalized.abbr && normalized.abbr !== ctx.stateAbbr) return "out";
    return "in";
  }

  if (ctx.stateAbbr) {
    if (normalized.abbr === ctx.stateAbbr) return "in";
    if (normalized.abbr && normalized.abbr !== ctx.stateAbbr) return "out";

    const otherStateInAddr = addrHasOtherState(addr, ctx.stateAbbr);
    if (otherStateInAddr) return "out";

    const stateMatchesAddr =
      new RegExp(`(?:^|[,\\s])${stateAbbrLower}(?=[\\s,]+\\d{5}(?:-\\d{4})?\\b)`, "i").test(addr) ||
      new RegExp(`(?:^|[,\\s])${stateAbbrLower}(?=$|[,\\s])`, "i").test(addr) ||
      (stateNameLower && new RegExp(`(?:^|[,\\s])${stateNameLower}(?=$|[,\\s])`, "i").test(addr));

    const cityMatches =
      (ctx.cityLower && cityField.includes(ctx.cityLower)) ||
      (ctx.cityLower && addr.includes(ctx.cityLower));

    if (stateMatchesAddr) {
      if (ctx.stateAbbr === "AL" && ctx.cityLower) {
        if (
          NORTH_AL_NEARBY_CITIES.some((c) => addr.includes(c) || cityField.includes(c)) ||
          cityMatches
        ) {
          return "in";
        }
        return "no_geo";
      }
      return "in";
    }

    if (cityMatches) return "in";
  }

  if (!addr && !region && !cityField) return "no_geo";

  return "no_geo";
}

export function isInMarket(
  item: DfsItem,
  ctx: {
    cityLower: string;
    stateAbbr: string;
    stateName: string;
    radiusMiles: number;
    center: { lat: number; lng: number } | null;
  },
): boolean {
  return classifyGeo(item, ctx) === "in";
}

export function isServiceBusiness(item: DfsItem): boolean {
  const haystack = [item.title ?? "", item.category ?? "", ...(item.additional_categories ?? [])]
    .join(" ")
    .toLowerCase();
  if (!haystack) return true;

  const hasRetailToken = RETAIL_SUPPLY_TOKENS.some((t) =>
    new RegExp(`(?:^|[^a-z])${t}(?:[^a-z]|$)`, "i").test(haystack),
  );
  if (!hasRetailToken) return true;

  const hasServiceToken = SERVICE_KEEP_TOKENS.some((t) =>
    new RegExp(`(?:^|[^a-z])${t}(?:[^a-z]|$)`, "i").test(haystack),
  );

  if (hasServiceToken) {
    const nameOnly = (item.title ?? "").toLowerCase();
    const nameIsRetail = [
      "supply", "supplies", "wholesale", "distributor", "store", "showroom",
      "lumber", "hardware", "depot", "warehouse", "outlet", "mart",
    ].some((t) => new RegExp(`(?:^|[^a-z])${t}(?:[^a-z]|$)`, "i").test(nameOnly));
    return !nameIsRetail;
  }
  return false;
}

const PROFESSIONAL_INDUSTRY_TOKENS: Record<string, string[]> = {
  dental: ["dentist", "dental", "orthodont", "endodont", "periodont", "oral surgeon", "prosthodont"],
  medical: ["doctor", "physician", "clinic", "medical", "urgent care", "family practice"],
  chiropractic: ["chiropract"],
  veterinary: ["veterinarian", "veterinary", "animal hospital", "vet clinic"],
  law: ["law", "attorney", "lawyer", "legal"],
  accounting: ["account", "bookkeep", "cpa", "tax service"],
  insurance: ["insurance"],
  financial: ["financial", "advisor", "wealth", "investment"],
};

function industryHaystack(item: DfsItem): string {
  return [item.title ?? "", item.category ?? "", ...(item.additional_categories ?? [])]
    .join(" ")
    .toLowerCase();
}

/**
 * For "professional" industries like Dental, ensure the listing actually
 * looks like that profession. DataForSEO's keyword search occasionally
 * mixes in adjacent results (e.g. dental supply, dental insurance broker)
 * — we want to drop those but never reject for non-professional
 * industries where the search phrase is already specific enough.
 */
export function matchesIndustry(item: DfsItem, industry: string): boolean {
  const i = industry.toLowerCase();
  let key: string | null = null;
  if (i.includes("dental") || i.includes("dentist")) key = "dental";
  else if (i.includes("medical")) key = "medical";
  else if (i.includes("chiropract")) key = "chiropractic";
  else if (i.includes("veterinary") || i.includes("animal")) key = "veterinary";
  else if (i.includes("law") || i.includes("attorney")) key = "law";
  else if (i.includes("account") || i.includes("bookkeep") || i.includes("cpa")) key = "accounting";
  else if (i.includes("insurance")) key = "insurance";
  else if (i.includes("financial")) key = "financial";

  if (!key) return true;

  const tokens = PROFESSIONAL_INDUSTRY_TOKENS[key];
  const hay = industryHaystack(item);
  if (!hay) return true;
  return tokens.some((t) => hay.includes(t));
}

async function callDataForSeo(
  login: string,
  password: string,
  body: { city: string; state?: string; industry: string; maxCount: number; radiusMiles: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ rawItems: DfsItem[] }> {
  const cityLower = body.city.trim().toLowerCase();
  const center = CITY_CENTERS[cityLower] ?? null;
  const searchPhrase = industryToSearchPhrase(body.industry);
  const radiusKm = Math.max(1, Math.round(body.radiusMiles * 1.60934));

  const taskFields: Record<string, unknown> = {
    description: searchPhrase,
    limit: Math.min(Math.max(body.maxCount * 3, 10), 100),
  };

  if (center) {
    taskFields.location_coordinate = `${center.lat},${center.lng},${radiusKm}`;
  } else {
    taskFields.location_name = body.state
      ? `${body.city},${body.state},United States`
      : `${body.city},United States`;
  }

  const res = await fetchImpl(
    "https://api.dataforseo.com/v3/business_data/business_listings/search/live",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${login}:${password}`).toString("base64"),
      },
      body: JSON.stringify([taskFields]),
    },
  );

  if (!res.ok) throw new Error(`dataforseo_http_${res.status}`);

  const data = (await res.json()) as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{ items?: DfsItem[] }>;
    }>;
  };

  const task = data.tasks?.[0];
  if (task && typeof task.status_code === "number" && task.status_code >= 40000) {
    throw new Error(`dataforseo_task_${task.status_code}_${task.status_message ?? "unknown"}`);
  }

  return { rawItems: task?.result?.[0]?.items ?? [] };
}

function buildLead(it: DfsItem, i: number, body: { city: string; state?: string; industry: string }): GeneratedLead {
  const hasWebsite = Boolean(it.url);
  const rating = it.rating?.value ?? 0;
  const reviews = it.rating?.votes_count ?? 0;
  const score = fitScore(rating, reviews, hasWebsite);
  return {
    id: `dfs_${i}_${Date.now().toString(36)}`,
    businessName: it.title ?? "(unnamed)",
    industry: body.industry,
    city: it.address_info?.city || body.city,
    state: it.address_info?.region || body.state || "",
    hasWebsite,
    website: it.url,
    phone: it.phone,
    address: it.address_info?.address || it.address,
    reviewsCount: reviews,
    rating: Math.round(rating * 10) / 10,
    fitScore: score,
    recommendedPackage: packageFor(score),
    signal: signalFor(hasWebsite, reviews, score),
    source: "dataforseo",
  };
}

export interface FilterResult {
  kept: DfsItem[];
  rejectedOutOfState: number;
  rejectedRetail: number;
  rejectedNoGeo: number;
  rejectedIndustryMismatch: number;
}

/**
 * Apply all filters in order with separate counters. When geography is
 * ambiguous ("no_geo") and the caller indicates the query has a clear
 * city+state, we include the item with lower confidence rather than
 * dropping every result — the provider was already asked for that
 * city/state, so a missing address field is usually noise, not a
 * different market.
 */
export function filterRawItems(
  rawItems: DfsItem[],
  ctx: {
    cityLower: string;
    stateAbbr: string;
    stateName: string;
    radiusMiles: number;
    center: { lat: number; lng: number } | null;
    industry: string;
    includeNoGeoWhenCityStateProvided: boolean;
  },
): FilterResult {
  const kept: DfsItem[] = [];
  let rejectedOutOfState = 0;
  let rejectedRetail = 0;
  let rejectedNoGeo = 0;
  let rejectedIndustryMismatch = 0;

  for (const it of rawItems) {
    const geo = classifyGeo(it, ctx);
    if (geo === "out") {
      rejectedOutOfState++;
      continue;
    }
    if (geo === "no_geo" && !ctx.includeNoGeoWhenCityStateProvided) {
      rejectedNoGeo++;
      continue;
    }
    if (!isServiceBusiness(it)) {
      rejectedRetail++;
      continue;
    }
    if (!matchesIndustry(it, ctx.industry)) {
      rejectedIndustryMismatch++;
      continue;
    }
    kept.push(it);
  }

  return { kept, rejectedOutOfState, rejectedRetail, rejectedNoGeo, rejectedIndustryMismatch };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: GenerateLeadsBody;
  try {
    body = await readJson<GenerateLeadsBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const city = (body.city || "").trim();
  const state = (body.state || "").trim();
  const industry = (body.industry || body.industries?.[0] || "").trim();
  const maxCount = Math.min(Math.max(body.maxCount ?? 25, 1), 50);
  const radiusMiles = Math.min(Math.max(body.radiusMiles ?? 25, 1), 100);

  if (!city || !industry) {
    return badRequest("city_and_industry_required");
  }

  const login = getEnv("DATAFORSEO_LOGIN");
  const password = getEnv("DATAFORSEO_PASSWORD");
  const placesKey = getEnv("GOOGLE_PLACES_API_KEY");

  if (!login || !password) {
    const missing: string[] = [];
    if (!login) missing.push("DATAFORSEO_LOGIN");
    if (!password) missing.push("DATAFORSEO_PASSWORD");
    return ok({
      status: "setup_required",
      missing,
      message:
        "Live lead search requires DataForSEO credentials. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Netlify, then redeploy.",
      placesFallback: placesKey
        ? { configured: true }
        : {
            configured: false,
            note: "Optional Google Places fallback also unset (GOOGLE_PLACES_API_KEY).",
          },
      leads: [],
    });
  }

  try {
    const { rawItems } = await callDataForSeo(login, password, {
      city,
      state,
      industry,
      maxCount,
      radiusMiles,
    });

    const cityLower = city.toLowerCase();
    const stateAbbrUpper = state.toUpperCase();
    const stateNormalized = normalizeRegion(state);
    const stateAbbr = stateNormalized.abbr ?? (stateAbbrUpper.length === 2 ? stateAbbrUpper : "");
    const stateName = stateNormalized.name ?? (US_STATES.find((s) => s.abbr === stateAbbr)?.name ?? "");
    const center = CITY_CENTERS[cityLower]
      ? { lat: CITY_CENTERS[cityLower].lat, lng: CITY_CENTERS[cityLower].lng }
      : null;

    const { kept, rejectedOutOfState, rejectedRetail, rejectedNoGeo, rejectedIndustryMismatch } =
      filterRawItems(rawItems, {
        cityLower,
        stateAbbr,
        stateName,
        radiusMiles,
        center,
        industry,
        includeNoGeoWhenCityStateProvided: Boolean(city && stateAbbr),
      });

    const leads = kept.slice(0, maxCount).map((it, i) => buildLead(it, i, { city, state, industry }));

    let persisted = 0;
    const me = await currentUser(req);
    if (me && leads.length > 0 && body.persist !== false) {
      const rows = leads.map((l) => ({
        owner_id: me.id,
        business_name: l.businessName,
        phone: l.phone ?? null,
        website: l.website ?? null,
        address: l.address ?? null,
        city: l.city || null,
        state: l.state || null,
        industry: l.industry || null,
        source: "dataforseo",
        score: l.fitScore,
        metadata: {
          rating: l.rating,
          reviewsCount: l.reviewsCount,
          recommendedPackage: l.recommendedPackage,
          signal: l.signal,
          radiusMiles,
        },
      }));
      const result = await tryPersist("generate-leads.insert", async () => {
        const { data, error } = await me.client.from("leads").insert(rows).select("id");
        if (error) throw new Error(error.message);
        return data?.length ?? 0;
      });
      if (typeof result === "number") persisted = result;
    }

    if (leads.length === 0) {
      return ok({
        status: "empty",
        provider: "dataforseo",
        message:
          rawItems.length === 0
            ? `DataForSEO returned no businesses for "${industry}" in ${city}${state ? `, ${state}` : ""}.`
            : `DataForSEO returned ${rawItems.length} but none matched after geography/service filtering.`,
        rawCount: rawItems.length,
        filteredCount: 0,
        rejectedOutOfState,
        rejectedRetail,
        rejectedNoGeo,
        rejectedIndustryMismatch,
        leads: [],
        persisted,
      });
    }

    return ok({
      status: "ok",
      provider: "dataforseo",
      rawCount: rawItems.length,
      filteredCount: leads.length,
      rejectedOutOfState,
      rejectedRetail,
      rejectedNoGeo,
      rejectedIndustryMismatch,
      leads,
      persisted,
    });
  } catch (err) {
    return json(502, {
      status: "error",
      provider: "dataforseo",
      message: err instanceof Error ? err.message : "upstream_call_failed",
      leads: [],
    });
  }
};
