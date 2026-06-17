import { useEffect, useRef, useState, type FC } from "react";
import { api, type AnalyzeResponse, type WebsiteBuildRequestRecord, type WebsiteBuildStatus } from "../api";
import { resolveProspectFacts, useActiveProspect, updateActiveProspect } from "../lib/prospect";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { getAuthRedirect } from "../lib/authRedirect";
import { TypelessButton } from "./TypelessButton";

interface Props {
  analysis: AnalyzeResponse | null;
}

interface StatusMeta {
  label: string;
  tone: "green" | "yellow" | "red";
  blurb: string;
}

// Sales-facing status vocabulary. The database also has a "cancelled" state for
// admins; reps only ever see the four below plus a graceful fallback.
const STATUS_META: Record<WebsiteBuildStatus, StatusMeta> = {
  requested: { label: "Requested", tone: "yellow", blurb: "We've got it — your build is in the queue." },
  in_progress: { label: "In progress", tone: "yellow", blurb: "Our team is putting the demo together." },
  ready: { label: "Ready", tone: "green", blurb: "The demo is ready to show your prospect." },
  needs_info: { label: "Needs info", tone: "red", blurb: "We need a little more from you to continue." },
  cancelled: { label: "Cancelled", tone: "red", blurb: "This request was cancelled." },
};

function statusMeta(status: WebsiteBuildStatus): StatusMeta {
  return STATUS_META[status] ?? { label: status, tone: "yellow", blurb: "" };
}

export const WebsiteBuildRequest: FC<Props> = ({ analysis }) => {
  const prospect = useActiveProspect();
  const facts = resolveProspectFacts(prospect, analysis);

  const [businessName, setBusinessName] = useState(facts.businessName ?? "");
  const [website, setWebsite] = useState(facts.website ?? "");
  const [noWebsite, setNoWebsite] = useState<boolean>(prospect?.noWebsite ?? false);
  const [contactName, setContactName] = useState(facts.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(facts.contactEmail ?? "");
  const [city, setCity] = useState(facts.city ?? "");
  const [state, setState] = useState(facts.state ?? "");
  const [industry, setIndustry] = useState(facts.industry ?? "");
  const [goals, setGoals] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<WebsiteBuildStatus | null>(null);

  const [authed, setAuthed] = useState(false);
  const [requests, setRequests] = useState<WebsiteBuildRequestRecord[] | null>(null);

  // Prefill from the selected prospect whenever a new one is chosen upstream so
  // the rep never re-types the business they're already working.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = facts.businessName ?? null;
    if (key && prefilledFor.current !== key) {
      prefilledFor.current = key;
      setBusinessName(facts.businessName ?? "");
      setWebsite(facts.website ?? "");
      setNoWebsite(prospect?.noWebsite ?? false);
      setContactName(facts.contactName ?? "");
      setContactEmail(facts.contactEmail ?? "");
      setCity(facts.city ?? "");
      setState(facts.state ?? "");
      setIndustry(facts.industry ?? "");
    }
  }, [facts, prospect]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setAuthed(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(Boolean(s)));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRequests() {
    if (!authed) return;
    try {
      const { requests } = await api.listWebsiteBuildRequests();
      setRequests(requests);
    } catch {
      // A listing failure shouldn't block submitting a new request; the request
      // form stays fully usable and we simply skip the tracker.
      setRequests(null);
    }
  }

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function handleSubmit() {
    setError(null);
    if (!businessName.trim()) {
      setError("Add the business name so we know who the demo is for.");
      return;
    }
    setSubmitting(true);
    try {
      // Keep the shared prospect record in step with what the rep typed here so
      // the other modules (Intel, Proposal, Outreach) carry the same facts.
      updateActiveProspect({
        businessName: businessName.trim() || undefined,
        website: noWebsite ? undefined : website.trim() || undefined,
        noWebsite,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        industry: industry.trim() || undefined,
      });

      const res = await api.createWebsiteBuildRequest({
        businessName: businessName.trim(),
        currentWebsite: noWebsite ? undefined : website.trim() || undefined,
        noWebsite,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        industry: industry.trim() || undefined,
        goals: goals.trim() || undefined,
      });
      setJustSubmitted(res.status);
      setGoals("");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your request. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Website Build Request</h2>
        <p className="subtitle">
          Ask the MS2GO team to build a demo website for your prospect. We'll pull in what you already know about them —
          you just confirm the details and send.
        </p>

        {facts.businessName && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Working selected prospect: <strong>{facts.businessName}</strong>
            {facts.industry ? ` · ${facts.industry}` : ""}
            {facts.city ? ` · ${facts.city}${facts.state ? `, ${facts.state}` : ""}` : ""}
          </div>
        )}

        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-business">Business name</label>
            <input
              id="wbr-business"
              placeholder="e.g. Joe's Pizza"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                updateActiveProspect({ businessName: e.target.value });
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-industry">Industry (optional)</label>
            <input
              id="wbr-industry"
              placeholder="e.g. Restaurant, HVAC, Salon"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-city">City (optional)</label>
            <input id="wbr-city" placeholder="e.g. Gulfport" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-state">State (optional)</label>
            <input id="wbr-state" placeholder="e.g. MS" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-contact">Contact name (optional)</label>
            <input
              id="wbr-contact"
              placeholder="Who you're working with"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-email">Contact email (optional)</label>
            <input
              id="wbr-email"
              type="email"
              placeholder="name@business.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="wbr-website">Current website (optional)</label>
            <input
              id="wbr-website"
              type="url"
              inputMode="url"
              placeholder={noWebsite ? "Not needed — building their first website" : "e.g. www.theirbusiness.com"}
              value={noWebsite ? "" : website}
              disabled={noWebsite}
              onChange={(e) => {
                setWebsite(e.target.value);
                updateActiveProspect({ website: e.target.value });
              }}
            />
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              {noWebsite
                ? "Website not required — “No existing website” is checked below."
                : "If they already have a site, add it so we can match the look. Leave it blank if you don't have it."}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="checkbox-row" htmlFor="wbr-no-website">
            <input
              id="wbr-no-website"
              type="checkbox"
              checked={noWebsite}
              onChange={(e) => {
                setNoWebsite(e.target.checked);
                updateActiveProspect({ noWebsite: e.target.checked });
              }}
            />
            <span>
              <strong>No existing website</strong> — this business doesn't have a website yet. We'll build their first
              professional site from scratch.
            </span>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label htmlFor="wbr-goals">What should the demo highlight? (optional)</label>
          <textarea
            id="wbr-goals"
            placeholder="e.g. online ordering, booking, showcase their work, drive more calls"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
          />
          <TypelessButton value={goals} onChange={setGoals} />
        </div>

        <div className="actions">
          <button className="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Sending request…" : "Request demo website"}
          </button>
        </div>

        {error && (
          <p className="error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {justSubmitted && !error && (
          <div className="notice" style={{ marginTop: 12 }}>
            <span className={`indicator ${statusMeta(justSubmitted).tone}`} style={{ marginRight: 8 }}>
              <span className="dot" />
              {statusMeta(justSubmitted).label}
            </span>
            Request sent for <strong>{businessName.trim()}</strong>. {statusMeta(justSubmitted).blurb} You'll see status
            updates below.
          </div>
        )}
      </section>

      {!supabaseConfigured ? null : !authed ? (
        <RequestSignIn />
      ) : (
        <section className="card">
          <h2>Your build requests</h2>
          {requests === null ? (
            <p className="muted">Sign in to track your requests, or send your first one above.</p>
          ) : requests.length === 0 ? (
            <p className="muted">No requests yet. Send your first demo website request above.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Where</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const meta = statusMeta(r.status);
                  return (
                    <tr key={r.id}>
                      <td>{r.business_name}</td>
                      <td>{r.city ? `${r.city}${r.state ? `, ${r.state}` : ""}` : "—"}</td>
                      <td>
                        <span className={`indicator ${meta.tone}`}>
                          <span className="dot" />
                          {meta.label}
                        </span>
                        {r.status === "ready" && r.preview_url && (
                          <>
                            {" "}
                            <a href={r.preview_url} target="_blank" rel="noopener noreferrer">
                              View demo
                            </a>
                          </>
                        )}
                      </td>
                      <td>{new Date(r.requested_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
};

const RequestSignIn: FC = () => {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!supabase) {
      setMsg("Sign-in is unavailable because this build isn't connected yet.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: getAuthRedirect() } });
    setMsg(error ? error.message : "Check your inbox for a sign-in link.");
  }

  return (
    <section className="card" style={{ maxWidth: 480 }}>
      <h2>Sign in to track your requests</h2>
      <p className="subtitle">You can send a request above anytime. Sign in to follow its status here.</p>
      <form onSubmit={sendLink}>
        <label htmlFor="wbr-signin-email">Work email</label>
        <input
          id="wbr-signin-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
        />
        <div className="actions">
          <button type="submit" className="primary">
            Send sign-in link
          </button>
        </div>
        {msg && (
          <p className="muted" style={{ marginTop: 8 }}>
            {msg}
          </p>
        )}
      </form>
    </section>
  );
};
