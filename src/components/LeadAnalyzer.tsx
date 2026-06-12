import { useEffect, useRef, useState, type FC } from "react";
import { api, type AnalyzeResponse, type PlaceSignal } from "../api";
import { Indicator } from "./Indicator";
import { updateActiveProspect, useActiveProspect } from "../lib/prospect";

interface Props {
  onAnalysisReady: (analysis: AnalyzeResponse) => void;
}

export const LeadAnalyzer: FC<Props> = ({ onAnalysisReady }) => {
  const prospect = useActiveProspect();
  const [businessName, setBusinessName] = useState(prospect?.businessName ?? "");
  const [website, setWebsite] = useState(prospect?.website ?? "");
  const [noWebsite, setNoWebsite] = useState<boolean>(prospect?.noWebsite ?? false);
  const [city, setCity] = useState(prospect?.city ?? "");
  const [state, setState] = useState(prospect?.state ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  // When a lead is selected upstream (Lead Lists), prefill this brief with the
  // chosen business so the rep doesn't re-type anything.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = prospect?.businessName ?? null;
    if (key && prefilledFor.current !== key) {
      prefilledFor.current = key;
      setBusinessName(prospect?.businessName ?? "");
      setWebsite(prospect?.website ?? "");
      setNoWebsite(prospect?.noWebsite ?? false);
      setCity(prospect?.city ?? "");
      setState(prospect?.state ?? "");
    }
  }, [prospect]);

  async function handleAnalyze() {
    setError(null);
    if (!businessName.trim() && (noWebsite || !website.trim())) {
      setError(
        noWebsite
          ? "Add a business name to run the analysis."
          : "Add a business name or website to run the analysis.",
      );
      return;
    }
    setLoading(true);
    try {
      const data = await api.analyzeLead({
        businessName: businessName.trim() || undefined,
        website: noWebsite ? undefined : website.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(data);
      onAnalysisReady(data);
      updateActiveProspect({
        businessName: data.lead.businessName ?? (businessName.trim() || undefined),
        website: noWebsite
          ? undefined
          : data.placeProfile.website ?? data.lead.website ?? (website.trim() || undefined),
        noWebsite,
        phone: data.placeProfile.internationalPhone,
        address: data.placeProfile.formattedAddress ?? data.lead.address,
        city: data.lead.city ?? (city.trim() || undefined),
        state: data.lead.state ?? (state.trim() || undefined),
        industry: data.placeProfile.primaryCategory,
      });
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
        {prospect?.businessName && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Working selected lead: <strong>{prospect.businessName}</strong>
            {prospect.industry ? ` · ${prospect.industry}` : ""}
            {prospect.phone ? ` · ${prospect.phone}` : ""}
            {prospect.address ? ` · ${prospect.address}` : ""}
          </div>
        )}
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
              placeholder={noWebsite ? "No website yet" : "joespizza.com"}
              value={noWebsite ? "" : website}
              disabled={noWebsite}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="checkbox-row" htmlFor="intel-no-website">
            <input
              id="intel-no-website"
              type="checkbox"
              checked={noWebsite}
              onChange={(e) => {
                setNoWebsite(e.target.checked);
                updateActiveProspect({ noWebsite: e.target.checked });
              }}
            />
            <span>
              <strong>No existing website</strong> — skip the website &amp; SEO crawl. We'll position MS2GO to build
              their first professional site.
            </span>
          </label>
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
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="linkedin">LinkedIn URL</label>
            <input
              id="linkedin"
              type="url"
              placeholder="https://www.linkedin.com/company/…"
              value={prospect?.linkedinUrl ?? ""}
              onChange={(e) => updateActiveProspect({ linkedinUrl: e.target.value })}
            />
            {prospect?.linkedinUrl && (
              <p className="muted" style={{ marginTop: 6 }}>
                <a href={prospect.linkedinUrl} target="_blank" rel="noreferrer">
                  Open LinkedIn profile
                </a>
              </p>
            )}
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

      {result?.websiteResolution?.notice && (
        <div className="notice" role="status" style={{ marginBottom: 12 }}>
          <strong>Heads up:</strong> {result.websiteResolution.notice}
          {result.websiteResolution.enteredWebsite && result.websiteResolution.verifiedWebsite && (
            <div className="muted" style={{ marginTop: 6 }}>
              Typed: {result.websiteResolution.enteredWebsite} · Used for SEO:{" "}
              {result.websiteResolution.verifiedWebsite}
            </div>
          )}
        </div>
      )}

      {result && (
        <>
          <section className="card">
            <div className="ops-page-head">
              <div>
                <h2>What the rep should know</h2>
                <p className="subtitle">Plain-English read on this prospect.</p>
              </div>
              <div className="actions no-print" style={{ marginTop: 0 }}>
                <button className="ghost" type="button" onClick={() => window.print()}>
                  Print notes
                </button>
              </div>
            </div>
            <div className="print-document">
              <div className="print-letterhead">
                <span className="print-brand">MS2GO</span>
                <span className="print-brand-sub">
                  Prospect Notes{result.lead.businessName ? ` · ${result.lead.businessName}` : ""}
                </span>
              </div>
              <pre className="preview notes-output">{result.narrative}</pre>
              {notes.trim() && (
                <>
                  <p className="section-title" style={{ marginTop: 16 }}>Rep notes</p>
                  <pre className="preview notes-output">{notes}</pre>
                </>
              )}
            </div>
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
            <h2>Search visibility</h2>
            {result.seoSnapshot.status === "available" ? (
              <p className="subtitle">
                {result.seoSnapshot.organicKeywordCount !== undefined
                  ? `Ranking for ${result.seoSnapshot.organicKeywordCount.toLocaleString()} keywords · ~${Math.round(
                      result.seoSnapshot.organicTrafficEstimate ?? 0,
                    ).toLocaleString()} estimated monthly organic visits.`
                  : "Live search data retrieved."}
                {result.seoSnapshot.domain ? ` (${result.seoSnapshot.domain})` : ""}
              </p>
            ) : result.seoSnapshot.status === "unavailable" ? (
              <p className="subtitle">
                Search-visibility data isn't available for this website right now — we'll confirm it
                live before the proposal. (This is not a reading of zero traffic.)
              </p>
            ) : (
              <p className="subtitle">
                Search-visibility check is offline in this environment.
              </p>
            )}
            {result.seoSnapshot.backlinks?.status === "unavailable" && (
              <p className="muted" style={{ marginTop: 8 }}>
                Backlink data unavailable for this site.
              </p>
            )}
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
