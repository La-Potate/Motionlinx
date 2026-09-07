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
MASTER_KEY=<32 random bytes, base64>      # same command; encrypts saved API keys at rest
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

### Without MASTER_KEY

Saved API keys are written to disk in plaintext. The AES-256-GCM encryption is
implemented and simply switched off until the key is present; setting it later
triggers migration 006, which encrypts the existing rows on next boot.

---

## Updating

```bash
git pull
docker compose -f docker-compose.nas.yml up -d --build
```

Schema migrations run automatically at boot and complete before any route is
mounted, so there is no separate migrate step.

## Architecture note

The image is `node:20-slim` (Debian, glibc) rather than Alpine: `sqlite3` and
`bcrypt` publish no musl prebuilds, and Playwright does not support musl at all.
On an x86-64 NAS both native modules install from prebuilt binaries with no
compiler in the image. On an architecture without published prebuilds, `npm ci`
will fall back to `node-gyp` and ask for `build-essential` and `python3`.
