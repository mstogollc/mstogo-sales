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
| Google Places (New) | `GOOGLE_PLACES_API_KEY` | `analyze-lead` |
| DataForSEO | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `analyze-lead` |
| OpenAI | `OPENAI_API_KEY` | `analyze-lead`, `draft-email`, `rewrite`, `proposal`, `training-content` |
| Resend | `RESEND_API_KEY`, optional `MS2GO_FROM_EMAIL`, `MS2GO_REPLY_TO` | `send-email` |
| Calendly | `CALENDLY_PERSONAL_ACCESS_TOKEN` | (reserved for booking flow) |
| Dropbox Sign | `DROPBOX_SIGN_API_KEY` | `dropbox-sign-callback` |

### Dropbox Sign account callback

Paste this URL into the Dropbox Sign dashboard (Settings → API → Account Callback):

- Production: `https://portal.mstogo.com/.netlify/functions/dropbox-sign-callback`
- Netlify fallback: `https://<site>.netlify.app/.netlify/functions/dropbox-sign-callback`

The handler accepts `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` payloads, always replies with the literal string `Hello API Event Received` (required by Dropbox Sign), and verifies the `event_hash` HMAC when `DROPBOX_SIGN_API_KEY` is set.

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

Primary rep: **Joe Pearce** (`joe@ms2go.com`).
