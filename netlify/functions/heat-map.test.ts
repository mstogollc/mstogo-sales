import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runHeatMap } from "./heat-map";

const ORIGINAL = {
  places: process.env.GOOGLE_PLACES_API_KEY,
  login: process.env.DATAFORSEO_LOGIN,
  password: process.env.DATAFORSEO_PASSWORD,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("GOOGLE_PLACES_API_KEY", ORIGINAL.places);
  restore("DATAFORSEO_LOGIN", ORIGINAL.login);
  restore("DATAFORSEO_PASSWORD", ORIGINAL.password);
});

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("runHeatMap", () => {
  it("returns a sales-friendly setup state when credentials are missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    const result = await runHeatMap({ businessName: "Joe's Pizza" }, async () => makeResponse({}));
    expect(result.configured).toBe(false);
    expect(result.status).toBe("setup_required");
    expect(result.cells).toHaveLength(0);
    // No developer-facing wording leaks to the rep.
    expect(result.message.toLowerCase()).not.toMatch(/env|api key|credential|undefined|null|error/);
  });

  describe("with credentials configured", () => {
    beforeEach(() => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.DATAFORSEO_LOGIN = "login";
      process.env.DATAFORSEO_PASSWORD = "pw";
    });

    it("asks for a business name before mapping", async () => {
      const result = await runHeatMap({}, async () => makeResponse({}));
      expect(result.configured).toBe(true);
      expect(result.status).toBe("needs_location");
    });

    it("falls back to needs_location when geocoding finds nothing", async () => {
      const result = await runHeatMap(
        { businessName: "Ghost Co", city: "Nowhere" },
        async () => makeResponse({ places: [] }),
      );
      expect(result.status).toBe("needs_location");
      expect(result.cells).toHaveLength(0);
    });

    it("builds a heat grid and ranks the business per cell", async () => {
      const fakeFetch = async (input: string | URL | Request): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("places:searchText")) {
          return makeResponse({ places: [{ location: { latitude: 30.36, longitude: -89.09 } }] });
        }
        // DataForSEO maps SERP: business is rank 2.
        return makeResponse({
          tasks: [{ result: [{ items: [{ rank_absolute: 2, title: "Joe's Pizza Gulfport" }] }] }],
        });
      };
      const result = await runHeatMap(
        { businessName: "Joe's Pizza", city: "Gulfport", state: "MS", gridSize: 3, stepMiles: 1 },
        fakeFetch as typeof fetch,
      );
      expect(result.status).toBe("ok");
      expect(result.cells).toHaveLength(9);
      expect(result.cells.every((c) => c.rank === 2 && c.level === "green")).toBe(true);
      expect(result.topThreeShare).toBe(100);
      expect(result.averageRank).toBe(2);
    });
  });
});
