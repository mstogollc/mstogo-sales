import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

if (!supabaseConfigured && typeof window !== "undefined") {
  console.warn("[ms2go] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; auth is disabled");
}

export const supabase: SupabaseClient = createClient(url ?? "https://placeholder.invalid", anon ?? "anon", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function authHeader(): Promise<Record<string, string>> {
  if (!supabaseConfigured) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
