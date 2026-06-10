import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chat } from "./openai";

const ORIGINAL = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("chat()", () => {
  it("falls back when key missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await chat(
      [{ role: "user", content: "hi" }],
      {},
      () => "fallback-body",
      (async () => jsonResponse({})) as typeof fetch,
    );
    expect(result.source).toBe("fallback");
    expect(result.text).toBe("fallback-body");
    expect(result.reason).toBe("openai_not_configured");
  });

  it("returns openai text when API succeeds", async () => {
    const fakeFetch = async () =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "real reply" } }],
      });
    const result = await chat(
      [{ role: "user", content: "hi" }],
      {},
      () => "fallback",
      fakeFetch as typeof fetch,
    );
    expect(result.source).toBe("openai");
    expect(result.text).toBe("real reply");
  });

  it("falls back on API error", async () => {
    const fakeFetch = async () => jsonResponse({ error: { message: "boom" } }, 500);
    const result = await chat(
      [{ role: "user", content: "hi" }],
      {},
      () => "fallback",
      fakeFetch as typeof fetch,
    );
    expect(result.source).toBe("fallback");
    expect(result.text).toBe("fallback");
    expect(result.reason).toBe("boom");
  });
});
