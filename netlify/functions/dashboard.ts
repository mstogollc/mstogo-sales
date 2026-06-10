import type { Context } from "@netlify/functions";
import { ok, methodNotAllowed, json } from "./_lib/http";
import { currentUser } from "./_lib/supabase";

/**
 * Live dashboard reads. RLS already restricts visibility:
 * - reps see only their own (+ sponsored) data
 * - super_admins / managers see everything
 *
 * Returns zeros and empty arrays when the caller is unauthenticated so the
 * dashboard UI can still render a sign-in state without errors.
 */

type SupabaseError = { code?: string | null; message?: string | null } | null | undefined;

export function isSchemaCacheMissError(err: SupabaseError): boolean {
  if (!err) return false;
  if (err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || msg.includes("could not find table");
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);

  const me = await currentUser(req);
  if (!me) {
    return json(401, { error: "not_authenticated" });
  }

  try {
    const [leadsRes, prospectsRes, proposalsRes, salesRes, activityRes, commissionsRes, pipelineRes] = await Promise.all([
      me.client.from("leads").select("id", { count: "exact", head: true }),
      me.client.from("prospects").select("id", { count: "exact", head: true }),
      me.client.from("proposals").select("id", { count: "exact", head: true }),
      me.client.from("sales").select("id", { count: "exact", head: true }),
      me.client
        .from("outreach_activity")
        .select("id, channel, direction, subject, created_at, owner_id")
        .order("created_at", { ascending: false })
        .limit(20),
      me.client
        .from("commissions")
        .select("id, rep_id, kind, amount, status, period_month")
        .order("created_at", { ascending: false })
        .limit(50),
      me.client.from("v_pipeline_summary").select("*"),
    ]);

    const allResults = [leadsRes, prospectsRes, proposalsRes, salesRes, activityRes, commissionsRes, pipelineRes];

    const schemaMiss = allResults.find((r) => "error" in r && isSchemaCacheMissError(r.error as SupabaseError));
    if (schemaMiss && "error" in schemaMiss && schemaMiss.error) {
      const detail = (schemaMiss.error as { message?: string }).message ?? "";
      return json(503, {
        error: "crm_setup_required",
        code: "PGRST205",
        detail,
        user: { id: me.id, email: me.email },
      });
    }

    const firstError = allResults.find((r) => "error" in r && r.error);
    if (firstError && "error" in firstError && firstError.error) {
      return json(400, { error: firstError.error.message });
    }

    return ok({
      user: { id: me.id, email: me.email },
      counts: {
        leads: leadsRes.count ?? 0,
        prospects: prospectsRes.count ?? 0,
        proposals: proposalsRes.count ?? 0,
        sales: salesRes.count ?? 0,
      },
      recent_activity: activityRes.data ?? [],
      commissions: commissionsRes.data ?? [],
      pipeline: pipelineRes.data ?? [],
    });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "dashboard_failed" });
  }
};
