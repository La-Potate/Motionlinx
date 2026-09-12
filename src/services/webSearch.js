'use strict';

const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { db } = require('../utils/dbAsync');
const { delay, normalizeUrl } = require('../utils/url');
const { decodeHtmlEntities, stripTags, toAbsolute } = require('../utils/htmlScrape');
const { ensureFetch, fetchWithSmartAgent } = require('../utils/smartFetch');
const { getSystemApiKey } = require('../storage/systemSettings');
const { decryptSecret } = require('../utils/crypto');
const { BUSINESS_AUDIT_USER_AGENT: MAP_SCRAPER_USER_AGENT, SCHEMA_AUTOFILL_USER_AGENT: AUTOFILL_USER_AGENT } =
  require('../config/env');

// ---- Constants ----
const MAX_BULK_INDEX_URLS = 100;
const MAX_BULK_HTTP_URLS = 50;
const HTTP_REDIRECT_LIMIT = 10;
const HTTP_CHECK_TIMEOUT_MS = 12000;
const BULK_HTTP_DELAY_MS = 150;
const BULK_INDEX_DELAY_MS = 400;

const GOOGLE_SEARCH_ENDPOINT = 'https://www.google.com/search';
const GOOGLE_CUSTOM_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const DATAFORSEO_ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
const DATAFORSEO_BING_ENDPOINT = 'https://api.dataforseo.com/v3/serp/bing/organic/live/advanced';

const GOOGLE_QUERY_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const NOT_INDEXED_PATTERNS = [
  'did not match any documents',
  'did not return any documents',
  "there aren't many great matches for your search",
  'no results found for',
  'make sure that all words are spelled correctly',
];
const BLOCKED_PATTERNS = [
  'our systems have detected unusual traffic from your computer network',
  'to continue, please type the characters below',
  'sorry, but your computer or network may be sending automated queries',
];

const SITEMAP_CANDIDATE_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap.xml.gz',
  '/wp-sitemap.xml',
  '/sitemap1.xml',
  '/page-sitemap.xml',
  '/post-sitemap.xml',
];

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// ---- Admin Google keys lookup ----
const getAdminGoogleKeys = async () => {
  const adminKeys = await new Promise((resolve) => {
    db.all(
      `SELECT us.setting_key, us.setting_value
       FROM user_settings us
       JOIN users u ON us.user_id = u.id
       WHERE u.role = 'admin'
         AND us.setting_key IN ('googlePlaces_api_key', 'google_api_key', 'google_cx')
       ORDER BY u.id ASC`,
      [],
      (err, rows = []) => {
        if (err) {
          logger.error({ err }, 'Error fetching admin API keys');
          return resolve({});
        }
        const mapped = {};
        rows.forEach((row) => {
          // These rows are encrypted at rest; reading them raw handed the
          // Google endpoints an `enc:v1:...` blob instead of a key.
          mapped[row.setting_key] = decryptSecret(row.setting_value) || '';
        });
        resolve(mapped);
      },
    );
  });

  // getSystemApiKey decrypts; reading settings.apiKeys directly did not.
  const apiKey =
    adminKeys.googlePlaces_api_key ||
    adminKeys.google_api_key ||
    getSystemApiKey('googlePlaces') ||
    getSystemApiKey('googleApiKey') ||
    '';
  const cx = adminKeys.google_cx || getSystemApiKey('googleCx') || '';
  return { apiKey, cx };
};

// ---- Internal crawler (spider web) ----
const classifyPath = (pathname = '') => {
  const lower = pathname.toLowerCase();
  if (lower.includes('/page')) return 'page';
  if (lower.includes('/post') || lower.includes('/blog')) return 'post';
  return 'other';
};

const extractInternalLinks = ($, baseUrl, host, options = {}) => {
  const links = new Set();
  const isInChrome = (el) => {
    const classId = `${$(el).attr('class') || ''} ${$(el).attr('id') || ''}`.toLowerCase();
    return (
      classId.includes('nav') ||
      classId.includes('menu') ||
      classId.includes('header') ||
      classId.includes('footer') ||
      classId.includes('sidebar') ||
      classId.includes('breadcrumb') ||
      classId.includes('social') ||
      classId.includes('share') ||
      classId.includes('legal') ||
      classId.includes('cookie') ||
      classId.includes('policy') ||
      classId.includes('sitemap')
    );
  };

  $('body a[href]').each((_, el) => {
    const parentSection = $(el).closest('header, nav, footer, [role="navigation"]');
    if (parentSection.length) return;
    let blockedByChrome = false;
    $(el)
      .parents()
      .each((__, ancestor) => {
        if (isInChrome(ancestor)) {
          blockedByChrome = true;
          return false;
        }
        return undefined;
      });
    if (blockedByChrome) return;
    const text = ($(el).text() || '').trim();
    if (!text || text.length < 3) return;
    const lowerText = text.toLowerCase();
    if (
      lowerText.includes('privacy') ||
      lowerText.includes('terms') ||
      lowerText.includes('policy') ||
      lowerText.includes('sitemap') ||
      lowerText.includes('login') ||
      lowerText.includes('account')
    ) {
      return;
    }
    const href = String($(el).attr('href') || '').trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
      return;
    }
    const abs = toAbsolute(baseUrl, href);
    try {
      const parsed = new URL(abs);
      if (parsed.hostname !== host) return;
      parsed.hash = '';
      const normalized = parsed.toString();
      const type = classifyPath(parsed.pathname || '');
      if (type === 'page' && options.ignorePages) return;
      if (type === 'post' && options.ignorePosts) return;
      if (type === 'other' && options.ignoreOthers) return;
      const lowered = normalized.toLowerCase();
      if (
        lowered.includes('sitemap') ||
        lowered.includes('privacy') ||
        lowered.includes('terms') ||
        lowered.includes('policy') ||
        lowered.includes('login') ||
        lowered.includes('account')
      ) {
        return;
      }
      links.add(normalized);
    } catch {
      // ignore invalid
    }
  });
  return [...links];
};

const crawlInternalGraph = async ({
  startUrl,
  limit = 200,
  ignorePages = false,
  ignorePosts = false,
  ignoreOthers = false,
}) => {
  const queue = [startUrl];
  const visited = new Set();
  const nodes = new Map();
  const host = new URL(startUrl).hostname;
  const fetcher = await ensureFetch();
  let processed = 0;

  while (queue.length && nodes.size < limit) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    processed += 1;

    let html = '';
    try {
      const resp = await fetcher(current, {
        headers: {
          'User-Agent': AUTOFILL_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 8000,
      });
      html = await resp.text();
      if (!resp.ok) continue;
    } catch {
      continue;
    }

    const $ = cheerio.load(html || '');
    const title = ($('title').first().text() || '').trim() || current;
    const linksOut = extractInternalLinks($, current, host, {
      ignorePages,
      ignorePosts,
      ignoreOthers,
    });

    nodes.set(current, { id: current, url: current, title, linksOut, linksIn: [] });

    linksOut.forEach((link) => {
      if (nodes.size + queue.length >= limit) return;
      if (!visited.has(link) && !queue.includes(link)) queue.push(link);
    });
  }

  nodes.forEach((node) => {
    node.linksOut.forEach((target) => {
      const t = nodes.get(target);
      if (t) t.linksIn.push(node.id);
    });
  });

  nodes.forEach((node) => {
    node.orphan = node.linksIn.length === 0;
  });

  return { nodes: [...nodes.values()], processed };
};

// ---- Index helpers ----
function extractAllResults(html) {
  if (!html) return [];
  const linkRegex = /href="\/url\?q=([^"&]+)[^"]*"/g;
  const titleRegex = /<h3 class="[^"]*">([^<]+)<\/h3>/g;
  const snippetRegex = /<div class="[^"]*?VwiC3b[^"]*?">([\s\S]*?)<\/div>/g;

  const links = [];
  const titles = [];
  const snippets = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null) links.push(decodeURIComponent(m[1]));
  while ((m = titleRegex.exec(html)) !== null) titles.push(decodeHtmlEntities(m[1]).trim());
  while ((m = snippetRegex.exec(html)) !== null) {
    const raw = m[1];
    snippets.push(raw ? decodeHtmlEntities(stripTags(raw)).replace(/\s+/g, ' ').trim() : null);
  }

  const count = Math.max(links.length, titles.length, snippets.length);
  if (count === 0) return [];

  const results = [];
  for (let i = 0; i < count; i++) {
    results.push({ link: links[i] || null, title: titles[i] || null, snippet: snippets[i] || null });
  }
  return results;
}

function stripWww(hostname) {
  return hostname.replace(/^www\./i, '');
}

function normalizePath(pathname) {
  return (pathname || '/').replace(/\/+$/, '') || '/';
}

function isResultRelevant(targetUrl, resultLink) {
  if (!targetUrl || !resultLink) return false;
  try {
    const target = new URL(targetUrl);
    const candidate = new URL(resultLink);
    if (stripWww(candidate.hostname) !== stripWww(target.hostname)) return false;
    let targetPath;
    let candidatePath;
    try {
      targetPath = normalizePath(decodeURIComponent(target.pathname));
      candidatePath = normalizePath(decodeURIComponent(candidate.pathname));
    } catch {
      targetPath = normalizePath(target.pathname);
      candidatePath = normalizePath(candidate.pathname);
    }
    if (targetPath === '/') return true;
    return candidatePath.toLowerCase() === targetPath.toLowerCase();
  } catch {
    return false;
  }
}

function evaluateIndexResponse(html, targetUrl) {
  const lowerHtml = html.toLowerCase();
  if (BLOCKED_PATTERNS.some((pattern) => lowerHtml.includes(pattern))) {
    return {
      status: 'warning',
      firstResult: null,
      note: 'Google flagged the request as automated. Pause before retrying.',
    };
  }

  const allResults = extractAllResults(html);
  const firstResult = allResults.length > 0 ? allResults[0] : null;
  const missingSignals = NOT_INDEXED_PATTERNS.some((pattern) => lowerHtml.includes(pattern));

  if (allResults.length === 0 && missingSignals) return { status: 'missing', firstResult: null };

  if (allResults.length > 0) {
    const matchedResult = allResults.find((r) => isResultRelevant(targetUrl, r.link));
    if (matchedResult) return { status: 'indexed', firstResult: matchedResult };
    if (missingSignals) {
      return {
        status: 'missing',
        firstResult,
        note: 'Google did not return the exact URL. Double-check the address.',
      };
    }
    return {
      status: 'warning',
      firstResult,
      note: 'Top Google result belongs to a different host. Review manually.',
    };
  }

  if (missingSignals) return { status: 'missing', firstResult: null };

  return {
    status: 'missing',
    firstResult: null,
    note: 'No organic result markup detected. Treated as not indexed; verify manually.',
  };
}

function buildIndexQuery(url) {
  try {
    const parsed = new URL(url);
    const path = normalizePath(parsed.pathname);
    if (path === '/') return `site:${parsed.hostname}`;
    return `"${url}"`;
  } catch {
    return `"${url}"`;
  }
}

function toResultObj(item) {
  const rawSnippet = item.snippet || item.htmlSnippet || '';
  return {
    link: item.link || item.formattedUrl || '',
    title: item.title || '',
    snippet: rawSnippet ? stripTags(rawSnippet).trim() : '',
  };
}

async function probeIndex(targetUrl) {
  const fetcher = await ensureFetch();
  const query = buildIndexQuery(targetUrl);
  const searchUrl = `${GOOGLE_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&num=5&hl=en`;
  const started = Date.now();
  let response;
  try {
    response = await fetcher(searchUrl, { headers: GOOGLE_QUERY_HEADERS, timeout: 5000 });
  } catch (error) {
    if (/timeout/i.test(error.message || '')) {
      return {
        status: 'warning',
        firstResult: null,
        note: 'Google request timed out. Try again in a moment.',
        tookMs: Date.now() - started,
      };
    }
    throw error;
  }
  const tookMs = Date.now() - started;

  if (!response.ok) {
    return {
      status: 'warning',
      firstResult: null,
      note: `Google returned status ${response.status}`,
      tookMs,
    };
  }

  const html = await response.text();
  const evaluation = evaluateIndexResponse(html, targetUrl);
  return { ...evaluation, tookMs };
}

async function runDirectBulk(urls, seedNotes = []) {
  const results = [];
  const notes = [...seedNotes];
  for (const url of urls) {
    try {
      const probe = await probeIndex(url);
      results.push({
        url,
        status: probe.status,
        firstResult: probe.firstResult,
        tookMs: probe.tookMs,
      });
      if (probe.note) notes.push(`${url}: ${probe.note}`);
    } catch (error) {
      logger.error({ err: error, url }, 'Bulk index probe failed');
      results.push({ url, status: 'warning', firstResult: null });
      notes.push(`${url}: ${error.message || 'Unexpected error while querying Google.'}`);
    }
    await delay(BULK_INDEX_DELAY_MS);
  }

  return { results, notes };
}

async function runGoogleCustomSearchBulk(urls, credentials) {
  const fetcher = await ensureFetch();
  const results = [];
  const notes = [];

  for (const url of urls) {
    try {
      const endpoint = new URL(GOOGLE_CUSTOM_SEARCH_ENDPOINT);
      endpoint.search = new URLSearchParams({
        key: credentials.apiKey,
        cx: credentials.cx,
        q: buildIndexQuery(url),
        num: '5',
      }).toString();

      const started = Date.now();
      const response = await fetcher(endpoint.toString());
      const tookMs = Date.now() - started;

      if (!response.ok) {
        let message = `Google Custom Search error ${response.status}`;
        try {
          const errorPayload = await response.json();
          if (errorPayload?.error?.message) message = errorPayload.error.message;
        } catch {
          // ignore JSON parse failures
        }
        results.push({ url, status: 'warning', firstResult: null, tookMs });
        notes.push(`${url}: ${message}`);
        await delay(BULK_INDEX_DELAY_MS);
        continue;
      }

      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];

      if (items.length === 0) {
        results.push({ url, status: 'missing', firstResult: null, tookMs });
        await delay(BULK_INDEX_DELAY_MS);
        continue;
      }

      let matchedResult = null;
      for (const item of items) {
        const link = item.link || item.formattedUrl || '';
        if (isResultRelevant(url, link)) {
          matchedResult = toResultObj(item);
          break;
        }
      }

      if (matchedResult) {
        results.push({ url, status: 'indexed', firstResult: matchedResult, tookMs });
      } else {
        const firstResult = toResultObj(items[0]);
        results.push({
          url,
          status: 'missing',
          firstResult,
          tookMs,
          note: 'Page not found among Google results for this domain.',
        });
        notes.push(`${url}: Page not found among Google Custom Search results.`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Google Custom Search bulk lookup failed');
      results.push({ url, status: 'warning', firstResult: null });
      notes.push(`${url}: ${error.message || 'Unexpected error calling Google Custom Search.'}`);
    }

    await delay(BULK_INDEX_DELAY_MS);
  }

  return { results, notes };
}

// ---- DataForSEO SERP bulk ----
async function fetchDataForSEOSerp(endpoint, urls, credentials) {
  const fetcher = await ensureFetch();
  const locationCode = Number.parseInt(credentials.locationCode, 10) || 2840;
  const languageCode = credentials.languageCode || 'en';
  const body = urls.map((url, index) => ({
    keyword: buildIndexQuery(url),
    location_code: locationCode,
    language_code: languageCode,
    device: 'desktop',
    depth: 10,
    tag: String(index),
  }));

  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`DataForSEO responded with status ${response.status}`);

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.tasks)) {
    throw new Error('Unexpected DataForSEO response shape.');
  }

  payload.tasks.forEach((task, i) => {
    if (task.status_code !== 20000) {
      logger.warn(
        { idx: i, status: task.status_code, msg: task.status_message, keyword: body[i]?.keyword },
        'DataForSEO task non-success',
      );
    }
  });

  return payload.tasks;
}

function parseDataForSEOTasks(urls, tasks) {
  const results = [];
  const notes = [];
  const taskMap = new Map();

  tasks.forEach((task, index) => {
    const rawTag = task.tag;
    const key = rawTag != null ? Number(rawTag) : index;
    taskMap.set(Number.isFinite(key) ? key : index, task);
  });

  urls.forEach((url, index) => {
    const task = taskMap.get(index) || tasks[index];
    if (!task) {
      results.push({ url, status: 'warning', firstResult: null });
      notes.push(`${url}: Missing DataForSEO task result.`);
      return;
    }
    if (task.status_code === 20100) {
      results.push({ url, status: 'missing', firstResult: null });
      notes.push(`${url}: No results available in search engine.`);
      return;
    }
    if (task.status_code !== 20000) {
      const message = task.status_message || 'Task failed.';
      results.push({ url, status: 'missing', firstResult: null });
      notes.push(`${url}: DataForSEO error ${task.status_code} - ${message}`);
      return;
    }

    const firstResultBlock = task.result?.[0] || null;
    const items = Array.isArray(firstResultBlock?.items) ? firstResultBlock.items : [];
    const organicItems = items.filter((item) => item.type === 'organic');

    if (organicItems.length === 0) {
      results.push({ url, status: 'missing', firstResult: null });
      notes.push(`${url}: DataForSEO returned no organic results.`);
      return;
    }

    const matchedItem = organicItems.find((item) => isResultRelevant(url, item.url || ''));
    if (matchedItem) {
      results.push({
        url,
        status: 'indexed',
        firstResult: {
          link: matchedItem.url || '',
          title: matchedItem.title || '',
          snippet: matchedItem.description || '',
        },
      });
    } else {
      const topItem = organicItems[0];
      const firstResult = {
        link: topItem.url || '',
        title: topItem.title || '',
        snippet: topItem.description || '',
      };
      results.push({
        url,
        status: 'missing',
        firstResult,
        note: 'Top result belongs to a different URL.',
      });
      notes.push(`${url}: Top DataForSEO result points to ${firstResult.link || 'another host'}.`);
    }
  });

  return { results, notes };
}

async function runDataForSEOBulk(urls, credentials) {
  const tasks = await fetchDataForSEOSerp(DATAFORSEO_ENDPOINT, urls, credentials);
  return parseDataForSEOTasks(urls, tasks);
}

async function runDataForSEODualBulk(urls, credentials) {
  const [googleOutcome, bingOutcome] = await Promise.allSettled([
    fetchDataForSEOSerp(DATAFORSEO_ENDPOINT, urls, credentials).then((tasks) =>
      parseDataForSEOTasks(urls, tasks),
    ),
    fetchDataForSEOSerp(DATAFORSEO_BING_ENDPOINT, urls, credentials).then((tasks) =>
      parseDataForSEOTasks(urls, tasks),
    ),
  ]);

  const googleData =
    googleOutcome.status === 'fulfilled'
      ? googleOutcome.value
      : {
          results: urls.map((url) => ({ url, status: 'warning', firstResult: null })),
          notes: [`Google check failed: ${googleOutcome.reason?.message || 'Unknown error'}`],
        };
  const bingData =
    bingOutcome.status === 'fulfilled'
      ? bingOutcome.value
      : {
          results: urls.map((url) => ({ url, status: 'warning', firstResult: null })),
          notes: [`Bing check failed: ${bingOutcome.reason?.message || 'Unknown error'}`],
        };

  const googleMap = new Map(googleData.results.map((r) => [r.url, r]));
  const bingMap = new Map(bingData.results.map((r) => [r.url, r]));

  const results = urls.map((url) => {
    const g = googleMap.get(url) || { status: 'warning', firstResult: null };
    const b = bingMap.get(url) || { status: 'warning', firstResult: null };
    return {
      url,
      google: { status: g.status, firstResult: g.firstResult },
      bing: { status: b.status, firstResult: b.firstResult },
      status: g.status === 'indexed' ? 'indexed' : b.status === 'indexed' ? 'indexed' : g.status,
      firstResult: g.firstResult || b.firstResult,
    };
  });

  return { results, notes: [...googleData.notes, ...bingData.notes] };
}

// ---- Bulk HTTP status / redirect chain ----
const normalizeRedirectLocation = (locationHeader, baseUrl) => {
  if (!locationHeader || typeof locationHeader !== 'string') return null;
  const trimmed = locationHeader.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
};

async function fetchHttpHop(url, method = 'HEAD') {
  const headers = { 'User-Agent': MAP_SCRAPER_USER_AGENT, Accept: '*/*' };
  const baseOptions = {
    method,
    redirect: 'manual',
    headers,
    timeout: HTTP_CHECK_TIMEOUT_MS,
    // User-supplied URL: tolerate misconfigured customer sites with bad certs.
    allowInsecureRetry: true,
  };

  try {
    const response = await fetchWithSmartAgent(url, baseOptions);
    if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
      if (response.body && typeof response.body.cancel === 'function') {
        try { response.body.cancel(); } catch { /* ignore */ }
      }
      return await fetchWithSmartAgent(url, { ...baseOptions, method: 'GET' });
    }
    return response;
  } catch (error) {
    if (method === 'HEAD') {
      return await fetchWithSmartAgent(url, { ...baseOptions, method: 'GET' });
    }
    throw error;
  }
}

async function traceHttpChain(targetUrl) {
  const chain = [];
  const notes = [];
  const visited = new Set();
  let current = targetUrl;
  const started = Date.now();

  while (chain.length < HTTP_REDIRECT_LIMIT) {
    if (visited.has(current)) {
      notes.push('Redirect loop detected; halted to avoid infinite hops.');
      break;
    }
    visited.add(current);

    let response;
    try {
      response = await fetchHttpHop(current);
    } catch (error) {
      chain.push({ url: current, status: null, error: error.message || 'Request failed' });
      notes.push(`${current}: ${error.message || 'Request failed'}`);
      break;
    }

    const locationHeader = response.headers.get('location');
    const resolvedLocation = normalizeRedirectLocation(locationHeader, current);

    chain.push({
      url: current,
      status: response.status,
      location: locationHeader || null,
      resolvedLocation,
    });

    if (response.body && typeof response.body.cancel === 'function') {
      try { response.body.cancel(); } catch { /* ignore */ }
    }

    if (!REDIRECT_STATUS_CODES.has(response.status) || !resolvedLocation) break;
    current = resolvedLocation;
  }

  if (
    chain.length >= HTTP_REDIRECT_LIMIT &&
    REDIRECT_STATUS_CODES.has(chain[chain.length - 1]?.status)
  ) {
    notes.push(`Stopped after ${HTTP_REDIRECT_LIMIT} redirects; chain may continue.`);
  }

  const lastHop = chain[chain.length - 1] || { url: targetUrl };
  const finalStatus = typeof lastHop.status === 'number' ? lastHop.status : null;
  const finalUrl = lastHop.resolvedLocation || lastHop.url || targetUrl;
  const redirected = chain.length > 1;
  const ok = finalStatus !== null && finalStatus < 400;
  const timeMs = Date.now() - started;

  return { chain, finalStatus, finalUrl, redirected, ok, timeMs, notes };
}

async function runHttpStatusBulk(urls) {
  const results = [];
  const notes = [];

  for (const url of urls) {
    try {
      const trace = await traceHttpChain(url);
      results.push({ url, ...trace });
      trace.notes.forEach((note) => notes.push(`${url}: ${note}`));
    } catch (error) {
      results.push({
        url,
        chain: [],
        finalStatus: null,
        finalUrl: url,
        redirected: false,
        ok: false,
        timeMs: null,
        error: error.message || 'Unexpected error during HTTP check.',
        notes: [],
      });
      notes.push(`${url}: ${error.message || 'Unexpected error during HTTP check.'}`);
    }
    await delay(BULK_HTTP_DELAY_MS);
  }

  return { results, notes };
}

// ---- Sitemap discovery + parser ----
async function fetchWithUA(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetcher = await ensureFetch();
    const res = await fetcher(url, {
      headers: { 'User-Agent': MAP_SCRAPER_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseSitemapXml(xml) {
  if (!xml) return { urls: [], sitemaps: [] };
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = [];
  const sitemaps = [];

  if ($('sitemapindex').length) {
    $('sitemap > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) sitemaps.push(loc);
    });
  } else if ($('urlset').length) {
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
  }
  return { urls, sitemaps };
}

async function discoverSitemap(startUrl) {
  const normalized = normalizeUrl(startUrl);
  if (!normalized) return { origin: null, sitemapUrls: [] };
  const origin = new URL(normalized).origin;
  const candidates = new Set(SITEMAP_CANDIDATE_PATHS.map((p) => origin + p));

  try {
    const robots = await fetchWithUA(`${origin}/robots.txt`, 8000);
    robots
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .forEach((line) => {
        const parts = line.split(/sitemap:/i)[1]?.trim();
        if (parts) {
          const url = parts.split(/\s+/)[0];
          if (url) candidates.add(url);
        }
      });
  } catch {
    // ignore robots failures
  }

  return { origin, sitemapUrls: [...candidates] };
}

module.exports = {
  MAX_BULK_INDEX_URLS,
  MAX_BULK_HTTP_URLS,
  BULK_INDEX_DELAY_MS,
  BULK_HTTP_DELAY_MS,
  GOOGLE_SEARCH_ENDPOINT,
  GOOGLE_CUSTOM_SEARCH_ENDPOINT,
  GOOGLE_QUERY_HEADERS,
  BLOCKED_PATTERNS,
  NOT_INDEXED_PATTERNS,
  SITEMAP_CANDIDATE_PATHS,
  getAdminGoogleKeys,
  classifyPath,
  extractInternalLinks,
  crawlInternalGraph,
  extractAllResults,
  isResultRelevant,
  evaluateIndexResponse,
  buildIndexQuery,
  toResultObj,
  probeIndex,
  runDirectBulk,
  runGoogleCustomSearchBulk,
  runDataForSEOBulk,
  runDataForSEODualBulk,
  runHttpStatusBulk,
  fetchWithUA,
  parseSitemapXml,
  discoverSitemap,
};
