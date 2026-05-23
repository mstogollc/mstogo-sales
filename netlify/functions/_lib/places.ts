import { getEnv } from "./env";

export type PlaceIndicatorLevel = "green" | "yellow" | "red";

export interface PlaceSignal {
  label: string;
  level: PlaceIndicatorLevel;
  detail: string;
}

export interface PlaceProfile {
  matched: boolean;
  placeId?: string;
  name?: string;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  internationalPhone?: string;
  website?: string;
  businessStatus?: string;
  categories?: string[];
  primaryCategory?: string;
  googleMapsUri?: string;
  signals: PlaceSignal[];
  overall: PlaceIndicatorLevel;
  summary: string;
  rawError?: string;
}

interface PlacesSearchResponse {
  places?: Array<{ id?: string; displayName?: { text?: string } }>;
  error?: { message?: string };
}

interface PlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  error?: { message?: string };
}

const PLACES_BASE = "https://places.googleapis.com/v1";

const SEARCH_FIELD_MASK = "places.id,places.displayName";
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
].join(",");

export interface PlacesLookupInput {
  businessName?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
}

function buildQuery(input: PlacesLookupInput): string | undefined {
  const parts = [input.businessName, input.address, input.city, input.state].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  if (parts.length === 0 && input.website) return input.website;
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}

function unmatchedProfile(reason: string): PlaceProfile {
  return {
    matched: false,
    signals: [
      {
        label: "Google Business Profile",
        level: "red",
        detail: reason,
      },
    ],
    overall: "red",
    summary:
      "No verified Google Business Profile match. This is a red flag for local visibility — prospect likely needs profile claim, optimization, and review-velocity work.",
  };
}

function deriveSignals(d: PlaceDetailsResponse): {
  signals: PlaceSignal[];
  overall: PlaceIndicatorLevel;
  summary: string;
} {
  const signals: PlaceSignal[] = [];

  const rating = typeof d.rating === "number" ? d.rating : undefined;
  const count = typeof d.userRatingCount === "number" ? d.userRatingCount : 0;

  if (rating === undefined) {
    signals.push({
      label: "Star rating",
      level: "red",
      detail: "No public star rating on Google. Reputation engine is not running.",
    });
  } else if (rating >= 4.5) {
    signals.push({
      label: "Star rating",
      level: "green",
      detail: `${rating.toFixed(1)}★ — strong reputation signal for local SEO.`,
    });
  } else if (rating >= 4.0) {
    signals.push({
      label: "Star rating",
      level: "yellow",
      detail: `${rating.toFixed(1)}★ — solid but coachable. We can lift this with review prompts and response cadence.`,
    });
  } else {
    signals.push({
      label: "Star rating",
      level: "red",
      detail: `${rating.toFixed(1)}★ — hurting conversion. Reputation cleanup is a fast win.`,
    });
  }

  if (count === 0) {
    signals.push({
      label: "Review volume",
      level: "red",
      detail: "Zero reviews on file. Buyers will skip past this listing.",
    });
  } else if (count < 25) {
    signals.push({
      label: "Review volume",
      level: "yellow",
      detail: `${count} reviews — below the trust threshold for most categories.`,
    });
  } else if (count < 100) {
    signals.push({
      label: "Review volume",
      level: "yellow",
      detail: `${count} reviews — competitive, but ranking leaders usually clear 100+.`,
    });
  } else {
    signals.push({
      label: "Review volume",
      level: "green",
      detail: `${count} reviews — established social proof.`,
    });
  }

  if (d.websiteUri) {
    signals.push({
      label: "Website on profile",
      level: "green",
      detail: "Website link is live on Google Business Profile.",
    });
  } else {
    signals.push({
      label: "Website on profile",
      level: "red",
      detail: "No website on the Google Business Profile — direct conversion path is broken.",
    });
  }

  const phone = d.internationalPhoneNumber || d.nationalPhoneNumber;
  if (phone) {
    signals.push({
      label: "Phone listed",
      level: "green",
      detail: "Phone number is publicly listed on Google.",
    });
  } else {
    signals.push({
      label: "Phone listed",
      level: "yellow",
      detail: "No phone on profile — call tracking and mobile click-to-call are unavailable.",
    });
  }

  if (d.businessStatus && d.businessStatus !== "OPERATIONAL") {
    signals.push({
      label: "Business status",
      level: "red",
      detail: `Google reports this listing as ${d.businessStatus}. Verify before outreach.`,
    });
  } else if (d.businessStatus === "OPERATIONAL") {
    signals.push({
      label: "Business status",
      level: "green",
      detail: "Google reports the listing as operational.",
    });
  }

  if (d.formattedAddress) {
    signals.push({
      label: "Address",
      level: "green",
      detail: "Verified address on file.",
    });
  } else {
    signals.push({
      label: "Address",
      level: "yellow",
      detail: "Address not surfaced on the profile.",
    });
  }

  const reds = signals.filter((s) => s.level === "red").length;
  const yellows = signals.filter((s) => s.level === "yellow").length;
  let overall: PlaceIndicatorLevel;
  if (reds >= 2) overall = "red";
  else if (reds === 1 || yellows >= 2) overall = "yellow";
  else overall = "green";

  const summary = (() => {
    if (overall === "green") {
      return `Strong Google footprint — ${rating?.toFixed(1) ?? "—"}★ across ${count} reviews. Lead with growth strategy, not cleanup.`;
    }
    if (overall === "yellow") {
      return `Mixed signals on Google. There is room to tighten reputation, listings, and the call-to-action path before scaling spend.`;
    }
    return `Foundational gaps on Google. Profile health and reputation need to be fixed before paid demand will convert.`;
  })();

  return { signals, overall, summary };
}

export async function fetchPlaceProfile(
  input: PlacesLookupInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceProfile> {
  const apiKey = getEnv("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return {
      matched: false,
      signals: [
        {
          label: "Google Places",
          level: "yellow",
          detail: "Places enrichment not configured for this environment.",
        },
      ],
      overall: "yellow",
      summary: "Places enrichment is offline. Analysis is based on other signals only.",
    };
  }

  const textQuery = buildQuery(input);
  if (!textQuery) {
    return unmatchedProfile("Not enough business identity supplied to search Google.");
  }

  try {
    const searchRes = await fetchImpl(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount: 1 }),
    });

    if (!searchRes.ok) {
      const body = (await searchRes.json().catch(() => ({}))) as PlacesSearchResponse;
      return {
        ...unmatchedProfile("Google did not return a confident match."),
        rawError: body.error?.message || `places_search_${searchRes.status}`,
      };
    }

    const searchBody = (await searchRes.json()) as PlacesSearchResponse;
    const top = searchBody.places?.[0];
    if (!top?.id) {
      return unmatchedProfile("No Google Business Profile matched this lead.");
    }

    const detailsRes = await fetchImpl(`${PLACES_BASE}/places/${encodeURIComponent(top.id)}`, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": DETAILS_FIELD_MASK,
      },
    });

    if (!detailsRes.ok) {
      const body = (await detailsRes.json().catch(() => ({}))) as PlaceDetailsResponse;
      return {
        ...unmatchedProfile("Could not load Google Business Profile detail."),
        rawError: body.error?.message || `places_details_${detailsRes.status}`,
      };
    }

    const d = (await detailsRes.json()) as PlaceDetailsResponse;
    const { signals, overall, summary } = deriveSignals(d);

    return {
      matched: true,
      placeId: d.id,
      name: d.displayName?.text,
      rating: d.rating,
      userRatingCount: d.userRatingCount,
      formattedAddress: d.formattedAddress,
      internationalPhone: d.internationalPhoneNumber || d.nationalPhoneNumber,
      website: d.websiteUri,
      businessStatus: d.businessStatus,
      categories: d.types,
      primaryCategory: d.primaryTypeDisplayName?.text || d.primaryType,
      googleMapsUri: d.googleMapsUri,
      signals,
      overall,
      summary,
    };
  } catch (err) {
    return {
      ...unmatchedProfile("Places lookup failed."),
      rawError: err instanceof Error ? err.message : "unknown_places_error",
    };
  }
}
