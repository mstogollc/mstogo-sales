import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the Supabase SDK so we don't instantiate the realtime client (which
// requires a native WebSocket in Node < 22). The shape of the returned object
// is irrelevant to these tests — we only assert whether a client was created
// at all, never call methods on it.
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((url: string, key: string) => ({
      __mock: true,
      url,
      key,
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInWithOtp: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    })),
  };
});

/**
 * Tests for the browser Supabase client's env handling.
 *
 * Regression target: a missing or malformed `VITE_SUPABASE_ANON_KEY` previously
 * fell back to the literal string "anon", which Supabase rejected at sign-in
 * with "Invalid API key". The client must now refuse to instantiate instead
 * of shipping a bogus key, and must never accept a service_role JWT.
 */

// Synthetic JWTs whose payload base64-decodes to a recognizable role. They are
// unsigned and only used to exercise the shape checks in supabase.ts.
const ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjowLCJleHAiOjk5OTk5OTk5OTl9.c2lnbmF0dXJlLXBsYWNlaG9sZGVyLWZvci10ZXN0cy1vbmx5LWRvLW5vdC10cnVzdA";
const SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjowLCJleHAiOjk5OTk5OTk5OTl9.c2lnbmF0dXJlLXBsYWNlaG9sZGVyLWZvci10ZXN0cy1vbmx5LWRvLW5vdC10cnVzdA";
// The second segment of the above intentionally re-decodes to {"role":"service_role"}.
// Recompute it programmatically to avoid drift if someone edits the constant.
function makeJwt(role: string): string {
  const b64 = (s: string): string =>
    Buffer.from(s)
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({ role, iss: "supabase", iat: 0, exp: 9999999999 }),
  );
  const sig = b64("test-signature-not-real");
  return `${header}.${payload}.${sig}`;
}

const FRESH_ANON = makeJwt("anon");
const FRESH_SERVICE = makeJwt("service_role");

// vi.stubEnv mutates import.meta.env. We must re-import the module under test
// after each env change because it captures the values at module init.
async function loadModuleWith(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  vi.resetModules();
  return await import("./supabase");
}

// Browser globals expected by the module's `typeof window` check.
beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  if (g.window === undefined) g.window = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("browser supabase client — env handling", () => {
  it("treats a valid URL + anon JWT as configured", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: FRESH_ANON,
    });
    expect(mod.supabaseConfigured).toBe(true);
    expect(mod.supabase).not.toBeNull();
  });

  it("is unconfigured when the anon key is missing", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "",
    });
    expect(mod.supabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
  });

  it("is unconfigured when the anon key is the literal placeholder 'anon'", async () => {
    // This is the production-bug regression check: shipping the string "anon"
    // as the API key triggered Supabase's "Invalid API key" response.
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
    });
    expect(mod.supabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
  });

  it("is unconfigured when the URL is malformed", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_ANON_KEY: FRESH_ANON,
    });
    expect(mod.supabaseConfigured).toBe(false);
  });

  it("rejects non-supabase hostnames", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://attacker.example.com",
      VITE_SUPABASE_ANON_KEY: FRESH_ANON,
    });
    expect(mod.supabaseConfigured).toBe(false);
  });

  it("refuses to instantiate when a service_role JWT was wired up as the anon key", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: FRESH_SERVICE,
    });
    expect(mod.supabaseConfigured).toBe(false);
    expect(mod.supabase).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("authHeader resolves to {} when not configured", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    });
    await expect(mod.authHeader()).resolves.toEqual({});
  });

  it("shape helpers recognize anon vs service_role payloads", async () => {
    const mod = await loadModuleWith({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: FRESH_ANON,
    });
    const t = mod.__testing;
    expect(t.looksLikeSupabaseUrl("https://x.supabase.co")).toBe(true);
    expect(t.looksLikeSupabaseUrl("http://x.supabase.co")).toBe(false);
    expect(t.looksLikeSupabaseUrl("https://example.com")).toBe(false);
    expect(t.looksLikeAnonJwt(FRESH_ANON)).toBe(true);
    expect(t.looksLikeAnonJwt(FRESH_SERVICE)).toBe(false);
    expect(t.looksLikeAnonJwt("anon")).toBe(false);
    expect(t.isServiceRoleJwt(FRESH_SERVICE)).toBe(true);
    expect(t.isServiceRoleJwt(FRESH_ANON)).toBe(false);
  });
});

// Silence the unused-constant warnings for the original copy-pasted JWTs above.
void ANON_JWT;
void SERVICE_ROLE_JWT;
