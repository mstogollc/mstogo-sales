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
          <Quick label="Generate a lead list" desc="Find local prospects by city, industry, and radius." onClick={() => onNavigate("leads")} />
          <Quick label="Run Lead Intel" desc="Pull a pre-meeting brief on any business in seconds." onClick={() => onNavigate("intel")} />
          <Quick label="Build a proposal" desc="A branded MS2GO proposal you can send in minutes." onClick={() => onNavigate("proposal")} />
          <Quick label="Draft outreach" desc="Write, polish, and send prospect emails." onClick={() => onNavigate("outreach")} />
          <Quick label="Open the pipeline" desc="Track every lead, proposal, and sale in one place." onClick={() => onNavigate("pipeline")} />
          <Quick label="Set up payouts" desc="Connect your bank for commission direct deposit." onClick={() => onNavigate("payouts")} />
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
