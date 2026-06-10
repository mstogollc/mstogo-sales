import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractBearer, isSupabaseConfigured, serviceClient, userClient, tryPersist } from "./supabase";

const KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) SAVED[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/dashboard", { headers });
}

describe("supabase helpers", () => {
  it("isSupabaseConfigured reflects env vars", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("extractBearer parses Authorization header", () => {
    expect(extractBearer(makeReq({}))).toBeNull();
    expect(extractBearer(makeReq({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(extractBearer(makeReq({ authorization: "Basic xxx" }))).toBeNull();
  });

  it("clients return null when env missing", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(serviceClient()).toBeNull();
    expect(userClient("jwt")).toBeNull();
  });

  it("tryPersist swallows errors and returns null", async () => {
    const result = await tryPersist("test", async () => {
      throw new Error("boom");
    });
    expect(result).toBeNull();
  });

  it("tryPersist returns value on success", async () => {
    const result = await tryPersist("ok", async () => 42);
    expect(result).toBe(42);
  });
});
