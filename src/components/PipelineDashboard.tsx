import { useEffect, useState, type FC } from "react";
import { supabase, supabaseConfigured, authHeader } from "../lib/supabase";
import { getAuthRedirect } from "../lib/authRedirect";

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

const ADMIN_EMAILS = new Set(["mstogollc@gmail.com", "admin@mstogo.com", "joe@mstogo.com"]);

const MIGRATION_FILES = [
  "supabase/migrations/20260523000000_init_crm_foundation.sql",
  "supabase/migrations/20260524000000_rep_payout_accounts.sql",
];

function isMissingTableMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("pgrst205") || m.includes("could not find the table") || m.includes("could not find table");
}

function supabaseSqlEditorUrl(): string | null {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  try {
    const u = new URL(url);
    const host = u.hostname;
    const m = /^([^.]+)\.supabase\.(co|in)$/.exec(host);
    if (!m) return null;
    return `https://supabase.com/dashboard/project/${m[1]}/sql/new`;
  } catch {
    return null;
  }
}

export const PipelineDashboard: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
      setUserEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(Boolean(s));
      setUserEmail(s?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setError(null);
    setSetupRequired(false);
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { headers: await authHeader() });
        const payload = (await res.json().catch(() => ({}))) as
          | (DashboardData & { error?: undefined })
          | { error: string; code?: string; detail?: string; user?: { email: string | null } };

        if (!res.ok) {
          const errMsg = (payload as { error?: string }).error ?? res.statusText;
          const code = (payload as { code?: string }).code;
          const detail = (payload as { detail?: string }).detail ?? "";
          if (
            res.status === 503 ||
            code === "PGRST205" ||
            errMsg === "crm_setup_required" ||
            isMissingTableMessage(errMsg) ||
            isMissingTableMessage(detail)
          ) {
            setSetupRequired(true);
            const respUser = (payload as { user?: { email: string | null } }).user;
            if (respUser?.email) setUserEmail(respUser.email);
            return;
          }
          throw new Error(errMsg);
        }

        setData(payload as DashboardData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load dashboard.";
        if (isMissingTableMessage(message)) {
          setSetupRequired(true);
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authed]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg(null);
    if (!supabase) {
      setAuthMsg("Sign-in is unavailable because Supabase isn't configured for this build.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthRedirect() },
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

  if (setupRequired) {
    return <SetupNeeded userEmail={userEmail} />;
  }

  if (error) {
    return (
      <section className="card">
        <h2>Couldn't load your dashboard</h2>
        <p className="muted">We hit an unexpected error while loading your numbers. Try refreshing in a minute — the other tabs (Lead Intel, Email, Proposal, Training, Payouts) still work in the meantime.</p>
        <p className="error" style={{ opacity: 0.7 }}>{error}</p>
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
          <button className="ghost" onClick={() => supabase?.auth.signOut()}>Sign out</button>
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

const SetupNeeded: FC<{ userEmail: string | null }> = ({ userEmail }) => {
  const isAdmin = userEmail ? ADMIN_EMAILS.has(userEmail.toLowerCase()) : false;
  const sqlEditor = supabaseSqlEditorUrl();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h2>Pipeline</h2>
          <p className="subtitle">
            {userEmail ? <>Signed in as {userEmail}.</> : <>Signed in.</>}
          </p>
        </div>
        <button className="ghost" onClick={() => supabase?.auth.signOut()}>Sign out</button>
      </div>

      <div
        className="indicator yellow"
        style={{ marginTop: 4, marginBottom: 12 }}
      >
        <span className="dot" />
        CRM database setup pending
      </div>

      <p className="branded-body" style={{ marginTop: 0 }}>
        CRM database setup is pending. Apply the Supabase migrations to activate
        pipeline, commissions, audit log, and payout storage.
      </p>
      <p className="muted">
        In the meantime, the rest of the portal still works — switch tabs above
        to use <strong>Lead Intel</strong>, <strong>Email</strong>,{" "}
        <strong>Proposal</strong>, <strong>Training</strong>, and{" "}
        <strong>Payouts</strong>.
      </p>

      {isAdmin && (
        <>
          <div className="divider" />
          <h3 className="section-title" style={{ marginTop: 0 }}>Admin: apply migrations</h3>
          <p className="branded-body" style={{ marginTop: 0 }}>
            Run these migration files in the Supabase SQL editor, in order:
          </p>
          <ul className="signal-list" style={{ marginBottom: 12 }}>
            {MIGRATION_FILES.map((f) => (
              <li key={f}>
                <span className="label" style={{ flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 500 }}>{f}</span>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => copy(f, f)}
                  aria-label={`Copy ${f}`}
                >
                  {copied === f ? "Copied" : "Copy path"}
                </button>
              </li>
            ))}
          </ul>
          <div className="actions">
            {sqlEditor && (
              <a
                className="branded-button branded-button-primary"
                href={sqlEditor}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Supabase SQL editor
              </a>
            )}
            {sqlEditor && (
              <button
                className="branded-button branded-button-ghost"
                type="button"
                onClick={() => copy(sqlEditor, "sql-editor")}
              >
                {copied === "sql-editor" ? "Link copied" : "Copy editor link"}
              </button>
            )}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            After running both migrations, return to this tab and refresh —
            pipeline, commissions, and audit log will activate automatically.
          </p>
        </>
      )}
    </section>
  );
};

const Metric: FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="tier">
    <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    <div className="price">{value}</div>
  </div>
);
