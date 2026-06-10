import type { FC } from "react";

interface Integration {
  name: string;
  description: string;
  envVars: string[];
  endpoints: string[];
  status: "configured-at-build" | "live-server-side";
}

const INTEGRATIONS: Integration[] = [
  {
    name: "Supabase Auth + CRM",
    description: "Magic-link sign-in, RLS-protected leads/prospects/proposals/sales tables, audit log.",
    envVars: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    endpoints: ["/api/dashboard", "/api/qualify-lead"],
    status: "live-server-side",
  },
  {
    name: "DataForSEO",
    description: "Live lead search (Business Listings) and SERP/keyword footprint for Lead Intel.",
    envVars: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
    endpoints: ["/api/generate-leads", "/api/analyze-lead"],
    status: "live-server-side",
  },
  {
    name: "Google Places (New)",
    description: "Verified Google Business Profile enrichment for Lead Intel.",
    envVars: ["GOOGLE_PLACES_API_KEY"],
    endpoints: ["/api/analyze-lead"],
    status: "live-server-side",
  },
  {
    name: "OpenAI",
    description: "Narrative, email drafts, rewrite, proposal copy, training content.",
    envVars: ["OPENAI_API_KEY"],
    endpoints: ["/api/analyze-lead", "/api/draft-email", "/api/proposal", "/api/rewrite", "/api/training-content"],
    status: "live-server-side",
  },
  {
    name: "Resend",
    description: "Outbound prospect / qualification email delivery.",
    envVars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    endpoints: ["/api/send-email"],
    status: "live-server-side",
  },
  {
    name: "Plaid",
    description: "Rep payout / direct-deposit onboarding via Plaid Link.",
    envVars: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"],
    endpoints: ["/api/plaid-create-link-token", "/api/plaid-exchange-token"],
    status: "live-server-side",
  },
  {
    name: "DocuSign",
    description: "Contract signing with branded OAuth + consent callbacks.",
    envVars: ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID"],
    endpoints: ["/docusign/oauth/callback", "/docusign/consent-complete"],
    status: "live-server-side",
  },
  {
    name: "Dropbox Sign",
    description: "Lightweight e-sign fallback for proposals + NDAs.",
    envVars: ["DROPBOX_SIGN_CLIENT_ID", "DROPBOX_SIGN_API_KEY"],
    endpoints: ["/api/dropbox-sign-callback"],
    status: "live-server-side",
  },
  {
    name: "Gusto",
    description: "Rep onboarding / payroll OAuth + webhook receiver.",
    envVars: ["GUSTO_CLIENT_ID", "GUSTO_CLIENT_SECRET", "GUSTO_WEBHOOK_SECRET"],
    endpoints: ["/gusto/oauth/callback", "/api/gusto-webhook"],
    status: "live-server-side",
  },
];

export const IntegrationsHub: FC = () => (
  <section className="card">
    <h2>Integrations</h2>
    <p className="subtitle">
      Every external service the portal uses is server-side. Credentials live in Netlify environment variables — they
      are never shipped to the browser. Configure them, redeploy, and the matching module activates automatically.
    </p>
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>What it powers</th>
          <th>Env vars</th>
          <th>Endpoints</th>
        </tr>
      </thead>
      <tbody>
        {INTEGRATIONS.map((i) => (
          <tr key={i.name}>
            <td style={{ fontWeight: 600 }}>{i.name}</td>
            <td className="muted" style={{ fontSize: 13 }}>{i.description}</td>
            <td>
              <code style={{ fontSize: 12 }}>{i.envVars.join(", ")}</code>
            </td>
            <td>
              <code style={{ fontSize: 12 }}>{i.endpoints.join(", ")}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
