/**
 * Curated, sales-ready reference content for the MS2GO Training module.
 *
 * This is intentionally static (not AI-generated) so new reps always have an
 * accurate, on-message explanation of what MS2GO sells and how the follow-up
 * system works — even when the OpenAI integration is unavailable. Each system
 * entry answers three questions a rep must be able to handle on a call:
 *   what it is, what it does for the customer, and how MS2GO maximizes it.
 */

export interface TrainingSystem {
  id: string;
  name: string;
  whatItIs: string;
  customerBenefit: string;
  howMs2goMaximizes: string;
}

export const PACKAGE_SYSTEMS: TrainingSystem[] = [
  {
    id: "seo",
    name: "Search Engine Optimization (SEO)",
    whatItIs:
      "Ongoing work that helps a business show up higher in Google's organic (unpaid) results and in the local Map Pack when nearby customers search for what they sell.",
    customerBenefit:
      "More of the right people find the business without paying for every click. Local SEO especially drives calls, direction requests, and walk-ins from people who are ready to buy right now.",
    howMs2goMaximizes:
      "We optimize the Google Business Profile, fix on-page content and technical issues, build local citations, and track Map Pack ranking with the Heat Map so we can prove movement and double down on the keywords and neighborhoods that convert.",
  },
  {
    id: "paid-ads",
    name: "Paid Ads (Search & Display)",
    whatItIs:
      "Sponsored placements across search engines and partner sites that put the business in front of buyers immediately, on a controlled budget.",
    customerBenefit:
      "Instant visibility and lead flow while slower channels like SEO build. The owner only pays to reach people actively looking, and spend can scale up or down with demand.",
    howMs2goMaximizes:
      "We structure campaigns around high-intent keywords, write conversion-focused ad copy, route traffic to landing pages built to convert, and continuously cut wasted spend so every dollar works harder.",
  },
  {
    id: "google-ads-lsa",
    name: "Google Ads & Local Services Ads (LSA)",
    whatItIs:
      "Google Search Ads plus Local Services Ads — the 'Google Guaranteed' listings at the very top of local results where the business pays per qualified lead, not per click.",
    customerBenefit:
      "Top-of-page placement and the Google Guaranteed badge build instant trust, and pay-per-lead pricing means the owner pays for real phone calls and messages, not just clicks.",
    howMs2goMaximizes:
      "We handle the Google verification and licensing setup, manage the lead inbox, dispute invalid charges, and tune budgets and service areas so the cost per booked job keeps dropping.",
  },
  {
    id: "directories",
    name: "Business Directories & Listings",
    whatItIs:
      "Accurate, consistent business listings across Google, Bing, Apple Maps, Yelp, Facebook, and the major industry directories.",
    customerBenefit:
      "Customers find correct hours, address, and phone everywhere they look, and consistent listings are a core ranking signal that lifts local search visibility.",
    howMs2goMaximizes:
      "We claim and standardize every listing, remove duplicates that confuse Google, and keep details in sync so a number or address change never costs the business a customer.",
  },
  {
    id: "ai-search",
    name: "AI Search Optimization",
    whatItIs:
      "Preparing a business to be found and recommended inside AI-powered search and assistants — Google's AI Overviews, ChatGPT, and similar tools that now answer buyer questions directly.",
    customerBenefit:
      "As more people ask AI instead of scrolling links, the business gets named in the answer. Early movers win recommendations their competitors aren't even aware of yet.",
    howMs2goMaximizes:
      "We structure the website content, FAQs, and reviews so AI systems can confidently understand and cite the business, and we monitor how it's being represented so the story stays accurate.",
  },
  {
    id: "social",
    name: "Facebook / Social Posts & Ads",
    whatItIs:
      "Regular organic posts plus targeted paid campaigns on Facebook and Instagram to keep the business visible and reach new local audiences.",
    customerBenefit:
      "Stays top-of-mind with existing customers and reaches new ones by interest and location — great for promotions, events, and building a local following that refers business.",
    howMs2goMaximizes:
      "We produce on-brand creative, run a consistent posting calendar, and layer in audience-targeted ads with retargeting so the business reaches both new prospects and people who already visited the site.",
  },
  {
    id: "website",
    name: "Website Build & Conversion Systems",
    whatItIs:
      "A fast, mobile-first website engineered not just to look good but to turn visitors into calls, form fills, and booked appointments.",
    customerBenefit:
      "The site becomes a 24/7 salesperson. Clear calls to action, click-to-call, and easy booking mean more of the traffic the business already gets actually becomes revenue.",
    howMs2goMaximizes:
      "We build with conversion best practices baked in — speed, mobile layout, trust signals, and lead capture — then test and refine so the conversion rate keeps climbing over time.",
  },
  {
    id: "follow-up",
    name: "Follow-Up & Speed-to-Lead Systems",
    whatItIs:
      "Automated and human follow-up that responds to every new lead and missed call instantly, then nurtures it until the customer books or buys.",
    customerBenefit:
      "Leads get answered before they call a competitor. Studies consistently show responding in the first minute dramatically increases the odds of winning the customer — so no opportunity slips through the cracks.",
    howMs2goMaximizes:
      "We wire up instant text/email responses, missed-call text-back, reminders, and a structured call/text/email sequence with clear ownership and escalation — covered in detail in the Speed-to-Lead playbook below.",
  },
];

export interface FollowUpStep {
  title: string;
  detail: string;
}

/**
 * The operational "10-second response" playbook Dad asked for. This is training
 * / ops content reps and managers can hand to a client — it describes the system
 * and the SLA, it does not silently turn on any automation.
 */
export const SPEED_TO_LEAD_PLAYBOOK = {
  promise:
    "The goal is simple: every inbound lead or missed call gets a real response within seconds, not hours. The faster we respond, the more deals we close — speed-to-lead is the single biggest lever most local businesses are ignoring.",
  sla: [
    "Instant (0–10 seconds): automated SMS + email acknowledges the lead by name and sets the expectation that a person is reaching out.",
    "Within 5 minutes: a live team member calls. If no answer, send a personal text and leave a voicemail.",
    "Day 1: if still no connection, a second call + text later the same day.",
    "Days 2–7: a structured call / text / email sequence (at least 5–7 touches) until the lead responds, books, or opts out.",
  ] as string[],
  steps: [
    {
      title: "Missed-call text-back",
      detail:
        "Any call that isn't answered triggers an immediate text: 'Sorry we missed you — how can we help?' This recovers leads that would otherwise call the next business on the list.",
    },
    {
      title: "Instant form / lead response",
      detail:
        "The moment a web form, chat, or ad lead comes in, an automated SMS and email go out within 10 seconds, followed by a live human call as fast as possible.",
    },
    {
      title: "Calendly booking & reminders",
      detail:
        "Send a one-tap booking link so the lead can self-schedule, with automatic reminders before the appointment to cut no-shows.",
    },
    {
      title: "Notification routing & ownership",
      detail:
        "Every new lead pings the right person (or rotates through the team) so it's always clear who owns the first response. No lead is 'everyone's job', which means nobody's job.",
    },
    {
      title: "Escalation",
      detail:
        "If the owner doesn't respond inside the SLA window, the lead escalates to a backup so it never sits unanswered. Managers review any breaches daily.",
    },
  ] as FollowUpStep[],
  note: "Where MS2GO has approved, connected integrations (e.g. Calendly, Resend), these steps are partly automated. Otherwise this is the operating standard your team runs manually — the SLA is the product, the tools just make it easier to hit.",
};
