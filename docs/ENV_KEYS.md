# Environment Keys — what to put in `.env`

This is the practical "what do I need to plug in to make each feature work" reference. The toolkit boots fine with most of these blank — features that depend on a missing key just disable themselves and surface a friendly error in the UI. The "REQUIRED" markers below are about **production** safety, not local dev.

Copy [`.env.example`](../.env.example) to `.env` at the repo root and fill in what you need.

---

## Core runtime — backend (`src/config/env.js`)

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `NODE_ENV` | recommended | `development` \| `production` \| `test`. Production mode enables CORS lock-down, HSTS, strict env validation, and refuses to boot on missing fatal vars. | Set yourself. |
| `PORT` | optional | Backend listen port. Default `3000`. | Pick a free port. |
| `JWT_SECRET` | **REQUIRED in prod** | Signs JWT access + refresh tokens. Without it in prod the server refuses to boot. Dev falls back to an insecure placeholder. | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CLIENT_ORIGIN` | **REQUIRED in prod** | Comma-separated list of allowed CORS origins. In prod the server refuses to boot if blank (CORS fails closed). | Set to e.g. `https://app.yourdomain.com` (multi: `https://app.x.com,https://staging.x.com`). Local dev: `http://localhost:3001`. |
| `USERDATA_PATH` | optional | Absolute path to the persistent data dir (SQLite + per-user files). Defaults to `./app-data` at the repo root. In Docker, mount a volume here. | Set to an absolute host path. |
| `LEGACY_USERDATA_PATH` | optional | If you migrated from an older install, point this at the old data dir and the server one-time-copies its contents on first boot. | Path of your old install. |
| `MAX_FAILED_LOGINS` | optional | Account lock threshold. Default `6`. | Number. |
| `ACCOUNT_LOCK_MINUTES` | optional | Lock duration after threshold. Default `15`. | Number. |
| `REFRESH_TOKEN_TTL_DAYS` | optional | Refresh-token lifetime. Default `14`. | Number. |
| `INITIAL_ADMIN_PASSWORD` | recommended for prod | Bootstrap password for the auto-created `admin` user on a fresh DB. In production with no value set, the server **refuses to auto-create the admin** (you must seed one manually). Dev falls back to `admin123` with a clear warning. | Generate any strong password. |
| `MASTER_KEY` | recommended for prod | 32 raw bytes (base64) used to AES-256-GCM-encrypt user API keys at rest in the SQLite `user_settings` table + system-settings.json. If unset, keys are stored in plaintext with a startup warning. Set this and re-run migrations to encrypt existing rows. | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

---

## Frontend (`client/.env` or root `.env`, Vite-style)

Vite only exposes env vars prefixed with `VITE_` to the browser bundle. Put these in `client/.env` (or pass them at build time).

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `VITE_API_URL` | optional | Base URL for API calls from the React app. Defaults to `/api` (relative). | Only needed if the frontend is served from a different origin than the API. |
| `VITE_GOOGLE_CLIENT_ID` | optional | Enables "Sign in with Google". Must match the backend `GOOGLE_CLIENT_ID`. Without it the UI hides the Google login button. | Google Cloud Console — same OAuth client as below. |

---

## Auth — Google OAuth (optional)

Skip this and users will log in with email/password only.

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | optional | Verifies Google ID tokens sent from the frontend. **Must equal `VITE_GOOGLE_CLIENT_ID`.** | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → "Create credentials" → "OAuth client ID" → Web application → authorized origins = your frontend URL. Copy the **Client ID**. (You only need the ID server-side because we use Google Identity Services ID tokens, not the OAuth code flow — no client secret needed.) |

---

## DataForSEO — keyword research, AI SERP scraper, business info (optional)

Powers: Local Keyword Research, AI Keyword Data, AI Optimization, Google Business Audit, Schema Generator (business data).

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `DATAFORSEO_LOGIN` | optional | DataForSEO API login (used as HTTP Basic username). | [DataForSEO dashboard](https://app.dataforseo.com/) → API Access → copy the **API Login**. |
| `DATAFORSEO_PASSWORD` | optional | DataForSEO API password (HTTP Basic password). | Same page — copy the **API Password**. |

Per-user override: admins can also save DataForSEO credentials per-user in **Settings → API Keys** (stored in `user_settings` table). The env values act as a fallback.

---

## Serper.dev — Google Search / Reviews / Answers proxy (optional)

Powers: Serper Search, Serper Reviews, Citation Audit, "Answer the AI", schema autofill review enrichment.

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `SERPER_API_KEY` | optional (stored in DB, not env) | The Serper key is **not** read from env. Admins paste it in **Settings → API Keys**; it's stored in `system_settings.json` and restored from DB on every boot via `apiKeySync.js`. | [serper.dev](https://serper.dev/) → sign up → API key in the dashboard. Then paste into the admin Settings UI; no env var required. |

---

## Anthropic Claude — content generation (optional)

Powers: Press Release writer, Blog Post writer, Beyond Intent.

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `CLAUDE_API_KEY` | optional | Anthropic API key. Fallback used when no per-admin key is saved in Settings. | [Anthropic Console](https://console.anthropic.com/) → API Keys → "Create Key". |

Per-user override: same pattern as Serper — admins can save Claude keys via Settings.

---

## Stripe — billing + subscriptions (optional)

Leave all Stripe vars blank to disable the entire billing surface (plans page, checkout, webhooks). The toolkit still works, just without paid plans.

| Key | Required? | What it does | How to get it |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | optional | Stripe server-side API key (sk_test_… or sk_live_…). | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key. |
| `STRIPE_WEBHOOK_SECRET` | **REQUIRED in prod if `STRIPE_SECRET_KEY` is set** | Verifies incoming webhook signatures. Server refuses to boot in prod without it. | Dashboard → Developers → Webhooks → "Add endpoint" → point at `https://yourdomain/api/billing/webhook` → copy the **Signing secret** (whsec_…). |
| `STRIPE_PRICE_PERSONAL` | required for Personal plan | Stripe Price ID for the Personal subscription. | Dashboard → Products → create "Personal" → copy `price_…` ID. |
| `STRIPE_PRICE_BUSINESS` | required for Business plan | Same as above, for Business tier. | Products → create "Business". |
| `STRIPE_PRICE_AGENCY` | required for Agency plan | Same, for Agency tier. | Products → create "Agency". |
| `STRIPE_PRICE_TOPUP` | required for credit top-ups | Price ID for one-time credit top-up purchases. | Products → create "Credit Top-up" with a one-time price. |
| `STRIPE_SUCCESS_URL` | optional | Where Stripe Checkout redirects after a successful purchase. | e.g. `https://app.yourdomain.com/billing/success` |
| `STRIPE_CANCEL_URL` | optional | Where Stripe Checkout redirects on cancellation. | e.g. `https://app.yourdomain.com/billing` |
| `STRIPE_WEBHOOK_IPS` | optional, defense-in-depth | Comma-separated CIDR list — webhook requests whose source IP isn't in the list get a 403 BEFORE signature verification runs. Set to `auto` to use the bundled snapshot of Stripe's published IP ranges. If empty (default), the IP check is skipped and signature verification alone gates the endpoint. | Either `auto`, or paste the CSV from [stripe.com/files/ips/ips_webhooks.json](https://stripe.com/files/ips/ips_webhooks.json). |

### Stripe webhook events to subscribe to

When you create the webhook endpoint in the Stripe dashboard, subscribe to at minimum:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Google Places + Custom Search (stored in DB, not env)

Powers: Heatmap, Google Maps text search, Bulk Index Checker (Google API mode), per-user rank tracking.

These are **per-admin Settings keys**, not env vars. Paste them in **Settings → API Keys**:

| Setting key (in UI) | Stored as | What it does | How to get it |
|---|---|---|---|
| Google Places API key | `googlePlaces_api_key` | Heatmap grid + text search + place details enrichment. | [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) → enable **Places API** + **Maps JavaScript API** → Credentials → create API key → restrict to HTTP referrers (your domain) AND the Places + Maps APIs. |
| Google Custom Search API key | `google_api_key` | Bulk Index Checker (google-api mode) + rank tracking via Custom Search. | Same console — enable **Custom Search API** → reuse or create a separate key. |
| Google Custom Search Engine ID (cx) | `google_cx` | Required alongside the Custom Search API key. | [Programmable Search Engine](https://programmablesearchengine.google.com/) → create engine → "Search the entire web" → copy the **Search engine ID** (long alphanumeric string). |

---

## Scraping User-Agents (optional)

Used when the toolkit crawls a page for schema autofill or business audit. Defaults are sensible.

| Key | Required? | Default | What it does |
|---|---|---|---|
| `SCHEMA_AUTOFILL_USER_AGENT` | optional | `SEOToolkitSchemaBot/1.0 (+https://seo-toolkit.local)` | UA for schema generator + citation crawler + spider web. Identifies your bot to webmasters. |
| `BUSINESS_AUDIT_USER_AGENT` | optional | A Chrome 118 UA | UA for Google Business audit scrape + bulk HTTP checker. |

Override these to brand the crawler with your own contact URL.

---

## Bare-minimum local dev `.env`

You can boot the app with just these. Most features will return "API key missing" errors, but the auth flow + UI work.

```dotenv
NODE_ENV=development
PORT=3000
JWT_SECRET=replace_with_node_-e_crypto_randomBytes_32_base64_output
CLIENT_ORIGIN=http://localhost:3001
```

## Recommended local dev `.env` for full feature testing

```dotenv
NODE_ENV=development
PORT=3000
JWT_SECRET=<generated 32-byte base64>
CLIENT_ORIGIN=http://localhost:3001
INITIAL_ADMIN_PASSWORD=<your own strong password>

# Google OAuth (also add VITE_GOOGLE_CLIENT_ID to client/.env)
GOOGLE_CLIENT_ID=<your_oauth_client_id>.apps.googleusercontent.com

# DataForSEO
DATAFORSEO_LOGIN=<email>
DATAFORSEO_PASSWORD=<api_password>

# Claude
CLAUDE_API_KEY=sk-ant-<...>
```

Then in the admin Settings UI, after first login, paste:
- Serper API key
- Google Places API key
- Google Custom Search API key + cx

## Production checklist

In production (`NODE_ENV=production`) the server REFUSES TO BOOT if any of these are missing:

- [ ] `JWT_SECRET` — must be set
- [ ] `CLIENT_ORIGIN` — must list every allowed origin (CORS fails closed)
- [ ] `STRIPE_WEBHOOK_SECRET` — required if `STRIPE_SECRET_KEY` is set

Strongly recommended in production:

- [ ] `INITIAL_ADMIN_PASSWORD` — without it, no admin is auto-created on a fresh DB (you'd have to seed one via the database)
- [ ] `MASTER_KEY` — without it, user API keys are stored in plaintext in SQLite + system-settings.json
- [ ] `USERDATA_PATH` — set to a persistent absolute path (a Docker volume, not the container filesystem)
- [ ] `STRIPE_WEBHOOK_IPS=auto` — adds a Stripe-IP-allowlist check before signature verification

### Rotating `MASTER_KEY`

Once `MASTER_KEY` is set and migration 006 has encrypted the existing rows, **changing the value will break decryption** of all stored keys. To rotate:

1. Provision a new key.
2. Write a one-off migration (e.g. `007_rotate_master_key.js`) that reads each encrypted row, decrypts with the OLD key, re-encrypts with the NEW key.
3. Swap the env var and redeploy.

There's no automated tool for this yet — it's a once-in-a-blue-moon operation.
