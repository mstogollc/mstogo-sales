import { useState, type FC } from "react";
import { api, type AnalyzeResponse } from "../api";
import { useActiveProspect, updateActiveProspect } from "../lib/prospect";

interface Props {
  analysis: AnalyzeResponse | null;
}

const INDUSTRY_OPTIONS = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "General Contractor",
  "Home Services",
  "Real Estate",
  "Property Management",
  "Dental",
  "Chiropractic",
  "Veterinary",
  "Medical / Healthcare",
  "Law Firm",
  "Accounting",
  "Insurance",
  "Financial Advisor",
  "Fitness",
  "Salon / Barber / Spa",
  "Restaurant / Food Service",
  "Automotive",
  "Retail",
  "Professional Services",
];

const CUSTOM_INDUSTRY = "__custom__";

export const ProposalBuilder: FC<Props> = ({ analysis }) => {
  const prospect = useActiveProspect();
  const businessName = analysis?.lead.businessName || prospect?.businessName || "";
  const [goals, setGoals] = useState("");
  const [contactName, setContactName] = useState(prospect?.contactName ?? "");
  const [contactRole, setContactRole] = useState(prospect?.contactRole ?? "");
  const presetIndustry = prospect?.industry ?? "";
  const industryIsKnown = INDUSTRY_OPTIONS.includes(presetIndustry);
  const [industryChoice, setIndustryChoice] = useState<string>(
    presetIndustry ? (industryIsKnown ? presetIndustry : CUSTOM_INDUSTRY) : "",
  );
  const [customIndustry, setCustomIndustry] = useState(
    presetIndustry && !industryIsKnown ? presetIndustry : "",
  );
  const [tier, setTier] = useState<"Basic" | "Growth" | "Premium">(
    analysis?.recommendation.tier || "Growth",
  );
  const [noWebsite, setNoWebsite] = useState<boolean>(prospect?.noWebsite ?? false);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState(prospect?.contactEmail ?? "");
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const industry = industryChoice === CUSTOM_INDUSTRY ? customIndustry.trim() : industryChoice;
  const proposalCity = prospect?.city || analysis?.lead.city || "";
  const proposalState = prospect?.state || analysis?.lead.state || "";

  async function handleBuild() {
    setError(null);
    if (!businessName) {
      setError("Select a lead or run an analysis first so we have something to anchor the proposal on.");
      return;
    }
    setLoading(true);
    try {
      const goalsWithIndustry = [industry ? `Industry: ${industry}` : null, goals.trim() || null]
        .filter(Boolean)
        .join("\n");
      // When the prospect has no website, drop any website/SEO-derived signals so
      // the proposal never references a site that doesn't exist.
      const rawSignals = analysis
        ? [...analysis.placeProfile.signals, ...(analysis.seoSnapshot.rankSignals || [])]
        : [];
      const topSignals = (noWebsite
        ? rawSignals.filter((s) => !/website|seo|organic|domain|dataforseo/i.test(s.label))
        : rawSignals
      ).slice(0, 5);
      const res = await api.proposal({
        businessName,
        contactName: contactName || undefined,
        contactRole: contactRole || undefined,
        city: proposalCity || undefined,
        state: proposalState || undefined,
        industry: industry || undefined,
        overall: analysis?.placeProfile.overall,
        reviewCount: analysis?.placeProfile.userRatingCount,
        topSignals: topSignals.length ? topSignals : undefined,
        recommendedTier: tier,
        goals: goalsWithIndustry || undefined,
        noWebsite: noWebsite || undefined,
      });
      setOutput(res.proposal);
      setEmailStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the proposal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailProposal() {
    setError(null);
    setEmailStatus(null);
    if (!output.trim()) {
      setError("Build the proposal first, then email it.");
      return;
    }
    if (!recipientEmail.trim()) {
      setError("Add the recipient's email address to send this proposal.");
      return;
    }
    setEmailing(true);
    try {
      const res = await api.sendEmail({
        to: recipientEmail.trim(),
        subject: `Your MS2GO proposal${businessName ? ` for ${businessName}` : ""}`,
        text: output,
        kind: "proposal",
      });
      if (res.delivery.status === "sent") {
        setEmailStatus(`Sent to ${recipientEmail.trim()} — Resend confirmed delivery.`);
      } else if (res.delivery.status === "queued_local") {
        setEmailStatus(
          "Saved and ready to send. Email delivery (Resend) isn't connected on this workspace yet — once the MS2GO sending domain is verified, this proposal goes out automatically.",
        );
      } else {
        setError(`Could not send the proposal: ${res.delivery.reason}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not email the proposal.");
    } finally {
      setEmailing(false);
    }
  }

  return (
    <section className="card">
      <h2>Proposal builder</h2>
      <p className="subtitle">A one-page proposal sales reps can send within five minutes of a discovery call.</p>

      {businessName ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          Proposal for <strong>{businessName}</strong>
          {industry ? ` · ${industry}` : ""}
          {proposalCity ? ` · ${proposalCity}${proposalState ? `, ${proposalState}` : ""}` : ""}
        </div>
      ) : (
        <div className="notice" style={{ marginBottom: 12 }}>
          Select a lead or run a lead analysis first — proposals are stronger when grounded in real signals.
        </div>
      )}

      {businessName && !proposalCity && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          No city set for this prospect — the proposal will use neutral wording like "your local market" instead of
          naming a town, so it never references the wrong city. Add the city/state in Lead Intel to localize it.
        </div>
      )}

      <div className="row">
        <div>
          <label htmlFor="dm">Decision maker</label>
          <input id="dm" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <input id="role" placeholder="Owner, GM, Marketing…" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tier">Package</label>
          <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
            <option value="Basic">Basic — $300/mo</option>
            <option value="Growth">Growth — $750/mo</option>
            <option value="Premium">Premium — $2,000/mo</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="industry">Industry / category</label>
          <select
            id="industry"
            value={industryChoice}
            onChange={(e) => setIndustryChoice(e.target.value)}
          >
            <option value="">Select an industry…</option>
            {INDUSTRY_OPTIONS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
            <option value={CUSTOM_INDUSTRY}>Other — enter manually…</option>
          </select>
        </div>
        {industryChoice === CUSTOM_INDUSTRY && (
          <div>
            <label htmlFor="industry-custom">Custom industry</label>
            <input
              id="industry-custom"
              placeholder="e.g. Marine Outfitter, Med Spa, Franchise Bakery"
              value={customIndustry}
              onChange={(e) => setCustomIndustry(e.target.value)}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="checkbox-row" htmlFor="no-website">
          <input
            id="no-website"
            type="checkbox"
            checked={noWebsite}
            onChange={(e) => {
              setNoWebsite(e.target.checked);
              updateActiveProspect({ noWebsite: e.target.checked });
            }}
          />
          <span>
            <strong>No existing website</strong> — this prospect doesn't have a website yet. MS2GO will build their
            first professional site, and the proposal will skip any current-website analysis.
          </span>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="goals">Goals for the engagement</label>
        <textarea
          id="goals"
          placeholder="e.g. fill the lunch rush, recover review velocity, launch a new location"
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="primary" onClick={handleBuild} disabled={loading}>
          {loading ? "Building…" : "Build proposal"}
        </button>
      </div>

      {output && (
        <>
          <div className="divider" />
          <div className="no-print" style={{ marginBottom: 12 }}>
            <label htmlFor="proposal-email">Email this proposal to</label>
            <div className="row" style={{ marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <input
                  id="proposal-email"
                  type="email"
                  placeholder="owner@theirbusiness.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="primary" type="button" onClick={handleEmailProposal} disabled={emailing}>
                {emailing ? "Sending…" : "Email proposal"}
              </button>
              <button className="ghost" type="button" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              "Email proposal" sends this exact copy from your MS2GO sending address. Prefer to personalize it first?
              Use Print / Save as PDF and attach it, or paste it into the Email Outreach module.
            </p>
            {emailStatus && (
              <div className="notice" style={{ marginTop: 8 }}>
                {emailStatus}
              </div>
            )}
          </div>
          <div className="print-document">
            <div className="print-letterhead">
              <span className="print-brand">MS2GO</span>
              <span className="print-brand-sub">Sales Proposal</span>
            </div>
            <pre className="preview proposal-output">{output}</pre>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
};
