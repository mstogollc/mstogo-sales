import { describe, it, expect } from "vitest";
import {
  buildProposalPrompt,
  fallbackProposal,
  fullProposalFallback,
  introLetterFallback,
  locationPhrase,
  type ProposalBody,
} from "../../netlify/functions/proposal";

describe("proposal geography is locked to the selected prospect", () => {
  it("passes the selected city/state through to the prompt", () => {
    const body: ProposalBody = {
      businessName: "Gulfport Dental",
      city: "Gulfport",
      state: "MS",
      industry: "Dental",
    };
    const { user } = buildProposalPrompt(body);
    expect(user).toContain("Gulfport, MS");
    expect(user).toContain("Industry / category: Dental");
  });

  it("never injects Huntsville / North Alabama for a Gulfport prospect (both formats)", () => {
    const body: ProposalBody = {
      businessName: "Gulfport Dental",
      city: "Gulfport",
      state: "MS",
      goals: "fill the schedule for the new hygienist",
    };
    // The user prompt (facts) and both fallbacks (actual copy) must never name
    // the wrong region. The system prompt deliberately names Huntsville inside
    // its guardrail, so it is excluded here.
    const { user } = buildProposalPrompt(body);
    const texts = [user, introLetterFallback(body), fullProposalFallback(body)];
    for (const text of texts) {
      expect(text).not.toMatch(/Huntsville/i);
      expect(text).not.toMatch(/North Alabama/i);
      expect(text).not.toMatch(/\bN\.?\s?AL\b/i);
    }
  });

  it("forbids the model from inventing a city and demands neutral wording when missing", () => {
    const { system, user } = buildProposalPrompt({ businessName: "Acme Roofing" });
    expect(system).toMatch(/MUST NOT invent, guess, change, or substitute/i);
    expect(system).toMatch(/Never reference Huntsville, North Alabama/i);
    expect(system).toMatch(/neutral wording/i);
    // No city/state fact line emitted; explicitly flagged unknown.
    expect(user).toMatch(/Location: unknown/i);
    expect(user).not.toMatch(/Gulfport|Huntsville/i);
  });

  it("locationPhrase falls back to a neutral phrase, never a guessed region", () => {
    expect(locationPhrase("Gulfport", "MS")).toBe("Gulfport, MS");
    expect(locationPhrase("Gulfport")).toBe("Gulfport");
    expect(locationPhrase(undefined, "MS")).toBe("MS");
    expect(locationPhrase()).toBe("your local market");
    expect(locationPhrase("   ", "  ")).toBe("your local market");
  });
});

describe("full proposal package — the original website-build package (default print/export)", () => {
  const body: ProposalBody = {
    businessName: "Gulfport Dental",
    industry: "Dental",
    city: "Gulfport",
    state: "MS",
    recommendedTier: "Growth",
    goals: "fill the schedule for the new hygienist",
  };

  it("fallbackProposal defaults to the full package, not the intro letter", () => {
    expect(fallbackProposal(body)).toBe(fullProposalFallback(body));
    expect(fallbackProposal({ ...body, format: "full" })).toBe(fullProposalFallback(body));
  });

  it("emits every original section, in order", () => {
    const text = fullProposalFallback(body);
    const order = [
      "WEBSITE DESIGN & DEVELOPMENT PROPOSAL",
      "Prepared For",
      "Prepared By",
      "Introduction & Thank You",
      "FAST TRACK",
      "INTRODUCTORY VALUE",
      "About MS2GO LLC",
      "Website Proposal: What We Will Build",
      "Core Deliverables",
      "Proposed Page Map",
      "Industry-Standard Features",
      "Investment — Your Website Build",
      "Monthly Service Options",
      "Online Directory Visibility",
      "Start Today — The Full Package",
      "What Is Not Included in the Initial Build",
      "Project Timeline — One-Week Fast Track",
      "Why MS2GO",
      "Next Steps",
      "Agreement & Acceptance",
    ];
    let cursor = -1;
    for (const heading of order) {
      const at = text.indexOf(heading);
      expect(at, `missing or out-of-order: ${heading}`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("titles the cover with the prospect's real business name and verified location", () => {
    const text = fullProposalFallback(body);
    expect(text).toMatch(/MS2GO — Marketing Solutions for Local Businesses/);
    expect(text).toContain("Gulfport Dental");
    expect(text).toContain("Gulfport, MS");
  });

  it("includes the one-time WEBSITE BUILD cost: $5,000 standard, $2,500 introductory, $1,250 deposit", () => {
    const text = fullProposalFallback(body);
    const invest = text.slice(text.indexOf("Investment — Your Website Build"), text.indexOf("Monthly Service Options"));
    expect(invest).toMatch(/\$5,000/);
    expect(invest).toMatch(/\$2,500/);
    expect(invest).toMatch(/50% deposit \(\$1,250\)/);
    expect(invest).toMatch(/remaining 50% due at launch/i);
  });

  it("lists all three MONTHLY packages at the correct prices and marks the recommended one", () => {
    const text = fullProposalFallback(body);
    const monthly = text.slice(text.indexOf("Monthly Service Options"), text.indexOf("Online Directory Visibility"));
    expect(monthly).toMatch(/Basic — \$300\/month/);
    expect(monthly).toMatch(/Growth — \$750\/month/);
    expect(monthly).toMatch(/Premium — \$2,000\/month/);
    expect(monthly).toMatch(/Growth — \$750\/month  ★ Recommended for you/);
  });

  it("has a Proposed Page Map with the customer-journey pages", () => {
    const text = fullProposalFallback(body);
    const map = text.slice(text.indexOf("Proposed Page Map"), text.indexOf("Industry-Standard Features"));
    expect(map).toMatch(/Home/);
    expect(map).toMatch(/Request a Quote/i);
    expect(map.split("\n").filter((l) => l.trim().startsWith("•")).length).toBeGreaterThanOrEqual(6);
  });

  it("has all five Industry-Standard Features subsections", () => {
    const text = fullProposalFallback(body);
    const features = text.slice(text.indexOf("Industry-Standard Features"), text.indexOf("Investment — Your Website Build"));
    expect(features).toMatch(/Trust & Credibility/);
    expect(features).toMatch(/Conversion & Lead Capture/);
    expect(features).toMatch(/Project & Quote Experience/);
    expect(features).toMatch(/Local & Industry SEO/);
    expect(features).toMatch(/Performance & Security/);
  });

  it("includes directory visibility in all three packages with no separate directory charge", () => {
    const text = fullProposalFallback(body);
    const monthly = text.slice(text.indexOf("Monthly Service Options"), text.indexOf("Online Directory Visibility"));
    expect(monthly).toMatch(/directory & listings visibility at no extra cost/i);
    const directory = text.slice(text.indexOf("Online Directory Visibility"), text.indexOf("Start Today"));
    // Directories are included in every package — Basic, Growth, and Premium.
    expect(directory).toMatch(/included in every MS2GO package/i);
    expect(directory).toMatch(/Basic, Growth, and Premium/);
    // No separate one-time / annual directory fee anywhere in the directory section.
    expect(directory).not.toMatch(/\$2,000 per year/);
    expect(directory).not.toMatch(/launch-year|activation|buildout/i);
    expect(directory).not.toMatch(/\$2,000/);
  });

  it("never charges a separate $2,000 one-time/annual directory fee anywhere in the proposal", () => {
    const text = fullProposalFallback(body);
    // The only legitimate $2,000 figures are the Premium monthly package price.
    expect(text).not.toMatch(/directory.{0,40}\$2,000/i);
    expect(text).not.toMatch(/\$2,000.{0,40}director/i);
    expect(text).not.toMatch(/Annual Online Directory/i);
    expect(text).not.toMatch(/directory.{0,30}(per year|one-time|activation|buildout)/i);
  });

  it("has the Start Today math: website $2,500 + first month Premium $2,000 = $4,500, no directory line", () => {
    const text = fullProposalFallback(body);
    const start = text.slice(text.indexOf("Start Today — The Full Package"), text.indexOf("What Is Not Included"));
    expect(start).toMatch(/Total to Start Today — \$4,500/);
    // No separate directory line item or charge, and no old $6,500 grand total.
    // (The copy may reassure that directories are included — it just must not
    // price them as a separate day-one line.)
    expect(start).not.toMatch(/director\w*.{0,40}\$[\d,]+/i);
    expect(start).not.toMatch(/\$[\d,]+.{0,20}director/i);
    expect(start).not.toMatch(/Annual Online Directory/i);
    expect(start).not.toMatch(/\$6,500/);
    // The deposit logic for the website build is shown.
    expect(start).toMatch(/50% deposit \(\$1,250\)/);
    expect(start).toMatch(/\$1,250 is due at launch/i);
    // Day-one alternatives for Growth and Basic are offered too.
    expect(start).toMatch(/first month Growth/i);
    expect(start).toMatch(/first month Basic/i);
  });

  it("the full-package prompt instructs the website build cost, page map, features, and Start Today math", () => {
    const { system, user } = buildProposalPrompt({ ...body, format: "full" });
    expect(system).toMatch(/website-build proposal package/i);
    expect(system).toMatch(/standard build \$5,000, reduced 50% to \$2,500/i);
    expect(system).toMatch(/50% deposit \(\$1,250\)/);
    expect(system).toMatch(/Proposed Page Map/);
    expect(system).toMatch(/Industry-Standard Features — FIVE subsections/i);
    // Start Today math: website + first month Premium = $4,500, no directory line.
    expect(system).toMatch(/\$4,500 to start today/i);
    expect(system).toMatch(/NO separate directory line item/i);
    expect(system).not.toMatch(/\$6,500/);
    expect(system).toMatch(/included in Basic, Growth, and Premium/i);
    expect(system).toMatch(/Directory visibility is included in every package — never present directories as an add-on or a separate charge/i);
    expect(user).toMatch(/All packages \(list every one in the Investment section\)/i);
    expect(user).toMatch(/Basic — \$300\/month/);
    expect(user).toMatch(/Premium — \$2,000\/month/);
  });

  it("has detailed multi-line Core Deliverables, not a one-liner", () => {
    const text = fullProposalFallback(body);
    const core = text.slice(text.indexOf("Core Deliverables"), text.indexOf("Proposed Page Map"));
    expect(core).toMatch(/mobile-first/i);
    expect(core).toMatch(/on-page SEO|SEO foundation/i);
    expect(core).toMatch(/training/i);
    expect(core.split("\n").filter((l) => l.trim().startsWith("•")).length).toBeGreaterThanOrEqual(6);
  });
});

describe("intro letter (kept as a separate, lighter output)", () => {
  const body: ProposalBody = {
    businessName: "Gulfport Dental",
    industry: "Dental",
    city: "Gulfport",
    state: "MS",
  };

  it("is available via format: 'intro' and is shorter than the full package", () => {
    const intro = fallbackProposal({ ...body, format: "intro" });
    const full = fallbackProposal({ ...body, format: "full" });
    expect(intro).toBe(introLetterFallback({ ...body, format: "intro" }));
    expect(intro).toContain("MS2GO Proposal for Gulfport Dental");
    expect(intro.length).toBeLessThan(full.length);
    // The intro letter does not enumerate the whole growth system / all tiers.
    expect(intro).not.toMatch(/The MS2GO growth system/i);
    expect(intro).not.toMatch(/Premium — \$2,000\/month/);
  });

  it("the intro prompt keeps the one-page structure and word cap", () => {
    const { system } = buildProposalPrompt({ ...body, format: "intro" });
    expect(system).toMatch(/one-page introductory letter/i);
    expect(system).toMatch(/under 350 words/i);
  });

  it("names the verified city and nothing else", () => {
    const withCity = introLetterFallback({ businessName: "Gulfport Dental", city: "Gulfport", state: "MS", format: "intro" });
    expect(withCity).toContain("Gulfport, MS");
    expect(withCity).not.toMatch(/Huntsville|North Alabama|Anytown|\[City\]/i);

    const withoutCity = introLetterFallback({ businessName: "Acme Roofing", format: "intro" });
    expect(withoutCity).toContain("your local market");
    expect(withoutCity).not.toMatch(/Huntsville|North Alabama|Gulfport|Anytown|\[City\]/i);
  });
});

describe("no-website handling never invents a URL (both formats)", () => {
  it("no-website mode emits no placeholder URL and frames a first website", () => {
    const base: ProposalBody = { businessName: "Coastal Cafe", city: "Gulfport", state: "MS", noWebsite: true };
    for (const text of [fullProposalFallback(base), introLetterFallback({ ...base, format: "intro" })]) {
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/example\.com|\[website\]|yoursite/i);
      expect(text).toMatch(/first professional website/i);
    }
  });

  it("the no-website full proposal frames building a first website in the Website Proposal section", () => {
    const base: ProposalBody = { businessName: "Coastal Cafe", city: "Gulfport", state: "MS", noWebsite: true };
    const full = fullProposalFallback(base);
    expect(full).toMatch(/Website Proposal: What We Will Build/i);
    expect(full).toMatch(/first professional website/i);
    expect(full).toMatch(/competitor who has one/i);
    expect(full).toMatch(/Where you stand today \(no website yet\)/i);
    // The website-build section names no invented URL.
    const websiteBlock = full.slice(full.indexOf("Website Proposal"), full.indexOf("Core Deliverables"));
    expect(websiteBlock).not.toMatch(/https?:\/\//);
  });

  it("ignores any stale website when 'No existing website' is set", () => {
    const body: ProposalBody = {
      businessName: "Walk-In Barber Co",
      industry: "Salon / Barber / Spa",
      city: "Gulfport",
      state: "MS",
      website: "www.staleurl.com",
      noWebsite: true,
    };
    const { user } = buildProposalPrompt(body);
    const full = fullProposalFallback(body);
    const intro = introLetterFallback({ ...body, format: "intro" });

    expect(user).not.toMatch(/staleurl/i);
    expect(user).not.toMatch(/Current website/i);
    expect(full).not.toMatch(/staleurl/i);
    expect(full).toMatch(/first professional website/i);
    // The intro letter still frames a first website; its "Current website" line is suppressed.
    expect(intro).not.toMatch(/staleurl/i);
    expect(intro).not.toMatch(/Current website/i);
    expect(intro).not.toMatch(/https?:\/\//);
  });

  it("the full website-build proposal still carries its fixed prices even with no website", () => {
    const base: ProposalBody = { businessName: "Coastal Cafe", city: "Gulfport", state: "MS", noWebsite: true };
    const full = fullProposalFallback(base);
    expect(full).toMatch(/\$5,000/);
    expect(full).toMatch(/\$2,500/);
    expect(full).toMatch(/\$1,250/);
    expect(full).toMatch(/Total to Start Today — \$4,500/);
    // The old $6,500 directory-inclusive grand total is gone.
    expect(full).not.toMatch(/\$6,500/);
  });
});

describe("website address on the proposal", () => {
  it("carries the supplied website into the prompt facts and both fallbacks", () => {
    const body: ProposalBody = {
      businessName: "Bayside Marine Outfitters",
      industry: "Marine Outfitter",
      city: "Biloxi",
      state: "MS",
      website: "www.baysidemarine.com",
    };
    const { system, user } = buildProposalPrompt(body);

    expect(user).toContain("Current website (the ONLY URL you may reference): www.baysidemarine.com");
    expect(system).toMatch(/Never invent, alter, or substitute a different URL/i);
    expect(fullProposalFallback(body)).toContain("www.baysidemarine.com");
    expect(introLetterFallback({ ...body, format: "intro" })).toContain("Current website: www.baysidemarine.com");
  });

  it("the full proposal names the provided website inside the Website Proposal section", () => {
    const body: ProposalBody = {
      businessName: "Bayside Marine Outfitters",
      industry: "Marine Outfitter",
      city: "Biloxi",
      state: "MS",
      website: "www.baysidemarine.com",
    };
    const full = fullProposalFallback(body);
    // The provided URL is named exactly, inside the real build section.
    expect(full).toMatch(/Website Proposal: What We Will Build/i);
    expect(full).toContain("www.baysidemarine.com");
    expect(full).toMatch(/Where you stand today/i);
  });

  it("a manual proposal with no website provided names no URL but still builds (both formats)", () => {
    const body: ProposalBody = {
      businessName: "Joe's Pizza",
      industry: "Restaurant / Food Service",
      city: "Gulfport",
      state: "MS",
    };
    const { user } = buildProposalPrompt(body);
    expect(user).not.toMatch(/Current website/i);

    const full = fullProposalFallback(body);
    const intro = introLetterFallback({ ...body, format: "intro" });
    for (const text of [full, intro]) {
      expect(text).not.toMatch(/Current website/i);
      expect(text).not.toMatch(/https?:\/\//);
    }
    expect(full).toContain("Joe's Pizza");
    expect(full).toMatch(/WEBSITE DESIGN & DEVELOPMENT PROPOSAL/);
    expect(intro).toContain("MS2GO Proposal for Joe's Pizza");
  });
});

describe("one-off manual proposals (business card / walk-in, no selected lead)", () => {
  it("anchors the full proposal on the typed business name with no invented signals", () => {
    const body: ProposalBody = {
      businessName: "Bayside Marine Outfitters",
      industry: "Marine Outfitter",
      city: "Biloxi",
      state: "MS",
      recommendedTier: "Growth",
    };
    const { user } = buildProposalPrompt(body);
    const full = fullProposalFallback(body);

    expect(user).toContain("Business: Bayside Marine Outfitters");
    expect(user).toContain("Industry / category: Marine Outfitter");
    expect(user).toContain("Biloxi, MS");
    expect(full).toContain("Bayside Marine Outfitters");
    expect(full).toContain("Biloxi, MS");
    // The cover/intro must use the real business name — never a placeholder.
    expect(full).not.toMatch(/Anytown|\[Business\]/i);
  });
});
