import { useState, type FC } from "react";
import { api, type HeatMapResponse, type HeatCell, type HeatLevel } from "../api";
import { useActiveProspect } from "../lib/prospect";

const GRID_OPTIONS = [3, 5, 7] as const;

const LEVEL_COPY: Record<HeatLevel, { label: string; range: string }> = {
  green: { label: "Owning it", range: "Ranks 1–3" },
  blue: { label: "Just outside", range: "Ranks 4–7" },
  yellow: { label: "Buried", range: "Ranks 8–15" },
  red: { label: "Invisible", range: "16+ / not found" },
};

function cellLabel(cell: HeatCell): string {
  if (cell.rank == null || cell.rank <= 0) return "—";
  return String(cell.rank);
}

function cellTitle(cell: HeatCell): string {
  if (cell.rank == null || cell.rank <= 0) {
    return "Not found in the local results at this spot";
  }
  return `Ranks #${cell.rank} here · ${LEVEL_COPY[cell.level].label}`;
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

  const showGrid = result?.status === "ok" && result.cells.length > 0;
  const showSetup = result != null && SETUP_STATES.has(result.status);

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

      {showGrid && result && (
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

          <div className="heatmap-legend">
            {(Object.keys(LEVEL_COPY) as HeatLevel[]).map((level) => (
              <span key={level}>
                <i className={`heat-dot heat-${level}`} /> {LEVEL_COPY[level].label} · {LEVEL_COPY[level].range}
              </span>
            ))}
          </div>

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
        </>
      )}
    </section>
  );
};
