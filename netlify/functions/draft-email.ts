import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND } from "./_lib/brand";

interface DraftBody {
  businessName?: string;
  contactName?: string;
  contactRole?: string;
  rep?: { name?: string; email?: string };
  insight?: string;
  recommendedTier?: "Basic" | "Growth" | "Premium";
  tone?: "warm" | "direct" | "consultative";
  intent?: "first_touch" | "follow_up" | "proposal_intro" | "discovery_recap";
}

function fallbackEmail(body: DraftBody): { subject: string; text: string } {
  const business = body.businessName || "your team";
  const repName = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
  const tier = body.recommendedTier || "Growth";
  const insight = body.insight?.trim() || "I noticed a couple of quick wins on your local presence.";
  const subject = `Helping ${business} close a few quick local wins`;
  const text = [
    `Hi ${body.contactName || "there"},`,
    "",
    `I'm ${repName} with MS2GO. ${insight}`,
    "",
    `Based on what I'm seeing, our ${tier} package would line up well — it covers the gap and gives us room to scale once the foundation is solid.`,
    "",
    "Worth a 15-minute call this week to walk you through what we'd do first?",
    "",
    `— ${repName}`,
    `MS2GO · ${repEmail}`,
  ].join("\n");
  return { subject, text };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: DraftBody;
  try {
    body = await readJson<DraftBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const repName = body.rep?.name || MS2GO_BRAND.primaryRep.name;
  const repEmail = body.rep?.email || MS2GO_BRAND.primaryRep.defaultEmail;
  const tier = body.recommendedTier || "Growth";
  const fb = fallbackEmail(body);

  const system =
    "You are drafting a sales email for an MS2GO rep. Output strictly:\n" +
    "Line 1: 'Subject: <subject line under 65 chars>'\n" +
    "Then a blank line, then the email body.\n" +
    "Keep it under 140 words. No emoji. No marketing fluff. No mention of AI, models, or prompts. " +
    "Sign off with the rep's name and MS2GO. Always end with a single, low-friction call to action.";

  const userPrompt = [
    `Rep: ${repName} (${repEmail})`,
    body.contactName ? `Contact: ${body.contactName}${body.contactRole ? ", " + body.contactRole : ""}` : null,
    `Business: ${body.businessName || "(unknown)"}`,
    `Tone: ${body.tone || "consultative"}`,
    `Intent: ${body.intent || "first_touch"}`,
    `Recommended package: ${tier}`,
    body.insight ? `Insight to reference: ${body.insight}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 500 },
    () => `Subject: ${fb.subject}\n\n${fb.text}`,
  );

  const raw = result.text;
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : fb.subject;
  const text = raw.replace(/^Subject:.*\n?/i, "").trim() || fb.text;

  return ok({
    subject,
    text,
    source: result.source,
    rep: { name: repName, email: repEmail },
  });
};
