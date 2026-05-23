import { useState, type FC } from "react";
import { api, type AnalyzeResponse } from "../api";

interface Props {
  analysis: AnalyzeResponse | null;
}

export const ProposalBuilder: FC<Props> = ({ analysis }) => {
  const [goals, setGoals] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [tier, setTier] = useState<"Basic" | "Growth" | "Premium">(
    analysis?.recommendation.tier || "Growth",
  );
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuild() {
    setError(null);
    if (!analysis?.lead.businessName) {
      setError("Run an analysis first so we have something to anchor the proposal on.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.proposal({
        businessName: analysis.lead.businessName,
        contactName: contactName || undefined,
        contactRole: contactRole || undefined,
        overall: analysis.placeProfile.overall,
        reviewCount: analysis.placeProfile.userRatingCount,
        topSignals: [...analysis.placeProfile.signals, ...(analysis.seoSnapshot.rankSignals || [])].slice(0, 5),
        recommendedTier: tier,
        goals: goals || undefined,
      });
      setOutput(res.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the proposal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Proposal builder</h2>
      <p className="subtitle">A one-page proposal sales reps can send within five minutes of a discovery call.</p>

      {!analysis && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Run a lead analysis first — proposals are stronger when grounded in real signals.
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
          <pre className="preview">{output}</pre>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
};
