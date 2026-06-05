import { serviceClient, type CurrentUser } from "./supabase";

/**
 * Usage / cost tracking.
 *
 * Logs portal-side usage events and the external API categories they trigger
 * (DataForSEO, Google Places, OpenAI, Resend, ...). This is a portal-activity
 * + estimated-vendor-usage ledger, NOT a billing feed. Final vendor invoices
 * may vary.
 *
 * Design notes:
 *  - Writes go through the service-role client so a row is recorded even when
 *    the caller is an anonymous rep or RLS would otherwise block the insert.
 *    Reps can never read usage_events (no select policy for them), so the
 *    service-role write is safe.
 *  - logUsage is best-effort: any failure is logged to the server console and
 *    swallowed. A logging failure must never break the rep-facing flow.
 *  - No secrets, tokens, raw upstream payloads, or customer PII should be put
 *    in metadata. Keep it to coarse descriptors (location, industry, counts).
 */

export const ACTION_TYPES = [
  "lead_search",
  "google_places_enrichment",
  "dataforseo_lead_search",
  "dataforseo_seo_analysis",
  "heat_map_scan",
  "ai_email_draft",
  "ai_proposal_generation",
  "ai_business_brief",
  "demo_website_request",
  "calendly_booking_link",
  "resend_email_send",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const PROVIDERS = [
  "DataForSEO",
  "Google Places",
  "OpenAI/LLM",
  "Resend",
  "Netlify",
  "Calendly",
  "Supabase",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface UsageEventInput {
  actionType: ActionType;
  provider: Provider;
  units?: number;
  metadata?: Record<string, unknown>;
}

export interface UsageActor {
  id: string | null;
  email: string | null;
  name?: string | null;
}

/**
 * Resolve a usage actor from an authenticated CurrentUser (or null when the
 * caller is anonymous). Server functions already call currentUser(req) for
 * persistence; pass the same result here.
 */
export function actorFromUser(me: CurrentUser | null): UsageActor {
  if (!me) return { id: null, email: null, name: null };
  return { id: me.id, email: me.email, name: null };
}

/**
 * Best-effort usage logger. Never throws. Returns true when a row was written,
 * false otherwise (misconfiguration, write error, ...). The boolean is mostly
 * for tests — callers should treat this as fire-and-forget.
 */
export async function logUsage(
  actor: UsageActor,
  event: UsageEventInput,
): Promise<boolean> {
  try {
    const client = serviceClient();
    if (!client) {
      // Service role not configured (e.g. local dev / preview). Stay silent to
      // the rep; this is visible only in server logs.
      return false;
    }
    const { error } = await client.from("usage_events").insert({
      rep_id: actor.id,
      rep_email: actor.email,
      rep_name: actor.name ?? null,
      action_type: event.actionType,
      provider: event.provider,
      units: event.units ?? 1,
      metadata: sanitizeMetadata(event.metadata),
    });
    if (error) {
      console.warn("[ms2go] logUsage insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[ms2go] logUsage threw:", err instanceof Error ? err.message : err);
    return false;
  }
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization|bearer|credential|jwt)/i;

/**
 * Drop anything that looks like a secret and cap value sizes so a stray large
 * payload can't bloat the ledger. Defensive — callers already pass coarse
 * descriptors, but this guarantees no key/token leaks into metadata.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      out[key] = value.length > 200 ? value.slice(0, 200) : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 25);
    }
    // Objects are intentionally dropped to avoid nesting raw payloads.
  }
  return out;
}

// =============================================================================
// Dashboard data transform (pure — unit tested)
// =============================================================================

export interface UsageEventRow {
  id: string;
  rep_id: string | null;
  rep_email: string | null;
  rep_name: string | null;
  action_type: string;
  provider: string;
  units: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UsageSummary {
  totalActions: number;
  totalUnits: number;
  leadSearches: number;
  aiGenerations: number;
  heatMapScans: number;
  demoRequests: number;
  emailsSent: number;
}

export interface UsageByRep {
  repId: string | null;
  repEmail: string | null;
  repName: string | null;
  eventCount: number;
  totalUnits: number;
}

export interface UsageByProvider {
  provider: string;
  eventCount: number;
  totalUnits: number;
}

export interface UsageDashboardData {
  summary: UsageSummary;
  byRep: UsageByRep[];
  byProvider: UsageByProvider[];
  recent: UsageEventRow[];
}

const LEAD_SEARCH_ACTIONS = new Set(["lead_search", "dataforseo_lead_search"]);
const AI_ACTIONS = new Set([
  "ai_email_draft",
  "ai_proposal_generation",
  "ai_business_brief",
]);
const EMAIL_ACTIONS = new Set(["resend_email_send"]);

/**
 * Transform a flat list of usage events into the shape the admin dashboard
 * renders. Pure and deterministic so it can be unit tested without Supabase.
 */
export function summarizeUsage(events: UsageEventRow[]): UsageDashboardData {
  const summary: UsageSummary = {
    totalActions: events.length,
    totalUnits: 0,
    leadSearches: 0,
    aiGenerations: 0,
    heatMapScans: 0,
    demoRequests: 0,
    emailsSent: 0,
  };

  const repMap = new Map<string, UsageByRep>();
  const providerMap = new Map<string, UsageByProvider>();

  for (const e of events) {
    const units = Number.isFinite(e.units) ? e.units : 0;
    summary.totalUnits += units;

    if (LEAD_SEARCH_ACTIONS.has(e.action_type)) summary.leadSearches += 1;
    if (AI_ACTIONS.has(e.action_type)) summary.aiGenerations += 1;
    if (e.action_type === "heat_map_scan") summary.heatMapScans += 1;
    if (e.action_type === "demo_website_request") summary.demoRequests += 1;
    if (EMAIL_ACTIONS.has(e.action_type)) summary.emailsSent += 1;

    const repKey = e.rep_id ?? `email:${e.rep_email ?? "unknown"}`;
    const rep = repMap.get(repKey);
    if (rep) {
      rep.eventCount += 1;
      rep.totalUnits += units;
    } else {
      repMap.set(repKey, {
        repId: e.rep_id,
        repEmail: e.rep_email,
        repName: e.rep_name,
        eventCount: 1,
        totalUnits: units,
      });
    }

    const prov = providerMap.get(e.provider);
    if (prov) {
      prov.eventCount += 1;
      prov.totalUnits += units;
    } else {
      providerMap.set(e.provider, {
        provider: e.provider,
        eventCount: 1,
        totalUnits: units,
      });
    }
  }

  const byRep = [...repMap.values()].sort((a, b) => b.eventCount - a.eventCount);
  const byProvider = [...providerMap.values()].sort(
    (a, b) => b.eventCount - a.eventCount,
  );

  // events arrive newest-first from the query; keep that order for "recent".
  return { summary, byRep, byProvider, recent: events.slice(0, 50) };
}
