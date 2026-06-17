export const MS2GO_BRAND = {
  primaryRep: {
    name: "Joe Pearce",
    title: "Sales Lead, MS2GO",
    defaultEmail: "joe@mstogo.com",
  },
  defaultFromEmail: "sales@mstogo.com",
  defaultReplyTo: "joe@mstogo.com",
  packages: [
    {
      tier: "Basic",
      price: 300,
      cadence: "month",
      summary: "Foundational local presence — profile health, listings hygiene, monthly reporting.",
    },
    {
      tier: "Growth",
      price: 750,
      cadence: "month",
      summary: "Active demand generation — reputation engine, content, and paid amplification.",
    },
    {
      tier: "Premium",
      price: 2000,
      cadence: "month",
      summary: "Full sales acceleration — multi-channel campaigns, creative production, dedicated strategist.",
    },
  ],
} as const;

export type MS2GOPackage = (typeof MS2GO_BRAND.packages)[number];

/**
 * One-time website build pricing — the piece Justin flagged as missing from the
 * rebuilt proposal. Standard build is $5,000; the introductory partnership offer
 * is 50% off to $2,500, taken as a 50% deposit ($1,250) to begin with the
 * remaining balance due at launch. These are the original BKC Homes Founding
 * Partner numbers and must appear in BOTH the deterministic fallback and the LLM
 * prompt so a missing model response still produces the original package.
 */
export const WEBSITE_BUILD = {
  standard: 5000,
  introductory: 2500,
  deposit: 1250,
} as const;

/**
 * "Start Today" day-one math. Directory visibility is now included in every
 * monthly package, so there is NO separate directory line item. Day one is the
 * introductory website build plus the first month of the SELECTED package, so
 * the total always matches the package the proposal recommends:
 *   Basic   — website $2,500 + $300   = $2,800
 *   Growth  — website $2,500 + $750   = $3,250
 *   Premium — website $2,500 + $2,000 = $4,500
 * Of the website build, a 50% deposit ($1,250) begins the work and the
 * remaining $1,250 is due at launch.
 */
export const START_TODAY = {
  premiumFirstMonth: MS2GO_BRAND.packages[2].price, // 2000
  websitePlusPremium: WEBSITE_BUILD.introductory + MS2GO_BRAND.packages[2].price, // 4500
} as const;

/**
 * The day-one "Start Today" total for a given tier: the introductory website
 * build plus that tier's first month. Centralized here so the deterministic
 * fallback, the LLM prompt, and the tests can never disagree on the math — the
 * exact bug behind the "$4,500 … Growth $750" drift.
 */
export function startTodayTotal(tier: MS2GOPackage["tier"]): number {
  const pkg = MS2GO_BRAND.packages.find((p) => p.tier === tier) ?? MS2GO_BRAND.packages[1];
  return WEBSITE_BUILD.introductory + pkg.price;
}

export function usd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

/**
 * The growth systems that make up the full MS2GO proposal package. These are the
 * sales-facing sections a printed proposal walks the owner through — what MS2GO
 * actually builds and runs. Every package includes business directories &
 * listings, so directories live here as a standard inclusion, never an add-on.
 */
export const PROPOSAL_SYSTEMS: ReadonlyArray<{ name: string; benefit: string }> = [
  {
    name: "Local SEO & Google Map Pack",
    benefit:
      "We optimize your Google Business Profile and local presence so nearby customers find you first in the Map Pack — driving calls, direction requests, and walk-ins from people ready to buy now.",
  },
  {
    name: "Industry SEO & Website Content",
    benefit:
      "We tune your site's pages and content around the exact services and questions your buyers search for, so you rank for the high-intent terms that bring in your best-fit customers.",
  },
  {
    name: "Business Directories & Listings",
    benefit:
      "Included in every MS2GO package. We claim and standardize your listings across Google, Bing, Apple Maps, Yelp, Facebook, and the major industry directories so your hours, address, and phone are correct everywhere — a core local ranking signal.",
  },
  {
    name: "Paid Ads & Google Local Services Ads",
    benefit:
      "Top-of-page visibility on a controlled budget, plus the Google Guaranteed badge with pay-per-lead pricing — you pay for real calls and messages, not just clicks.",
  },
  {
    name: "AI Search Optimization",
    benefit:
      "We prepare your business to be named and recommended inside AI answers — Google AI Overviews, ChatGPT, and similar — so you win customers your competitors don't even know they're losing.",
  },
  {
    name: "Reviews & Reputation Engine",
    benefit:
      "We help you steadily earn and showcase 5-star reviews, the trust signal that turns searchers into customers and lifts your local ranking at the same time.",
  },
  {
    name: "Follow-Up & Speed-to-Lead",
    benefit:
      "Every new lead and missed call gets an instant response, then a structured follow-up sequence — so leads get answered before they call a competitor and no opportunity slips through.",
  },
];

export function recommendPackage(opts: {
  overall: "green" | "yellow" | "red";
  reviewCount?: number;
}): MS2GOPackage {
  if (opts.overall === "red") return MS2GO_BRAND.packages[1];
  if (opts.overall === "yellow") return MS2GO_BRAND.packages[1];
  if ((opts.reviewCount ?? 0) > 200) return MS2GO_BRAND.packages[2];
  return MS2GO_BRAND.packages[0];
}
