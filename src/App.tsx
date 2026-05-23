import { useState, type FC } from "react";
import { LeadAnalyzer } from "./components/LeadAnalyzer";
import { EmailComposer } from "./components/EmailComposer";
import { ProposalBuilder } from "./components/ProposalBuilder";
import { TrainingHub } from "./components/TrainingHub";
import { PipelineDashboard } from "./components/PipelineDashboard";
import type { AnalyzeResponse } from "./api";
import { resolveRoute } from "./router";
import { DocusignCallback } from "./pages/DocusignCallback";
import { DocusignConsentComplete } from "./pages/DocusignConsentComplete";
import { GustoCallback } from "./pages/GustoCallback";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";

type Tab = "leads" | "email" | "proposal" | "training" | "pipeline";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "pipeline", label: "Pipeline" },
  { id: "leads", label: "Lead intel" },
  { id: "email", label: "Email" },
  { id: "proposal", label: "Proposal" },
  { id: "training", label: "Training" },
];

const SalesApp: FC = () => {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">M2</div>
          <div>
            <div>MS2GO Sales Command Center</div>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>
              Local growth, on tap.
            </div>
          </div>
        </div>
        <div className="rep">Joe Pearce · MS2GO</div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "pipeline" && <PipelineDashboard />}
        {tab === "leads" && <LeadAnalyzer onAnalysisReady={setAnalysis} />}
        {tab === "email" && <EmailComposer analysis={analysis} />}
        {tab === "proposal" && <ProposalBuilder analysis={analysis} />}
        {tab === "training" && <TrainingHub />}
      </main>
    </div>
  );
};

export const App: FC = () => {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const route = resolveRoute(pathname);

  switch (route) {
    case "docusign-callback":
      return <DocusignCallback />;
    case "docusign-consent-complete":
      return <DocusignConsentComplete />;
    case "gusto-callback":
      return <GustoCallback />;
    case "privacy":
      return <Privacy />;
    case "terms":
      return <Terms />;
    case "app":
    default:
      return <SalesApp />;
  }
};
