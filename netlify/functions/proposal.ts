import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";
import {
  MS2GO_BRAND,
  PROPOSAL_SYSTEMS,
  recommendPackage,
  WEBSITE_BUILD,
  START_TODAY,
  usd,
  type MS2GOPackage,
} from "./_lib/brand";
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
 * What each tier adds on top of the one below it, in plain owner-facing terms.
 * This is the detailed cost/investment explanation Justin expects on the
 * investment page — not just a price, but exactly what the money buys at each
 * level. Pricing is locked to the real MS2GO rate card (Basic $300, Growth $750,
 * Premium $2,000) via MS2GO_BRAND.packages.
 */
const TIER_DETAIL: Record<MS2GOPackage["tier"], readonly string[]> = {
  Basic: [
    "Google Business Profile fully optimized and actively managed.",
    "Business directories & listings claimed and standardized everywhere — included in every package.",
    "Reviews & reputation monitoring so new 5-star reviews keep coming in.",
    "Monthly reporting on calls, direction requests, and local visibility.",
  ],
  Growth: [
    "Everything in Basic, plus active demand generation.",
    "Industry SEO & website content tuned to the high-intent terms your buyers actually search.",
    "Paid Ads & Google Local Services Ads managed on your budget — pay for real calls, not clicks.",
    "Reviews & reputation engine plus follow-up / speed-to-lead so no inquiry goes cold.",
  ],
  Premium: [
    "Everything in Growth, plus full sales acceleration.",
    "Multi-channel campaigns and creative production handled end to end.",
    "AI Search Optimization so your business gets named inside AI answers and Google AI Overviews.",
    "A dedicated strategist and priority support driving the whole growth system.",
  ],
};

/**
 * Renders the three monthly MS2GO packages as the "Monthly Service Options"
 * section, with the recommended tier called out and a plain-English breakdown of
 * what each tier buys. Directory visibility is included in every tier — Basic,
 * Growth, and Premium — so this section never positions directories as an add-on
 * or a separate one-time charge.
 */
function monthlyServiceSection(recommendedTier: MS2GOPackage["tier"]): string {
  const lines = [
    "Monthly Service Options — Three Choices",
    "  Launching the website is step one. To keep growing — earning visibility, reviews, and new",
    "  quote requests month after month — most successful businesses invest in ongoing monthly support.",
    "  Pick the level that matches where you want to be a year from now; you can move up or down anytime.",
    "  Every package is month-to-month and includes business directory & listings visibility at no extra cost.",
    "",
  ];
  for (const pkg of MS2GO_BRAND.packages) {
    const star = pkg.tier === recommendedTier ? "  ★ Recommended for you" : "";
    lines.push(`  • ${pkg.tier} — ${usd(pkg.price)}/${pkg.cadence}${star}`);
    lines.push(`      ${pkg.summary}`);
    for (const detail of TIER_DETAIL[pkg.tier]) {
      lines.push(`        – ${detail}`);
    }
    lines.push("");
  }
  lines.push("  No setup fees and no long-term contract — 30 days' notice cancels anytime, every month.");
  return lines.join("\n");
}

/**
 * The one-time website BUILD investment section — the piece Justin flagged as
 * missing from the rebuilt proposal. Standard build $5,000, introductory 50% off
 * to $2,500, 50% deposit ($1,250) to begin, remaining balance due at launch. This
 * is hard-coded from WEBSITE_BUILD so the deterministic fallback alone carries the
 * original package even if the LLM never responds.
 */
function investmentSection(): string {
  return [
    "Investment — Your Website Build",
    `  Our standard website build is ${usd(WEBSITE_BUILD.standard)}. As an introductory partnership offer we are`,
    `  reducing the total investment by 50% to ${usd(WEBSITE_BUILD.introductory)} — so you can launch a real,`,
    "  professionally-built site and start routing quote requests into the business right away.",
    "",
    `  • Website design, development, and launch (all core deliverables) — ${usd(WEBSITE_BUILD.standard)} standard, ${usd(WEBSITE_BUILD.introductory)} introductory`,
    "  • Content collaboration and copy guidance — Included",
    "  • Training, handoff, and a written quick-start guide — Included",
    "  • 30 days of post-launch support for bug fixes — Included",
    "",
    `  Total Website Investment (Introductory Offer — 50% Off): ${usd(WEBSITE_BUILD.introductory)}`,
    `  Payment terms: 50% deposit (${usd(WEBSITE_BUILD.deposit)}) to begin work, with the remaining 50% due at launch.`,
    "  We accept check, ACH, or credit card.",
  ].join("\n");
}

/**
 * Online directory section. Directory visibility is INCLUDED in every monthly
 * package — Basic, Growth, and Premium — so there is no separate directory fee.
 * Higher tiers simply include more active directory management, cleanup, and
 * expansion. This section never prices directories as a one-time charge.
 */
function directorySection(): string {
  return [
    "Online Directory Visibility — Included in Every Package",
    "  Directory visibility is included in every MS2GO package — Basic, Growth, and Premium — at no extra cost.",
    "  We place your business across all the major directories — Google Business Profile, Bing Places, Apple Maps,",
    "  Yelp, BBB, and the major industry-specific directories — with consistent name, address, phone, and",
    "  service-area data. Each package includes the directory foundation appropriate to that tier:",
    "  • Basic — your core listings claimed and standardized everywhere, kept accurate month to month.",
    "  • Growth — everything in Basic, plus active monitoring and expansion across more industry directories.",
    "  • Premium — the most aggressive directory management, cleanup, and expansion we offer, fully hands-off for you.",
    "  Why it matters:",
    "  • Immediate local SEO impact — consistent listings are one of the strongest local ranking signals.",
    "  • AI Search Optimization — listed and recommended inside AI answers (ChatGPT, Google AI Overviews, Perplexity, Gemini).",
    "  • Real lead generation — drives phone calls and map-based visits from buyers ready now.",
  ].join("\n");
}

/**
 * "Start Today" — the day-one investment math. Directory visibility is included
 * in every monthly package, so there is NO separate directory line item. Day one
 * is the introductory website build ($2,500) plus the first month of the
 * recommended Premium package ($2,000) = $4,500 to start today. The website build
 * is taken as a 50% deposit ($1,250) to begin with the remaining $1,250 due at
 * launch. Lighter Growth and Basic day-one options are offered too.
 */
function startTodaySection(): string {
  const basic = MS2GO_BRAND.packages.find((p) => p.tier === "Basic")!;
  const growth = MS2GO_BRAND.packages.find((p) => p.tier === "Growth")!;
  const premium = MS2GO_BRAND.packages.find((p) => p.tier === "Premium")!;
  return [
    "Start Today — The Full Package",
    "  If you move forward with the website build today — and add the recommended Premium monthly",
    "  package — here is the complete day-one investment broken out. Directory visibility is already",
    "  included in your monthly package, so there is no separate directory charge:",
    "",
    `  • Website design, development, and launch (introductory 50% off) — ${usd(WEBSITE_BUILD.introductory)}`,
    `  • First month of recommended Premium Package — ${usd(premium.price)}`,
    `  • Total to Start Today — ${usd(START_TODAY.websitePlusPremium)}`,
    "",
    `  How the website build is paid: a 50% deposit (${usd(WEBSITE_BUILD.deposit)}) begins the work and the`,
    `  remaining ${usd(WEBSITE_BUILD.introductory - WEBSITE_BUILD.deposit)} is due at launch. Monthly billing begins on launch day, not at`,
    "  signing — and you can cancel anytime with 30 days' notice. No contract, no handcuffs, ever.",
    "  Prefer a lighter start? Day-one alternatives (website build plus first month):",
    `    – Website + first month Growth (${usd(growth.price)}/mo) — ${usd(WEBSITE_BUILD.introductory + growth.price)}`,
    `    – Website + first month Basic (${usd(basic.price)}/mo) — ${usd(WEBSITE_BUILD.introductory + basic.price)}`,
  ].join("\n");
}

/**
 * The full multi-section MS2GO proposal package — the complete printed proposal a
 * rep walks an owner through, restored to the original Founding Partner structure
 * (the BKC Homes website-build proposal). This is the default print/export output.
 * It honors every grounding rule the intro letter does (verified city only, no
 * invented website, real pricing, the prospect's own business name) and never
 * references Huntsville / North Alabama for an out-of-region prospect.
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
  const industryLabel = industry ? `${industry} business` : "local business";

  // 1. Cover / Prepared For / Prepared By
  const cover = [
    "MS2GO — Marketing Solutions for Local Businesses",
    "WEBSITE DESIGN & DEVELOPMENT PROPOSAL",
    "",
    "Prepared For",
    `  ${business}${place !== "your local market" ? ` · ${place}` : ""}`,
    body.contactName ? `  ${body.contactName}${body.contactRole ? `, ${body.contactRole}` : ""}` : null,
    "",
    "Prepared By",
    `  ${rep}, MS2GO LLC`,
    `  ${repEmail}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // 2. Introduction & Thank You
  const intro = [
    "Introduction & Thank You",
    `  Thank you for the opportunity to put this together. This proposal lays out a complete website`,
    `  build for ${business} — structured to establish credibility, route real quote requests, and give`,
    `  your ${industryLabel} in ${place} an online presence that finally matches the work you do. Honest`,
    "  pricing, a fast timeline, and a partner that earns the relationship every month.",
  ].join("\n");

  // 3. FAST TRACK
  const fastTrack = [
    "FAST TRACK",
    "  We put this project on an accelerated one-week build schedule. From kickoff to a live,",
    "  public-facing website, the total turnaround is seven days — so your new site is live and",
    "  capturing search traffic before your competitors' is.",
  ].join("\n");

  // 4. INTRODUCTORY VALUE
  const introValue = [
    "INTRODUCTORY VALUE",
    `  Our standard website build is priced at ${usd(WEBSITE_BUILD.standard)}. As an introductory partnership`,
    `  offer, we are reducing the investment by 50% to ${usd(WEBSITE_BUILD.introductory)} — so you can launch`,
    "  the site, prove the work, and earn the larger relationship before any bigger conversation.",
  ].join("\n");

  // 5. About MS2GO LLC
  const about = [
    "About MS2GO LLC",
    "  MS2GO is a full-service marketing agency that designs and builds websites that are fast,",
    "  mobile-first, easy to manage, and built to convert quote requests — for the locally-owned",
    "  businesses and trades that define their markets. Beyond launch day, we support clients with",
    "  SEO, paid advertising, social media, and automation so the marketing keeps working long",
    "  after the site goes live.",
  ].join("\n");

  // 6. Website Proposal: What We Will Build (+ where-you-stand signals)
  const signalsList =
    body.topSignals && body.topSignals.length > 0
      ? body.topSignals
          .slice(0, 5)
          .map((s) => `  • ${s.label}: ${s.detail}`)
          .join("\n")
      : "  • Findings to be confirmed on the discovery call.";

  const websiteBuild = body.noWebsite
    ? [
        "Website Proposal: What We Will Build",
        `  You don't have a website yet, and that's the single biggest gap costing you customers — today`,
        "  every search for your business hands a ready-to-buy customer to a competitor who has one. We",
        "  will design, develop, and launch your first professional website so that stops. It will reflect",
        "  your brand, establish credibility, and route quote requests straight to you.",
        "",
        "Where you stand today (no website yet)",
        signalsList,
        "  • Without a website, every search for your business sends a potential customer to a competitor who has one.",
      ].join("\n")
    : [
        "Website Proposal: What We Will Build",
        website
          ? `  We will design, develop, and launch a modern, responsive website for ${business} — replacing`
          : `  We will design, develop, and launch a modern, responsive website for ${business} —`,
        website
          ? `  ${website} with a real, professionally-built site that gives your business the online presence it`
          : "  a real, professionally-built site that gives your business the online presence it",
        "  deserves. It will reflect your brand, establish credibility through reviews and project history,",
        "  and clearly position your services so leads route to the right place automatically.",
        "",
        "Where you stand today",
        website ? [signalsList, `  • Current website: ${website}`].join("\n") : signalsList,
      ].join("\n");

  // 7. Core Deliverables
  const coreDeliverables = [
    "Core Deliverables",
    "  • Custom Design: a unique, professional visual identity built around your brand — tailored, not templated.",
    "  • Mobile-First Responsive Build: pixel-perfect rendering on phones, tablets, and desktops.",
    "  • Fast, SEO-Friendly Code: optimized images, clean markup, fast hosting, Core Web Vitals tuned for Google.",
    "  • Content Strategy & Copy Guidance: messaging structured to build trust and convert your specific buyers.",
    "  • On-Page SEO Foundation: keyword-targeted metadata, schema markup, XML sitemap, and a Google Business Profile audit.",
    "  • Accessibility (WCAG 2.1 AA aware): color contrast, alt text, keyboard navigation, and readable typography.",
    "  • Secure Hosting Setup: SSL certificate, HTTPS, and an environment configured for uptime and speed.",
    "  • Analytics & Tracking: Google Analytics 4, Search Console, and conversion tracking on every form and phone click.",
    "  • CMS: a simple, secure back end so you can update hours, swap photos, and post promotions without touching code.",
    "  • One Round of Revisions Per Page, plus Training & Handoff: a live walkthrough and a written quick-start guide.",
  ].join("\n");

  // 8. Proposed Page Map
  const pageMap = [
    "Proposed Page Map",
    "  Based on what works for successful businesses in your industry — and what your customers actually",
    "  search for — we recommend the following page architecture, mirroring the customer journey from",
    "  research, to trust, to quote request:",
    "  • Home — hero introduction, primary CTAs (Request a Quote + click-to-call), and trust signals.",
    "  • About / Meet the Team — your story and credentials, giving the brand a face from day one.",
    "  • Services — pillar pages for each core service line, each its own SEO ranking opportunity.",
    "  • Service Area — map and city list for the areas you cover.",
    "  • Project Gallery — photo-driven proof of work, the single most powerful trust signal.",
    "  • Reviews & Testimonials — pulled from Google, Facebook, and the directories, collected on-site too.",
    "  • Request a Quote / Contact — embedded quote-request form, click-to-call, click-to-text, map, and hours.",
    "  • Legal — privacy policy, terms of use, accessibility statement, and license/insurance information.",
  ].join("\n");

  // 9. Industry-Standard Features (5 subsections)
  const industryFeatures = [
    "Industry-Standard Features",
    "  Our build incorporates the features your customers expect, and the features Google rewards.",
    "",
    "  Trust & Credibility",
    "    • Owner story and credentials displayed prominently (licensed / insured / bonded where applicable).",
    "    • Project gallery with real photography — replacing any broken or placeholder images.",
    "    • Live review feed pulling from Google, Facebook, BBB, and the major directories.",
    "",
    "  Conversion & Lead Capture",
    "    • Click-to-call buttons pinned on mobile, plus click-to-text for fast quote requests.",
    "    • \"Request a Quote\" CTA above the fold on every page, with a photo-upload field and spam protection.",
    "    • Properly formatted email addresses and a thank-you page with a tracked conversion event.",
    "",
    "  Project & Quote Experience",
    "    • Online quote-request forms routed to the right person automatically.",
    "    • FAQ section that reduces phone-call friction (warranty, process, timeline, financing).",
    "    • Map + directions, hours, and a clear coverage-area list.",
    "",
    "  Local & Industry SEO",
    "    • Optimized for high-intent local terms across your services.",
    "    • Schema markup (LocalBusiness, Service, FAQ, Review) and NAP consistency across every platform.",
    "    • Service-area landing pages — each one a separate ranking opportunity.",
    "",
    "  Performance & Security",
    "    • Core Web Vitals optimized (LCP, INP, CLS), image compression, and modern formats (WebP / AVIF).",
    "    • Backup + restore process, a staging environment, malware scanning, and uptime monitoring.",
  ].join("\n");

  // 16. Why MS2GO
  const whyMs2go = [
    "Why MS2GO",
    "  • Local focus. We specialize in websites for local businesses and understand what wins the quote.",
    "  • Conversion-first design. Every section, button, and headline is placed with one goal: a booked quote request.",
    "  • Human partnership. You work directly with a small team — no call-center support, no ticket queues.",
    "  • Built to grow. Your site is ready to add SEO content, paid-traffic landing pages, and automation without a rebuild.",
    "  • Full ownership. You own the domain, hosting, content, and assets. No long-term contract. No handcuffs.",
  ].join("\n");

  // 17. Next Steps
  const nextSteps = [
    "Next Steps",
    "  1. Review and sign this proposal.",
    `  2. Submit the 50% deposit (${usd(WEBSITE_BUILD.deposit)}).`,
    "  3. Schedule the 30-minute kickoff call.",
    "  4. Provide existing assets (logo, photos, license/insurance docs, service-area preferences).",
    body.goals ? `  Goals we'll target: ${body.goals}` : null,
    `  Questions or changes — reach ${rep} directly at ${repEmail}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // 18. Agreement & Acceptance / signature block
  const agreement = [
    "Agreement & Acceptance",
    "  By signing below, the client agrees to the scope, pricing, and timeline described in this proposal.",
    "  This document serves as a working agreement until a more formal contract is executed, if desired.",
    "",
    "  CLIENT                                   MS2GO LLC",
    `  ${business}                              Justin Pearce, Owner, MS2GO LLC`,
    "  Signature: ______________________        Signature: ______________________",
    "  Date: ___________________________        Date: ___________________________",
  ].join("\n");

  return [
    cover,
    "",
    intro,
    "",
    fastTrack,
    "",
    introValue,
    "",
    about,
    "",
    websiteBuild,
    "",
    coreDeliverables,
    "",
    pageMap,
    "",
    industryFeatures,
    "",
    investmentSection(),
    "",
    monthlyServiceSection(tier.tier),
    "",
    directorySection(),
    "",
    startTodaySection(),
    "",
    notIncludedSection(),
    "",
    timelineSection(),
    "",
    whyMs2go,
    "",
    nextSteps,
    "",
    agreement,
  ].join("\n");
}

/**
 * "What Is Not Included in the Initial Build" — keeps the introductory fee
 * transparent. Pinned to the introductory website price.
 */
function notIncludedSection(): string {
  return [
    "What Is Not Included in the Initial Build",
    `  To keep the initial investment transparent, the ${usd(WEBSITE_BUILD.introductory)} website fee excludes:`,
    "  • Domain registration and renewal (handled directly with the registrar, typically $12–$20/year).",
    "  • Paid software subscriptions (CRMs, scheduling tools, email-marketing platforms, etc.).",
    "  • Stock photography or professional photo/video shoots on location (highly recommended; quoted separately).",
    "  • Logo refinement or a new brand mark (quoted separately if desired).",
    "  • Ongoing monthly services listed above (available as optional add-ons).",
  ].join("\n");
}

/**
 * "Project Timeline — One-Week Fast Track" — the original seven-day schedule.
 */
function timelineSection(): string {
  return [
    "Project Timeline — One-Week Fast Track",
    "  Because every day without a real digital presence is a day of quote requests going to competitors,",
    "  we put this project on an accelerated one-week schedule. From kickoff, the site goes live within seven days.",
    "  • Day 1 — Kickoff call, brand discovery, asset collection, domain/hosting planning, content questionnaire.",
    "  • Day 2 — Homepage design concept finalized; sitemap confirmed; copy drafting begins.",
    "  • Days 3–4 — Full design and build of all pages; schema markup, forms, SEO foundation, analytics implemented.",
    "  • Day 5 — Internal QA across mobile, tablet, and desktop; staging preview sent for your review.",
    "  • Day 6 — Your feedback applied (one consolidated round of revisions); final QA and accessibility pass.",
    "  • Day 7 — Launch day. Site goes live, Google Business Profile linked, training call and quick-start guide delivered.",
    "  Total time from kickoff to launch: 7 days (assumes same-day feedback when reviews are requested).",
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

  const monthlyList = MS2GO_BRAND.packages
    .map((p) => `${p.tier} ${usd(p.price)}/mo`)
    .join(", ");
  const growthSystemList = PROPOSAL_SYSTEMS.map((s) => s.name).join("; ");

  const structure = isIntro
    ? "You are an MS2GO sales strategist writing a short one-page introductory letter. Structure it as: title, " +
      "'Where you stand today', 'What we'll do', 'Investment', 'Goals', and 'Next step'. Keep it under 350 words. "
    : "You are an MS2GO sales strategist writing the complete, multi-section MS2GO website-build proposal package — " +
      "the original Founding Partner proposal. It is a WEBSITE BUILD proposal with monthly options, not a monthly-only " +
      "plan. Use EXACTLY this section order, each as its own headed section:\n" +
      "1. Cover — 'MS2GO — Marketing Solutions for Local Businesses', 'WEBSITE DESIGN & DEVELOPMENT PROPOSAL', " +
      "Prepared For (business + contact), Prepared By (rep + MS2GO LLC + email).\n" +
      "2. Introduction & Thank You — a warm, specific paragraph.\n" +
      "3. FAST TRACK — accelerated one-week (seven-day) build callout.\n" +
      `4. INTRODUCTORY VALUE — standard build ${usd(WEBSITE_BUILD.standard)}, reduced 50% to ${usd(WEBSITE_BUILD.introductory)}.\n` +
      "5. About MS2GO LLC.\n" +
      "6. Website Proposal: What We Will Build — a real, multi-paragraph explanation of the site you'll build (or rebuild), " +
      "plus a short 'Where you stand today' read. If the prospect has no website, frame it as building their first " +
      "professional website and explain why not having one loses customers to competitors.\n" +
      "7. Core Deliverables — custom design, mobile-first build, fast SEO-friendly code, content/copy guidance, on-page SEO " +
      "foundation, accessibility, secure hosting, analytics & tracking, CMS, revisions, training & handoff.\n" +
      "8. Proposed Page Map — recommended page architecture (Home, About, Services, Service Area, Gallery, Reviews, " +
      "Request a Quote / Contact, Legal), each with a one-line purpose.\n" +
      "9. Industry-Standard Features — FIVE subsections, in this order: 'Trust & Credibility', 'Conversion & Lead Capture', " +
      "'Project & Quote Experience', 'Local & Industry SEO', 'Performance & Security'.\n" +
      `10. Investment — the one-time WEBSITE BUILD cost: standard ${usd(WEBSITE_BUILD.standard)}, introductory ${usd(WEBSITE_BUILD.introductory)} ` +
      `(50% off). Payment terms: 50% deposit (${usd(WEBSITE_BUILD.deposit)}) to begin, remaining 50% due at launch. ` +
      "This website build cost is REQUIRED and must appear — it is the piece prior drafts were missing.\n" +
      `11. Monthly Service Options — list ALL three monthly packages (${monthlyList}), mark the recommended one, and under each ` +
      "spell out in plain English what that money buys. Month-to-month, no setup fees, cancel anytime with 30 days' notice. " +
      "Directory visibility is included in every package — never present directories as an add-on or a separate charge.\n" +
      "12. Online Directory Visibility — Included in Every Package. State plainly that directory visibility is included in " +
      "Basic, Growth, and Premium at no extra cost, and that each package includes the directory foundation appropriate to that " +
      "tier (Premium includes the most aggressive management, cleanup, and expansion). Do NOT present any separate one-time or " +
      "annual directory fee.\n" +
      `13. Start Today — the day-one math, with NO separate directory line item (directories are included in the monthly package): ` +
      `website ${usd(WEBSITE_BUILD.introductory)} + first month of recommended Premium (${usd(START_TODAY.premiumFirstMonth)}) = ` +
      `${usd(START_TODAY.websitePlusPremium)} to start today. The website build is a 50% deposit (${usd(WEBSITE_BUILD.deposit)}) to begin ` +
      "with the remaining 50% due at launch. Offer lighter Growth and Basic day-one alternatives (website plus first month) too.\n" +
      `14. What Is Not Included in the Initial Build — keep the ${usd(WEBSITE_BUILD.introductory)} fee transparent.\n` +
      "15. Project Timeline — One-Week Fast Track (Day 1 through Day 7).\n" +
      "16. Why MS2GO.\n" +
      "17. Next Steps — review & sign, submit the deposit, schedule kickoff, provide assets.\n" +
      "18. Agreement & Acceptance — a signature block for the client and 'Justin Pearce, Owner, MS2GO LLC'.\n" +
      "Where it helps, you may reference the MS2GO growth systems (" + growthSystemList + ") inside the relevant sections. " +
      "Aim for two to four pages. Every dollar figure above is fixed — do not change any price. ";

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
    { temperature: 0.55, maxTokens: format === "intro" ? 900 : 3200 },
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
