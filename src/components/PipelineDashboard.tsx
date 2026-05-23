import { useEffect, useState, type FC } from "react";
import { supabase, supabaseConfigured, authHeader } from "../lib/supabase";

interface DashboardData {
  user: { id: string; email: string | null };
  counts: { leads: number; prospects: number; proposals: number; sales: number };
  recent_activity: Array<{ id: string; channel: string; direction: string; subject: string | null; created_at: string }>;
  commissions: Array<{ id: string; rep_id: string; kind: string; amount: number; status: string; period_month: string }>;
  pipeline: Array<{
    owner_id: string;
    new_count: number;
    engaged_count: number;
    qualified_count: number;
    opportunity_count: number;
    won_count: number;
    lost_count: number;
  }>;
}

export const PipelineDashboard: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(Boolean(s)));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { headers: await authHeader() });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        setData((await res.json()) as DashboardData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authed]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setAuthMsg(error ? error.message : "Check your inbox for a sign-in link.");
  }

  if (!supabaseConfigured) {
    return (
      <section className="card">
        <h2>Pipeline</h2>
        <p className="subtitle">Supabase isn't configured for this build.</p>
        <p className="notice warn">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Netlify and redeploy to enable the live dashboard.
        </p>
      </section>
    );
  }

  if (!authed) {
    return (
      <section className="card" style={{ maxWidth: 480 }}>
        <h2>Sign in</h2>
        <p className="subtitle">We'll email you a secure link — no password needed.</p>
        <form onSubmit={sendLink}>
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" />
          <div className="actions">
            <button type="submit" className="primary">Send sign-in link</button>
          </div>
          {authMsg && <p className="muted" style={{ marginTop: 8 }}>{authMsg}</p>}
        </form>
      </section>
    );
  }

  if (loading) return <p className="muted">Loading your numbers…</p>;
  if (error) {
    return (
      <section className="card">
        <h2>Couldn't load your dashboard</h2>
        <p className="error">{error}</p>
      </section>
    );
  }
  if (!data) return null;

  const pendingEarnings = data.commissions
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <h2>Pipeline</h2>
            <p className="subtitle">Signed in as {data.user.email ?? "rep"}.</p>
          </div>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
        <div className="row">
          <Metric label="Leads" value={data.counts.leads} />
          <Metric label="Prospects" value={data.counts.prospects} />
          <Metric label="Proposals" value={data.counts.proposals} />
          <Metric label="Sales" value={data.counts.sales} />
          <Metric label="Earnings (pending)" value={`$${pendingEarnings.toFixed(2)}`} />
        </div>
      </section>

      <section className="card">
        <h2>Pipeline by rep</h2>
        {data.pipeline.length === 0 ? (
          <p className="muted">No pipeline activity yet. Add a lead to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Rep</th><th>New</th><th>Engaged</th><th>Qualified</th><th>Opportunity</th><th>Won</th><th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {data.pipeline.map((p) => (
                <tr key={p.owner_id}>
                  <td>{p.owner_id.slice(0, 8)}…</td>
                  <td>{p.new_count}</td>
                  <td>{p.engaged_count}</td>
                  <td>{p.qualified_count}</td>
                  <td>{p.opportunity_count}</td>
                  <td>{p.won_count}</td>
                  <td>{p.lost_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        {data.recent_activity.length === 0 ? (
          <p className="muted">No outreach yet. Draft your first email to log activity.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th><th>Channel</th><th>Direction</th><th>Subject</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_activity.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.channel}</td>
                  <td>{a.direction}</td>
                  <td>{a.subject || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
};

const Metric: FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="tier">
    <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    <div className="price">{value}</div>
  </div>
);
