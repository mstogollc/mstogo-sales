# MS2GO Sales Command Center

Sales portal for MS2GO — lead analysis, branded outreach, proposal generation, and rep training.

## Stack

- Vite + React + TypeScript front end
- Netlify Functions (Node 20) for all server-side integrations
- Vitest for unit tests

## Server-side integrations (Netlify Functions)

All third-party calls live in `netlify/functions/_lib/*` so API keys never reach the client bundle.

| Provider | Env var(s) | Used by |
| --- | --- | --- |
| **Supabase** (CRM, auth, RLS, audit log) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server) · `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PORTAL_URL` (browser) | `analyze-lead`, `dashboard`, `draft-email`, `generate-leads`, `heat-map`, `plaid-*`, `proposal`, `qualify-lead`, `send-email`, `usage-dashboard`, `website-build-request` |
| Google Places (New) | `GOOGLE_PLACES_API_KEY` | `analyze-lead`, `generate-leads` (fallback), `heat-map` |
| DataForSEO | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `analyze-lead`, `generate-leads`, `heat-map` |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_TIMEOUT_MS` (default 8000) | `analyze-lead`, `draft-email`, `rewrite`, `proposal`, `training-content` |
| Resend | `RESEND_API_KEY`, optional `MS2GO_FROM_EMAIL`, `MS2GO_REPLY_TO` | `send-email` |
| Calendly | `VITE_CALENDLY_URL` (public booking link), `CALENDLY_PERSONAL_ACCESS_TOKEN` (reserved) | Appointments view |
| Dropbox Sign | `DROPBOX_SIGN_API_KEY` | `dropbox-sign-callback` |
| **Plaid** (rep direct-deposit verification) | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | `plaid-create-link-token`, `plaid-exchange-token` |
| **Gusto** (payroll OAuth + webhooks) | `GUSTO_CLIENT_ID`, `GUSTO_CLIENT_SECRET`, `GUSTO_WEBHOOK_SECRET` | `gusto-webhook`, `/gusto/oauth/callback` page |

`.env.example` lists every variable with comments.

### Gusto — OAuth callback and webhook

- OAuth redirect URI: `https://portal.mstogo.com/gusto/oauth/callback` (branded page that handles `?code` / `?error`).
- Webhook URL: `https://portal.mstogo.com/.netlify/functions/gusto-webhook`. When `GUSTO_WEBHOOK_SECRET` is set, each body is verified with HMAC-SHA256 against the `X-Gusto-Signature` header.

### DocuSign — OAuth pages

The app serves branded landing pages at `/docusign/oauth/callback` and `/docusign/consent-complete` for the DocuSign OAuth and consent redirects. No server-side DocuSign function or env var exists yet.

### Admin-only: Usage & Cost dashboard

`/sales-ops/admin/usage` (backed by `usage-dashboard`) shows portal activity and estimated vendor usage per rep. Only super admins and users whose profile role is `super_admin` or `manager` can see it. The UI hides it and the function returns 403 for everyone else. It is an estimate ledger, not a billing feed.

### Website build requests

`website-build-request` lets a rep ask MS2GO to build a demo or first website for a prospect (`POST`) and track their requests (`GET`; managers and admins see all). Fulfillment is a manual step that flips the status to ready.

### Dropbox Sign account callback

Paste this URL into the Dropbox Sign dashboard (Settings → API → Account Callback):

- Production: `https://portal.mstogo.com/.netlify/functions/dropbox-sign-callback`
- Netlify fallback: `https://<site>.netlify.app/.netlify/functions/dropbox-sign-callback`

The handler accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` payloads, always replies with the literal string `Hello API Event Received` (required by Dropbox Sign), and verifies the `event_hash` HMAC when `DROPBOX_SIGN_API_KEY` is set.

### Plaid — rep payout onboarding

Independent contractor sales reps connect a bank account so MS2GO can route commission direct deposit. The integration uses only the **Auth** and **Identity** products in **US / en**, and never exposes raw routing/account numbers or the access token to the browser.

- `POST /.netlify/functions/plaid-create-link-token` → `{ link_token, expiration }`. Requires an authenticated Supabase user (Bearer JWT) unless a `client_user_id` is supplied for unauthenticated demos.
- `POST /.netlify/functions/plaid-exchange-token` with `{ public_token, institution_name?, expected_owner_name? }` → `{ persisted, summary }`. The handler:
  1. Exchanges the public token server-side for an access token (kept server-only).
  2. Calls `/auth/get` and best-effort `/identity/get`.
  3. Resolves the institution name when available.
  4. Returns a safe verification summary: institution, account `mask` (last4), type/subtype, ACH-eligible flag, owner-match level (`match` / `partial` / `mismatch` / `unknown`), and overall `status` (`verified` / `needs_review` / `unverified`).
  5. When Supabase service role is configured, upserts the summary into `public.rep_payout_accounts` (RLS lets reps see only their own row; the `access_token` column is service-role-only).

`PLAID_ENV` selects the host: `sandbox` → `sandbox.plaid.com`, `development` → `development.plaid.com`, `production` → `production.plaid.com`. Sandbox test creds inside Link: `user_good` / `pass_good`.

The branded UI lives under the **Payouts** tab (`<PayoutSetup />`) and loads Plaid Link from `cdn.plaid.com` on demand so the main bundle stays small.

## CRM database (Supabase)

The full schema, RLS policies, and audit log live in
[`supabase/migrations/20260523000000_init_crm_foundation.sql`](supabase/migrations/20260523000000_init_crm_foundation.sql).

See [`docs/APPLY_MIGRATION.md`](docs/APPLY_MIGRATION.md) for the exact steps to
apply it to project `izoveptctxypwmyvavyg`. Later migrations in the same folder
apply in filename order:

- `20260524000000_rep_payout_accounts.sql` — Plaid payout summaries
- `20260605000000_usage_tracking.sql` — `usage_events` for the Usage dashboard
- `20260617000000_website_build_requests.sql` — website build requests

Highlights:

- Reps see only their own records (and any reps they sponsor) via RLS.
- Super admins `mstogollc@gmail.com` and `admin@mstogo.com` see everything.
- `audit_log` is **append-only** — enforced by both RLS and a deny-update/delete trigger.
- `sales` inserts automatically generate direct + sponsor-override commissions.
  Defaults: new rep 15% direct, super-admins / Joe Pearce 25% direct + 10% override.
- Live pipeline + earnings views (`v_pipeline_summary`, `v_commission_summary`).
- `dashboard` function reads everything through the caller's JWT, so the
  database — not the UI — decides what each rep can see.

Every helper gracefully handles missing keys, no matches, and API errors — analysis and drafting continue to work with safe fallbacks so the rep is never blocked.

## Local development

```bash
npm install
npm run dev        # Vite dev server (UI only)
npm run typecheck  # TypeScript across app + functions
npm run test       # Vitest unit tests (no live API calls)
npm run build      # Production build
```

For end-to-end local testing with functions, use `netlify dev`.

## Packages

| Tier | Price | Focus |
| --- | --- | --- |
| Basic | $300/mo | Foundational local presence |
| Growth | $750/mo | Active demand generation |
| Premium | $2,000/mo | Full sales acceleration |

Primary rep: **Joe Pearce** (`joe@mstogo.com`).
