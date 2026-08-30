# SEO Toolkit — Project Audit

_Refreshed 2026-05-27 after the comprehensive reliability + security pass. Supersedes all previous notes._

---

## 1. What this is

**SEO Toolkit** is a self-hosted, full-stack web app — Node 20 / Express backend, React 18 / Vite frontend, SQLite — that packages a working SEO consultant's daily toolkit into one product. Currently at `v0.6.0`. Deployable via `npm start` (which runs `node src/index.js`) or `docker compose up`.

### Feature surface

| Tab | Tools |
|---|---|
| **Home** | Dashboard + tool launcher |
| **Whiteboard** | Fabric.js canvas for visual planning |
| **Local Business** | Keyword research (DataForSEO), Google Business Audit + comparison, Heatmap rank grid (Google Places), Business Citations directory (90 US + UK publishers) |
| **Web Search** | Site Marker (capture + annotate live pages with shareable links), Map Element, Schema Generator (autofills LocalBusiness/Article/FAQ JSON-LD), Technical Audit, Bulk Index Checker (Google API / DataForSEO dual Google+Bing), Bulk HTTP Checker (redirect chain), Site Tree Generator |
| **AI SEO** | AI Keyword Data, AI Optimization (LLM SERP scraper), Crawler Access Checker (27-bot robots.txt evaluator), LLMS.txt Validator + Generator, "Answer the AI" PAA gap analysis |
| **Content** | Press Release writer, Blog Post writer, Beyond Intent — all Claude-backed |
| **Settings / Admin / Billing** | API keys, prompts, IP whitelist, user CRUD, ban management, credit grants, Stripe Personal/Business/Agency + top-ups |

### External services

- **DataForSEO** — keyword volume, AI keyword data, LLM scraper, Google Business Info
- **Google Custom Search / Google Places** — index checking, rank verification, heatmap, place details
- **Serper.dev** — Google Search / Reviews / Answers proxy
- **Anthropic Claude** — content generation
- **Stripe** — billing (Checkout + webhooks, optional IP allowlist)
- **Google OAuth** — optional "Sign in with Google"
- **OpenStreetMap Nominatim** — free geocoding
- **Playwright** — headless browser pool for live-page captures

---

## 2. How it's structured

### Top-level layout

```
MotionLinx Toolkit/
├── src/                      ← all backend code; src/index.js is the entry + barrel
├── client/                   ← Vite + React 18 + TypeScript-leaning SPA
├── tests/                    ← vitest backend smoke tests (23 passing)
├── app-data/                 ← runtime storage (gitignored)
├── docker-compose.yml        ← builds locally (no registry), USERDATA_PATH volume
├── Dockerfile                ← Node 20 (Debian slim), multi-stage, Chromium, non-root
├── .env.example              ← every env var documented
├── docs/
│   ├── ENV_KEYS.md           ← how to get each API key + production checklist
│   └── AUDIT.md              ← this file
└── .github/workflows/ci.yml  ← lint + test + client typecheck/build on every PR
```

### Backend — `src/` (~13,800 lines across 53 modules)

```
src/
├── index.js                  ← public barrel: { start, buildApp }
├── app.js                    ← Express composition root; async to await migrations
│
├── config/
│   ├── env.js                ← zod-validated env, fail-fast in prod
│   ├── helmet.js             ← CSP w/ per-request nonce, Trusted Types RO, HSTS preload, Permissions-Policy
│   └── cors.js               ← fails closed in production
│
├── db/
│   ├── connection.js         ← sqlite3 + WAL + foreign_keys + busy_timeout
│   ├── schema.js             ← thin wrapper: initSchema → runMigrations
│   ├── migrate.js            ← numbered migration runner; statements split + sequential
│   └── migrations/
│       ├── 001_initial_schema.sql            ← all CREATE TABLEs (idempotent)
│       ├── 002_legacy_column_reconcile.js    ← adds late columns + late-column indexes on old DBs
│       ├── 003_bootstrap_admin.js            ← creates default admin (gated on INITIAL_ADMIN_PASSWORD)
│       ├── 004_jobs_table.sql                ← persistent backing for jobQueue
│       ├── 005_apikeys_disk_to_db.js         ← copies legacy disk apiKeys → user_settings
│       └── 006_encrypt_user_api_keys.js      ← AES-GCM encrypts user_settings secrets (gated on MASTER_KEY)
│
├── middleware/
│   ├── authenticate.js       ← JWT verify + trial-route allowlist
│   ├── creditGuard.js        ← credit check + post-response deduct + API log
│   ├── rateLimits.js         ← heavy/medium/cheap tier factories
│   ├── requireAdmin.js
│   ├── errorHandler.js       ← typed errors + asyncHandler
│   └── stripeIpAllowlist.js  ← optional defense-in-depth IP check for webhook
│
├── utils/
│   ├── logger.js             ← pino + secret redaction
│   ├── dbAsync.js            ← promisified dbGet/dbAll/dbRun + ensureTableColumns + withTransaction
│   ├── smartFetch.js         ← native fetch + AbortController timeout + opt-in TLS retry (undici dispatcher)
│   ├── crypto.js             ← AES-256-GCM encrypt/decrypt for at-rest secrets
│   ├── url.js                ← normalizeUrl / normalizeHostname / delay
│   ├── htmlScrape.js         ← JSON-LD parser, postal address normalizer, STOPWORDS
│   ├── http.js               ← resolveClientIp, maskApiKey
│   ├── userLevel.js          ← USER_LEVELS, isTrialRequestAllowed
│   └── mergeDeep.js
│
├── storage/
│   ├── paths.js              ← USERDATA_ROOT init, ensureDir, legacy migrator (skipped in tests)
│   ├── userSettings.js       ← per-user JSON file (preferences + profile mirror; apiKeys deprecated here)
│   ├── systemSettings.js     ← system-wide JSON; getSystemApiKey decrypts on read
│   ├── pageCommenter.js      ← page-comments/ dir (was "Page Comment Data"); async fs
│   └── siteMarker.js         ← site-markers/ dir; async fs + O(1) share-token index
│
├── integrations/             ← external API clients (decrypt on read for credentials)
│   ├── stripe.js, google.js, claude.js, dataforseo.js, googlePlaces.js,
│   ├── googleCustomSearch.js, serper.js
│   └── playwright/pool.js    ← generic-pool browser context pool
│
├── services/                 ← business logic (no Express)
│   ├── auth.js, billing.js, credits.js, apiLog.js, apiQuota.js, apiKeySync.js,
│   ├── heatmap.js, rankings.js, pageCommenter.js, schemaAutofill.js,
│   ├── webSearch.js, aiSeo.js, businessDetails.js
│
├── jobs/
│   ├── jobQueue.js           ← SQLite-backed; hydrates pending/running on boot
│   └── citationAudit.js      ← registered handler (concurrency=2)
│
├── data/
│   └── citation-sources.js   ← 52 USA + 38 UK publishers
│
└── routes/                   ← 19 routers, all mounted in app.js
    auth, billing, profile, admin, content, projects, citations, citation-audit,
    heatmap, rankings, settings, page-commenter, site-marker, local, schema,
    web-search, ai-seo, serp, geocode
```

**Request pipeline** (in order): attach CSP nonce → helmet → CSP report-only (dev) → permissions-policy → CORS → pino-http access log → global `/api` rate limit (300/15min) → JSON body parse → JWT auth gate (with `CREDIT_EXEMPT_PREFIXES` skip-list) → credit guard → router-specific rate limit (`heavy` / `medium`) → handler.

### Frontend — `client/src/` (~12,400 lines)

```
client/src/
├── App.jsx                       ← Google OAuth provider wrap
├── main.jsx                      ← Vite entry
├── index.css, styles/globals.css ← Tailwind v4 base + design tokens
├── app/                          ← composition + routing (TS)
│   ├── providers.tsx             ← Theme + Auth + Toaster + Motion + ErrorBoundary
│   ├── routes.tsx                ← React.lazy() for every page; AppShell mounted ONCE
│   ├── nav-config.ts             ← PRIMARY_TABS + ALL_TOOLS + HUB_DEFS
│   └── shell/                    ← AppShell, TopBar, PrimaryNav, BreadcrumbNav, CommandPalette (Cmd+K), CreditsWidget, UserMenu
├── features/                     ← per-feature pages
│   ├── home/, auth/, admin/, billing/, settings/, whiteboard/,
│   ├── local-business/  (5 tools), web-search/ (8 tools incl. SharedSiteMarkerPage),
│   ├── ai-seo/ (5 tools), content/ (3 generators)
├── shared/
│   ├── ui/                       ← shadcn primitives (22 files: button, card, dialog, sheet, tabs, …)
│   ├── components/               ← project widgets (PageHeader, ToolCard, HubLanding, MorphIcon, Wordmark, ErrorBoundary, LoadingScreen, …)
│   ├── hooks/                    ← useDataFetch, useFiltered, useLocalHistory
│   ├── lib/                      ← cn (tailwind-merge), format, toast-shim
│   ├── motion/                   ← MotionProvider, presets
│   └── api/client.js             ← axios instance w/ 401 → refresh queue (single HTTP pipeline)
├── services/                     ← 15 legacy *Service.js files
│   └── httpClient.js             ← legacy fetch-shaped facade over apiClient (no duplicate refresh logic)
└── contexts/{AuthContext, ThemeContext}.jsx
```

**TypeScript adoption**: `app/`, `shared/ui/`, `shared/components/`, `shared/lib/`, `shared/motion/` are `.ts`/`.tsx`. `shared/api/`, `shared/hooks/`, `services/`, `contexts/` are still `.js`/`.jsx`. `tsconfig.json` has `allowJs: true` so both coexist.

### Storage layout (`app-data/`)

```
app-data/
├── database.sqlite                  ← 30+ tables, WAL mode, migrations tracked in schema_migrations
├── database.sqlite-{wal,shm}
├── system-settings.json             ← global API keys (encrypted at rest if MASTER_KEY set)
├── users/<userId>/
│   ├── settings.json                ← per-user preferences + profile mirror (apiKeys deprecated; DB is source of truth)
│   ├── gba-history.json             ← per-user Google Business Audit history
│   ├── projects/  whiteboard/  notes/  heatmaps/  exports/
├── page-comments/<userId>/<pageId>/{page.html, page.json}   ← was "Page Comment Data"
└── site-markers/
    ├── share-index.json             ← O(1) share-token → {userId, pageId}
    └── <userId>/<pageId>/{page.html, page.json}             ← was "Site Marker Data"
```

---

## 3. Hardening completed in this pass

| Area | Change |
|---|---|
| **Schema migrations** | Replaced the legacy 570-line `initSchema()` god-function with a numbered migration system (`001..006`). Migrations run sequentially with explicit logging; `buildApp` is now async and awaits completion before mounting routes — eliminating the race where ALTER TABLEs were still in flight when the first request landed. |
| **Job-queue persistence** | `src/jobs/jobQueue.js` is now SQLite-backed via the `jobs` table. Pending/running jobs hydrate on boot, so citation audits survive process restart instead of getting stranded in `running` with no runner. |
| **Settings consolidation** | Migration 005 copies any disk-only `apiKeys` into the `user_settings` table. `readUserSettingsFromDisk` is now annotated `@deprecated` — runtime credential lookups should query `user_settings` directly. |
| **Transactional file deletion** | `removeSiteMarkerPage` deletes files first then revokes the share token (asymmetric-safe ordering), with EBUSY/EPERM retry for Windows file-lock transients. Same retry on `removePageCommentPage`. |
| **AES-256-GCM at-rest encryption** | New `MASTER_KEY` env. `user_settings` secret values + system-settings.json `apiKeys.*` get auto-encrypted on write and auto-decrypted on read. Migration 006 converts existing plaintext rows once `MASTER_KEY` is configured. Disable-by-default for dev (logs a warning). |
| **Stripe webhook IP allowlist** | New `STRIPE_WEBHOOK_IPS` env. When set (CIDR list or `auto` for bundled snapshot), the webhook returns 403 for source IPs outside Stripe's published ranges before signature verification runs. |
| **HSTS preload + Trusted Types** | Production HSTS now uses `preload: true` (1y, includeSubDomains). Dev-only CSP-Report-Only header adds `require-trusted-types-for 'script'` so DOM-sink violations surface in the browser console without breaking the SPA. |
| **Per-share-token rate limit** | The public `/api/site-marker/shared/:shareToken` endpoint now rate-limits per TOKEN (60 req/min) instead of per IP. A popular share stops self-DoSing from one NAT'd office, and an unpopular share isn't a free 30/min hit for crawlers per IP. |
| **Kebab-case storage dirs** | `Page Comment Data/` → `page-comments/` and `Site Marker Data/` → `site-markers/`. One-time rename on boot leaves legacy installs untouched if both names exist. |
| **Tests** | 23/23 passing — covers `/api/health`, `/api/health/ready` deep checks (DB + USERDATA writable), 19 route mount points, security headers, CSP Report-Only contents. |

---

## 4. Issues that remain

### 🟢 Low-priority (small / aesthetic)

| # | Item | Notes |
|---|---|---|
| 12 | Remaining sync `fs.*` calls in `userSettings.js`/`systemSettings.js` | Deliberate trade-off — files are tiny, sync reads are sub-millisecond, async conversion would cascade through ~30 call sites. Revisit only if multi-user load grows. |
| 18 | Three large service files (`webSearch.js` 883 / `businessDetails.js` 749 / `aiSeo.js` 567) could split | Each is cohesive within itself; splitting just for size adds import friction. Worth doing only if specific sub-modules grow further. |

### Optimizations the audit flagged that were intentionally deferred

| Item | Reason |
|---|---|
| Persist `BUSINESS_DETAILS_CACHE` + `DATAFORSEO_LOCATION_CACHE` to SQLite/Redis | Cache miss on restart is acceptable; in-memory TTL is fine for single-instance deployments. Worth doing when scaling horizontally. |
| Shared zod schemas in `src/types/` for frontend/backend | The frontend redesign is on a separate workstream — adding shared types would risk colliding with that work. Defer until the redesign lands. |
| `MASTER_KEY` rotation tooling | The rotation procedure is documented in [ENV_KEYS.md](ENV_KEYS.md). Building an automated rotator is "once in a blue moon" work. |
| Removing `style-src 'unsafe-inline'` from production CSP | Google Maps SDK injects inline styles dynamically. The dev `Content-Security-Policy-Report-Only` header now flags every inline-style violation in the browser console — once we identify a workable subset (or sandbox Maps in an iframe), we can flip the enforced CSP. |

### Front-end concerns (separate workstream)

- 14 of 16 `client/src/services/*Service.js` files still call `authenticatedFetch` via the legacy shim. The shim now routes through `apiClient`, so there's no functional duplication — just stylistic noise. A future cleanup pass can migrate them to direct `apiClient.get(...)` calls and delete `httpClient.js`. **Frontend tab will handle.**

---

## 5. Quick stats

- Backend: **53 modules**, **~13,800 lines** across `src/`
- Frontend: **30+ pages**, 22 shadcn primitives, **~12,400 lines**
- Entry point: `src/index.js` (acts as both barrel + runnable script via `if (require.main === module)`)
- Schema: **6 migrations**, tracked in `schema_migrations(version, applied_at)`
- Tests: **23 vitest cases passing in 1.3 s**; CI runs lint + test + client typecheck/build on every PR
- Security headers verified live: CSP with per-request nonce, CSP-Report-Only (dev) with Trusted Types directive, Permissions-Policy (19 APIs denied), X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS with preload in prod
- Rate limits: global 300/15min on `/api` + per-route tiers (heavy 10/min, medium 30/min, per-token 60/min on shared)
- Job queue: SQLite-backed, citation audits survive restart

---

## 6. Production readiness checklist

In production (`NODE_ENV=production`) the server **refuses to boot** without:

- [ ] `JWT_SECRET`
- [ ] `CLIENT_ORIGIN` (CORS fails closed)
- [ ] `STRIPE_WEBHOOK_SECRET` (if `STRIPE_SECRET_KEY` is set)

Strongly recommended:

- [ ] `INITIAL_ADMIN_PASSWORD` — without it, no admin is auto-created on a fresh DB
- [ ] `MASTER_KEY` — without it, user API keys are stored in plaintext
- [ ] `USERDATA_PATH` — set to a persistent absolute path (Docker volume, not container FS)
- [ ] `STRIPE_WEBHOOK_IPS=auto` — defense-in-depth on top of signature verification

See [ENV_KEYS.md](ENV_KEYS.md) for the full list with "where to get each value" and Stripe webhook event subscriptions.

---

## 7. Where to look first when something breaks

| Symptom | First place to look |
|---|---|
| Boot fails with env error | `src/config/env.js` — zod schema + production-only fatal checks |
| Schema-related error on first boot of a new DB | `src/db/migrate.js` logs the failing migration name + statement index |
| 401 on every authed route | `src/middleware/authenticate.js` (JWT verify) + `src/middleware/creditGuard.js` (`CREDIT_EXEMPT_PREFIXES`) |
| User can't log in | `src/routes/auth.js` (`MAX_FAILED_LOGINS` / `ACCOUNT_LOCK_MINUTES`) |
| API key not found despite being saved | `src/integrations/*.js` credential resolvers (DB → disk fallback → env) and `src/utils/crypto.js` decryption |
| Stripe webhook silently failing | `src/routes/billing.js` + `src/middleware/stripeIpAllowlist.js` (check log for "source IP not in allowlist") |
| Job stuck in "running" forever | `src/jobs/jobQueue.js` — boot hydration resets running → pending; manual recovery via SQLite `UPDATE jobs SET status='pending'` |
| Shared site-marker link 404s | `src/storage/siteMarker.js` `findSiteMarkerByShareToken` — index miss triggers a one-time rebuild; check log warnings |
| Heatmap snapshot won't generate | `src/services/heatmap.js` + `src/integrations/googlePlaces.js` (Google Places key required) |
