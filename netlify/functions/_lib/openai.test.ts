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

  it("aborts a slow request and falls back with an openai_timeout reason", async () => {
    // Simulates OpenAI taking far longer than the budget: the fetch only
    // settles when its abort signal fires. This is the production 504 scenario.
    const hangingFetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    const result = await chat(
      [{ role: "user", content: "hi" }],
      { timeoutMs: 20 },
      () => "deterministic-fallback",
      hangingFetch as unknown as typeof fetch,
    );
    expect(result.source).toBe("fallback");
    expect(result.text).toBe("deterministic-fallback");
    expect(result.reason).toBe("openai_timeout");
  });

  it("passes an abort signal to fetch so requests can be cancelled", async () => {
    let sawSignal = false;
    const fakeFetch = (_url: string, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return Promise.resolve(
        jsonResponse({ model: "gpt-4o-mini", choices: [{ message: { content: "ok" } }] }),
      );
    };
    const result = await chat(
      [{ role: "user", content: "hi" }],
      {},
      () => "fallback",
      fakeFetch as unknown as typeof fetch,
    );
    expect(sawSignal).toBe(true);
    expect(result.source).toBe("openai");
  });
});
