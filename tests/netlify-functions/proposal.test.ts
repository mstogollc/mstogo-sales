import { describe, it, expect } from "vitest";
import {
  buildProposalPrompt,
  fallbackProposal,
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

  it("never injects Huntsville / North Alabama for a Gulfport prospect", () => {
    const body: ProposalBody = {
      businessName: "Gulfport Dental",
      city: "Gulfport",
      state: "MS",
      goals: "fill the schedule for the new hygienist",
    };
    // The user prompt (facts) and the fallback (actual copy) must never name
    // the wrong region. The system prompt deliberately names Huntsville inside
    // its guardrail, so it is excluded here.
    const { user } = buildProposalPrompt(body);
    const fallback = fallbackProposal(body);
    for (const text of [user, fallback]) {
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

  it("fallback names the verified city and nothing else", () => {
    const withCity = fallbackProposal({ businessName: "Gulfport Dental", city: "Gulfport", state: "MS" });
    expect(withCity).toContain("Gulfport, MS");
    expect(withCity).not.toMatch(/Huntsville|North Alabama|Anytown|\[City\]/i);

    const withoutCity = fallbackProposal({ businessName: "Acme Roofing" });
    expect(withoutCity).toContain("your local market");
    expect(withoutCity).not.toMatch(/Huntsville|North Alabama|Gulfport|Anytown|\[City\]/i);
  });

  it("locationPhrase falls back to a neutral phrase, never a guessed region", () => {
    expect(locationPhrase("Gulfport", "MS")).toBe("Gulfport, MS");
    expect(locationPhrase("Gulfport")).toBe("Gulfport");
    expect(locationPhrase(undefined, "MS")).toBe("MS");
    expect(locationPhrase()).toBe("your local market");
    expect(locationPhrase("   ", "  ")).toBe("your local market");
  });

  it("no-website mode never emits a placeholder URL or current-site claim", () => {
    const text = fallbackProposal({ businessName: "Coastal Cafe", city: "Gulfport", state: "MS", noWebsite: true });
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/example\.com|\[website\]|yoursite/i);
    expect(text).toMatch(/first professional website/i);
  });
});
