import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND, recommendPackage } from "./_lib/brand";
import { currentUser, tryPersist } from "./_lib/supabase";
import { actorFromUser, logUsage } from "./_lib/usage";

export interface ProposalBody {
  businessName?: string;
  contactName?: string;
  contactRole?: string;
  city?: string;
  state?: string;
  industry?: string;
  overall?: "green" | "yellow" | "red";
  reviewCount?: number;
  topSignals?: Array<{ label: string; level: "green" | "yellow" | "red"; detail: string }>;
  recommendedTier?: "Basic" | "Growth" | "Premium";
  rep?: { name?: string; email?: string };
  goals?: string;
  noWebsite?: boolean;
  leadId?: string;
  prospectId?: string;
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The location an MS2GO proposal is allowed to name. It comes only from the
 * rep's selected prospect — never inferred. A Gulfport, MS prospect must never
 * see Huntsville / North Alabama copy, so when the city is unknown we emit
 * neutral wording instead of letting the model guess a region.
 */
export function locationPhrase(city?: string, state?: string): string {
  const c = clean(city);
  const s = clean(state);
  if (c) return `${c}${s ? `, ${s}` : ""}`;
  if (s) return s;
  return "your local market";
}

export function fallbackProposal(body: ProposalBody): string {
  const business = body.businessName || "your business";
  const rep = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
  const place = locationPhrase(body.city, body.state);
  const industry = clean(body.industry);
  const tier =
    MS2GO_BRAND.packages.find((p) => p.tier === body.recommendedTier) ||
    recommendPackage({ overall: body.overall || "yellow", reviewCount: body.reviewCount });

  const signalsList =
    body.topSignals && body.topSignals.length > 0
      ? body.topSignals
          .slice(0, 4)
          .map((s) => `  • ${s.label}: ${s.detail}`)
          .join("\n")
      : "  • Findings to be confirmed on the discovery call.";

  const standingHeader = body.noWebsite ? "Where you stand today (no website yet)" : "Where you stand today";
  const standingBody = body.noWebsite
    ? [
        signalsList,
        "  • You don't have a website yet — every search for your business sends a potential customer to a competitor who does.",
      ].join("\n")
    : signalsList;

  const whatWeDo = body.noWebsite
    ? [
        "What we'll do",
        "  • Build your first professional website — fast-loading, mobile-first, and built to convert.",
        `  • Recommended package: ${tier.tier} — $${tier.price}/${tier.cadence}`,
        `  • ${tier.summary}`,
      ].join("\n")
    : [
        "What we'll do",
        `  • Recommended package: ${tier.tier} — $${tier.price}/${tier.cadence}`,
        `  • ${tier.summary}`,
      ].join("\n");

  const intro = industry
    ? `For a ${industry} business in ${place}, here's how MS2GO would move the needle.`
    : `Here's how MS2GO would move the needle for ${business} in ${place}.`;

  return [
    `MS2GO Proposal for ${business}`,
    `Prepared by ${rep}, MS2GO`,
    "",
    intro,
    "",
    standingHeader,
    standingBody,
    "",
    whatWeDo,
    "",
    `Goals we'll target${body.goals ? ": " + body.goals : "."}`,
    "",
    "Next step",
    "  • 30-minute kickoff this week to align scope and success metrics.",
    "",
    `Questions or changes — reach me directly at ${repEmail}.`,
  ].join("\n");
}

/**
 * Builds the system + user prompt for a proposal. Pure and exported so tests can
 * assert that the verified city/state are passed through and that the model is
 * forbidden from inventing a different city or region (the Gulfport→Huntsville bug).
 */
export function buildProposalPrompt(body: ProposalBody): { system: string; user: string } {
  const recommended =
    MS2GO_BRAND.packages.find((p) => p.tier === body.recommendedTier) ||
    recommendPackage({ overall: body.overall || "yellow", reviewCount: body.reviewCount });
  const rep = clean(body.rep?.name) || MS2GO_BRAND.primaryRep.name;
  const repEmail = clean(body.rep?.email) || MS2GO_BRAND.primaryRep.defaultEmail;
  const city = clean(body.city);
  const state = clean(body.state);
  const industry = clean(body.industry);

  const system =
    "You are an MS2GO sales strategist writing a one-page proposal. Structure it as: title, " +
    "'Where you stand today', 'What we'll do', 'Investment', 'Goals', and 'Next step'. " +
    "Speak in plain English to the business owner. Do not mention APIs, AI, models, or prompts.\n" +
    "\n" +
    "CRITICAL — LOCATION:\n" +
    "Only the city and state listed in the verified facts are true about this business. " +
    "You MUST NOT invent, guess, change, or substitute any other city, town, or region. " +
    "Never reference Huntsville, North Alabama, or any region unless it appears verbatim in the verified facts. " +
    "If the city/state are not provided, use neutral wording such as 'your area' or 'your local market' — " +
    "never name a city. Never use placeholder or example data (e.g. 'Anytown', '[City]'). " +
    (body.noWebsite
      ? "This prospect does NOT currently have a website. Never imply they already have one, never reference " +
        "their current site, and do not include any placeholder website URL. Frame the opportunity as MS2GO " +
        "building their first professional website, and treat the missing site as the core gap to close. "
      : "") +
    "Keep it under 350 words.";

  const locationFact =
    city || state ? `Location (the ONLY place you may name): ${locationPhrase(city, state)}` : null;
  const locationMissing =
    !city && !state
      ? "Location: unknown. Do NOT name any city or region — use neutral wording like 'your area'."
      : null;

  const user = [
    `Business: ${body.businessName}`,
    industry ? `Industry / category: ${industry}` : null,
    body.contactName ? `Decision maker: ${body.contactName}${body.contactRole ? " (" + body.contactRole + ")" : ""}` : null,
    `Rep: ${rep} (${repEmail})`,
    locationFact,
    locationMissing,
    body.noWebsite ? "Website status: prospect has no website yet — MS2GO will build their first one." : null,
    `Recommended package: ${recommended.tier} — $${recommended.price}/${recommended.cadence}`,
    `Package summary: ${recommended.summary}`,
    body.goals ? `Stated goals: ${body.goals}` : null,
    body.topSignals && body.topSignals.length
      ? "Top signals:\n" +
        body.topSignals.map((s) => `- [${s.level.toUpperCase()}] ${s.label}: ${s.detail}`).join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: ProposalBody;
  try {
    body = await readJson<ProposalBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  if (!body.businessName) {
    return badRequest("missing_business_name");
  }

  const recommended =
    MS2GO_BRAND.packages.find((p) => p.tier === body.recommendedTier) ||
    recommendPackage({ overall: body.overall || "yellow", reviewCount: body.reviewCount });

  const { system, user: userPrompt } = buildProposalPrompt(body);

  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.55, maxTokens: 900 },
    () => fallbackProposal(body),
  );

  let proposalId: string | null = null;
  const me = await currentUser(req);
  if (me) {
    const tierToPackage: Record<string, "basic" | "growth" | "premium"> = {
      Basic: "basic",
      Growth: "growth",
      Premium: "premium",
    };
    const pkg = tierToPackage[recommended.tier] ?? "growth";
    await tryPersist("proposal", async () => {
      const { data, error } = await me.client
        .from("proposals")
        .insert({
          owner_id: me.id,
          lead_id: body.leadId ?? null,
          prospect_id: body.prospectId ?? null,
          package: pkg,
          monthly_price: recommended.price,
          status: "draft",
          metadata: {
            business_name: body.businessName,
            contact_name: body.contactName,
            city: clean(body.city) ?? null,
            state: clean(body.state) ?? null,
            industry: clean(body.industry) ?? null,
            goals: body.goals,
            tier: recommended.tier,
            no_website: body.noWebsite ?? false,
            source: result.source,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      proposalId = data.id;
    });
  }

  await logUsage(actorFromUser(me), {
    actionType: "ai_proposal_generation",
    provider: "OpenAI/LLM",
    units: 1,
    metadata: {
      source: result.source,
      tier: recommended.tier,
      noWebsite: body.noWebsite ?? false,
    },
  });

  return ok({
    proposal: result.text,
    proposalId,
    source: result.source,
    recommendation: {
      tier: recommended.tier,
      price: recommended.price,
      cadence: recommended.cadence,
      summary: recommended.summary,
    },
  });
};
