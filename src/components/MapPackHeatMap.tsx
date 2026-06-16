import { useMemo, useState, type FC } from "react";
import { api, type HeatMapResponse, type HeatCell } from "../api";
import { useActiveProspect } from "../lib/prospect";
import { HeatMapView } from "./HeatMapView";
import { LEVEL_COLOR, LEVEL_COPY, LEVEL_ORDER, markerLabel, pointLabel, pointTitle, toMapPoints } from "../lib/heatMap";

const GRID_OPTIONS = [3, 5, 7] as const;

function cellLabel(cell: HeatCell): string {
  return pointLabel(cell.rank);
}

function cellTitle(cell: HeatCell): string {
  return pointTitle(cell.rank);
}

const SETUP_STATES = new Set(["setup_required", "needs_location", "unavailable"]);

export const MapPackHeatMap: FC = () => {
  const prospect = useActiveProspect();
  const [businessName, setBusinessName] = useState(prospect?.businessName ?? "");
  const [website, setWebsite] = useState(prospect?.website ?? "");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState(prospect?.city ?? "");
  const [state, setState] = useState(prospect?.state ?? "");
  const [competitor, setCompetitor] = useState("");
  const [gridSize, setGridSize] = useState<number>(5);
  const [stepMiles, setStepMiles] = useState<number>(1);
  const [result, setResult] = useState<HeatMapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGridView, setShowGridView] = useState(false);

  async function handleRun() {
    setNotice(null);
    if (!businessName.trim()) {
      setNotice("Add a business name to plot its local ranking grid.");
      return;
    }
    setLoading(true);
    try {
      const data = await api.heatMap({
        businessName: businessName.trim(),
        website: website.trim() || undefined,
        keyword: keyword.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        address: prospect?.address,
        competitor: competitor.trim() || undefined,
        gridSize,
        stepMiles,
      });
      setResult(data);
    } catch {
      // Never surface a raw error or blank screen — keep the rep in a clean state.
      setResult(null);
      setNotice(
        "The Map Pack Heat Map isn't reachable right now. Try again in a moment — your inputs are saved above.",
      );
    } finally {
      setLoading(false);
    }
  }

  const hasResult = result?.status === "ok" && result.cells.length > 0;
  const showSetup = result != null && SETUP_STATES.has(result.status);
  const mapPoints = useMemo(() => (hasResult ? toMapPoints(result.cells) : []), [hasResult, result]);
  const locationLine = [city.trim(), state.trim()].filter(Boolean).join(", ");
  const printedAt = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [result],
  );

  return (
    <section className="card">
      <h2>Local Ranking Heat Map</h2>
      <p className="subtitle">
        Plot exactly where a business ranks in Google's local map pack across its whole service area. Each point on the
        grid is a real search location — green means it's winning that spot, red means nearby customers never see it.
      </p>

      {prospect?.businessName && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Working selected lead: <strong>{prospect.businessName}</strong>
          {prospect.city ? ` · ${prospect.city}` : ""}
          {prospect.state ? `, ${prospect.state}` : ""}
        </div>
      )}

      <div className="row">
        <div>
          <label htmlFor="hm-biz">Business name</label>
          <input
            id="hm-biz"
            placeholder="e.g. Joe's Pizza"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="hm-web">Website (optional)</label>
          <input
            id="hm-web"
            placeholder="e.g. joespizza.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="hm-kw">Search term (optional)</label>
          <input
            id="hm-kw"
            placeholder="e.g. pizza near me"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="hm-comp">Compare to competitor (optional)</label>
          <input
            id="hm-comp"
            placeholder="e.g. Tony's Pizzeria"
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="hm-city">City</label>
          <input id="hm-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label htmlFor="hm-state">State</label>
          <input id="hm-state" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="hm-grid">Grid size</label>
          <select id="hm-grid" value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
            {GRID_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} × {n} ({n * n} points)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hm-step">Spacing between points (miles)</label>
          <select id="hm-step" value={stepMiles} onChange={(e) => setStepMiles(Number(e.target.value))}>
            {[0.5, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n} mi
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={handleRun} disabled={loading}>
          {loading ? "Mapping…" : "Run heat map"}
        </button>
      </div>

      {notice && <p className="error">{notice}</p>}

      {showSetup && result && (
        <>
          <div className="divider" />
          <div className="heatmap-empty">
            <div className="heatmap-empty-badge">MS2GO</div>
            <p className="heatmap-empty-title">
              {result.status === "needs_location" ? "A little more detail needed" : "Heat map ready to activate"}
            </p>
            <p className="heatmap-empty-body">{result.message}</p>
          </div>
        </>
      )}

      {hasResult && result && (
        <>
          <div className="divider" />

          <div className="heatmap-summary">
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.averageRank ?? "—"}</span>
              <span className="heatmap-stat-label">average rank</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.bestRank ? `#${result.bestRank}` : "—"}</span>
              <span className="heatmap-stat-label">best rank</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.worstRank ? `#${result.worstRank}` : "—"}</span>
              <span className="heatmap-stat-label">worst rank</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.topThreeShare}%</span>
              <span className="heatmap-stat-label">of area in top 3</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.topTenShare}%</span>
              <span className="heatmap-stat-label">of area in top 10</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.weakZoneShare}%</span>
              <span className="heatmap-stat-label">weak / opportunity zones</span>
            </div>
          </div>

          <p className="heatmap-readout">{result.message}</p>

          {mapPoints.length > 0 ? (
            <div className="heatmap-map-wrap">
              <HeatMapView points={mapPoints} center={result.center} />
            </div>
          ) : (
            <div className="heatmap-map-fallback notice">
              No mappable coordinates came back for this search, so the grid below shows the ranking data instead.
            </div>
          )}

          <div className="heatmap-legend">
            {LEVEL_ORDER.map((level) => (
              <span key={level}>
                <i
                  className="heat-pin heat-pin-legend"
                  style={{ background: LEVEL_COLOR[level] }}
                  aria-hidden="true"
                >
                  {level === "red" ? "NF" : ""}
                </i>{" "}
                {LEVEL_COPY[level].label} · {LEVEL_COPY[level].range}
              </span>
            ))}
          </div>

          <div className="heatmap-view-toggle no-print">
            <button type="button" className="ghost" onClick={() => setShowGridView((v) => !v)}>
              {showGridView ? "Hide grid view" : "Show grid view"}
            </button>
            <button type="button" className="primary" onClick={() => window.print()}>
              Print heat map / Save as PDF
            </button>
          </div>

          {showGridView && (
            <div
              className="heatmap-grid"
              style={{ gridTemplateColumns: `repeat(${result.gridSize}, 1fr)` }}
            >
              {result.cells.map((cell) => (
                <div
                  key={`${cell.row}-${cell.col}`}
                  className={`heatmap-cell heat-${cell.level}`}
                  title={cellTitle(cell)}
                >
                  {cellLabel(cell)}
                </div>
              ))}
            </div>
          )}

          {result.talkingPoints.length > 0 && (
            <div className="heatmap-talkpoints">
              <p className="heatmap-talkpoints-title">What to tell the prospect</p>
              <ul>
                {result.talkingPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="print-document heatmap-print">
            <div className="print-letterhead">
              <span className="print-brand">MS2GO</span>
              <span className="print-brand-sub">Local Ranking Heat Map</span>
            </div>

            <div className="heatmap-print-head">
              <h1 className="heatmap-print-title">{businessName.trim() || "Local Ranking Heat Map"}</h1>
              <p className="heatmap-print-meta">
                {keyword.trim() && (
                  <span>
                    Search term: <strong>{keyword.trim()}</strong>
                  </span>
                )}
                {locationLine && (
                  <span>
                    Area: <strong>{locationLine}</strong>
                  </span>
                )}
                {competitor.trim() && (
                  <span>
                    Compared to: <strong>{competitor.trim()}</strong>
                  </span>
                )}
                <span>Prepared: {printedAt}</span>
              </p>
            </div>

            <div className="heatmap-print-stats">
              <div>
                <span className="heatmap-print-stat-value">{result.averageRank ?? "—"}</span>
                <span className="heatmap-print-stat-label">average rank</span>
              </div>
              <div>
                <span className="heatmap-print-stat-value">{result.bestRank ? `#${result.bestRank}` : "—"}</span>
                <span className="heatmap-print-stat-label">best rank</span>
              </div>
              <div>
                <span className="heatmap-print-stat-value">{result.worstRank ? `#${result.worstRank}` : "—"}</span>
                <span className="heatmap-print-stat-label">worst rank</span>
              </div>
              <div>
                <span className="heatmap-print-stat-value">{result.topThreeShare}%</span>
                <span className="heatmap-print-stat-label">area in top 3</span>
              </div>
              <div>
                <span className="heatmap-print-stat-value">{result.topTenShare}%</span>
                <span className="heatmap-print-stat-label">area in top 10</span>
              </div>
              <div>
                <span className="heatmap-print-stat-value">{result.weakZoneShare}%</span>
                <span className="heatmap-print-stat-label">weak / opportunity zones</span>
              </div>
            </div>

            <p className="heatmap-print-readout">{result.message}</p>

            <div className="heatmap-print-legend">
              {LEVEL_ORDER.map((level) => (
                <span key={level}>
                  <i className="heat-swatch" style={{ background: LEVEL_COLOR[level] }} aria-hidden="true" />
                  {LEVEL_COPY[level].label} · {LEVEL_COPY[level].range}
                </span>
              ))}
            </div>

            <table className="heatmap-print-table">
              <thead>
                <tr>
                  <th>Spot</th>
                  <th>Rank</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.cells.map((cell) => (
                  <tr key={`${cell.row}-${cell.col}`}>
                    <td>
                      Row {cell.row + 1}, Col {cell.col + 1}
                    </td>
                    <td>{markerLabel(cell.rank)}</td>
                    <td>{LEVEL_COPY[cell.level].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.talkingPoints.length > 0 && (
              <div className="heatmap-print-talkpoints">
                <p className="heatmap-print-talkpoints-title">What to tell the prospect</p>
                <ul>
                  {result.talkingPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
