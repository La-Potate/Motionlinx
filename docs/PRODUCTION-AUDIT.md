# Production audit — issue register

Second full pass over the repository, following the security sweep of
2026-09-13 (tenant isolation, ban enforcement, credit atomicity, key storage,
SSRF). This pass covers what that one did not: billing, OAuth, reliability
under failure, data growth, dependencies, client robustness, and deployment.

Status values: `open` · `fixed` · `verified` · `deferred` · `accepted`.
Kind values: **Confirmed** (reproduced or unambiguous in code) ·
**Potential** (plausible, not demonstrated) · **Improvement**.

---

## P0 / P1 — security, integrity, correctness

### A-21 · CRITICAL · Deployment · Confirmed
**Location:** `client/package-lock.json`; `Dockerfile` client stage (`npm ci` → `npm run build`)
**Problem:** `vite build` in the client stage fails at config load: `Cannot find module '../lightningcss.linux-x64-gnu.node'`. `lightningcss` (via `@tailwindcss/vite`) loads its native binary from the platform package `lightningcss-linux-x64-gnu`, falling back to a bundled `.node` file; the reported error is the *fallback's*, which masks why the platform package itself could not be used.
**Impact:** The Docker image **cannot be built on the NAS** — or on any Linux host — from this repository. Every prior "Docker is validated" statement was static; this is the first real build and it fails. Nothing downstream (deployment, the Cloudflare tunnel) is reachable until this is fixed.
**Evidence:** First real `docker build`, 2026-09-23: client stage step 10/10 exit 1. `npm ci` in that stage reported `added 206 packages`; the lockfile holds 205 non-platform entries plus 4 `linux-x64-gnu` natives, so three natives were not installed. Local Windows build passes.
**Ruled out:** the first hypothesis — that the Windows-generated lockfile lacked the Linux variants — is wrong: the lockfile lists them with `os/cpu/libc` set, and a controlled two-package install in `node:20-slim` succeeded with every lockfile shape and npm version tried.
**Found:** a full `npm ci` of the *current* `client/package-lock.json` in `node:20-slim` installs `lightningcss-linux-x64-gnu`, `@rolldown/binding-linux-x64-gnu` and `@tailwindcss/oxide-linux-x64-gnu`, and `require('lightningcss-linux-x64-gnu')` loads. The failing image build had been started *before* `npm audit fix` rewrote that lockfile (the tree it resolved differs — e.g. `vite@8.3.0` now pins `lightningcss@1.33.0` nested beside the top-level 1.32.0), so it built from the old lockfile. The old lockfile's exact defect is moot; the current one is what ships.
**Fix:** rebuild from the current lockfile. The client stage now asserts the natives load right after `npm ci` (`node -e "require('lightningcss'); require('@tailwindcss/oxide'); require('rolldown')"`), so a recurrence fails at install with a plain message rather than inside Vite's config loader. CI builds the image on Linux on every push.
**Verification:** `docker build` completes; the container starts and `/api/health/ready` returns 200; `docker stop` exits cleanly (also verifies A-06).
**Status: verified** — second build from the current lockfile: `native toolchain OK`, client `✓ built`, `BUILD_EXIT=0`, image 584 MB. Container ready in 3 s; SPA 200; login works; runs as `node` (uid 1000); Chromium present; 0 source maps, no `.env`, no `app-data`, no dev dependencies inside; `sqlite3` and `bcrypt` natives load.

### A-22 · CRITICAL · Deployment · Confirmed
**Location:** `docker-compose.nas.yml` line 38, `docker-compose.yml` line 18 — the `MASTER_KEY` environment entry
**Problem:** `- MASTER_KEY=${MASTER_KEY:?set MASTER_KEY - generate with: openssl rand -base64 32}` contains `: ` inside an unquoted block-sequence scalar, so YAML parses the list item as a *mapping*, not a string.
**Impact:** `docker compose config` exits 1 with `services.web.environment.[6]: unexpected type map[string]interface {}` — so `docker compose up` fails on the NAS before a container is even created, with either compose file. This is the documented deployment path.
**Evidence:** Reproduced with `docker compose -f docker-compose.nas.yml config` (exit 1) before the fix; exit 0 after, with `MASTER_KEY` present in the resolved environment and the missing-value guard still firing with its message.
**Fix:** Quote the entry and drop the colon from the message.
**Status: verified** — both files validate; the built image was brought up through `docker-compose.yml` with a bind-mounted data directory (ready in 3 s, login works, `database.sqlite` written to the host path) and taken down cleanly in 1.2 s.

### A-01 · HIGH · Authorization · Confirmed
**Location:** `src/routes/ga4.js`, `src/routes/gsc.js` — `signState`, `verifyState`, `GET /auth/callback`
**Problem:** The OAuth `state` is a JWT carrying only the *initiating* user's id and a random nonce. Nothing binds it to the browser that completes the flow, and the callback is public.
**Impact:** Account-binding CSRF. An attacker calls `/auth/start`, takes the Google URL (which embeds a state for *their* uid), and gets a victim to open it. The victim consents with their Google account; Google redirects the victim's browser to our callback with the attacker's state; the victim's GA4 / Search Console refresh tokens are saved under the attacker's account. The attacker then reads the victim's Analytics and Search Console data through the app.
**Evidence:** `signState(userId)` → `{uid, nonce}`; callback saves to `payload.uid` with no other check.
**Fix:** At `/auth/start`, set a 10-minute `HttpOnly; SameSite=Lax` cookie holding the nonce. At callback, require the cookie to match `payload.nonce` or refuse. SameSite=Lax cookies are sent on the top-level GET Google performs, and cannot be set on the victim's browser by the attacker.
**Verification:** Test: valid state with missing/mismatched cookie → error redirect, no tokens saved; matching cookie → tokens saved.
**Status: verified** — `tests/oauthState.test.mjs` (both apps): valid state without the cookie → `invalid_state`, wrong cookie → `invalid_state`, matching cookie passes the gate, nothing saved on refusal. Cookie attributes confirmed on a production-mode boot.

### A-02 · HIGH · Data integrity (billing) · Confirmed
**Location:** `src/routes/billing.js` `POST /webhook`, `src/services/billing.js` `handleCheckoutCompleted`
**Problem:** No webhook idempotency. Stripe documents that events are retried and may be delivered more than once. Nothing records `event.id`.
**Impact:** `checkout.session.completed` for a credit top-up calls `applyCreditChange(+1000)` — additive — so every redelivery grants another 1000 credits. Subscription events are set-to-plan-limit, so they are idempotent by accident.
**Fix:** Migration 010 adds `stripe_webhook_events(event_id PRIMARY KEY, type, received_at)`. `INSERT OR IGNORE` before dispatch; if the row already existed, acknowledge with 200 and do nothing.
**Verification:** Test delivers the same signed event twice → balance rises exactly once.
**Status: verified** — `tests/billingWebhook.test.mjs`: same signed event delivered twice raises the balance exactly once; second delivery answers `{received:true, duplicate:true}`; tampered body → 400; event ids recorded.

### A-03 · MEDIUM · Authorization · Potential
**Location:** `src/services/billing.js` `handleSubscriptionSync`
**Problem:** `role` is written from `metadata.plan` before checking that a plan config exists. `normalizeUserLevel('admin')` is a valid level.
**Impact:** Not reachable by users — `/checkout` rejects plans without a price. Reachable via a Stripe Dashboard metadata edit or a compromised Stripe account: `metadata.plan = "admin"` promotes the customer to admin.
**Fix:** Only apply a role that resolves to a `PLAN_CONFIG` entry.
**Status: fixed** — role only changes when the plan resolves to a `PLAN_CONFIG` entry; otherwise the current role is kept and a warning logged. Not unit-tested: the path calls `stripe.subscriptions.retrieve`, which needs a live key.

### A-04 · HIGH · Correctness (feature broken) · Confirmed
**Location:** `client/src/features/local-business/HeatmapPage.tsx` lines 250, 285; `src/routes/heatmap.js` `GET /heatmap/reports/:id/html`
**Problem:** The snapshot preview is `<iframe src="/api/heatmap/reports/:id/html">` and the "open" control is an `<a href>` to the same URL. That route requires a Bearer token. Neither an iframe `src` nor an anchor can send an `Authorization` header.
**Impact:** The heatmap preview always renders a 401 and the open link always fails. The feature's output is unreachable from the UI.
**Fix:** Fetch the HTML with the authenticated client, render via `srcDoc` in a sandboxed iframe (same pattern as `PageAnnotator`), open-in-tab via a Blob URL.
**Verification:** Server test documents the contract (no header → 401). Client: `tsc` + build; manual.
**Status: fixed** — client fetches with the bearer token and renders via `srcDoc` in a sandboxed iframe; "Open report" uses a Blob URL. Server contract (no header → 401) pinned in `tests/hardening.test.mjs`. `tsc` and build clean.

### A-11 · MEDIUM · Authentication hardening · Confirmed
**Location:** `src/config/env.js`
**Problem:** `JWT_SECRET` is only checked for *presence* in production. A six-character secret boots.
**Impact:** Offline brute force of HS256 tokens → forge any user's session, including admin.
**Fix:** Fatal in production when shorter than 32 characters, matching how `MASTER_KEY` is treated.
**Verification:** Spawn with a short secret in production → exit 1 with the message.
**Status: verified** — child process with a 12-character secret exits 1 with the message; 40 characters boots.

### A-12 · MEDIUM · Authentication hardening · Confirmed
**Location:** `src/routes/profile.js` `passwordRouter`
**Problem:** Changing the password leaves every existing refresh token valid, and accepts 6 characters where signup requires 8.
**Impact:** A user who changes their password because they suspect compromise does not actually log the attacker out — the attacker's refresh token keeps minting sessions for up to 14 days.
**Fix:** Revoke all of the user's refresh tokens on change; require 8 characters.
**Verification:** Test: after change, the old refresh token → 401.
**Status: verified** — after a change, the pre-change refresh token → 401; 7-character password → 400.

---

## P2 — robustness, abuse, data integrity

### A-05 · MEDIUM · Reliability · Confirmed
**Location:** `src/utils/smartFetch.js` `ensureFetch`; every integration (`serper`, `dataforseo`, `googlePlaces`, `googleCustomSearch`, `claude`, `googleOauth`, `gsc`)
**Problem:** `ensureFetch()` returns bare global `fetch`. Grep shows zero timeouts / abort signals across all provider integrations. Only page capture and the crawler use `fetchWithSmartAgent` (15s).
**Impact:** A hung upstream (DataForSEO live endpoints are the realistic case) hangs the request forever server-side — the client gives up at Cloudflare's ~100s, but the handler, its credit-guard finish hook, and any held Playwright browser stay pinned. Enough of these and the process is wedged.
**Fix:** `ensureFetch()` returns a wrapper that applies a default 60s `AbortSignal` unless the caller supplies one (`AbortSignal.any` when both exist), with a `timeout` option. Claude gets an explicit 180s (large outputs); Google OAuth uses the wrapper.
**Verification:** Unit test against a never-responding local listener → rejects within the bound.
**Status: verified** — `tests/hardening.test.mjs`: a never-answering listener rejects within the bound; a caller signal aborts alongside the timer. Three callers (`geocode` 10s, crawler 8s, Google query 5s) already passed `timeout` that native fetch ignored — they now get it.

### A-06 · MEDIUM · Reliability · Confirmed
**Location:** `src/app.js` `attachShutdownHandlers`
**Problem:** On SIGTERM: `db.close(); process.exit(0)`. No `server.close()`, no in-flight drain, `drainAllPools()` exists but is never called, and `process.exit` races the async `db.close`.
**Impact:** Docker stop / `compose up --build` kills in-flight captures mid-write and can orphan Chromium processes; the WAL checkpoint on close is cut short.
**Fix:** Graceful shutdown in `start()`: stop accepting, close idle keep-alives, drain the browser pool, close the DB and wait, then exit — with a 10s hard deadline.
**Verification:** SIGTERM smoke test: ordered log lines, exit 0 within the deadline.
**Status: verified** — `docker stop` on the built image: 537 ms, exit code 0, log shows `SIGTERM received` → `HTTP server closed; in-flight requests finished` → `Database closed`. `compose down`: 1.2 s.

### A-07 · MEDIUM · Performance / data growth · Confirmed
**Location:** `src/db/migrations/*.sql`, `src/services/apiLog.js`, `src/services/auth.js`
**Problem:** `api_request_logs` gets a row per billable request and is never purged or indexed (admin filters by `user_id`, orders by `created_at`). `refresh_tokens.token_hash` is unindexed — a full scan on every `/auth/refresh` and `/logout` — and expired rows are only swept per-user at login. Seven user-scoped tables have no `user_id` index: `heatmap_reports`, `businesses`, `business_entities`, `press_releases`, `blog_posts`, `admin_users`, `team_members`.
**Impact:** On a NAS running for a year: a multi-million-row log table scanned on every admin page, refresh latency growing with every login ever made.
**Fix:** Migration 010 adds the indexes. A retention sweep at boot and daily deletes `api_request_logs` older than 90 days and expired refresh tokens.
**Verification:** `EXPLAIN QUERY PLAN` shows index use; sweep test.
**Status: verified** — migration 010 applied to a fresh DB and to a copy of the real dev DB (`integrity_check: ok`); sweep test deletes old logs / expired tokens and keeps fresh rows; new indexes asserted present.

### A-08 · MEDIUM · Information disclosure · Confirmed
**Location:** `client/vite.config.js` `build.sourcemap: true`; `Dockerfile` copies `client/build`
**Problem:** 96 `.map` files ship in the production image and are served.
**Impact:** Full original client source, comments and structure downloadable by anyone.
**Fix:** `sourcemap: false`.
**Verification:** Build emits 0 `.map` files.
**Status: verified** — build emits 0 `.map` files (was 96); CI asserts it.

### A-09 · MEDIUM · Abuse / resource exhaustion · Confirmed
**Location:** `src/routes/site-marker.js` `PUT /pages/:id/markers`, `src/routes/page-commenter.js` `PUT /pages/:id/comments`, `normalizeMarker`, `normalizeComment`
**Problem:** No cap on array length or text length; the global JSON limit is 10 MB; these routes sit under the 300/15 min global limiter only.
**Impact:** One account writes ~3 GB to the data volume per 15 minutes. Disk exhaustion on the NAS takes the whole app down.
**Fix:** Cap at 500 items and 4000 characters per note; 400 on exceed.
**Verification:** Test.
**Status: verified** — 501 items → 400; 50 000-char note stored clamped to 4000; same for comments.

### A-10 · MEDIUM · Open redirect · Confirmed
**Location:** `client/src/features/auth/LoginPage.tsx` `next`; `react-router-dom@6.30.3`
**Problem:** The whitelist rejects `//host` but not `/\host`, and the installed router has the backslash-normalisation open-redirect advisory.
**Impact:** `?next=/\evil.example` after login sends the user to an attacker's site.
**Fix:** Reject any backslash; upgrade the router via `npm audit fix`.
**Verification:** Dependency re-audit; `tsc`.
**Status: fixed** — backslash rejected; `react-router` bump is a v7 major and is deferred (see A-14).

### A-13 · MEDIUM · Data integrity · Confirmed
**Location:** `user_bans` schema; `GET /api/admin/users` `LEFT JOIN user_bans`
**Problem:** No uniqueness on `user_bans.user_id`. Duplicate bans were insertable until the route-level 409 added on 2026-09-13; any that exist duplicate rows in the admin user list.
**Fix:** Migration 010: delete duplicates keeping the earliest, then `UNIQUE INDEX`.
**Verification:** Migration test with seeded duplicates.
**Status: verified** — duplicate ban insert → UNIQUE violation; migration deduplicated 0 rows on the dev DB (none existed).

### A-14 · MEDIUM · Supply chain · Confirmed
**Location:** `package-lock.json`, `client/package-lock.json`
**Problem:** Server: 15 advisories (1 critical `tar`, 5 high) — all in the `sqlite3 → node-gyp → make-fetch-happen → cacache → tar` **install-time** chain plus `express/body-parser/qs` (moderate DoS) and `googleapis → uuid`. Client: `axios` high (prototype pollution), `form-data` high, `react-router` moderate.
**Impact:** `qs`/`body-parser`: request-triggered DoS — real. `tar`/`node-gyp`: not in the runtime require graph (verified earlier), so not reachable from a request. `uuid` v3/v5/v6 with attacker buffer: unreachable.
**Fix:** `npm audit fix` (non-breaking) on both packages. `sqlite3@6` and `googleapis@181` are semver-major: attempt `sqlite3@6` only if the Docker build can prove the native prebuild resolves; defer `googleapis` (no test coverage of GA4/GSC without live credentials).
**Verification:** Re-audit; full test suite; client build; Docker build.
**Status: fixed** — in two passes. First, non-breaking `npm audit fix`: server 15 → 12 (`express`, `body-parser`, `qs` patched — the request-triggered DoS is gone), client 5 → 2 (`axios`, `form-data`). Then the semver-majors (2026-09-24): `sqlite3` 5 → 6.0.1, `googleapis` 144 → 175 and `google-auth-library` 9 → 10 (the last two on Node-20-compatible releases; 180+ needs Node 22), `bcrypt` 5 → 6 (prebuilds ship inside the package, so no install-time download), `vitest` 2 → 4.1.11, client `react-router-dom` 6 → 7.18.4. **Both `npm audit` reports are now empty.** The router upgrade was checked against the v7 behaviour changes: the app has one top-level `*` route and no relative links or `navigate('..')`, so none apply; 12/12 browser flows and the full route sweep pass on the new build.
The Docker build caught what the local install could not: the `sqlite3@6` Linux prebuild is linked against glibc 2.38 and `node:20-slim` (Debian 12) ships 2.36, so it installed cleanly and then failed to load. The image is now `node:24-trixie-slim` (Debian 13, glibc 2.41; Node 20 reached end of life in April 2026), CI runs on Node 24, and the runtime stage `require`s both native modules right after `npm ci` so this class of failure stops the build instead of the first request. Verified with a real build and a container run: readiness 200, admin login (bcrypt + SQLite) succeeds, nonce-stamped shell served.

---

## P4–P6 — maintainability, tooling, deployment

### A-15 · LOW · Configuration · Confirmed
`PLAYWRIGHT_POOL_MAX`, `LOG_LEVEL` read via `process.env` outside the schema; `LEGACY_USERDATA_PATH` undocumented; `apiKeySync.js` reads `process.env.CLAUDE_API_KEY` directly. **Fix:** add to schema and `.env.example`; route through `env`.
**Status: verified** — no `process.env` reads remain outside `env.js` except the startup banner; `.env.example` documents all three.

### A-16 · LOW · CI · Confirmed
No CI configuration exists. **Fix:** GitHub Actions running lint, tests, `tsc`, client build on push/PR.
**Status: fixed** — `.github/workflows/ci.yml` (server lint+test, client tsc+build+no-sourcemap assertion, Linux Docker image build). Not yet exercised: nothing has been pushed this session.

### A-17 · LOW · Improvement · Confirmed
`src/integrations/claude.js` hard-coded a 2025 primary model whose two fallbacks were Claude 3.5 Sonnet builds Anthropic retired in 2025 — so once the primary went, the chain produced a second and third 404 and the user saw a generic failure.
**Fix:** the primary model is `CLAUDE_MODEL` (env, documented in `.env.example`) with a current default (`claude-sonnet-4-5`), one live fallback, and no retired entries; extended thinking is only requested for model families known to accept the budgeted form, so an operator-supplied model outside that set cannot trigger a 400 the fallback chain would not catch; a 403/404 on a model now logs a warning naming the model and pointing at `CLAUDE_MODEL`. Model choice remains the owner's: the default is the one the previous list was reaching for.
**Status: fixed** — `tests/claudeModels.test.mjs` (no retired ids, deduplicated sequence, 503 without a key). Not exercised against the live API (no key in CI).

### A-20 · LOW · Reliability · Confirmed
`jobQueue.submit()` returned a job id synchronously and persisted the row in the background; both callers store that id in a per-project / per-audit map, so a failed insert left them holding an id that `getJob` would never find and `cancel` could never act on. The citation-audit route had also already flipped the audit to `running`, so it would have looked stuck forever.
**Fix:** `submit` is async and resolves only once the row exists; a failed insert rejects. Both callers and routes await it, and the citation-audit route restores the previous status if submission fails.
**Status: fixed** — `tests/jobQueue.test.mjs` (row exists when the id is returned; duplicate id rejects and leaves a single row; unregistered type still refused).

### Accepted
- **A-18** Login returns 400 "sign in with Google" / 423 locked — reveals account existence and provider. Accepted for a small self-hosted tool.
- **A-19** JWT + refresh token in `localStorage`. Standard SPA trade-off; mitigated by nonce-based CSP, no `unsafe-inline` scripts, and sandboxed iframes for third-party HTML (verified).
- Response compression is absent; Cloudflare compresses at the edge in the intended deployment.

---

## Browser QA pass (2026-09-23, after the audit fixes)

Every client route driven in Chromium in three auth states with reload,
back/forward and a 390 px overflow check; every visible input filled and
every visible button clicked; twelve scripted end-to-end flows; console,
page exceptions and failed requests captured throughout; 4 330 malformed API
requests as admin and as a member. Findings below were all reproduced in the
browser and re-verified there after the fix.

### Q-01 · HIGH · Correctness · Confirmed
**Location:** `client/index.html` inline theme script; `src/app.js` SPA fallback
**Problem:** The built `index.html` carries an inline script (dark-mode init before React mounts) with no CSP nonce, and the shell was served verbatim. The browser blocked it on **every page load** with a console error, so the anti-flash theme init never ran in production.
**Fix:** The SPA fallback stamps the per-request nonce onto inline `<script>` tags; `index.html` is no longer served by `express.static`. The template is re-read when its mtime changes, and asset-like paths (`/assets/*`, any extension) 404 instead of returning the shell — a rebuild while running produced a stale template pointing at vanished hashed files and every page died with a module MIME error.
**Status: verified** — zero CSP errors across all routes and states; nonce in the shell matches the header; missing asset → 404 text/plain.

### Q-02 · HIGH · Correctness · Confirmed
**Location:** `client/src/features/settings/SettingsPage.tsx` `Field`
**Problem:** `Field` was a plain function component, but the Profile and Security forms spread `register()` onto it, so react-hook-form never received the input refs. The email rendered empty and was absent from the submit body (server said "Profile updated" having changed nothing); the password form could not read its fields at all. **Users could change neither their email nor their password from the UI.**
**Fix:** `forwardRef`, matching the login form's working `FormField`.
**Status: verified** — email change persists across reload; password changed through the UI and the new password signs in.

### Q-03 · HIGH · Correctness · Confirmed
**Location:** `SettingsPage.tsx` `getUserFromToken`
**Problem:** The Settings page built its user from the *JWT payload*, which carries username/email as of sign-in — so even with Q-02 fixed, a saved email did not show until the next login.
**Fix:** Identity from the server-validated session user; the token is read only for `iat`. The profile form re-seeds when the user changes and after a save.
**Status: verified** — same flow as Q-02.

### Q-04 · HIGH · Authorization (too strict) · Confirmed
**Location:** `src/utils/userLevel.js` trial allowlist
**Problem:** New accounts are `trial` and are sent to `/pricing`, whose plans call (`/api/billing/plans`) answered **403** for trial users. The page took that as "Stripe not configured" and disabled checkout — a trial could never upgrade.
**Fix:** `/api/billing` allowed for trial accounts; every tool and admin route stays refused.
**Status: verified** — `tests/trialAccess.test.mjs`; sweep shows no 403 on `/pricing` for a member.

### Q-05 · MEDIUM · Reliability · Confirmed
**Location:** `src/routes/auth.js` limiters
**Problem:** The 10-per-15-min auth limiter counted *successful* logins and was shared with `/auth/refresh`, which the client calls on a timer, on every 401 and from every tab. A few devices — or a dead session refreshing — locked the user out of signing in for 15 minutes.
**Fix:** `skipSuccessfulRequests` on the auth limiter; refresh gets its own 60/15 min bucket. Global `/api` limit made configurable (`API_RATE_LIMIT_MAX`, default 300 — measured at ~2.4 calls per full page load, ~120 loads/15 min) and its 429 body is JSON like every other API error.
**Status: verified** — flows sign in repeatedly without a 429.

### Q-06 · MEDIUM · Correctness · Confirmed
**Location:** `src/config/helmet.js` `base-uri`
**Problem:** Captured pages are rendered via `srcdoc`, inherit the page CSP, and carry the server-injected `<base href>`; `base-uri 'self'` blocked it on every capture, so relative images/CSS in previews did not resolve.
**Fix:** `base-uri 'self' https: http:` — scripts stay nonce-gated and origin-checked regardless of `<base>`.
**Status: verified** — no `base-uri` violation when opening a capture.

### Q-07 · MEDIUM · Performance · Confirmed
**Location:** `src/services/pageCommenter.js` `renderPageWithBrowser`, `inlineStylesWithPlaywright`
**Problem:** Every capture slept a fixed **30 s** (`waitForTimeout(PLAYWRIGHT_RENDER_TIMEOUT_MS)` — a timeout used as a delay) after `networkidle`; and `addStyleTag({ content: '' })` throws in Playwright, so browser-side style inlining never ran (warning on every capture).
**Fix:** 1.5 s settle; the no-op `addStyleTag` removed.
**Status: verified** — server responseTime for a capture of example.com: 30 006 ms before, **9 362 ms** after; zero "Inline styles (playwright) failed" warnings after (two per capture before).

### Q-08 · MEDIUM · Responsive layout · Confirmed
**Location:** `client/src/shared/ui/tabs.tsx`, `table.tsx`
**Problem:** `/admin` overflowed horizontally at 390 px: the five-trigger tab strip (555 px) and the users table (781 px) widened the page instead of scrolling within their containers.
**Fix:** `TabsList` gets `max-w-full overflow-x-auto`; the `Table` wrapper `max-w-full min-w-0`.
**Status: verified** — the final route sweeps (three auth states, 42 routes at 390 px) report no horizontal overflow anywhere.

### Q-09 · LOW · Accessibility · Confirmed
**Location:** `SiteMarkerPage.tsx` delete control
**Problem:** Icon-only delete button with no accessible name (the only one in the app; audited all `size="icon*"` buttons).
**Fix:** `aria-label="Delete page"`.
**Status: verified** — flow finds and uses it.

### Q-10 · LOW · Console hygiene · Confirmed
Expected outcomes (wrong password, 429, stale session on restore, declined refresh) were logged with `console.error`. Now only server faults and unreachable-server cases are logged.
**Status: verified** — console clean across all flows.

### Q-11 · LOW · Correctness · Confirmed
**Location:** `client/src/features/web-search/components/MapPreview.tsx`
**Problem:** Leaflet guesses its default marker image directory from the URL of its stylesheet. Under the Vite build the stylesheet is bundled and hashed, so the guess fell back to the current route and every marker on **Map element** requested `/web-search/marker-icon.png` and `/web-search/marker-shadow.png` — two 404s per marker and a broken-image placeholder where the pin should be.
**Fix:** Import the three marker images from the package and pin them on `L.Icon.Default`; Vite inlines them as `data:` URIs, which `img-src` already allows.
**Status: verified** — one 25×41 marker and one shadow render from `data:image/png`, no requests to `/web-search/marker-*.png`, console clean.

## Dismissed after checking
- Sweep entries `GET /favicon.svg net::ERR_ABORTED` and `POST /api/web-search/bulk-http net::ERR_ABORTED` — both are requests the driver's own next navigation cancelled mid-flight (the bulk-http one was started by the interaction pass on the Bulk HTTP page and attributed to the page it landed on next). The browser aborts in-flight requests on navigation by design; nothing in the app fires either request without user intent.
- Stripe raw body for signature verification — captured correctly, scoped to the webhook path.
- Captured-page iframe (`PageAnnotator`) — `sandbox="allow-same-origin"` without `allow-scripts`; scripts cannot run.
- Heatmap HTML generation — `escapeHtml` applied to name/keyword; cell values numeric.
- Client 403 → refresh interceptor — wasteful but not a logout bug; a genuinely suspended account is signed out correctly.
- Job re-run after restart — citation audit processes only `pending` rows; idempotent.
- Migration runner `--` stripping inside string literals — no current migration is affected.

---

# Final report

## Architecture

Single Node 20 / Express process serving a React SPA and a JSON API from the
same origin; SQLite (WAL) via `sqlite3`; Playwright Chromium pool for page
capture; an in-process, SQLite-backed job queue for long work (citation
audits, AI analysis). Per-user provider credentials (Serper, Anthropic,
DataForSEO, Google) are stored AES-256-GCM-encrypted under `MASTER_KEY` and
resolved user → workspace → env. Deployed as one container behind
`cloudflared` on a NAS; every request arrives through Cloudflare, so
`TRUST_PROXY=1` is load-bearing for rate limiting and IP-based controls.

Critical flows traced end to end: login → JWT (1h) + rotating refresh token
(14d) → per-request account-state check (exists / active / not banned, role
from DB) → credit guard (atomic deduction) → provider call (SSRF-guarded,
timed) → response. Stripe: checkout → webhook (signature, IP allowlist,
event-id claim) → credits/role. Google: `/auth/start` (nonce cookie + signed
state) → consent → callback (cookie must match) → tokens encrypted at rest.

## Findings

| ID | Severity | Category | Location | Problem | Status |
|---|---|---|---|---|---|
| A-21 | CRITICAL | Deployment | client lockfile / Dockerfile | Linux image build failed at Vite config load (native module) | verified |
| A-22 | CRITICAL | Deployment | both compose files | `MASTER_KEY` env entry parsed as YAML map → `compose up` fails | verified |
| A-01 | HIGH | Authorization | ga4.js, gsc.js | OAuth state not bound to browser → account-binding CSRF | verified |
| A-02 | HIGH | Billing integrity | billing.js | No webhook idempotency → duplicate top-up credits | verified |
| A-04 | HIGH | Correctness | HeatmapPage.tsx | Preview iframe/link could never authenticate → feature dead | fixed |
| A-03 | MEDIUM | Authorization | services/billing.js | Role written from metadata without plan check | fixed |
| A-05 | MEDIUM | Reliability | all integrations | No timeouts on any provider call | verified |
| A-06 | MEDIUM | Reliability | app.js | Non-graceful shutdown, pool never drained | verified |
| A-07 | MEDIUM | Perf / growth | schema, apiLog, auth | Unbounded log/token tables; 9 missing indexes | verified |
| A-08 | MEDIUM | Info disclosure | vite.config.js | 96 source maps shipped in the image | verified |
| A-09 | MEDIUM | Abuse | site-marker, page-commenter | Unbounded marker/comment payloads → disk exhaustion | verified |
| A-10 | MEDIUM | Open redirect | LoginPage.tsx | `/\host` bypassed the `next` whitelist | fixed |
| A-11 | MEDIUM | Auth hardening | env.js | No `JWT_SECRET` length floor | verified |
| A-12 | MEDIUM | Auth hardening | profile.js | Password change kept old refresh tokens alive | verified |
| A-13 | MEDIUM | Data integrity | user_bans | Duplicate bans possible | verified |
| A-14 | MEDIUM | Supply chain | lockfiles | 15 + 5 advisories | partially fixed |
| A-15 | LOW | Configuration | env.js, pool.js, logger.js | Env reads outside the schema | verified |
| A-16 | LOW | CI | — | No CI | fixed (not yet run) |
| A-17 | LOW | Improvement | claude.js | Hard-coded model IDs | flagged |
| A-20 | LOW | Reliability | jobQueue.js | Job id returned before persisted | flagged |
| A-18, A-19 | — | — | — | Enumeration via login messages; tokens in localStorage | accepted |

## Security

Confirmed vulnerabilities, all remediated and covered by tests: OAuth
account-binding CSRF (A-01), webhook replay → free credits (A-02),
metadata-driven role escalation (A-03), source disclosure (A-08), disk
exhaustion by an authenticated user (A-09), backslash open redirect (A-10),
weak-secret token forgery (A-11), sessions surviving a password change (A-12).
Redirect URLs are no longer assembled from request headers in production.
Carried forward from the 2026-09-13 sweep and re-verified by live probes this
pass: tenant isolation, ban/deactivation/deletion enforcement, atomic credits,
encrypted key storage, SSRF guard, rate-limit bucketing, path traversal.

## Performance

No CPU or rendering hotspot was found; the measurable problems were data
growth and missing indexes (A-07): a request-log table with no purge and no
index that the admin panel filters and sorts, a refresh-token hash looked up
by full scan on every refresh, and five user-scoped tables scanned on every
list. Migration 010 adds nine indexes; a daily sweep bounds the tables.
Bundle: 583 kB main chunk (189 kB gzip), code-split per route; compression is
left to Cloudflare's edge. Not optimised: response compression, image assets —
no evidence either is a bottleneck in the intended deployment.

## Refactoring

Deliberately minimal. Shared helpers were introduced only where a fix would
otherwise be duplicated: `publicOrigin`/cookie helpers in `googleOauth.js`
(used by both OAuth routers), `timedFetch` in `smartFetch.js` (one choke point
for every provider call), `maintenance.js` for retention. The webhook switch
moved into `dispatchStripeEvent` so the claim/release logic wraps it cleanly.
No new runtime dependencies.

## Testing

Before: 154 tests. After: **186** across 15 files (on vitest 4). Added: OAuth state binding
(both apps), webhook idempotency and tampering, fetch time bound, payload
caps, refresh revocation on password change, retention sweep, index presence,
ban uniqueness, heatmap route contract, production env floor, trial route
allowlist, job-queue persistence ordering, Claude model list. CI runs the
suite, `tsc`, the client build (asserting zero source maps) and a Linux
image build on every push.

Remaining gaps: no tests for the GA4/GSC data paths or Stripe subscription
sync (both need live credentials); no client unit tests (the client is
covered by `tsc` + build only); A-06 is verified by `docker stop`, not by an
automated test.

## Production path

Everything in the register that blocks deployment is fixed and verified.
Remaining, in priority order:

1. **Push and watch CI run once** (A-16) — the workflow exists but has never
   executed; it is unverified until it does. It now runs on Node 24.
2. **Rotate `JWT_SECRET` if the existing one is under 32 characters** — the
   server now refuses to start otherwise and says so (A-11).
3. **Confirm the Claude model** (A-17): the default is `claude-sonnet-4-5`;
   set `CLAUDE_MODEL` if a different model or price point is wanted. The GA4 /
   Search Console paths run on `googleapis@175` and were exercised only by the
   OAuth-state tests, not against live Google credentials.

## Final status

**Fixed and verified:** A-01, A-02, A-05, A-06, A-07, A-08, A-09, A-11, A-12,
A-13, A-14, A-15, A-20, A-21, A-22 — each by a test, a live probe, or a real
container run. **Fixed, verified by build/type-check only:** A-03, A-04, A-10.
**Fixed, verified by unit test only (needs a live key to go further):** A-17.
**Accepted:** A-18, A-19. Nothing in the register remains open.

**Verified this pass:** 177/177 tests; ESLint 0 errors; `tsc` clean; client
build with 0 source maps; migration 010 against a fresh DB and a copy of the
real dev DB (`integrity_check: ok`); production-mode boot on a fresh data dir;
13 live probes from the previous sweep; **real Docker image build**, container
readiness, login, non-root runtime, Chromium present, graceful `docker stop`
(537 ms, exit 0); both compose files validated and the image brought up and
down through compose with a bind-mounted data directory.

**Could not be verified here:** the CI workflow executing (nothing pushed);
GA4/GSC/DataForSEO/Serper against live providers with real keys; behaviour
behind a real Cloudflare tunnel (only simulated via forwarded headers).

**Known production risks:** the deferred semver-major dependency advisories
(none reachable from a request at runtime); `react-router`'s advisory is
mitigated at the one input that matters rather than patched; the Claude model
sequence may include retired IDs.

With A-21 and A-22 resolved, the repository builds and runs on the platform it
targets for the first time. No unresolved CRITICAL or HIGH item remains.
