import type { FC } from "react";
import { SALES_OPS_NAV, type SalesOpsModuleId } from "./SalesOpsLayout";

interface Props {
  onNavigate: (id: SalesOpsModuleId) => void;
  userEmail?: string | null;
  isSuperAdmin?: boolean;
}

export const CommandCenter: FC<Props> = ({ onNavigate, userEmail, isSuperAdmin }) => {
  const greeting = userEmail ? `Welcome back, ${userEmail.split("@")[0]}.` : "Welcome to the MS2GO Sales Operations Center.";
  return (
    <>
      <section className="card">
        <h2>{greeting}</h2>
        <p className="subtitle">
          {isSuperAdmin
            ? "You're signed in as a Super Admin — every module is unlocked, including integration callbacks and audit data."
            : "Pick a module from the left, or jump straight into a common workflow below."}
        </p>
        <div className="tier-grid" style={{ marginTop: 12 }}>
          <Quick label="Generate a lead list" desc="DataForSEO live search by city / industry / radius." onClick={() => onNavigate("leads")} />
          <Quick label="Run Lead Intel" desc="Pre-meeting brief from Google Places + DataForSEO + OpenAI." onClick={() => onNavigate("intel")} />
          <Quick label="Build a proposal" desc="Branded MS2GO proposal copy from the latest analysis." onClick={() => onNavigate("proposal")} />
          <Quick label="Draft outreach" desc="Email drafts, rewrites, and Resend send." onClick={() => onNavigate("outreach")} />
          <Quick label="Open the pipeline" desc="Supabase-backed CRM: leads, prospects, proposals, sales." onClick={() => onNavigate("pipeline")} />
          <Quick label="Set up payouts" desc="Plaid Link for rep direct-deposit." onClick={() => onNavigate("payouts")} />
        </div>
      </section>

      <section className="card">
        <h2>Modules</h2>
        <p className="subtitle">Each module is one route in the Operations Center.</p>
        <ul className="signal-list">
          {SALES_OPS_NAV.map((m) => (
            <li key={m.id}>
              <span className="label" style={{ flex: 1 }}>{m.label}</span>
              <span className="muted" style={{ fontSize: 12 }}>{m.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};

const Quick: FC<{ label: string; desc: string; onClick: () => void }> = ({ label, desc, onClick }) => (
  <button type="button" className="tier" style={{ textAlign: "left", cursor: "pointer", background: "white" }} onClick={onClick}>
    <div style={{ fontWeight: 700, color: "var(--ms2go-navy)" }}>{label}</div>
    <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>{desc}</p>
  </button>
);
