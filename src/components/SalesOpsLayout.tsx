import type { FC, ReactNode } from "react";

export type SalesOpsModuleId =
  | "command-center"
  | "leads"
  | "intel"
  | "heatmap"
  | "proposal"
  | "outreach"
  | "calendar"
  | "pipeline"
  | "payouts"
  | "training"
  | "integrations"
  | "usage";

interface NavItem {
  id: SalesOpsModuleId;
  label: string;
  description: string;
  path: string;
  badge?: string;
  adminOnly?: boolean;
}

export const SALES_OPS_NAV: NavItem[] = [
  {
    id: "command-center",
    label: "Command Center",
    description: "Daily mission control",
    path: "/sales-ops",
  },
  {
    id: "leads",
    label: "Lead Lists",
    description: "Generate territory targets",
    path: "/sales-ops/leads",
  },
  {
    id: "intel",
    label: "Lead Intel",
    description: "Pre-meeting business brief",
    path: "/sales-ops/intel",
  },
  {
    id: "heatmap",
    label: "Map Pack Heat Map",
    description: "Local 3-pack ranking grid",
    path: "/sales-ops/heat-map",
  },
  {
    id: "proposal",
    label: "Proposal Generator",
    description: "Build branded proposals",
    path: "/sales-ops/proposals",
  },
  {
    id: "outreach",
    label: "Email Outreach",
    description: "Draft, rewrite, send",
    path: "/sales-ops/outreach",
  },
  {
    id: "calendar",
    label: "Appointments",
    description: "Book meetings & demos",
    path: "/sales-ops/calendar",
  },
  {
    id: "pipeline",
    label: "CRM Pipeline",
    description: "Move every opportunity",
    path: "/sales-ops/pipeline",
  },
  {
    id: "payouts",
    label: "Payouts / Plaid",
    description: "Direct-deposit onboarding",
    path: "/sales-ops/payouts",
  },
  {
    id: "training",
    label: "Training",
    description: "Get sharp, stay sharp",
    path: "/sales-ops/training",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "DocuSign · Gusto · Dropbox · Resend",
    path: "/sales-ops/integrations",
  },
  {
    id: "usage",
    label: "Usage & Cost",
    description: "API usage by rep & provider",
    path: "/sales-ops/admin/usage",
    adminOnly: true,
  },
];

interface Props {
  activeId: SalesOpsModuleId;
  onNavigate: (id: SalesOpsModuleId) => void;
  userEmail?: string | null;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  onSignOut?: () => void;
  children: ReactNode;
}

export const SalesOpsLayout: FC<Props> = ({
  activeId,
  onNavigate,
  userEmail,
  isSuperAdmin,
  isAdmin,
  onSignOut,
  children,
}) => {
  const visibleNav = SALES_OPS_NAV.filter((n) => !n.adminOnly || isAdmin);
  const activeItem = SALES_OPS_NAV.find((n) => n.id === activeId) ?? SALES_OPS_NAV[0];
  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-brand">
          <div className="ops-brand-logo">M2</div>
          <div className="ops-brand-text">
            <div className="ops-brand-eyebrow">Sales Ops Center</div>
            <div className="ops-brand-sub">Operational HQ</div>
          </div>
        </div>

        <nav className="ops-nav">
          {visibleNav.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={`ops-nav-item${active ? " active" : ""}`}
                onClick={() => onNavigate(item.id)}
              >
                <div className="ops-nav-bullet">{item.label[0]}</div>
                <div className="ops-nav-text">
                  <div className="ops-nav-label">{item.label}</div>
                  <div className="ops-nav-desc">{item.description}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="ops-sidebar-footer">
          <div className="ops-sidebar-footer-title">Integration status</div>
          <p className="ops-sidebar-footer-body">
            DataForSEO, Google Places, Resend, OpenAI, Plaid, DocuSign, Dropbox Sign and Gusto activate when their env
            vars are configured on Netlify.
          </p>
        </div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar">
          <div className="ops-topbar-title">
            <div className="ops-topbar-eyebrow">{activeItem.label}</div>
            <div className="ops-topbar-heading">MS2GO Sales Operations Center</div>
          </div>
          <div className="ops-topbar-meta">
            {isSuperAdmin && <span className="indicator green"><span className="dot" />Super Admin</span>}
            {userEmail ? (
              <span className="ops-topbar-user">{userEmail}</span>
            ) : (
              <span className="ops-topbar-user muted">Signed out</span>
            )}
            {onSignOut && userEmail && (
              <button type="button" className="ghost" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className="ops-content">{children}</main>

        <footer className="ops-footer">
          <span>MS2GO Sales Operations Center · portal.mstogo.com</span>
          <span>Auth · Supabase · Live integrations</span>
        </footer>
      </div>
    </div>
  );
};
