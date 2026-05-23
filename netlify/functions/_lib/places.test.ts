import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchPlaceProfile } from "./places";

const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
});

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchPlaceProfile", () => {
  it("returns yellow profile when key missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const result = await fetchPlaceProfile({ businessName: "Acme" }, async () => makeResponse({}));
    expect(result.matched).toBe(false);
    expect(result.overall).toBe("yellow");
    expect(result.signals[0].level).toBe("yellow");
  });

  it("returns red when no place matches", async () => {
    const fakeFetch = async () => makeResponse({ places: [] });
    const result = await fetchPlaceProfile({ businessName: "Nothing" }, fakeFetch as typeof fetch);
    expect(result.matched).toBe(false);
    expect(result.overall).toBe("red");
  });

  it("derives green signals for strong profile", async () => {
    let call = 0;
    const fakeFetch = async () => {
      call += 1;
      if (call === 1) return makeResponse({ places: [{ id: "abc", displayName: { text: "Acme" } }] });
      return makeResponse({
        id: "abc",
        displayName: { text: "Acme" },
        formattedAddress: "100 Main St",
        internationalPhoneNumber: "+15555550100",
        websiteUri: "https://acme.com",
        googleMapsUri: "https://maps.google.com/?cid=abc",
        rating: 4.8,
        userRatingCount: 250,
        businessStatus: "OPERATIONAL",
        types: ["restaurant"],
        primaryTypeDisplayName: { text: "Restaurant" },
      });
    };

    const result = await fetchPlaceProfile({ businessName: "Acme" }, fakeFetch as typeof fetch);
    expect(result.matched).toBe(true);
    expect(result.overall).toBe("green");
    expect(result.rating).toBe(4.8);
    expect(result.userRatingCount).toBe(250);
    expect(result.signals.some((s) => s.level === "green")).toBe(true);
  });

  it("flags red when rating low and reviews missing", async () => {
    let call = 0;
    const fakeFetch = async () => {
      call += 1;
      if (call === 1) return makeResponse({ places: [{ id: "xyz", displayName: { text: "Struggle Co" } }] });
      return makeResponse({
        id: "xyz",
        displayName: { text: "Struggle Co" },
        rating: 3.1,
        userRatingCount: 4,
        businessStatus: "OPERATIONAL",
      });
    };
    const result = await fetchPlaceProfile({ businessName: "Struggle Co" }, fakeFetch as typeof fetch);
    expect(result.matched).toBe(true);
    expect(result.overall).toBe("red");
  });

  it("handles API error without throwing", async () => {
    const fakeFetch = async () => makeResponse({ error: { message: "blocked" } }, 403);
    const result = await fetchPlaceProfile({ businessName: "Anything" }, fakeFetch as typeof fetch);
    expect(result.matched).toBe(false);
    expect(result.overall).toBe("red");
    expect(result.rawError).toBeDefined();
  });
});
