import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchDataForSeoSnapshot, normalizeDomain } from "./dataforseo";

const ORIGINAL_LOGIN = process.env.DATAFORSEO_LOGIN;
const ORIGINAL_PASSWORD = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = "login";
  process.env.DATAFORSEO_PASSWORD = "password";
});

afterEach(() => {
  if (ORIGINAL_LOGIN === undefined) delete process.env.DATAFORSEO_LOGIN;
  else process.env.DATAFORSEO_LOGIN = ORIGINAL_LOGIN;
  if (ORIGINAL_PASSWORD === undefined) delete process.env.DATAFORSEO_PASSWORD;
  else process.env.DATAFORSEO_PASSWORD = ORIGINAL_PASSWORD;
});

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function overview(count: number, etv: number) {
  return {
    tasks: [
      {
        status_code: 20000,
        result: [{ metrics: { organic: { count, etv }, paid: { count: 0 } } }],
      },
    ],
  };
}

describe("normalizeDomain", () => {
  it("strips scheme, www, path and query", () => {
    expect(
      normalizeDomain(
        "https://www.alderpestcontrol.com/huntsville-al-pest-control/?utm_source=gbp",
      ),
    ).toBe("alderpestcontrol.com");
  });
  it("handles bare domains and casing", () => {
    expect(normalizeDomain("AdlerPestControl.com")).toBe("adlerpestcontrol.com");
  });
  it("returns undefined for blank input", () => {
    expect(normalizeDomain("")).toBeUndefined();
    expect(normalizeDomain(undefined)).toBeUndefined();
  });
});

describe("fetchDataForSeoSnapshot", () => {
  it("reports not_configured when creds missing", async () => {
    delete process.env.DATAFORSEO_LOGIN;
    const snap = await fetchDataForSeoSnapshot("example.com", async () => makeResponse({}));
    expect(snap.status).toBe("not_configured");
    expect(snap.configured).toBe(false);
  });

  it("returns available with real metrics", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "alderpestcontrol.com",
      async () => makeResponse(overview(858, 2899.96)),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(858);
    expect(Math.round(snap.organicTrafficEstimate ?? 0)).toBe(2900);
  });

  it("treats true zero from the API as available zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "adlerpestcontrol.com",
      async () => makeResponse(overview(0, 0)),
    );
    expect(snap.status).toBe("available");
    expect(snap.organicKeywordCount).toBe(0);
  });

  it("does NOT report zero when the API errors (unavailable, not zero)", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () => makeResponse({ error: "denied" }, 403),
    );
    expect(snap.status).toBe("unavailable");
    expect(snap.organicKeywordCount).toBeUndefined();
    expect(snap.organicTrafficEstimate).toBeUndefined();
    expect(snap.rankSignals?.[0].level).toBe("yellow");
  });

  it("treats a task-level subscription error as unavailable, not zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () =>
        makeResponse({
          status_code: 20000,
          tasks: [{ status_code: 40200, status_message: "Access denied." }],
        }),
    );
    expect(snap.status).toBe("unavailable");
    expect(snap.organicKeywordCount).toBeUndefined();
  });

  it("treats an empty result set as unavailable, not zero", async () => {
    const snap = await fetchDataForSeoSnapshot(
      "example.com",
      async () => makeResponse({ tasks: [{ status_code: 20000, result: [] }] }),
    );
    expect(snap.status).toBe("unavailable");
  });
});
