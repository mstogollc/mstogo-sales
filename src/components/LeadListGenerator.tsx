import { useState, type FC } from "react";
import { authHeader, supabase } from "../lib/supabase";

export interface GeneratedLead {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  state: string;
  hasWebsite: boolean;
  website?: string;
  phone?: string;
  address?: string;
  reviewsCount: number;
  rating: number;
  fitScore: number;
  recommendedPackage: "Basic" | "Growth" | "Premium";
  signal: string;
}

interface GenerateLeadsResponse {
  status: "ok" | "empty" | "setup_required" | "error";
  provider?: string;
  leads: GeneratedLead[];
  missing?: string[];
  message?: string;
  rawCount?: number;
  filteredCount?: number;
  rejectedOutOfState?: number;
  rejectedRetail?: number;
  rejectedNoGeo?: number;
  rejectedIndustryMismatch?: number;
  persisted?: number;
}

const CITIES = ["Huntsville", "Madison", "Decatur", "Athens", "Florence", "Muscle Shoals"];

const INDUSTRIES = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "General Contractor",
  "Home Builder",
  "Landscaping",
  "Pest Control",
  "Pool & Spa",
  "Cleaning Service",
  "Auto Repair",
  "Towing",
  "Real Estate",
  "Property Management",
  "Self Storage",
  "Moving & Junk Removal",
  "Dental",
  "Chiropractic",
  "Veterinary",
  "Law Firm",
  "Accounting",
  "Insurance",
  "Financial Advisor",
  "Fitness",
  "Salon / Barber / Spa",
  "Photography",
  "Event Services",
  "Concrete / Painting / Flooring",
  "Solar",
  "Security / Alarm",
];

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: GenerateLeadsResponse }
  | { kind: "empty"; data: GenerateLeadsResponse }
  | { kind: "setup_required"; data: GenerateLeadsResponse }
  | { kind: "error"; message: string };

export const LeadListGenerator: FC = () => {
  const [city, setCity] = useState("Huntsville");
  const [state, setState] = useState("AL");
  const [radius, setRadius] = useState(25);
  const [maxCount, setMaxCount] = useState(25);
  const [industry, setIndustry] = useState("Roofing");
  const [persist, setPersist] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function run() {
    if (!city || !industry) {
      setPhase({ kind: "error", message: "Pick a city and industry first." });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/generate-leads", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          city,
          state,
          industry,
          radiusMiles: radius,
          maxCount,
          persist,
        }),
      });
      const data = (await res.json()) as GenerateLeadsResponse;
      if (data.status === "ok") setPhase({ kind: "ok", data });
      else if (data.status === "empty") setPhase({ kind: "empty", data });
      else if (data.status === "setup_required") setPhase({ kind: "setup_required", data });
      else setPhase({ kind: "error", message: data.message ?? "Lead search failed." });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Network error." });
    }
  }

  function exportCsv() {
    if (phase.kind !== "ok") return;
    const header = "Business,Industry,City,State,FitScore,RecommendedPackage,HasWebsite,Website,Phone,Address,Reviews,Rating,Signal";
    const rows = phase.data.leads.map((l) =>
      [
        `"${l.businessName.replace(/"/g, "'")}"`,
        l.industry,
        l.city,
        l.state,
        l.fitScore,
        l.recommendedPackage,
        l.hasWebsite,
        l.website ?? "",
        l.phone ?? "",
        `"${(l.address ?? "").replace(/"/g, "'")}"`,
        l.reviewsCount,
        l.rating,
        `"${l.signal.replace(/"/g, "'")}"`,
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ms2go-leads-${city.toLowerCase()}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const leads = phase.kind === "ok" ? phase.data.leads : [];
  const hot = leads.filter((l) => l.fitScore >= 80).length;
  const cool = leads.filter((l) => l.fitScore < 70).length;
  const signedIn = Boolean(supabase);

  return (
    <>
      <section className="card">
        <div className="ops-page-head">
          <div>
            <h2>Lead Lists</h2>
            <p className="subtitle">
              Live lead search via DataForSEO Business Listings. Set the territory, run the search, persist to the CRM.
            </p>
          </div>
          <div className="actions">
            <button className="ghost" type="button" onClick={exportCsv} disabled={phase.kind !== "ok"}>
              Export CSV
            </button>
            <button className="primary" type="button" onClick={run} disabled={phase.kind === "loading"}>
              {phase.kind === "loading" ? "Searching…" : "Run live search"}
            </button>
          </div>
        </div>

        <div className="row">
          <div>
            <label htmlFor="ll-city">City</label>
            <input
              id="ll-city"
              list="ll-city-options"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <datalist id="ll-city-options">
              {CITIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="ll-state">State</label>
            <input id="ll-state" value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div>
            <label htmlFor="ll-industry">Industry</label>
            <select id="ll-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="ll-radius">Radius — {radius} mi</label>
            <input
              id="ll-radius"
              type="range"
              min={5}
              max={75}
              step={5}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="ll-max">Max count — {maxCount}</label>
            <input
              id="ll-max"
              type="range"
              min={5}
              max={50}
              step={5}
              value={maxCount}
              onChange={(e) => setMaxCount(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="ll-persist">Save to CRM</label>
            <select
              id="ll-persist"
              value={persist ? "yes" : "no"}
              onChange={(e) => setPersist(e.target.value === "yes")}
              disabled={!signedIn}
            >
              <option value="yes">Yes — persist to public.leads</option>
              <option value="no">No — return only</option>
            </select>
            {!signedIn && (
              <p className="muted" style={{ marginTop: 6 }}>
                Sign in to persist leads to the CRM.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="ops-page-head">
          <div>
            <h2>Results</h2>
            <p className="subtitle">
              {phase.kind === "ok"
                ? `${leads.length} businesses · source: ${phase.data.provider ?? "live"}${
                    phase.data.persisted ? ` · ${phase.data.persisted} saved to CRM` : ""
                  }`
                : phase.kind === "loading"
                ? "Calling DataForSEO via /api/generate-leads…"
                : "Run a search to see live businesses."}
            </p>
          </div>
          {phase.kind === "ok" && (
            <div className="actions">
              <span className="indicator green"><span className="dot" />{hot} hot</span>
              <span className="indicator yellow"><span className="dot" />{cool} cool</span>
            </div>
          )}
        </div>

        {phase.kind === "idle" && (
          <p className="notice">Ready when you are. Set the filters above and click <strong>Run live search</strong>.</p>
        )}
        {phase.kind === "loading" && (
          <p className="muted">Calling DataForSEO…</p>
        )}
        {phase.kind === "setup_required" && (
          <div className="notice warn">
            <p style={{ marginTop: 0 }}>
              <strong>Live lead search needs DataForSEO credentials.</strong>
            </p>
            <p>{phase.data.message}</p>
            {phase.data.missing && phase.data.missing.length > 0 && (
              <p className="muted">Missing env vars: {phase.data.missing.join(", ")}</p>
            )}
            <p className="muted">
              Add credentials in Netlify → Site settings → Environment variables, then redeploy.
            </p>
          </div>
        )}
        {phase.kind === "empty" && (
          <div className="notice">
            <p style={{ marginTop: 0 }}>{phase.data.message ?? "No in-market businesses returned."}</p>
            {typeof phase.data.rawCount === "number" && (
              <p className="muted">
                DataForSEO returned {phase.data.rawCount} raw result{phase.data.rawCount === 1 ? "" : "s"}; {phase.data.filteredCount ?? 0} passed the geography filter.
              </p>
            )}
          </div>
        )}
        {phase.kind === "error" && <p className="error">{phase.message}</p>}
        {phase.kind === "ok" && (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Industry</th>
                  <th>Location</th>
                  <th>Fit</th>
                  <th>Package</th>
                  <th>Reviews</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.businessName}</div>
                      {l.phone && <div className="muted" style={{ fontSize: 12 }}>{l.phone}</div>}
                      {l.website && (
                        <a href={l.website} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          {l.website}
                        </a>
                      )}
                      {!l.hasWebsite && (
                        <div className="indicator red" style={{ marginTop: 4 }}>
                          <span className="dot" />No website
                        </div>
                      )}
                    </td>
                    <td>{l.industry}</td>
                    <td>
                      {l.city}{l.state ? `, ${l.state}` : ""}
                      {l.address && <div className="muted" style={{ fontSize: 12 }}>{l.address}</div>}
                    </td>
                    <td>
                      <span className={`indicator ${l.fitScore >= 80 ? "green" : l.fitScore >= 65 ? "yellow" : "red"}`}>
                        <span className="dot" />{l.fitScore}
                      </span>
                    </td>
                    <td>{l.recommendedPackage}</td>
                    <td>
                      {l.rating ? `${l.rating.toFixed(1)}★` : "—"} · {l.reviewsCount}
                    </td>
                    <td className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
                      {l.signal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};
