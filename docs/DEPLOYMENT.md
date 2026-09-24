# Deploying Motionlinx on a NAS behind Cloudflare Tunnel

Two containers: the app, and `cloudflared` beside it. The tunnel dials out to
Cloudflare, so the NAS needs **no inbound firewall rule and no port forward**,
and nothing is exposed on the LAN.

```
browser ──https──▶ Cloudflare edge ──tunnel──▶ cloudflared ──http──▶ web:3000
```

---

## 1. Create the tunnel

In Cloudflare **Zero Trust → Networks → Tunnels**:

1. Create a tunnel, choose **Docker**, and copy the token.
2. Add a **public hostname**: your domain → service `http://web:3000`.
   `web` is the compose service name; the two containers share a network, so
   the app never needs a published port.

## 2. Configure

Create `.env` next to `docker-compose.nas.yml`:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=eyJ...            # from step 1
CLIENT_ORIGIN=https://seo.example.com     # your public https origin, exactly
JWT_SECRET=<32+ random bytes>             # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
MASTER_KEY=<32 random bytes, base64>      # REQUIRED: encrypts every user's API keys at rest
INITIAL_ADMIN_PASSWORD=<a real password>  # seeds the first admin on an empty database
USERDATA_PATH=/volume1/docker/motionlinx  # a real NAS share, NOT a path inside the container
```

`TRUST_PROXY=1` is already set in the compose file — see below for why it is
not optional.

## 3. Run

```bash
docker compose -f docker-compose.nas.yml up -d --build
```

First build pulls Chromium (~400 MB) for the capture tools. Check it came up:

```bash
docker compose -f docker-compose.nas.yml logs -f web
docker exec motionlinx node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>r.json()).then(console.log)"
```

`/api/health/ready` returns 503 until SQLite is queryable *and* the data
directory is writable, so it is the honest readiness signal — use it, not
`/api/health`, when checking a fresh deploy.

---

## Things that will bite you

### TRUST_PROXY is required, not cosmetic

Behind the tunnel every request reaches the app from cloudflared's address.
Without `TRUST_PROXY`, Express reports that same address as `req.ip` for
everyone, and the global rate limit — **300 requests per 15 minutes per IP** —
becomes 300 requests per 15 minutes *for your entire userbase combined*.

Measured on this app, with `X-Forwarded-For` present:

| setting | `req.ip` |
|---|---|
| unset | `::ffff:127.0.0.1` (the tunnel, for every client) |
| `TRUST_PROXY=1` | `203.0.113.55` (the real client) |

The limit itself is `API_RATE_LIMIT_MAX` (default 300). Measured: a signed-in
user's full page load costs ~2.4 API calls, so the default is about 120 full
page loads per quarter hour. Raise it if many people share one address.

Use the **number of hops** — cloudflared alone is `1`. Avoid `true`: it trusts
the whole `X-Forwarded-For` chain, which the client controls, so anyone could
forge an address to reset their own rate limit.

Client IPs prefer Cloudflare's `CF-Connecting-IP` header, which Cloudflare sets
itself and does not accept from the client, over `X-Forwarded-For`.

### CLIENT_ORIGIN must be the public origin

CORS fails closed in production. If this does not exactly match the origin the
browser sends, every request from your own front-end is rejected with 403.
Include the scheme, no trailing slash.

### Cloudflare's request timeout

The edge gives up on a request after ~100 seconds on the standard plans. Most
of the app is well inside that, but a large **Technical Audit** or a **Site
Marker / Page Commenter** capture of a slow page can exceed it. If you hit it,
audit fewer pages per run rather than raising limits — the work is batched
already.

### Stripe webhooks

If you set `STRIPE_WEBHOOK_IPS`, note the request arrives via Cloudflare. The
allowlist reads the forwarded client address, so it works, but it only works
because `TRUST_PROXY` is set. Signature verification runs regardless and is the
real control.

### Storage

Everything that must survive a rebuild lives under `USERDATA_PATH`: the SQLite
database, per-user files, page captures, and `system-settings.json`. Map it to a
NAS share, not a path inside the container.

On first start with an **empty** `USERDATA_PATH`, the app copies an existing
`./app-data` beside the source if it finds one. In a container there is none,
so it starts clean — worth knowing if you ever bind-mount the source directory.

### The server will not fetch private addresses

Page capture, the crawler, bulk HTTP checks and schema autofill all fetch a
URL the user typed, on the server, and hand the result back. On a NAS that
server sits on your LAN, so those requests are blocked unless they resolve to
a public internet address — loopback, `10.x`, `172.16–31.x`, `192.168.x`,
link-local `169.254.x` (cloud metadata) and their IPv6 equivalents all refuse
with a 400 explaining why.

Without this, any account on your install could read the UGREEN admin panel,
reach sibling containers, call this app's own API over loopback, and use bulk
HTTP as a LAN port scanner. Enforcement is at connect time, so a public
hostname that redirects to `127.0.0.1` is stopped at the redirect, and the
Playwright capture path filters its own requests as well.

Set `ALLOW_PRIVATE_URL_FETCH=1` only if you intend to audit internal sites,
and only on an install whose users you trust with your LAN.

### JWT_SECRET must be at least 32 characters

Presence alone used to be enough. A short HS256 secret can be brute-forced
offline, and a forged token is a session for any account — so production now
refuses to start with fewer than 32 characters, with the same kind of message
`MASTER_KEY` gives. If an existing install was set up with a short secret,
generate a new one (`openssl rand -base64 32`); every user signs in again once,
which is the correct outcome for a secret that was too weak.

### Stopping the container

`docker stop` / `compose up --build` send SIGTERM. The app stops accepting
connections, lets in-flight requests finish (a page capture can run for ~30s),
shuts down the headless browsers, then closes the database and waits for it —
all inside a 9-second deadline, because Docker follows up with SIGKILL at 10s.
Before this it exited immediately, mid-request, leaving Chromium processes and
a half-checkpointed WAL behind on every rebuild.

### Housekeeping the app does for itself

Once at start and then daily: request logs older than 90 days and expired
refresh tokens are deleted. Both tables previously grew without bound; on an
always-on NAS that eventually meant a multi-million-row log the admin panel
scanned on every page. Nothing else is purged — credit history is kept.

### Google sign-in for Analytics / Search Console

Connecting GA4 or Search Console sets a short-lived cookie
(`ga4_oauth_nonce` / `gsc_oauth_nonce`, HttpOnly, 10 minutes) that must be
present when Google redirects back. It binds the connection to the browser
that started it, so a crafted Google link cannot attach *your* Google account
to *someone else's* Motionlinx account. If a user reports "invalid_state" after
consenting, they started the flow in one browser and finished in another —
have them retry in a single browser session.

In production the OAuth redirect URI and the post-consent return URL are built
from `CLIENT_ORIGIN`, not from request headers — so the redirect URIs to
register in Google Cloud Console are exactly
`<CLIENT_ORIGIN>/api/ga4/auth/callback` and `<CLIENT_ORIGIN>/api/gsc/auth/callback`.

### MASTER_KEY is mandatory in production

The server refuses to start without it. Each user brings their own provider
credentials, so running without at-rest encryption would leave other people's
API keys in plaintext on the NAS. Setting it on an existing install triggers
migration 006, which encrypts the rows already stored.

Keep it somewhere other than `USERDATA_PATH` — a key stored beside the data it
encrypts protects nothing. Losing it means saved keys cannot be decrypted and
must be re-entered.

---

## Updating

```bash
git pull
docker compose -f docker-compose.nas.yml up -d --build
```

Schema migrations run automatically at boot and complete before any route is
mounted, so there is no separate migrate step.

## Architecture note

The image is `node:24-trixie-slim` (Debian 13, glibc) rather than Alpine:
`sqlite3` and `bcrypt` publish no musl prebuilds, and Playwright does not
support musl at all. On an x86-64 NAS both native modules install from prebuilt
binaries with no compiler in the image: `bcrypt` 6 ships its prebuilds inside
the package, `sqlite3` 6 downloads one at install time. On an architecture
without published prebuilds, `npm ci` will fall back to `node-gyp` and ask for
`build-essential` and `python3`.

Debian 13 specifically, not 12: the `sqlite3` 6 prebuild is linked against
glibc 2.38 and Debian 12 ships 2.36, so on `node:*-slim` it installs without
complaint and then fails to load. The runtime stage `require`s both native
modules straight after `npm ci`, so a wrong-ABI binary fails the build rather
than the first request. Node 20 reached end of life in April 2026; Node 24 is
the active LTS and what CI tests on.
