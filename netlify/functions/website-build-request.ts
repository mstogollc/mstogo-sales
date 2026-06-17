import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson, json } from "./_lib/http";
import { currentUser } from "./_lib/supabase";
import { actorFromUser, logUsage } from "./_lib/usage";

/**
 * Website / demo build requests.
 *
 * POST  — a rep asks MS2GO to build a demo or first website for a prospect.
 *         The request row is persisted (best-effort) and a usage event is
 *         logged. We never claim a site was generated here — fulfillment is a
 *         separate, human step that flips the status to ready.
 * GET    — list the requests the caller can see (their own; managers/admins see
 *         all) so the rep can track status without leaving the portal.
 */

type SupabaseError = { code?: string | null; message?: string | null } | null | undefined;

function isSchemaCacheMissError(err: SupabaseError): boolean {
  if (!err) return false;
  if (err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || msg.includes("could not find table");
}

interface CreateBody {
  businessName?: string;
  currentWebsite?: string;
  noWebsite?: boolean;
  contactName?: string;
  contactEmail?: string;
  city?: string;
  state?: string;
  industry?: string;
  goals?: string;
  leadId?: string;
  prospectId?: string;
}

const SELECT_COLUMNS =
  "id, business_name, current_website, no_website, contact_name, contact_email, city, state, industry, goals, status, preview_url, notes, requested_at, created_at, updated_at";

function trimOrNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

async function handleCreate(req: Request) {
  let body: CreateBody;
  try {
    body = await readJson<CreateBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const businessName = body.businessName?.trim();
  if (!businessName) return badRequest("missing_business_name");

  const noWebsite = Boolean(body.noWebsite);
  // If they're building a first site, the current-website field is meaningless;
  // drop it so we never persist a stale URL against a "no website" request.
  const currentWebsite = noWebsite ? null : trimOrNull(body.currentWebsite);

  const me = await currentUser(req);

  const row = {
    owner_id: me?.id ?? null,
    lead_id: trimOrNull(body.leadId),
    prospect_id: trimOrNull(body.prospectId),
    business_name: businessName,
    current_website: currentWebsite,
    no_website: noWebsite,
    contact_name: trimOrNull(body.contactName),
    contact_email: trimOrNull(body.contactEmail),
    city: trimOrNull(body.city),
    state: trimOrNull(body.state),
    industry: trimOrNull(body.industry),
    goals: trimOrNull(body.goals),
    status: "requested" as const,
  };

  let saved: Record<string, unknown> | null = null;
  let persisted = false;
  if (me) {
    const { data, error } = await me.client
      .from("website_build_requests")
      .insert(row)
      .select(SELECT_COLUMNS)
      .single();
    if (error) {
      if (isSchemaCacheMissError(error)) {
        return json(503, { error: "crm_setup_required", code: "PGRST205", detail: error.message ?? "" });
      }
      return badRequest(error.message ?? "request_failed");
    }
    saved = data as Record<string, unknown>;
    persisted = true;
  }

  await logUsage(actorFromUser(me), {
    actionType: "demo_website_request",
    provider: "Netlify",
    metadata: {
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      industry: row.industry ?? undefined,
      noWebsite,
    },
  });

  return ok({ request: saved, persisted, status: "requested" });
}

async function handleList(req: Request) {
  const me = await currentUser(req);
  if (!me) return json(401, { error: "not_authenticated" });

  const { data, error } = await me.client
    .from("website_build_requests")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isSchemaCacheMissError(error)) {
      return json(503, { error: "crm_setup_required", code: "PGRST205", detail: error.message ?? "" });
    }
    return json(400, { error: error.message });
  }

  return ok({ requests: data ?? [] });
}

export default async (req: Request, _ctx: Context) => {
  if (req.method === "POST") return handleCreate(req);
  if (req.method === "GET") return handleList(req);
  return methodNotAllowed(["GET", "POST"]);
};
