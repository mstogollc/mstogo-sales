import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson, serverError } from "./_lib/http";
import { fetchPlaceProfile, type PlaceProfile } from "./_lib/places";
import {
  fetchDataForSeoSnapshot,
  normalizeDomain,
  type DataForSeoSnapshot,
} from "./_lib/dataforseo";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND, recommendPackage } from "./_lib/brand";
import { currentUser, tryPersist } from "./_lib/supabase";
import { actorFromUser, logUsage } from "./_lib/usage";

interface AnalyzeBody {
  businessName?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
}

// Records which website was used for the SEO lookup and whether it differs
// from what the rep typed. `verifiedWebsite` is the Google-listed website we
// fell back to when the typed domain had no footprint. Surfaced to the rep in
// sales-friendly copy so they never present a false "zero visibility".
export interface WebsiteResolution {
  enteredWebsite?: string;
  enteredDomain?: string;
  verifiedWebsite?: string;
  verifiedDomain?: string;
  usedDomain?: string;
  /** True when we ran SEO against the Google-verified site, not the typed one. */
  usedVerified: boolean;
  mismatch: boolean;
  /** Sales-friendly note for the rep when the domains differ. */
  notice?: string;
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
  if (seo.status === "available" && seo.organicKeywordCount !== undefined) {
    lines.push(
      `SEO snapshot: ranking for ~${seo.organicKeywordCount.toLocaleString()} keywords with an estimated ${Math.round(
        seo.organicTrafficEstimate ?? 0,
      ).toLocaleString()} monthly organic visits.`,
    );
  } else if (seo.status === "unavailable") {
    lines.push(
      "SEO snapshot: search-visibility data isn't available for this site right now — we'll confirm it live before the proposal.",
    );
  } else if (seo.status === "not_configured") {
    lines.push("SEO snapshot: search-visibility check is offline in this environment.");
  }
  lines.push(
    "Next step for the rep: lead with the highest-impact gap above, anchor to MS2GO's stack, and ask for the discovery call.",
  );
  return lines.join("\n\n");
}

function buildResolution(
  enteredWebsite: string | undefined,
  verifiedWebsite: string | undefined,
  usedDomain: string | undefined,
  usedVerified: boolean,
): WebsiteResolution {
  const enteredDomain = normalizeDomain(enteredWebsite);
  const verifiedDomain = normalizeDomain(verifiedWebsite);
  const mismatch =
    Boolean(enteredDomain && verifiedDomain && enteredDomain !== verifiedDomain);
  const notice =
    usedVerified && mismatch
      ? "We found a verified Google listing website that differs from the typed domain and used that website for the SEO visibility check."
      : undefined;
  return {
    enteredWebsite: enteredWebsite || undefined,
    enteredDomain,
    verifiedWebsite: verifiedWebsite || undefined,
    verifiedDomain,
    usedDomain,
    usedVerified,
    mismatch,
    notice,
  };
}

// Resolves the SEO snapshot, preferring the rep-typed domain but falling back
// to the Google-verified profile website when the typed domain returns no
// usable footprint. This is what stops a typo ("adlerpestcontrol.com") from
// reporting false "zero visibility" when the real site
// ("alderpestcontrol.com") ranks well.
export async function resolveSeoSnapshot(
  enteredWebsite: string | undefined,
  place: PlaceProfile,
  fetchImpl: typeof fetch = fetch,
): Promise<{ seo: DataForSeoSnapshot; resolution: WebsiteResolution }> {
  const enteredDomain = normalizeDomain(enteredWebsite);
  const verifiedWebsite = place.website;
  const verifiedDomain = place.websiteDomain;

  const primary = await fetchDataForSeoSnapshot(enteredWebsite, fetchImpl);

  // Has the typed domain given us a real, non-empty footprint?
  const primaryHasFootprint =
    primary.status === "available" && (primary.organicKeywordCount ?? 0) > 0;

  const shouldTryVerified =
    !primaryHasFootprint &&
    Boolean(verifiedDomain) &&
    verifiedDomain !== enteredDomain &&
    primary.status !== "not_configured";

  if (shouldTryVerified) {
    const verified = await fetchDataForSeoSnapshot(verifiedWebsite, fetchImpl);
    const verifiedHasFootprint =
      verified.status === "available" && (verified.organicKeywordCount ?? 0) > 0;
    // Only switch to the verified site if it actually beats the typed one —
    // otherwise keep the primary result so we don't mask a real situation.
    if (verifiedHasFootprint || (verified.status === "available" && primary.status !== "available")) {
      return {
        seo: verified,
        resolution: buildResolution(enteredWebsite, verifiedWebsite, verified.domain, true),
      };
    }
  }

  return {
    seo: primary,
    resolution: buildResolution(enteredWebsite, verifiedWebsite, primary.domain, false),
  };
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
    // Places first: it yields the Google-verified website, which the SEO
    // resolver uses as a fallback when the typed domain has no footprint.
    const place = await fetchPlaceProfile({
      businessName: body.businessName,
      website: body.website,
      address: body.address,
      city: body.city,
      state: body.state,
    });
    const { seo, resolution } = await resolveSeoSnapshot(body.website, place);

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
      resolution.notice ? `Note: ${resolution.notice}` : null,
      seo.status === "available" && seo.organicKeywordCount !== undefined
        ? `Organic keywords: ${seo.organicKeywordCount}, est. monthly traffic: ${Math.round(seo.organicTrafficEstimate ?? 0)}`
        : seo.status === "unavailable"
          ? "Organic search data: not available right now (will confirm live before proposal — do NOT claim zero visibility)."
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

    // Best-effort persistence to Supabase. RLS-respecting (uses caller's JWT).
    let leadId: string | null = null;
    let analysisId: string | null = null;
    const me = await currentUser(req);
    if (me && body.businessName) {
      await tryPersist("analyze-lead.lead", async () => {
        const { data, error } = await me.client
          .from("leads")
          .insert({
            owner_id: me.id,
            business_name: body.businessName!,
            website: body.website,
            address: body.address,
            city: body.city,
            state: body.state,
            status: "analyzed",
            source: "analyze-lead",
            notes: body.notes,
          })
          .select("id")
          .single();
        if (error) throw error;
        leadId = data.id;
      });
      if (leadId) {
        await tryPersist("analyze-lead.analysis", async () => {
          const tierToPackage: Record<string, "basic" | "growth" | "premium"> = {
            Basic: "basic",
            Growth: "growth",
            Premium: "premium",
          };
          const { data, error } = await me.client
            .from("analyses")
            .insert({
              lead_id: leadId,
              created_by: me.id,
              source: "analyze-lead",
              summary: ai.text,
              raw: {
                placeProfile: place,
                seoSnapshot: seo,
                websiteResolution: resolution,
                recommendation: {
                  tier: recommended.tier,
                  package: tierToPackage[recommended.tier],
                  price: recommended.price,
                },
              },
            })
            .select("id")
            .single();
          if (error) throw error;
          analysisId = data.id;
        });
      }
    }

    const actor = actorFromUser(me);
    const briefMeta = {
      city: body.city,
      state: body.state,
      industry: place.primaryCategory,
      hasWebsite: Boolean(body.website),
    };
    await logUsage(actor, {
      actionType: "google_places_enrichment",
      provider: "Google Places",
      units: 1,
      metadata: { matched: place.matched, ...briefMeta },
    });
    if (seo.configured) {
      await logUsage(actor, {
        actionType: "dataforseo_seo_analysis",
        provider: "DataForSEO",
        units: 1,
        metadata: { domain: seo.domain, ...briefMeta },
      });
    }
    await logUsage(actor, {
      actionType: "ai_business_brief",
      provider: "OpenAI/LLM",
      units: 1,
      metadata: { source: ai.source, ...briefMeta },
    });

    return ok({
      lead: {
        businessName: body.businessName,
        website: body.website,
        address: body.address,
        city: body.city,
        state: body.state,
      },
      leadId,
      analysisId,
      placeProfile: place,
      seoSnapshot: seo,
      websiteResolution: resolution,
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
