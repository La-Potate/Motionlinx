'use strict';

const express = require('express');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { normalizeUrl } = require('../utils/url');
const { getUserDataForSeoCredentials } = require('../integrations/dataforseo');
const {
  MAX_BULK_INDEX_URLS,
  MAX_BULK_HTTP_URLS,
  getAdminGoogleKeys,
  crawlInternalGraph,
  runDirectBulk,
  runGoogleCustomSearchBulk,
  runDataForSEOBulk,
  runDataForSEODualBulk,
  runHttpStatusBulk,
  fetchWithUA,
  parseSitemapXml,
  discoverSitemap,
} = require('../services/webSearch');

const router = express.Router();
router.use(authenticate);
// Every route here either crawls or fans out to bulk APIs — heavy tier.
router.use(tieredRateLimit('heavy'));

router.post('/spider-web', async (req, res) => {
  try {
    const {
      domain,
      crawlLimit = 200,
      ignorePages = false,
      ignorePosts = false,
      ignoreOthers = false,
    } = req.body || {};
    const normalized = normalizeUrl(domain);
    if (!normalized) return res.status(400).json({ error: 'Enter a valid domain or URL.' });
    const urlObj = new URL(normalized);
    const startUrl = `${urlObj.origin}/`;
    const limit = Math.max(10, Math.min(parseInt(crawlLimit, 10) || 200, 10000));

    const { nodes, processed } = await crawlInternalGraph({
      startUrl,
      limit,
      ignorePages: Boolean(ignorePages),
      ignorePosts: Boolean(ignorePosts),
      ignoreOthers: Boolean(ignoreOthers),
    });

    res.json({ nodes, count: nodes.length, processed });
  } catch (error) {
    logger.error({ err: error }, 'Spider web crawl error');
    res.status(500).json({ error: 'Failed to crawl internal links.' });
  }
});

router.post('/bulk-index', async (req, res) => {
  try {
    const { urls, mode = 'dataforseo-dual', googleApiKey, googleCx, dataforseo } = req.body || {};
    const userId = req.user && req.user.id;

    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'Body must include an array of urls.' });
    }

    const normalised = urls
      .map((raw) => normalizeUrl(typeof raw === 'string' ? raw : ''))
      .filter(Boolean);
    const unique = [...new Set(normalised)];

    if (unique.length === 0) return res.status(400).json({ error: 'No valid URLs supplied.' });
    if (unique.length > MAX_BULK_INDEX_URLS) {
      return res.status(400).json({ error: `Limit ${MAX_BULK_INDEX_URLS} URLs per request.` });
    }

    let payload;
    if (mode === 'dataforseo-dual' || mode === 'dataforseo') {
      let creds = dataforseo;
      if (!creds || !creds.login || !creds.password) {
        creds = await getUserDataForSeoCredentials(userId);
      }
      if (!creds || !creds.login || !creds.password) {
        return res.status(400).json({
          error: 'DataForSEO credentials are required. Ask an admin to configure them.',
        });
      }
      payload =
        mode === 'dataforseo-dual'
          ? await runDataForSEODualBulk(unique, creds)
          : await runDataForSEOBulk(unique, creds);
    } else if (mode === 'google-api') {
      let apiKey = googleApiKey;
      let cx = googleCx;
      if (!apiKey || !cx) {
        const adminKeys = await getAdminGoogleKeys();
        apiKey = apiKey || adminKeys.apiKey;
        cx = cx || adminKeys.cx;
      }
      if (!apiKey || !cx) {
        return res.status(400).json({
          error: 'Google API key and Search Engine ID (cx) are required for this mode.',
        });
      }
      payload = await runGoogleCustomSearchBulk(unique, { apiKey, cx });
    } else {
      const notesSeed = googleApiKey ? ['Google API key provided but using direct lookup.'] : [];
      payload = await runDirectBulk(unique, notesSeed);
    }

    const isDual = mode === 'dataforseo-dual';
    const summary = {
      total: payload.results.length,
      indexed: payload.results.filter((item) => item.status === 'indexed').length,
      missing: payload.results.filter((item) => item.status === 'missing').length,
      ...(isDual && {
        googleIndexed: payload.results.filter((item) => item.google?.status === 'indexed').length,
        googleMissing: payload.results.filter((item) => item.google?.status === 'missing').length,
        bingIndexed: payload.results.filter((item) => item.bing?.status === 'indexed').length,
        bingMissing: payload.results.filter((item) => item.bing?.status === 'missing').length,
      }),
    };

    res.json({ ...payload, summary });
  } catch (error) {
    logger.error({ err: error }, 'Bulk index checker error');
    res.status(500).json({ error: 'Failed to run the bulk index checker.' });
  }
});

router.post('/bulk-http', async (req, res) => {
  try {
    const { urls } = req.body || {};
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'Body must include an array of urls.' });
    }
    const normalised = urls
      .map((raw) => normalizeUrl(typeof raw === 'string' ? raw : ''))
      .filter(Boolean);
    const unique = [...new Set(normalised)];

    if (unique.length === 0) return res.status(400).json({ error: 'No valid URLs supplied.' });
    if (unique.length > MAX_BULK_HTTP_URLS) {
      return res.status(400).json({ error: `Limit ${MAX_BULK_HTTP_URLS} URLs per request.` });
    }

    const payload = await runHttpStatusBulk(unique);
    const summary = {
      total: payload.results.length,
      ok: payload.results.filter((item) => item.ok).length,
      redirected: payload.results.filter((item) => item.redirected).length,
      errors: payload.results.filter((item) => !item.ok).length,
    };

    res.json({ ...payload, summary });
  } catch (error) {
    logger.error({ err: error }, 'Bulk HTTP checker error');
    res.status(500).json({ error: 'Failed to run the HTTP checker.' });
  }
});

router.post('/site-tree/sitemap', async (req, res) => {
  try {
    const { target, sitemapUrl } = req.body || {};
    const normalizedTarget = sitemapUrl ? normalizeUrl(sitemapUrl) : normalizeUrl(target);
    if (!normalizedTarget) {
      return res.status(400).json({ error: 'Enter a valid site or sitemap URL.' });
    }

    const { origin, sitemapUrls } = await discoverSitemap(normalizedTarget);
    const queue = [];
    if (sitemapUrl) queue.push(normalizedTarget);
    queue.push(...sitemapUrls);

    const visited = new Set();
    const foundUrls = new Set();
    const usedSitemaps = [];
    const MAX_SITEMAPS = 15;
    const MAX_URLS = 5000;

    const fetchSitemapRecursive = async (url, depth = 0) => {
      if (!url || visited.has(url) || visited.size >= MAX_SITEMAPS) return;
      visited.add(url);
      try {
        const xml = await fetchWithUA(url, 15000);
        const parsed = parseSitemapXml(xml);
        usedSitemaps.push(url);
        parsed.urls.forEach((u) => {
          if (foundUrls.size < MAX_URLS) foundUrls.add(u);
        });
        if (depth < 2 && parsed.sitemaps?.length) {
          for (const sub of parsed.sitemaps) {
            await fetchSitemapRecursive(sub, depth + 1);
            if (foundUrls.size >= MAX_URLS) break;
          }
        }
      } catch {
        // ignore individual failures
      }
    };

    for (const cand of queue) {
      if (foundUrls.size >= MAX_URLS) break;
      await fetchSitemapRecursive(cand, 0);
    }

    if (!foundUrls.size) return res.status(404).json({ error: 'No URLs found from sitemap.' });

    res.json({
      success: true,
      count: foundUrls.size,
      urls: [...foundUrls],
      sitemapsTried: queue.slice(0, MAX_SITEMAPS),
      sitemapsUsed: usedSitemaps,
      origin,
    });
  } catch (error) {
    logger.error({ err: error }, 'Site tree sitemap error');
    res.status(500).json({ error: 'Failed to fetch sitemap.', detail: error.message });
  }
});

router.post('/site-tree/meta', async (req, res) => {
  try {
    const { urls } = req.body || {};
    if (!Array.isArray(urls) || !urls.length) {
      return res.status(400).json({ error: 'Provide a list of URLs.' });
    }
    const LIMIT = 200;
    const targets = urls.slice(0, LIMIT);
    const results = [];
    for (const url of targets) {
      try {
        const html = await fetchWithUA(url, 8000);
        const $ = cheerio.load(html);
        const title =
          $('title').text() ||
          $('meta[property="og:title"]').attr('content') ||
          $('meta[name="twitter:title"]').attr('content') ||
          '';
        const description =
          $('meta[name="description"]').attr('content') ||
          $('meta[property="og:description"]').attr('content') ||
          $('meta[name="twitter:description"]').attr('content') ||
          '';
        results.push({
          url,
          title: title || 'No title',
          description: description || 'No description',
        });
      } catch (err) {
        results.push({
          url,
          title: 'Error fetching title',
          description: err.message || 'Failed to fetch',
        });
      }
    }
    res.json({ success: true, results, truncated: urls.length > LIMIT });
  } catch (error) {
    logger.error({ err: error }, 'Site tree meta error');
    res.status(500).json({ error: 'Failed to fetch metadata.' });
  }
});

module.exports = router;
