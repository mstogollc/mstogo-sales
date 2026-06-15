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

describe("full proposal package (the default print/export output)", () => {
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

  it("contains the full multi-section package content", () => {
    const text = fullProposalFallback(body);
    expect(text).toContain("MS2GO Growth Proposal for Gulfport Dental");
    expect(text).toMatch(/Where you stand today/i);
    expect(text).toMatch(/The MS2GO growth system/i);
    expect(text).toMatch(/Local SEO/i);
    expect(text).toMatch(/Industry SEO/i);
    expect(text).toMatch(/AI Search/i);
    expect(text).toMatch(/Investment/i);
    expect(text).toMatch(/Goals we'll target/i);
    expect(text).toMatch(/Next step/i);
  });

  it("lists all three packages at the correct prices and marks the recommended one", () => {
    const text = fullProposalFallback(body);
    expect(text).toMatch(/Basic — \$300\/month/);
    expect(text).toMatch(/Growth — \$750\/month/);
    expect(text).toMatch(/Premium — \$2,000\/month/);
    // Growth is recommended in this body, so it carries the star marker.
    expect(text).toMatch(/Growth — \$750\/month  ★ Recommended for you/);
  });

  it("includes business directories in every package, never as an add-on", () => {
    const text = fullProposalFallback(body);
    expect(text).toMatch(/Business Directories & Listings/i);
    expect(text).toMatch(/Included in every MS2GO package/i);
    expect(text).toMatch(/includes business directories & listings management at no extra cost/i);
    expect(text).not.toMatch(/directories[^\n]*add-?on/i);
  });

  it("the full-package prompt instructs all three tiers and directories-in-every-package", () => {
    const { system, user } = buildProposalPrompt({ ...body, format: "full" });
    expect(system).toMatch(/multi-section growth proposal package/i);
    expect(system).toMatch(/Directories are included in every package — never present them as an add-on/i);
    expect(user).toMatch(/All packages \(list every one in the Investment section\)/i);
    expect(user).toMatch(/Basic — \$300\/month/);
    expect(user).toMatch(/Premium — \$2,000\/month/);
  });

  // Justin's report: the rebuilt proposal lost the detailed website and
  // cost/investment explanations the original had. The full package must carry
  // real, multi-line explanations — not a single bullet each.
  it("has a detailed website explanation section, not a one-liner", () => {
    const text = fullProposalFallback(body); // Gulfport Dental, has no website set → unknown-website branch
    expect(text).toMatch(/Your website — what we improve/i);
    // Multiple concrete website improvements must be explained.
    expect(text).toMatch(/mobile/i);
    expect(text).toMatch(/conversion|click-to-call|booking form/i);
    expect(text).toMatch(/trust signals/i);
    expect(text).toMatch(/on-page SEO|local SEO/i);
    // The website section spans several lines, not just a header + one bullet.
    const websiteBlock = text.slice(text.indexOf("Your website"), text.indexOf("Investment"));
    expect(websiteBlock.split("\n").filter((l) => l.trim().startsWith("•")).length).toBeGreaterThanOrEqual(3);
  });

  it("has a detailed cost/investment breakdown of what each tier buys", () => {
    const text = fullProposalFallback(body);
    const investBlock = text.slice(text.indexOf("Investment"));
    // Each tier explains, in plain English, what the money buys (sub-bullets).
    expect(investBlock).toMatch(/Everything in Basic/i);
    expect(investBlock).toMatch(/Everything in Growth/i);
    expect(investBlock).toMatch(/month-to-month/i);
    expect(investBlock).toMatch(/no setup fees|no long-term contract/i);
    // At least a handful of detail sub-bullets (the "–" lines) across tiers.
    expect(investBlock.split("\n").filter((l) => l.trim().startsWith("–")).length).toBeGreaterThanOrEqual(8);
  });

  it("the full-package prompt asks for detailed website and per-tier investment copy", () => {
    const { system } = buildProposalPrompt({ ...body, format: "full" });
    expect(system).toMatch(/'Your website' section must be a real explanation/i);
    expect(system).toMatch(/what that money buys/i);
    expect(system).toMatch(/month-to-month/i);
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

  it("the no-website full proposal explains building a first website in detail", () => {
    const base: ProposalBody = { businessName: "Coastal Cafe", city: "Gulfport", state: "MS", noWebsite: true };
    const full = fullProposalFallback(base);
    expect(full).toMatch(/Your website — built from scratch/i);
    expect(full).toMatch(/first professional website|professional, mobile-first website/i);
    expect(full).toMatch(/competitor who does/i);
    expect(full).toMatch(/click-to-call|booking form|convert/i);
    expect(full).toMatch(/local SEO/i);
    // Several explanation bullets, not one line — and still no invented URL.
    const websiteBlock = full.slice(full.indexOf("Your website"), full.indexOf("Investment"));
    expect(websiteBlock.split("\n").filter((l) => l.trim().startsWith("•")).length).toBeGreaterThanOrEqual(3);
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
    for (const text of [full, intro]) {
      expect(text).not.toMatch(/staleurl/i);
      expect(text).toMatch(/first professional website/i);
      expect(text).not.toMatch(/https?:\/\//);
    }
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

  it("the full proposal explains, in detail, what it improves on a provided website", () => {
    const body: ProposalBody = {
      businessName: "Bayside Marine Outfitters",
      industry: "Marine Outfitter",
      city: "Biloxi",
      state: "MS",
      website: "www.baysidemarine.com",
    };
    const full = fullProposalFallback(body);
    // The provided URL is named exactly, inside a real explanation section.
    expect(full).toMatch(/Your website — what we improve/i);
    expect(full).toContain("www.baysidemarine.com");
    expect(full).toMatch(/mobile/i);
    expect(full).toMatch(/conversion|click-to-call|booking form/i);
    expect(full).toMatch(/trust signals/i);
    expect(full).toMatch(/on-page SEO|local SEO/i);
    const websiteBlock = full.slice(full.indexOf("Your website"), full.indexOf("Investment"));
    expect(websiteBlock.split("\n").filter((l) => l.trim().startsWith("•")).length).toBeGreaterThanOrEqual(3);
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
    expect(full).toContain("MS2GO Growth Proposal for Joe's Pizza");
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
    expect(full).toContain("MS2GO Growth Proposal for Bayside Marine Outfitters");
    expect(full).toContain("Biloxi, MS");
    // The title/intro must use the real business name — never a placeholder. (The
    // systems copy legitimately says "your business", so only flag placeholders.)
    expect(full).not.toMatch(/Anytown|\[Business\]/i);
    expect(full.split("\n")[0]).not.toMatch(/your business/i);
  });
});
