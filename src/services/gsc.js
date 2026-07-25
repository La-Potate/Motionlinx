'use strict';

const logger = require('../utils/logger');
const googleOauth = require('./googleOauth');

// Search Console API v1 wrapper. Hard limits we respect (per Google docs,
// 2026): searchAnalytics.query caps at 25,000 rows per response and pages
// through `startRow`; per-user QPS ≈ 20 / QPM ≈ 200; URL Inspection runs at
// ≈ 600 QPM per site. We throttle with a token bucket per (user, kind).

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';
const GSC_SEARCH_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const GSC_INSPECT_BASE = 'https://searchconsole.googleapis.com/v1';

const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GSC_WRITE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const SCOPES = ['openid', 'email', 'profile', GSC_READONLY_SCOPE, GSC_WRITE_SCOPE];

function buildAuthorizeUrl(args) {
  return googleOauth.buildAuthorizeUrl({ ...args, scopes: SCOPES });
}

// ---- Token bucket -------------------------------------------------------
// Process-wide buckets keyed by `${userId}:${kind}`. Allow `capacity` tokens
// per `refillMs`. Each call awaits a token; we don't queue items, we just
// stall the caller. This is enough for one user at a time pulling reports —
// if we ever go multi-tenant on the same node it still keeps us under the
// per-user quota.
const buckets = new Map();
function getBucket(key, capacity, refillMs) {
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, capacity, lastRefill: Date.now(), refillMs };
    buckets.set(key, b);
  }
  return b;
}

async function takeToken(key, capacity, refillMs) {
  const b = getBucket(key, capacity, refillMs);
  while (true) {
    const now = Date.now();
    const elapsed = now - b.lastRefill;
    if (elapsed >= refillMs) {
      const refills = Math.floor(elapsed / refillMs);
      b.tokens = Math.min(b.capacity, b.tokens + refills * b.capacity);
      b.lastRefill += refills * refillMs;
    }
    if (b.tokens > 0) {
      b.tokens -= 1;
      return;
    }
    const waitMs = Math.max(50, refillMs - (now - b.lastRefill));
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

// ---- HTTP helper --------------------------------------------------------
async function gscFetch(url, { accessToken, method = 'GET', body, userId, kind }) {
  // Throttle to the user's quota. `searchAnalytics` and `urlInspection` are
  // tracked separately because they have different per-second limits.
  if (kind === 'inspect') {
    await takeToken(`${userId}:inspect`, 8, 1000); // ~480 QPM head-room under the 600 cap
  } else {
    await takeToken(`${userId}:default`, 15, 1000); // 15 QPS, well under 20
  }

  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.ok) return res.json().catch(() => null);

    const text = await res.text().catch(() => '');
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    const status = res.status;
    const reason = parsed?.error?.message || text || res.statusText;

    // Retryable: rate-limit + transient 5xx with exponential backoff.
    if ((status === 429 || (status >= 500 && status < 600)) && attempt <= 4) {
      const backoffMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      logger.warn({ url, status, attempt, backoffMs }, 'GSC retrying');
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    const err = new Error(`GSC ${status}: ${reason}`);
    err.status = status;
    err.gscReason = parsed?.error?.errors?.[0]?.reason;
    throw err;
  }
}

// ---- Sites --------------------------------------------------------------
async function listSites({ accessToken, userId }) {
  const data = await gscFetch(`${GSC_BASE}/sites`, { accessToken, userId });
  const entries = Array.isArray(data?.siteEntry) ? data.siteEntry : [];
  return entries
    .map((entry) => ({
      siteUrl: entry.siteUrl || '',
      permissionLevel: entry.permissionLevel || '',
      verified: entry.permissionLevel !== 'siteUnverifiedUser',
    }))
    .filter((s) => s.siteUrl);
}

// ---- Sitemaps -----------------------------------------------------------
async function listSitemaps({ accessToken, siteUrl, userId }) {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
  const data = await gscFetch(url, { accessToken, userId });
  return Array.isArray(data?.sitemap) ? data.sitemap : [];
}

async function submitSitemap({ accessToken, siteUrl, sitemapUrl, userId }) {
  const url = `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  await gscFetch(url, { accessToken, method: 'PUT', userId });
  return true;
}

// ---- searchAnalytics.query (paginated) ----------------------------------
// Pages through `startRow` until a partial page comes back (< rowLimit) or
// we hit `maxRows`. The 25k-per-request cap is honoured by rowLimit; the
// 50k total-row sampling guideline is handled at the caller by segmenting
// across dates if needed.
async function querySearchAnalytics({
  accessToken,
  siteUrl,
  startDate,
  endDate,
  dimensions = ['query'],
  rowLimit = 25000,
  maxRows = 25000,
  dimensionFilterGroups,
  searchType = 'web',
  dataState = 'final',
  userId,
}) {
  const url = `${GSC_SEARCH_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const out = [];
  let startRow = 0;
  while (out.length < maxRows) {
    const body = {
      startDate,
      endDate,
      dimensions,
      rowLimit: Math.min(rowLimit, maxRows - out.length),
      startRow,
      type: searchType,
      dataState,
    };
    if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;
    // eslint-disable-next-line no-await-in-loop
    const data = await gscFetch(url, { accessToken, method: 'POST', body, userId });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    out.push(...rows);
    if (rows.length < body.rowLimit) break;
    startRow += rows.length;
  }
  return out;
}

// ---- URL Inspection -----------------------------------------------------
// Single URL per call by design — Google has no batch endpoint.
async function inspectUrl({ accessToken, siteUrl, url, languageCode = 'en-US', userId }) {
  const data = await gscFetch(`${GSC_INSPECT_BASE}/urlInspection/index:inspect`, {
    accessToken,
    method: 'POST',
    body: { inspectionUrl: url, siteUrl, languageCode },
    userId,
    kind: 'inspect',
  });
  return data?.inspectionResult || null;
}

module.exports = {
  SCOPES,
  GSC_READONLY_SCOPE,
  GSC_WRITE_SCOPE,
  buildAuthorizeUrl,
  exchangeCodeForTokens: googleOauth.exchangeCodeForTokens,
  refreshAccessToken: googleOauth.refreshAccessToken,
  fetchUserInfo: googleOauth.fetchUserInfo,
  revokeToken: googleOauth.revokeToken,
  listSites,
  listSitemaps,
  submitSitemap,
  querySearchAnalytics,
  inspectUrl,
};
