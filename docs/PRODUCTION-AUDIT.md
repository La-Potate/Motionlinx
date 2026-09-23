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
**Problem:** `lightningcss` (pulled in by `@tailwindcss/vite`) and Rolldown ship their native code as per-platform *optional* dependencies. The client lockfile was generated on Windows with `node_modules` already present, so npm recorded only the `win32-x64` variant. `npm ci` on Linux installs exactly what the lockfile says and the build dies with `Cannot find module '../lightningcss.linux-x64-gnu.node'`.
**Impact:** The Docker image **cannot be built on the NAS** — or on any Linux host — from this repository. Every prior "Docker is validated" statement was static; this is the first real build and it fails. Nothing downstream (deployment, the Cloudflare tunnel) is reachable until this is fixed.
**Evidence:** First real `docker build`, 2026-09-23: client stage step 10/10 exit 1 with the error above. Local Windows build passes because the Windows variant *is* in the lockfile.
**Fix:** Regenerate `client/package-lock.json` from a clean tree (`rm -rf node_modules package-lock.json && npm install`), which records every platform variant as optional; verify the Linux variants are present; rebuild the image. The new CI `image` job builds on Linux on every push so this class of defect cannot land silently again.
**Verification:** `docker build` completes; the container starts and `/api/health/ready` returns 200.

### A-01 · HIGH · Authorization · Confirmed
**Location:** `src/routes/ga4.js`, `src/routes/gsc.js` — `signState`, `verifyState`, `GET /auth/callback`
**Problem:** The OAuth `state` is a JWT carrying only the *initiating* user's id and a random nonce. Nothing binds it to the browser that completes the flow, and the callback is public.
**Impact:** Account-binding CSRF. An attacker calls `/auth/start`, takes the Google URL (which embeds a state for *their* uid), and gets a victim to open it. The victim consents with their Google account; Google redirects the victim's browser to our callback with the attacker's state; the victim's GA4 / Search Console refresh tokens are saved under the attacker's account. The attacker then reads the victim's Analytics and Search Console data through the app.
**Evidence:** `signState(userId)` → `{uid, nonce}`; callback saves to `payload.uid` with no other check.
**Fix:** At `/auth/start`, set a 10-minute `HttpOnly; SameSite=Lax` cookie holding the nonce. At callback, require the cookie to match `payload.nonce` or refuse. SameSite=Lax cookies are sent on the top-level GET Google performs, and cannot be set on the victim's browser by the attacker.
**Verification:** Test: valid state with missing/mismatched cookie → error redirect, no tokens saved; matching cookie → tokens saved.

### A-02 · HIGH · Data integrity (billing) · Confirmed
**Location:** `src/routes/billing.js` `POST /webhook`, `src/services/billing.js` `handleCheckoutCompleted`
**Problem:** No webhook idempotency. Stripe documents that events are retried and may be delivered more than once. Nothing records `event.id`.
**Impact:** `checkout.session.completed` for a credit top-up calls `applyCreditChange(+1000)` — additive — so every redelivery grants another 1000 credits. Subscription events are set-to-plan-limit, so they are idempotent by accident.
**Fix:** Migration 010 adds `stripe_webhook_events(event_id PRIMARY KEY, type, received_at)`. `INSERT OR IGNORE` before dispatch; if the row already existed, acknowledge with 200 and do nothing.
**Verification:** Test delivers the same signed event twice → balance rises exactly once.

### A-03 · MEDIUM · Authorization · Potential
**Location:** `src/services/billing.js` `handleSubscriptionSync`
**Problem:** `role` is written from `metadata.plan` before checking that a plan config exists. `normalizeUserLevel('admin')` is a valid level.
**Impact:** Not reachable by users — `/checkout` rejects plans without a price. Reachable via a Stripe Dashboard metadata edit or a compromised Stripe account: `metadata.plan = "admin"` promotes the customer to admin.
**Fix:** Only apply a role that resolves to a `PLAN_CONFIG` entry.

### A-04 · HIGH · Correctness (feature broken) · Confirmed
**Location:** `client/src/features/local-business/HeatmapPage.tsx` lines 250, 285; `src/routes/heatmap.js` `GET /heatmap/reports/:id/html`
**Problem:** The snapshot preview is `<iframe src="/api/heatmap/reports/:id/html">` and the "open" control is an `<a href>` to the same URL. That route requires a Bearer token. Neither an iframe `src` nor an anchor can send an `Authorization` header.
**Impact:** The heatmap preview always renders a 401 and the open link always fails. The feature's output is unreachable from the UI.
**Fix:** Fetch the HTML with the authenticated client, render via `srcDoc` in a sandboxed iframe (same pattern as `PageAnnotator`), open-in-tab via a Blob URL.
**Verification:** Server test documents the contract (no header → 401). Client: `tsc` + build; manual.

### A-11 · MEDIUM · Authentication hardening · Confirmed
**Location:** `src/config/env.js`
**Problem:** `JWT_SECRET` is only checked for *presence* in production. A six-character secret boots.
**Impact:** Offline brute force of HS256 tokens → forge any user's session, including admin.
**Fix:** Fatal in production when shorter than 32 characters, matching how `MASTER_KEY` is treated.
**Verification:** Spawn with a short secret in production → exit 1 with the message.

### A-12 · MEDIUM · Authentication hardening · Confirmed
**Location:** `src/routes/profile.js` `passwordRouter`
**Problem:** Changing the password leaves every existing refresh token valid, and accepts 6 characters where signup requires 8.
**Impact:** A user who changes their password because they suspect compromise does not actually log the attacker out — the attacker's refresh token keeps minting sessions for up to 14 days.
**Fix:** Revoke all of the user's refresh tokens on change; require 8 characters.
**Verification:** Test: after change, the old refresh token → 401.

---

## P2 — robustness, abuse, data integrity

### A-05 · MEDIUM · Reliability · Confirmed
**Location:** `src/utils/smartFetch.js` `ensureFetch`; every integration (`serper`, `dataforseo`, `googlePlaces`, `googleCustomSearch`, `claude`, `googleOauth`, `gsc`)
**Problem:** `ensureFetch()` returns bare global `fetch`. Grep shows zero timeouts / abort signals across all provider integrations. Only page capture and the crawler use `fetchWithSmartAgent` (15s).
**Impact:** A hung upstream (DataForSEO live endpoints are the realistic case) hangs the request forever server-side — the client gives up at Cloudflare's ~100s, but the handler, its credit-guard finish hook, and any held Playwright browser stay pinned. Enough of these and the process is wedged.
**Fix:** `ensureFetch()` returns a wrapper that applies a default 60s `AbortSignal` unless the caller supplies one (`AbortSignal.any` when both exist), with a `timeout` option. Claude gets an explicit 180s (large outputs); Google OAuth uses the wrapper.
**Verification:** Unit test against a never-responding local listener → rejects within the bound.

### A-06 · MEDIUM · Reliability · Confirmed
**Location:** `src/app.js` `attachShutdownHandlers`
**Problem:** On SIGTERM: `db.close(); process.exit(0)`. No `server.close()`, no in-flight drain, `drainAllPools()` exists but is never called, and `process.exit` races the async `db.close`.
**Impact:** Docker stop / `compose up --build` kills in-flight captures mid-write and can orphan Chromium processes; the WAL checkpoint on close is cut short.
**Fix:** Graceful shutdown in `start()`: stop accepting, close idle keep-alives, drain the browser pool, close the DB and wait, then exit — with a 10s hard deadline.
**Verification:** SIGTERM smoke test: ordered log lines, exit 0 within the deadline.

### A-07 · MEDIUM · Performance / data growth · Confirmed
**Location:** `src/db/migrations/*.sql`, `src/services/apiLog.js`, `src/services/auth.js`
**Problem:** `api_request_logs` gets a row per billable request and is never purged or indexed (admin filters by `user_id`, orders by `created_at`). `refresh_tokens.token_hash` is unindexed — a full scan on every `/auth/refresh` and `/logout` — and expired rows are only swept per-user at login. Seven user-scoped tables have no `user_id` index: `heatmap_reports`, `businesses`, `business_entities`, `press_releases`, `blog_posts`, `admin_users`, `team_members`.
**Impact:** On a NAS running for a year: a multi-million-row log table scanned on every admin page, refresh latency growing with every login ever made.
**Fix:** Migration 010 adds the indexes. A retention sweep at boot and daily deletes `api_request_logs` older than 90 days and expired refresh tokens.
**Verification:** `EXPLAIN QUERY PLAN` shows index use; sweep test.

### A-08 · MEDIUM · Information disclosure · Confirmed
**Location:** `client/vite.config.js` `build.sourcemap: true`; `Dockerfile` copies `client/build`
**Problem:** 96 `.map` files ship in the production image and are served.
**Impact:** Full original client source, comments and structure downloadable by anyone.
**Fix:** `sourcemap: false`.
**Verification:** Build emits 0 `.map` files.

### A-09 · MEDIUM · Abuse / resource exhaustion · Confirmed
**Location:** `src/routes/site-marker.js` `PUT /pages/:id/markers`, `src/routes/page-commenter.js` `PUT /pages/:id/comments`, `normalizeMarker`, `normalizeComment`
**Problem:** No cap on array length or text length; the global JSON limit is 10 MB; these routes sit under the 300/15 min global limiter only.
**Impact:** One account writes ~3 GB to the data volume per 15 minutes. Disk exhaustion on the NAS takes the whole app down.
**Fix:** Cap at 500 items and 4000 characters per note; 400 on exceed.
**Verification:** Test.

### A-10 · MEDIUM · Open redirect · Confirmed
**Location:** `client/src/features/auth/LoginPage.tsx` `next`; `react-router-dom@6.30.3`
**Problem:** The whitelist rejects `//host` but not `/\host`, and the installed router has the backslash-normalisation open-redirect advisory.
**Impact:** `?next=/\evil.example` after login sends the user to an attacker's site.
**Fix:** Reject any backslash; upgrade the router via `npm audit fix`.
**Verification:** Dependency re-audit; `tsc`.

### A-13 · MEDIUM · Data integrity · Confirmed
**Location:** `user_bans` schema; `GET /api/admin/users` `LEFT JOIN user_bans`
**Problem:** No uniqueness on `user_bans.user_id`. Duplicate bans were insertable until the route-level 409 added on 2026-09-13; any that exist duplicate rows in the admin user list.
**Fix:** Migration 010: delete duplicates keeping the earliest, then `UNIQUE INDEX`.
**Verification:** Migration test with seeded duplicates.

### A-14 · MEDIUM · Supply chain · Confirmed
**Location:** `package-lock.json`, `client/package-lock.json`
**Problem:** Server: 15 advisories (1 critical `tar`, 5 high) — all in the `sqlite3 → node-gyp → make-fetch-happen → cacache → tar` **install-time** chain plus `express/body-parser/qs` (moderate DoS) and `googleapis → uuid`. Client: `axios` high (prototype pollution), `form-data` high, `react-router` moderate.
**Impact:** `qs`/`body-parser`: request-triggered DoS — real. `tar`/`node-gyp`: not in the runtime require graph (verified earlier), so not reachable from a request. `uuid` v3/v5/v6 with attacker buffer: unreachable.
**Fix:** `npm audit fix` (non-breaking) on both packages. `sqlite3@6` and `googleapis@181` are semver-major: attempt `sqlite3@6` only if the Docker build can prove the native prebuild resolves; defer `googleapis` (no test coverage of GA4/GSC without live credentials).
**Verification:** Re-audit; full test suite; client build; Docker build.

---

## P4–P6 — maintainability, tooling, deployment

### A-15 · LOW · Configuration · Confirmed
`PLAYWRIGHT_POOL_MAX`, `LOG_LEVEL` read via `process.env` outside the schema; `LEGACY_USERDATA_PATH` undocumented; `apiKeySync.js` reads `process.env.CLAUDE_API_KEY` directly. **Fix:** add to schema and `.env.example`; route through `env`.

### A-16 · LOW · CI · Confirmed
No CI configuration exists. **Fix:** GitHub Actions running lint, tests, `tsc`, client build on push/PR.

### A-17 · LOW · Improvement · Potential
`src/integrations/claude.js` hard-codes 2024/2025 model IDs with a 403/404 fallback chain that would mask a retired model. Flagged, not changed — model choice alters output and cost, which is the owner's call.

### A-20 · LOW · Reliability · Potential
`jobQueue.submit()` returns a job id before the row is persisted; a failed insert leaves a dangling id in the caller's map. Flagged.

### Accepted
- **A-18** Login returns 400 "sign in with Google" / 423 locked — reveals account existence and provider. Accepted for a small self-hosted tool.
- **A-19** JWT + refresh token in `localStorage`. Standard SPA trade-off; mitigated by nonce-based CSP, no `unsafe-inline` scripts, and sandboxed iframes for third-party HTML (verified).
- Response compression is absent; Cloudflare compresses at the edge in the intended deployment.

---

## Dismissed after checking
- Stripe raw body for signature verification — captured correctly, scoped to the webhook path.
- Captured-page iframe (`PageAnnotator`) — `sandbox="allow-same-origin"` without `allow-scripts`; scripts cannot run.
- Heatmap HTML generation — `escapeHtml` applied to name/keyword; cell values numeric.
- Client 403 → refresh interceptor — wasteful but not a logout bug; a genuinely suspended account is signed out correctly.
- Job re-run after restart — citation audit processes only `pending` rows; idempotent.
- Migration runner `--` stripping inside string literals — no current migration is affected.
