import { describe, it, expect } from "vitest";
import {
  buildPrompt,
  fallbackEmail,
  companyFacts,
  type DraftBody,
} from "../../netlify/functions/draft-email";

describe("draft-email company facts", () => {
  it("passes the selected prospect city/state through to the prompt", () => {
    const body: DraftBody = {
      businessName: "Gulfport Dental",
      city: "Gulfport",
      state: "MS",
      industry: "Dental",
    };
    const { user } = buildPrompt(body);
    expect(user).toContain("City: Gulfport");
    expect(user).toContain("State: MS");
    expect(user).toContain("Business name: Gulfport Dental");
  });

  it("does not invent a city when none is provided — flags it unknown", () => {
    const body: DraftBody = { businessName: "Acme Roofing" };
    const { user, system } = buildPrompt(body);
    // No city/state lines emitted.
    expect(user).not.toMatch(/City:/);
    expect(user).not.toMatch(/State:/);
    // Explicitly told the model the city is unknown and must not be guessed.
    expect(user).toMatch(/do NOT guess these/i);
    expect(user).toContain("city");
    // System prompt forbids inventing location facts.
    expect(system).toMatch(/MUST NOT invent, guess, change, or embellish/i);
    expect(system).toMatch(/neutral wording/i);
  });

  it("fallback email names the city only when it is known", () => {
    const withCity = fallbackEmail({ businessName: "Gulfport Dental", city: "Gulfport", state: "MS" });
    expect(withCity.text).toContain("Gulfport");

    const withoutCity = fallbackEmail({ businessName: "Acme Roofing" });
    expect(withoutCity.text).not.toMatch(/Gulfport/);
    // No invented city name appears anywhere in the body.
    expect(withoutCity.text).not.toMatch(/\b(Anytown|Springfield|New York)\b/);
  });

  it("fallback never substitutes demo/example data for a real business", () => {
    const fb = fallbackEmail({ businessName: "Bayou Plumbing", city: "Biloxi" });
    expect(fb.subject).toContain("Bayou Plumbing");
    expect(fb.text).toContain("Bayou Plumbing");
    expect(fb.text).not.toMatch(/example\.com|Anytown|\[City\]|your team/i);
    expect(fb.text).toContain("Biloxi");
  });

  it("companyFacts trims and drops empty strings", () => {
    const facts = companyFacts({ businessName: "  Reef Cafe ", city: "   ", state: "FL" });
    expect(facts.businessName).toBe("Reef Cafe");
    expect(facts.city).toBeUndefined();
    expect(facts.state).toBe("FL");
  });
});
