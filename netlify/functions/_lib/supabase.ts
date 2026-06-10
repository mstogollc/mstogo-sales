import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase clients for Netlify Functions.
 *
 * - serviceClient(): bypasses RLS. Use only for trusted server operations.
 * - userClient(jwt): respects RLS and acts as the calling user.
 *
 * Both return null when their required env vars are missing, so existing
 * function tests that don't touch Supabase keep working unchanged.
 */

let cachedService: SupabaseClient | null = null;
let warnedMissingService = false;
let warnedMissingAnon = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export function serviceClient(): SupabaseClient | null {
  if (cachedService) return cachedService;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warnedMissingService) {
      console.warn("[ms2go] SUPABASE_SERVICE_ROLE_KEY not set — service client unavailable");
      warnedMissingService = true;
    }
    return null;
  }
  cachedService = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-ms2go-source": "netlify-fn" } },
  });
  return cachedService;
}

export function userClient(jwt: string | null | undefined): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (!warnedMissingAnon) {
      console.warn("[ms2go] SUPABASE_URL / SUPABASE_ANON_KEY not set — user client unavailable");
      warnedMissingAnon = true;
    }
    return null;
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
  });
}

export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  return scheme?.toLowerCase() === "bearer" ? (token ?? null) : null;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  jwt: string;
  client: SupabaseClient;
}

export async function currentUser(req: Request): Promise<CurrentUser | null> {
  const jwt = extractBearer(req);
  if (!jwt) return null;
  const client = userClient(jwt);
  if (!client) return null;
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, jwt, client };
}

/**
 * "Best-effort" persistence. Use inside existing handlers so that Supabase
 * being misconfigured (or the caller being anonymous) never breaks the
 * primary function response — we only log on failure.
 */
export async function tryPersist<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[ms2go] tryPersist(${label}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
