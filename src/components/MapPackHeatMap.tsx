import { useState, type FC } from "react";
import { api, type HeatMapResponse, type HeatCell } from "../api";
import { useActiveProspect } from "../lib/prospect";

function cellLabel(cell: HeatCell): string {
  if (cell.rank == null || cell.rank <= 0) return "20+";
  return String(cell.rank);
}

const SETUP_STATES = new Set(["setup_required", "needs_location", "unavailable"]);

export const MapPackHeatMap: FC = () => {
  const prospect = useActiveProspect();
  const [businessName, setBusinessName] = useState(prospect?.businessName ?? "");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState(prospect?.city ?? "");
  const [state, setState] = useState(prospect?.state ?? "");
  const [result, setResult] = useState<HeatMapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
        keyword: keyword.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        address: prospect?.address,
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

  const showGrid = result?.status === "ok" && result.cells.length > 0;
  const showSetup = result != null && SETUP_STATES.has(result.status);

  return (
    <section className="card">
      <h2>Map Pack Heat Map</h2>
      <p className="subtitle">
        See exactly where a business shows up in Google's local 3-pack across its neighborhood — green means it's
        winning the area, red means it's invisible to nearby searchers.
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
          <label htmlFor="hm-kw">Search term (optional)</label>
          <input
            id="hm-kw"
            placeholder="e.g. pizza near me"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
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

      {showGrid && result && (
        <>
          <div className="divider" />
          <div className="heatmap-summary">
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.topThreeShare}%</span>
              <span className="heatmap-stat-label">of the area in the top 3</span>
            </div>
            <div className="heatmap-stat">
              <span className="heatmap-stat-value">{result.averageRank ?? "—"}</span>
              <span className="heatmap-stat-label">average local rank</span>
            </div>
          </div>
          <p className="heatmap-readout">{result.message}</p>
          <div
            className="heatmap-grid"
            style={{ gridTemplateColumns: `repeat(${result.gridSize}, 1fr)` }}
          >
            {result.cells.map((cell) => (
              <div
                key={`${cell.row}-${cell.col}`}
                className={`heatmap-cell heat-${cell.level}`}
                title={`Rank ${cellLabel(cell)} at this spot`}
              >
                {cellLabel(cell)}
              </div>
            ))}
          </div>
          <div className="heatmap-legend">
            <span><i className="heat-dot heat-green" /> Top 3</span>
            <span><i className="heat-dot heat-yellow" /> Page 1 (4–10)</span>
            <span><i className="heat-dot heat-red" /> Not visible</span>
          </div>
        </>
      )}
    </section>
  );
};
