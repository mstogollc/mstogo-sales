import { useState, type FC } from "react";
import { api, type AnalyzeResponse, type PlaceSignal } from "../api";
import { Indicator } from "./Indicator";

interface Props {
  onAnalysisReady: (analysis: AnalyzeResponse) => void;
}

export const LeadAnalyzer: FC<Props> = ({ onAnalysisReady }) => {
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function handleAnalyze() {
    setError(null);
    if (!businessName.trim() && !website.trim()) {
      setError("Add a business name or website to run the analysis.");
      return;
    }
    setLoading(true);
    try {
      const data = await api.analyzeLead({
        businessName: businessName.trim() || undefined,
        website: website.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(data);
      onAnalysisReady(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong running the analysis.");
    } finally {
      setLoading(false);
    }
  }

  const allSignals: PlaceSignal[] = result
    ? [...result.placeProfile.signals, ...(result.seoSnapshot.rankSignals || [])]
    : [];

  return (
    <>
      <section className="card">
        <h2>Lead snapshot</h2>
        <p className="subtitle">Pull the public footprint of a prospect to ground your next conversation.</p>
        <div className="row">
          <div>
            <label htmlFor="biz">Business name</label>
            <input
              id="biz"
              placeholder="e.g. Joe's Pizza"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="site">Website</label>
            <input
              id="site"
              placeholder="joespizza.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label htmlFor="state">State</label>
            <input id="state" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="notes">Rep notes (optional)</label>
          <textarea
            id="notes"
            placeholder="Anything you already know — referral source, who you've spoken to, urgency, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="actions">
          <button className="primary" onClick={handleAnalyze} disabled={loading}>
            {loading ? "Running analysis…" : "Analyze lead"}
          </button>
          {result && <Indicator level={result.placeProfile.overall} />}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <>
          <section className="card">
            <h2>What the rep should know</h2>
            <p className="subtitle">Plain-English read on this prospect.</p>
            <pre className="preview">{result.narrative}</pre>
            <div className="divider" />
            <p className="section-title">Recommended package</p>
            <div className="tier-grid">
              {result.packages.map((p) => (
                <div
                  key={p.tier}
                  className={`tier ${p.tier === result.recommendation.tier ? "recommended" : ""}`}
                >
                  <div>{p.tier}</div>
                  <div className="price">${p.price}/mo</div>
                  <p className="muted" style={{ marginTop: 6 }}>{p.summary}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Google Business Profile</h2>
            <p className="subtitle">
              {result.placeProfile.matched ? "Live signal from Google." : "No verified Google match found."}
            </p>
            {result.placeProfile.matched && (
              <dl className="kv">
                {result.placeProfile.name && (
                  <>
                    <dt>Name on Google</dt>
                    <dd>{result.placeProfile.name}</dd>
                  </>
                )}
                {result.placeProfile.rating !== undefined && (
                  <>
                    <dt>Rating</dt>
                    <dd>
                      {result.placeProfile.rating.toFixed(1)}★ ·{" "}
                      {(result.placeProfile.userRatingCount ?? 0).toLocaleString()} reviews
                    </dd>
                  </>
                )}
                {result.placeProfile.formattedAddress && (
                  <>
                    <dt>Address</dt>
                    <dd>{result.placeProfile.formattedAddress}</dd>
                  </>
                )}
                {result.placeProfile.internationalPhone && (
                  <>
                    <dt>Phone</dt>
                    <dd>{result.placeProfile.internationalPhone}</dd>
                  </>
                )}
                {result.placeProfile.website && (
                  <>
                    <dt>Website on profile</dt>
                    <dd>
                      <a href={result.placeProfile.website} target="_blank" rel="noreferrer">
                        {result.placeProfile.website}
                      </a>
                    </dd>
                  </>
                )}
                {result.placeProfile.primaryCategory && (
                  <>
                    <dt>Category</dt>
                    <dd>{result.placeProfile.primaryCategory}</dd>
                  </>
                )}
                {result.placeProfile.businessStatus && (
                  <>
                    <dt>Status</dt>
                    <dd>{result.placeProfile.businessStatus}</dd>
                  </>
                )}
              </dl>
            )}
            <p className="muted" style={{ marginTop: 12 }}>{result.placeProfile.summary}</p>
          </section>

          <section className="card">
            <h2>Findings</h2>
            <p className="subtitle">Each signal calls out a specific opening on the call.</p>
            <ul className="signal-list">
              {allSignals.map((s, idx) => (
                <li key={idx}>
                  <Indicator level={s.level} label={s.label} />
                  <span>{s.detail}</span>
                </li>
              ))}
            </ul>
            {result.seoSnapshot.topKeywords && result.seoSnapshot.topKeywords.length > 0 && (
              <>
                <div className="divider" />
                <p className="section-title">Top organic keywords</p>
                <ul className="signal-list">
                  {result.seoSnapshot.topKeywords.map((kw, i) => (
                    <li key={i}>
                      <span className="label">#{kw.position}</span>
                      <span>
                        {kw.keyword}
                        {typeof kw.searchVolume === "number" ? ` · ${kw.searchVolume.toLocaleString()} searches/mo` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
};
