import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson, serverError } from "./_lib/http";
import { fetchPlaceProfile, type PlaceProfile } from "./_lib/places";
import { fetchDataForSeoSnapshot, type DataForSeoSnapshot } from "./_lib/dataforseo";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND, recommendPackage } from "./_lib/brand";

interface AnalyzeBody {
  businessName?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
}

function fallbackNarrative(
  body: AnalyzeBody,
  place: PlaceProfile,
  seo: DataForSeoSnapshot,
): string {
  const lines: string[] = [];
  const label = body.businessName || place.name || "this business";
  lines.push(`Quick read on ${label}.`);
  lines.push(place.summary);
  if (seo.organicKeywordCount !== undefined) {
    lines.push(
      `SEO snapshot: ranking for ~${seo.organicKeywordCount.toLocaleString()} keywords with an estimated ${Math.round(
        seo.organicTrafficEstimate ?? 0,
      ).toLocaleString()} monthly organic visits.`,
    );
  } else if (seo.configured) {
    lines.push("SEO snapshot pending — no domain footprint found yet.");
  }
  lines.push(
    "Next step for the rep: lead with the highest-impact gap above, anchor to MS2GO's stack, and ask for the discovery call.",
  );
  return lines.join("\n\n");
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: AnalyzeBody;
  try {
    body = await readJson<AnalyzeBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  if (!body.businessName && !body.website) {
    return badRequest("missing_required_fields", {
      detail: "Provide at least businessName or website.",
    });
  }

  try {
    const [place, seo] = await Promise.all([
      fetchPlaceProfile({
        businessName: body.businessName,
        website: body.website,
        address: body.address,
        city: body.city,
        state: body.state,
      }),
      fetchDataForSeoSnapshot(body.website),
    ]);

    const recommended = recommendPackage({
      overall: place.overall,
      reviewCount: place.userRatingCount,
    });

    const narrativePrompt = [
      `Lead: ${body.businessName || place.name || "Unknown"}`,
      body.website ? `Website: ${body.website}` : null,
      body.city || body.state ? `Location: ${[body.city, body.state].filter(Boolean).join(", ")}` : null,
      `Google Profile: ${place.matched ? "matched" : "no match"} (${place.overall})`,
      place.rating !== undefined
        ? `Rating: ${place.rating.toFixed(1)}★ across ${place.userRatingCount ?? 0} reviews`
        : null,
      place.website ? `Profile website: ${place.website}` : null,
      seo.organicKeywordCount !== undefined
        ? `Organic keywords: ${seo.organicKeywordCount}, est. monthly traffic: ${Math.round(seo.organicTrafficEstimate ?? 0)}`
        : null,
      body.notes ? `Rep notes: ${body.notes}` : null,
      `Recommended package: ${recommended.tier} ($${recommended.price}/mo)`,
    ]
      .filter(Boolean)
      .join("\n");

    const ai = await chat(
      [
        {
          role: "system",
          content:
            "You are an MS2GO sales strategist. Write a tight, plain-English read on the lead for a sales rep. " +
            "Three short paragraphs: (1) what's working, (2) what's hurting them, (3) the one move to lead with. " +
            "Do not mention APIs, models, prompts, or any implementation detail. Stay in the rep's voice.",
        },
        { role: "user", content: narrativePrompt },
      ],
      { temperature: 0.5, maxTokens: 500 },
      () => fallbackNarrative(body, place, seo),
    );

    return ok({
      lead: {
        businessName: body.businessName,
        website: body.website,
        address: body.address,
        city: body.city,
        state: body.state,
      },
      placeProfile: place,
      seoSnapshot: seo,
      recommendation: {
        tier: recommended.tier,
        price: recommended.price,
        cadence: recommended.cadence,
        summary: recommended.summary,
      },
      packages: MS2GO_BRAND.packages,
      narrative: ai.text,
      narrativeSource: ai.source,
    });
  } catch (err) {
    return serverError("analyze_failed", {
      detail: err instanceof Error ? err.message : "unknown_error",
    });
  }
};
