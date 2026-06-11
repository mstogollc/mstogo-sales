import type { Context } from "@netlify/functions";
import { ok, methodNotAllowed, json } from "./_lib/http";
import { currentUser } from "./_lib/supabase";
import { summarizeUsage, type UsageEventRow } from "./_lib/usage";
import { isSchemaCacheMissError } from "./dashboard";

/**
 * GET /api/usage-dashboard?range=7d|30d|today|all
 *
 * Admin-only usage / cost dashboard feed. Reps cannot read usage_events
 * (RLS blocks them), but we also gate explicitly here so a rep gets a clean
 * 403 rather than an empty dashboard. Super admins + managers see all reps'
 * usage.
 *
 * This is a portal-activity + estimated-vendor-usage ledger, NOT a billing
 * feed. Final vendor invoices may vary.
 */

type Range = "today" | "7d" | "30d" | "all";

export function rangeStart(range: Range, now: Date): string | null {
  const d = new Date(now);
  switch (range) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    case "7d":
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    case "30d":
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    case "all":
    default:
      return null;
  }
}

function parseRange(value: string | null): Range {
  if (value === "today" || value === "7d" || value === "30d" || value === "all") {
    return value;
  }
  return "7d";
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);

  const me = await currentUser(req);
  if (!me) return json(401, { error: "not_authenticated" });

  // Explicit admin gate: confirm the caller's profile role. is_super_admin /
  // is_manager are the same checks the usage_events RLS policy uses.
  const { data: profile, error: profileErr } = await me.client
    .from("profiles")
    .select("role")
    .eq("id", me.id)
    .single();

  if (profileErr && isSchemaCacheMissError(profileErr)) {
    return json(503, { error: "crm_setup_required", code: "PGRST205" });
  }

  const role = profile?.role ?? "rep";
  const isAdmin = role === "super_admin" || role === "manager";
  if (!isAdmin) {
    return json(403, { error: "forbidden" });
  }

  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    let query = me.client
      .from("usage_events")
      .select(
        "id, rep_id, rep_email, rep_name, action_type, provider, units, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    if (from || to) {
      // Custom range takes precedence when provided.
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
    } else {
      const start = rangeStart(range, new Date());
      if (start) query = query.gte("created_at", start);
    }

    const { data, error } = await query;

    if (error && isSchemaCacheMissError(error)) {
      return json(503, { error: "usage_setup_required", code: "PGRST205" });
    }
    if (error) {
      return json(400, { error: error.message });
    }

    const events = (data ?? []) as UsageEventRow[];
    const dashboard = summarizeUsage(events);

    return ok({
      user: { id: me.id, email: me.email },
      range: from || to ? "custom" : range,
      ...dashboard,
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : "usage_dashboard_failed",
    });
  }
};
