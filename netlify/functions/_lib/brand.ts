export const MS2GO_BRAND = {
  primaryRep: {
    name: "Joe Pearce",
    title: "Sales Lead, MS2GO",
    defaultEmail: "joe@mstogo.com",
  },
  defaultFromEmail: "sales@ms2go.com",
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
