import { useCallback, useEffect, useState, type FC } from "react";
import { authHeader } from "../lib/supabase";

type Range = "today" | "7d" | "30d" | "all";

interface UsageSummary {
  totalActions: number;
  totalUnits: number;
  leadSearches: number;
  aiGenerations: number;
  heatMapScans: number;
  demoRequests: number;
  emailsSent: number;
}

interface UsageByRep {
  repId: string | null;
  repEmail: string | null;
  repName: string | null;
  eventCount: number;
  totalUnits: number;
}

interface UsageByProvider {
  provider: string;
  eventCount: number;
  totalUnits: number;
}

interface UsageEventRow {
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

interface UsageDashboardResponse {
  range: string;
  summary: UsageSummary;
  byRep: UsageByRep[];
  byProvider: UsageByProvider[];
  recent: UsageEventRow[];
}

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const ACTION_LABELS: Record<string, string> = {
  lead_search: "Lead search",
  dataforseo_lead_search: "Lead search",
  google_places_enrichment: "Places enrichment",
  dataforseo_seo_analysis: "SEO analysis",
  heat_map_scan: "Heat map scan",
  ai_email_draft: "AI email draft",
  ai_proposal_generation: "AI proposal",
  ai_business_brief: "AI business brief",
  demo_website_request: "Demo website request",
  calendly_booking_link: "Calendly booking link",
  resend_email_send: "Email sent",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

function metadataSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  const parts: string[] = [];
  const city = meta.city as string | undefined;
  const state = meta.state as string | undefined;
  if (city) parts.push(state ? `${city}, ${state}` : city);
  if (meta.industry) parts.push(String(meta.industry));
  if (typeof meta.resultCount === "number") parts.push(`${meta.resultCount} results`);
  if (typeof meta.gridSize === "number") parts.push(`${meta.gridSize}×${meta.gridSize} grid`);
  if (typeof meta.recipientCount === "number") parts.push(`${meta.recipientCount} recipient(s)`);
  if (meta.tier) parts.push(String(meta.tier));
  if (meta.source) parts.push(String(meta.source));
  return parts.slice(0, 3).join(" · ");
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SummaryCard: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div
    className="tier"
    style={{ textAlign: "left", background: "white" }}
  >
    <div style={{ fontSize: 28, fontWeight: 700, color: "#0b5fff" }}>
      {value.toLocaleString()}
    </div>
    <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{label}</p>
  </div>
);

export const UsageDashboard: FC = () => {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<UsageDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage-dashboard?range=${r}`, {
        headers: await authHeader(),
      });
      if (res.status === 403) {
        setError("This dashboard is available to administrators only.");
        setData(null);
        return;
      }
      if (res.status === 401) {
        setError("Please sign in to view usage.");
        setData(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as
        | UsageDashboardResponse
        | { error?: string };
      if (!res.ok) {
        const code = (body as { error?: string }).error ?? "";
        if (code === "usage_setup_required") {
          setError(
            "Usage tracking isn't set up yet. Apply the usage_tracking migration in Supabase, then reload.",
          );
        } else {
          setError("Couldn't load usage right now. Try again in a moment.");
        }
        setData(null);
        return;
      }
      setData(body as UsageDashboardResponse);
    } catch {
      setError("Couldn't reach the usage service. Try again in a moment.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const summary = data?.summary;

  return (
    <>
      <section className="card">
        <div className="ops-page-head">
          <div>
            <h2>Usage &amp; Cost</h2>
            <p className="subtitle">
              Portal activity and external API usage by rep and provider.
            </p>
          </div>
          <div className="actions">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={range === r.id ? "primary" : "ghost"}
                onClick={() => setRange(r.id)}
                disabled={loading}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="notice" style={{ marginTop: 4 }}>
          This tracks portal activity and external API usage events. Final vendor
          invoices may vary.
        </div>

        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        {loading && !data && <p className="muted" style={{ marginTop: 12 }}>Loading usage…</p>}

        {summary && (
          <div className="tier-grid" style={{ marginTop: 16 }}>
            <SummaryCard label="Total tracked actions" value={summary.totalActions} />
            <SummaryCard label="Lead searches" value={summary.leadSearches} />
            <SummaryCard label="AI generations" value={summary.aiGenerations} />
            <SummaryCard label="Heat map scans" value={summary.heatMapScans} />
            <SummaryCard label="Demo requests" value={summary.demoRequests} />
            <SummaryCard label="Emails sent" value={summary.emailsSent} />
          </div>
        )}
      </section>

      {data && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <section className="card" style={{ flex: 1 }}>
            <h2>By rep</h2>
            <p className="subtitle">Tracked actions attributed to each rep.</p>
            {data.byRep.length === 0 ? (
              <p className="muted">No usage in this range yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Actions</th>
                    <th>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRep.map((r) => (
                    <tr key={r.repId ?? r.repEmail ?? "unknown"}>
                      <td>{r.repName || r.repEmail || "Unattributed"}</td>
                      <td>{r.eventCount.toLocaleString()}</td>
                      <td>{r.totalUnits.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card" style={{ flex: 1 }}>
            <h2>By provider</h2>
            <p className="subtitle">Estimated external API usage by category.</p>
            {data.byProvider.length === 0 ? (
              <p className="muted">No usage in this range yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Events</th>
                    <th>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProvider.map((p) => (
                    <tr key={p.provider}>
                      <td>{p.provider}</td>
                      <td>{p.eventCount.toLocaleString()}</td>
                      <td>{p.totalUnits.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {data && (
        <section className="card">
          <h2>Recent events</h2>
          <p className="subtitle">Latest tracked portal actions.</p>
          {data.recent.length === 0 ? (
            <p className="muted">No events recorded in this range yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Action</th>
                    <th>Provider</th>
                    <th>Units</th>
                    <th>When</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e) => (
                    <tr key={e.id}>
                      <td>{e.rep_name || e.rep_email || "Unattributed"}</td>
                      <td>{actionLabel(e.action_type)}</td>
                      <td>{e.provider}</td>
                      <td>{Number(e.units).toLocaleString()}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {formatTimestamp(e.created_at)}
                      </td>
                      <td className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
                        {metadataSummary(e.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
};
