import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * IMPORTANT: Vite only inlines variables prefixed with `VITE_` and accessed via
 * `import.meta.env`. `process.env.SUPABASE_*` does NOT exist in the browser
 * bundle. The Netlify build must therefore expose `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY` at build time, not just the unprefixed server keys.
 *
 * If the public env is missing or obviously wrong, we refuse to construct a
 * client. Previously we fell back to literal placeholder values like "anon",
 * which Supabase rightly rejected with "Invalid API key" at sign-in time.
 */

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

function looksLikeSupabaseUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && /\.supabase\.(co|in)$/.test(u.hostname);
  } catch {
    return false;
  }
}

function looksLikeAnonJwt(value: string): boolean {
  // Supabase anon keys are JWTs: three base64url segments separated by ".".
  // The header decodes to JSON containing { "alg": "HS256", ... } and the
  // payload contains { "role": "anon", ... }. We only do a cheap shape check
  // here; the real validation happens server-side.
  if (!value || value.length < 40) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { role?: string };
    return payload.role === "anon";
  } catch {
    // If we can't decode, treat as misconfigured rather than risking a service
    // role key shipping to the browser.
    return false;
  }
}

function isServiceRoleJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const urlOk = looksLikeSupabaseUrl(rawUrl);
const anonOk = looksLikeAnonJwt(rawAnon);

// Safety net: if a service_role key was ever wired up as VITE_SUPABASE_ANON_KEY
// we refuse to instantiate the client at all. The service role bypasses RLS
// and must NEVER reach the browser.
const serviceRoleLeaked = rawAnon !== "" && isServiceRoleJwt(rawAnon);

export const supabaseConfigured = urlOk && anonOk && !serviceRoleLeaked;

if (typeof window !== "undefined") {
  if (serviceRoleLeaked) {
    console.error(
      "[ms2go] VITE_SUPABASE_ANON_KEY is a service_role key. Refusing to create a browser client. Replace it with the anon key in Netlify env.",
    );
  } else if (!supabaseConfigured) {
    console.warn(
      "[ms2go] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing or malformed; auth is disabled. " +
        "Set them in the Netlify build env (not just SUPABASE_*) and redeploy.",
    );
  }
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(rawUrl, rawAnon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Exposed for tests only.
export const __testing = {
  looksLikeSupabaseUrl,
  looksLikeAnonJwt,
  isServiceRoleJwt,
};
