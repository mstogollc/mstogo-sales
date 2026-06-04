import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import { MS2GO_BRAND } from "./_lib/brand";
import { currentUser, tryPersist } from "./_lib/supabase";

/**
 * Verified facts about the prospect's business. These come from the rep's
 * selected lead / active prospect record — the single source of truth. The
 * model is forbidden from inventing or altering any of them, so a wrong city
 * never makes it into a draft.
 */
export interface CompanyFacts {
  businessName?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  industry?: string;
}

export interface DraftBody extends CompanyFacts {
  contactName?: string;
  contactRole?: string;
  rep?: { name?: string; email?: string };
  insight?: string;
  recommendedTier?: "Basic" | "Growth" | "Premium";
  tone?: "warm" | "direct" | "consultative";
  intent?: "first_touch" | "follow_up" | "proposal_intro" | "discovery_recap";
  leadId?: string;
  prospectId?: string;
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Pull only the verified company facts out of the request body. */
export function companyFacts(body: DraftBody): CompanyFacts {
  return {
    businessName: clean(body.businessName),
    website: clean(body.website),
    phone: clean(body.phone),
    address: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    industry: clean(body.industry),
  };
}

/**
 * The fallback never invents location or contact facts. It only uses values
 * the rep actually provided, and falls back to neutral wording otherwise — so
 * a missing city yields generic copy, not a guessed one, and never demo data.
 */
export function fallbackEmail(body: DraftBody): { subject: string; text: string } {
  const facts = companyFacts(body);
  const business = facts.businessName || "your team";
  const repName = clean(body.rep?.name) || MS2GO_BRAND.primaryRep.name;
  const repEmail = clean(body.rep?.email) || MS2GO_BRAND.primaryRep.defaultEmail;
  const tier = body.recommendedTier || "Growth";
  const insight = clean(body.insight) || "I noticed a couple of quick wins on your local presence.";

  // Only reference location when we actually know it.
  const locationPhrase = facts.city
    ? ` here in ${facts.city}${facts.state ? `, ${facts.state}` : ""}`
    : facts.state
      ? ` across ${facts.state}`
      : "";

  const subject = `Helping ${business} close a few quick local wins`;
  const text = [
    `Hi ${clean(body.contactName) || "there"},`,
    "",
    `I'm ${repName} with MS2GO. ${insight}`,
    "",
    `Based on what I'm seeing, our ${tier} package would line up well for a business like ${business}${locationPhrase} — it covers the gap and gives us room to scale once the foundation is solid.`,
    "",
    "Worth a 15-minute call this week to walk you through what we'd do first?",
    "",
    `— ${repName}`,
    `MS2GO · ${repEmail}`,
  ].join("\n");
  return { subject, text };
}

/**
 * Builds the system + user prompt. Kept pure and exported so tests can assert
 * that verified facts are passed through and that the anti-invention guardrails
 * are present without needing a live model.
 */
export function buildPrompt(body: DraftBody): { system: string; user: string; facts: CompanyFacts } {
  const facts = companyFacts(body);
  const repName = clean(body.rep?.name) || MS2GO_BRAND.primaryRep.name;
  const repEmail = clean(body.rep?.email) || MS2GO_BRAND.primaryRep.defaultEmail;
  const tier = body.recommendedTier || "Growth";

  const system =
    "You are drafting a sales email for an MS2GO rep. Output strictly:\n" +
    "Line 1: 'Subject: <subject line under 65 chars>'\n" +
    "Then a blank line, then the email body.\n" +
    "Keep it under 140 words. No emoji. No marketing fluff. No mention of AI, models, or prompts. " +
    "Sign off with the rep's name and MS2GO. Always end with a single, low-friction call to action.\n" +
    "\n" +
    "CRITICAL — COMPANY FACTS:\n" +
    "Only the facts in the 'Verified company facts' section are true about this business. " +
    "You MUST NOT invent, guess, change, or embellish the company's city, state, address, " +
    "website, phone, business name, or industry. If a fact is not listed, it is unknown — " +
    "do not state or imply it. When a location is unknown, use neutral wording such as " +
    "'your area' or 'your local market' rather than naming a city or region. " +
    "Never use placeholder or example data (e.g. 'Anytown', 'example.com', '[City]'). " +
    "Reference a company fact only if it appears verbatim in the verified section.";

  const factLines: string[] = [];
  if (facts.businessName) factLines.push(`Business name: ${facts.businessName}`);
  if (facts.industry) factLines.push(`Industry: ${facts.industry}`);
  if (facts.city) factLines.push(`City: ${facts.city}`);
  if (facts.state) factLines.push(`State: ${facts.state}`);
  if (facts.address) factLines.push(`Address: ${facts.address}`);
  if (facts.website) factLines.push(`Website: ${facts.website}`);
  if (facts.phone) factLines.push(`Phone: ${facts.phone}`);

  const verifiedBlock =
    factLines.length > 0
      ? `Verified company facts (the ONLY facts you may state about this business):\n${factLines.join("\n")}`
      : "Verified company facts: none provided. Do not state any specific company facts; keep the email general.";

  const missing: string[] = [];
  if (!facts.city) missing.push("city");
  if (!facts.state) missing.push("state");
  const missingNote =
    missing.length > 0
      ? `Unknown (do NOT guess these — use neutral wording instead): ${missing.join(", ")}.`
      : null;

  const user = [
    `Rep: ${repName} (${repEmail})`,
    body.contactName ? `Contact: ${body.contactName}${body.contactRole ? ", " + body.contactRole : ""}` : null,
    verifiedBlock,
    missingNote,
    `Tone: ${body.tone || "consultative"}`,
    `Intent: ${body.intent || "first_touch"}`,
    `Recommended package: ${tier}`,
    body.insight ? `Insight to reference: ${body.insight}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, facts };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: DraftBody;
  try {
    body = await readJson<DraftBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const repName = clean(body.rep?.name) || MS2GO_BRAND.primaryRep.name;
  const repEmail = clean(body.rep?.email) || MS2GO_BRAND.primaryRep.defaultEmail;
  const fb = fallbackEmail(body);
  const { system, user } = buildPrompt(body);

  const result = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.6, maxTokens: 500 },
    () => `Subject: ${fb.subject}\n\n${fb.text}`,
  );

  const raw = result.text;
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : fb.subject;
  const text = raw.replace(/^Subject:.*\n?/i, "").trim() || fb.text;

  // Best-effort persistence — only when caller is authenticated and identified
  // a lead/prospect to associate this draft with.
  const me = await currentUser(req);
  if (me && (body.leadId || body.prospectId)) {
    await tryPersist("draft-email", async () => {
      const { error } = await me.client.from("outreach_activity").insert({
        owner_id: me.id,
        lead_id: body.leadId ?? null,
        prospect_id: body.prospectId ?? null,
        channel: "email",
        direction: "outbound",
        subject,
        body: text,
        status: "draft",
        metadata: { source: result.source, intent: body.intent ?? "first_touch" },
      });
      if (error) throw error;
    });
  }

  return ok({
    subject,
    text,
    source: result.source,
    rep: { name: repName, email: repEmail },
  });
};
