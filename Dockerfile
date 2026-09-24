# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Base image: Debian slim, NOT Alpine.
#
# Alpine was the root cause of three separate failures:
#   - sqlite3 and bcrypt resolve no musl prebuild, so they fall back to
#     `node-gyp rebuild`, which needs python3/make/g++ that node:*-alpine does
#     not ship — the install step failed outright.
#   - Playwright does not support musl. Site Marker and Page Commenter launch
#     real Chromium, so they could never work there.
#   - The compose healthcheck shells out to curl, which Alpine does not ship.
#
# Debian slim has glibc, so both native modules install from prebuilt binaries
# and Playwright is on a supported platform.
#
# Debian 13 (trixie), not 12: the sqlite3 6.x prebuild is linked against
# glibc 2.38 and bookworm ships 2.36 - on node:*-slim (bookworm) the module
# installs fine and then fails to load with "GLIBC_2.38 not found". Node 24 is
# the active LTS; Node 20 reached end of life in April 2026.
# ---------------------------------------------------------------------------

# ---------- stage 1: build the SPA ----------
FROM node:24-trixie-slim AS client

WORKDIR /build

# Lockfile-exact install so the image matches what CI tested.
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
# The CSS and bundler toolchain ships native code as per-platform optional
# packages. If the Linux variant is missing or will not load, fail here with a
# plain message instead of deep inside Vite's config loader - that is exactly
# how the first real Linux build of this image died (audit A-21).
RUN node -e "require('lightningcss'); require('@tailwindcss/oxide'); require('rolldown')" \
    && echo "native toolchain OK"

COPY client/src ./src
COPY client/public ./public
COPY client/index.html ./
COPY client/vite.config.js ./
COPY client/tsconfig.json ./
RUN npm run build


# ---------- stage 2: runtime ----------
FROM node:24-trixie-slim AS runtime

# Browsers live outside the home directory so they survive the switch to the
# non-root user and are readable by it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
# sqlite3 (prebuild-install, downloaded at install time) and bcrypt (prebuilds
# shipped inside the package) resolve glibc binaries here, so no compiler
# toolchain is needed. If you build for an architecture they do not publish
# prebuilds for, npm falls back to node-gyp and this step will fail asking for
# python3/make/g++ — add build-essential and python3 in that case.
# The require line makes a silently skipped or wrong-ABI binary fail the build
# here rather than the first request in production.
RUN npm ci --omit=dev --no-audit --no-fund \
    && node -e "require('sqlite3'); require('bcrypt')"

# Chromium plus its OS libraries. Must run as root, before the USER switch.
#
# Uses the LOCAL cli from node_modules, never `npx playwright@<version>`:
# Playwright pins each library version to a specific browser build, and the
# declared range (^1.45.0) currently resolves to 1.60.0. Naming a version here
# would download browsers the installed library does not look for, and every
# capture would fail at runtime with "Executable doesn't exist".
#
# Only chromium is installed — the pool never requests firefox or webkit, and
# each extra engine costs several hundred MB.
RUN ./node_modules/.bin/playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright

COPY src ./src
COPY --from=client /build/build ./client/build

# app-data is the default USERDATA_PATH target and must be writable by the
# runtime user even when no volume is mounted over it.
RUN mkdir -p /var/lib/app-data \
    && chown -R node:node /var/lib/app-data /app

USER node

EXPOSE 3000

# Healthcheck runs in-process rather than shelling out, so the image needs no
# curl or wget. Exit code alone decides health.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
