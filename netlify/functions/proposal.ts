import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND, PROPOSAL_SYSTEMS, recommendPackage, type MS2GOPackage } from "./_lib/brand";
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
  website?: string;
  noWebsite?: boolean;
  leadId?: string;
  prospectId?: string;
  /**
   * "full" (default) builds the complete multi-section MS2GO proposal package.
   * "intro" builds the short one-page introductory letter. Both are available so
   * a rep can lead with the full package or send a light first-touch intro.
   */
  format?: "full" | "intro";
}

export type ProposalFormat = "full" | "intro";

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

/**
 * The short one-page introductory letter. Kept as a separate, explicit output so
 * a rep can send a light first-touch "intro" while the full package remains the
 * default. Sales-facing label in the UI: "Intro letter".
 */
export function introLetterFallback(body: ProposalBody): string {
  const business = body.businessName || "your business";
  const rep = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
  const place = locationPhrase(body.city, body.state);
  const industry = clean(body.industry);
  const website = body.noWebsite ? undefined : clean(body.website);
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
    : website
      ? [signalsList, `  • Current website: ${website}`].join("\n")
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
 * Renders the three MS2GO packages as an "Investment" section, with the
 * recommended tier called out. Directories are included in every tier, so the
 * full proposal never positions them as an add-on.
 */
function investmentSection(recommendedTier: MS2GOPackage["tier"]): string {
  const lines = ["Investment — choose the package that fits your goals"];
  for (const pkg of MS2GO_BRAND.packages) {
    const star = pkg.tier === recommendedTier ? "  ★ Recommended for you" : "";
    lines.push(`  • ${pkg.tier} — $${pkg.price.toLocaleString("en-US")}/${pkg.cadence}${star}`);
    lines.push(`      ${pkg.summary}`);
  }
  lines.push("  • Every package includes business directories & listings management at no extra cost.");
  return lines.join("\n");
}

/**
 * The full multi-section MS2GO proposal package — the complete printed proposal a
 * rep walks an owner through. This is the default print/export output. It honors
 * every grounding rule the intro letter does (verified city only, no invented
 * website, real pricing, the prospect's own business name) and never references
 * Huntsville / North Alabama for an out-of-region prospect.
 */
export function fullProposalFallback(body: ProposalBody): string {
  const business = body.businessName || "your business";
  const rep = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
  const place = locationPhrase(body.city, body.state);
  const industry = clean(body.industry);
  const website = body.noWebsite ? undefined : clean(body.website);
  const tier =
    MS2GO_BRAND.packages.find((p) => p.tier === body.recommendedTier) ||
    recommendPackage({ overall: body.overall || "yellow", reviewCount: body.reviewCount });

  const intro = industry
    ? `MS2GO builds and runs the complete growth system for ${industry} businesses in ${place}. This proposal lays out where ${business} stands today, the systems we'll put to work, and the investment to get there.`
    : `MS2GO builds and runs the complete growth system for local businesses in ${place}. This proposal lays out where ${business} stands today, the systems we'll put to work, and the investment to get there.`;

  const signalsList =
    body.topSignals && body.topSignals.length > 0
      ? body.topSignals
          .slice(0, 5)
          .map((s) => `  • ${s.label}: ${s.detail}`)
          .join("\n")
      : "  • Findings to be confirmed on the discovery call.";

  const standingHeader = body.noWebsite ? "Where you stand today (no website yet)" : "Where you stand today";
  const standingBody = body.noWebsite
    ? [
        signalsList,
        "  • You don't have a website yet — every search for your business sends a potential customer to a competitor who does.",
      ].join("\n")
    : website
      ? [signalsList, `  • Current website: ${website}`].join("\n")
      : signalsList;

  const systemsHeader = "The MS2GO growth system — what we put to work for you";
  const systemsBody = PROPOSAL_SYSTEMS.map((s) => `  • ${s.name}\n      ${s.benefit}`).join("\n");

  const websiteSection = body.noWebsite
    ? [
        "Your website — built from scratch",
        "  • You don't have a website yet, so we start by building your first professional website — fast-loading, mobile-first, and built to turn visitors into calls and booked jobs.",
      ].join("\n")
    : website
      ? [
          "Your website — what we improve",
          `  • We build on your current site (${website}) with conversion best practices: speed, mobile layout, trust signals, and lead capture, then refine it over time.`,
        ].join("\n")
      : [
          "Your website — what we improve",
          "  • We strengthen your site with conversion best practices — speed, mobile layout, trust signals, and lead capture — then refine it over time.",
        ].join("\n");

  return [
    `MS2GO Growth Proposal for ${business}`,
    `Prepared by ${rep}, MS2GO`,
    "",
    intro,
    "",
    standingHeader,
    standingBody,
    "",
    systemsHeader,
    systemsBody,
    "",
    websiteSection,
    "",
    investmentSection(tier.tier),
    "",
    `Goals we'll target${body.goals ? ": " + body.goals : "."}`,
    "",
    "Next step",
    "  • 30-minute kickoff this week to align scope, success metrics, and your start date.",
    "",
    `Questions or changes — reach me directly at ${repEmail}.`,
  ].join("\n");
}

/**
 * Selects the right fallback for the requested format. Defaults to the full
 * package; "intro" returns the one-page introductory letter.
 */
export function fallbackProposal(body: ProposalBody): string {
  return body.format === "intro" ? introLetterFallback(body) : fullProposalFallback(body);
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
  const website = body.noWebsite ? undefined : clean(body.website);
  const isIntro = body.format === "intro";

  const structure = isIntro
    ? "You are an MS2GO sales strategist writing a short one-page introductory letter. Structure it as: title, " +
      "'Where you stand today', 'What we'll do', 'Investment', 'Goals', and 'Next step'. Keep it under 350 words. "
    : "You are an MS2GO sales strategist writing a complete, multi-section growth proposal package. Structure it as: " +
      "title, a short intro paragraph, 'Where you stand today', 'The MS2GO growth system' (cover Local SEO & the " +
      "Google Map Pack, Industry SEO & website content, Business Directories & Listings — included in every package, " +
      "Paid Ads & Google Local Services Ads, AI Search Optimization, Reviews & Reputation, and Follow-Up & Speed-to-Lead), " +
      "a 'Your website' section, 'Investment' that lists all three packages (Basic $300/mo, Growth $750/mo, " +
      "Premium $2,000/mo) and marks the recommended one, 'Goals', and 'Next step'. Directories are included in every " +
      "package — never present them as an add-on. Aim for one to two pages (roughly 500-800 words). ";

  const system =
    structure +
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
      : website
        ? "The business's current website is provided in the verified facts. You may reference that exact URL " +
          "when discussing their current online presence. Never invent, alter, or substitute a different URL, " +
          "and never use a placeholder website. "
        : "If no website is listed in the verified facts, do not invent one or reference any specific URL. ");

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
    !body.noWebsite && website ? `Current website (the ONLY URL you may reference): ${website}` : null,
    `Recommended package: ${recommended.tier} — $${recommended.price}/${recommended.cadence}`,
    `Package summary: ${recommended.summary}`,
    !isIntro
      ? "All packages (list every one in the Investment section):\n" +
        MS2GO_BRAND.packages
          .map(
            (p) =>
              `- ${p.tier} — $${p.price.toLocaleString("en-US")}/${p.cadence}: ${p.summary}` +
              (p.tier === recommended.tier ? " [recommended]" : ""),
          )
          .join("\n")
      : null,
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

  const format: ProposalFormat = body.format === "intro" ? "intro" : "full";
  const { system, user: userPrompt } = buildProposalPrompt(body);

  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.55, maxTokens: format === "intro" ? 900 : 1600 },
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
            website: body.noWebsite ? null : clean(body.website) ?? null,
            goals: body.goals,
            tier: recommended.tier,
            no_website: body.noWebsite ?? false,
            format,
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
      format,
    },
  });

  return ok({
    proposal: result.text,
    proposalId,
    format,
    source: result.source,
    recommendation: {
      tier: recommended.tier,
      price: recommended.price,
      cadence: recommended.cadence,
      summary: recommended.summary,
    },
  });
};
