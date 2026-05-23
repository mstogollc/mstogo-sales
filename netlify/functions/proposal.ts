import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND, recommendPackage } from "./_lib/brand";
import { currentUser, tryPersist } from "./_lib/supabase";

interface ProposalBody {
  businessName?: string;
  contactName?: string;
  contactRole?: string;
  overall?: "green" | "yellow" | "red";
  reviewCount?: number;
  topSignals?: Array<{ label: string; level: "green" | "yellow" | "red"; detail: string }>;
  recommendedTier?: "Basic" | "Growth" | "Premium";
  rep?: { name?: string; email?: string };
  goals?: string;
  leadId?: string;
  prospectId?: string;
}

function fallbackProposal(body: ProposalBody): string {
  const business = body.businessName || "your business";
  const rep = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
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

  return [
    `MS2GO Proposal for ${business}`,
    `Prepared by ${rep}, MS2GO`,
    "",
    "Where you stand today",
    signalsList,
    "",
    "What we'll do",
    `  • Recommended package: ${tier.tier} — $${tier.price}/${tier.cadence}`,
    `  • ${tier.summary}`,
    "",
    `Goals we'll target${body.goals ? ": " + body.goals : "."}`,
    "",
    "Next step",
    "  • 30-minute kickoff this week to align scope and success metrics.",
    "",
    `Questions or changes — reach me directly at ${repEmail}.`,
  ].join("\n");
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
  const rep = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;

  const system =
    "You are an MS2GO sales strategist writing a one-page proposal. Structure it as: title, " +
    "'Where you stand today', 'What we'll do', 'Investment', 'Goals', and 'Next step'. " +
    "Speak in plain English to the business owner. Do not mention APIs, AI, models, or prompts. " +
    "Keep it under 350 words.";

  const userPrompt = [
    `Business: ${body.businessName}`,
    body.contactName ? `Decision maker: ${body.contactName}${body.contactRole ? " (" + body.contactRole + ")" : ""}` : null,
    `Rep: ${rep} (${repEmail})`,
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
            goals: body.goals,
            tier: recommended.tier,
            source: result.source,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      proposalId = data.id;
    });
  }

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
