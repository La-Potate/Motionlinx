'use strict';

const { upstreamAuthError, isAuthStatus } = require('../utils/http');
const { getApiKey } = require('../services/apiKeys');
const express = require('express');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { dbRun } = require('../utils/dbAsync');
const { normalizeUrl } = require('../utils/url');
const { ensureFetch, fetchWithSmartAgent } = require('../utils/smartFetch');
const { getSystemApiKey } = require('../storage/systemSettings');
const { SCHEMA_AUTOFILL_USER_AGENT: AUTOFILL_USER_AGENT } = require('../config/env');
const {
  getUserDataForSeoCredentials,
  buildLocationSettings,
  fetchDataForSeoAiKeywordData,
  fetchDataForSeoAiOptimization,
} = require('../integrations/dataforseo');
const {
  AI_CRAWLER_AGENTS,
  normalizeDomainTarget,
  parseRobotsTxt,
  evaluateAgentAccess,
  fetchRobotsTxt,
  fetchTextWithFallback,
  fetchSitemapUrls,
  buildLlmsTxt,
} = require('../services/aiSeo');

const router = express.Router();
router.use(authenticate);
// Every route here either calls DataForSEO AI APIs, Serper, or crawls — heavy tier.
router.use(tieredRateLimit('heavy'));

router.post('/keyword-data', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'personal';
    if (role === 'trial') {
      return res.status(403).json({ error: 'Service unavailable for trial accounts.' });
    }

    const { keywords = [], location = {} } = req.body || {};
    const keywordList = Array.isArray(keywords)
      ? keywords.map((kw) => (typeof kw === 'string' ? kw.trim() : '')).filter(Boolean)
      : [];
    if (!keywordList.length) return res.status(400).json({ error: 'Provide at least one keyword.' });

    const creds = await getUserDataForSeoCredentials(userId);
    if (!creds.login || !creds.password) {
      return res.status(400).json({
        error: 'DataForSEO credentials are missing. Update them in Settings → Saved APIs.',
      });
    }

    const locationSettings = buildLocationSettings(location);
    const cap = role === 'admin' || role === 'business' ? 500 : 100;
    const { items, location: resolvedLocation } = await fetchDataForSeoAiKeywordData(
      {
        keywords: keywordList,
        location_code: locationSettings.location_code,
        location_name: locationSettings.location_name,
        language_code: locationSettings.language_code,
      },
      creds,
      cap,
    );

    if (items.length && role !== 'admin') {
      await dbRun('UPDATE users SET credits = COALESCE(credits,0) - 2 WHERE id = ?', [userId]);
    }

    const locationPayload = {
      ...locationSettings,
      ...(resolvedLocation || {}),
      location_name:
        (resolvedLocation && resolvedLocation.location_name) || locationSettings.location_name,
      language_code:
        (resolvedLocation && resolvedLocation.language_code) || locationSettings.language_code,
      location_code: resolvedLocation?.location_code || locationSettings.location_code,
    };

    res.json({
      count: items.length,
      items,
      keywords: keywordList,
      location: locationPayload,
    });
  } catch (error) {
    logger.error({ err: error }, 'AI keyword data fetch failed');
    res.status(500).json({ error: 'Failed to fetch AI keyword data', details: error.message });
  }
});

router.post('/ai-optimization', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'personal';
    if (role === 'trial') {
      return res.status(403).json({ error: 'Service unavailable for trial accounts.' });
    }

    const { keywords = [], location = {}, forceWebSearch = true } = req.body || {};
    const keywordList = Array.isArray(keywords)
      ? keywords.map((kw) => (typeof kw === 'string' ? kw.trim() : '')).filter(Boolean)
      : [];

    if (!keywordList.length) return res.status(400).json({ error: 'Provide at least one keyword.' });

    const creds = await getUserDataForSeoCredentials(userId);
    if (!creds.login || !creds.password) {
      return res.status(400).json({
        error: 'DataForSEO credentials are missing. Update them in Settings → Saved APIs.',
      });
    }

    const locationSettings = buildLocationSettings(location);
    const cap = role === 'admin' || role === 'business' ? 20 : 10;

    const { results, notes } = await fetchDataForSeoAiOptimization(
      {
        keywords: keywordList.slice(0, cap),
        location_code: locationSettings.location_code,
        language_code: locationSettings.language_code || 'en',
        force_web_search: forceWebSearch !== false,
      },
      creds,
      cap,
    );

    if (results.length && role !== 'admin') {
      await dbRun('UPDATE users SET credits = COALESCE(credits,0) - 2 WHERE id = ?', [userId]);
    }

    res.json({
      count: results.length,
      keywords: keywordList.slice(0, cap),
      location: locationSettings,
      results,
      notes,
    });
  } catch (error) {
    logger.error({ err: error }, 'AI optimization error');
    res
      .status(500)
      .json({ error: 'Failed to fetch AI optimization insights', details: error.message });
  }
});

router.post('/llms/validate', async (req, res) => {
  try {
    const targetInput =
      typeof req.body?.target === 'string'
        ? req.body.target
        : typeof req.body?.domain === 'string'
          ? req.body.domain
          : '';
    const normalized = normalizeDomainTarget(targetInput);
    if (!normalized) {
      return res
        .status(400)
        .json({ error: 'Enter a valid domain or URL to validate llms.txt.' });
    }

    const llms = await fetchTextWithFallback(normalized.hostname, '/llms.txt');
    const missing = !llms.body || llms.status === 404 || llms.status === 410;
    res.json({
      domain: normalized.hostname,
      llmsUrl: llms.url,
      status: llms.status,
      body: llms.body || '',
      missing,
      notes: llms.notes || [],
      fetchedVia: llms.via || 'https',
    });
  } catch (error) {
    logger.error({ err: error }, 'LLMS validation error');
    res.status(502).json({ error: 'Unable to fetch llms.txt right now.', detail: error.message });
  }
});

router.post('/llms/generate', async (req, res) => {
  try {
    const targetInput =
      typeof req.body?.target === 'string'
        ? req.body.target
        : typeof req.body?.domain === 'string'
          ? req.body.domain
          : '';
    const normalized = normalizeDomainTarget(targetInput);
    if (!normalized) {
      return res
        .status(400)
        .json({ error: 'Enter a valid domain or URL to generate llms.txt.' });
    }

    const limit = Math.min(Math.max(parseInt(req.body?.maxUrls, 10) || 200, 10), 500);
    const sitemap = await fetchSitemapUrls(normalized.hostname, limit);
    const urls = sitemap.urls.length
      ? sitemap.urls.slice(0, limit)
      : [`https://${normalized.hostname}/`];
    const llmsText = buildLlmsTxt({
      hostname: normalized.hostname,
      urls,
      sitemapUrl: sitemap.sitemapUrl,
    });

    res.json({
      domain: normalized.hostname,
      llmsUrl: `https://${normalized.hostname}/llms.txt`,
      sitemap: { url: sitemap.sitemapUrl, status: sitemap.status },
      urls,
      stats: { detected: sitemap.urls.length || urls.length, processed: urls.length },
      llmsText,
      notes: sitemap.notes || [],
    });
  } catch (error) {
    logger.error({ err: error }, 'LLMS generation error');
    res.status(502).json({ error: 'Failed to generate llms.txt preview.', detail: error.message });
  }
});

router.post('/answer-ai', async (req, res) => {
  try {
    const { keyword, url, location = '' } = req.body || {};
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Keyword is required.' });
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'Landing page URL is required.' });
    }
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return res.status(400).json({ error: 'Provide a valid landing page URL.' });

    const serperKey = await getApiKey(req.user.id, 'serper');
    if (!serperKey) {
      return res.status(400).json({ error: 'Serper API key not configured. Add it in settings.' });
    }

    const fetcher = await ensureFetch();
    const makeSerperCall = async (type) => {
      const payload = { q: keyword.trim() };
      if (location) payload.location = location;
      const response = await fetcher(`https://google.serper.dev/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': serperKey,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (isAuthStatus(response.status)) throw upstreamAuthError('Serper');
        const text = await response.text();
        throw new Error(`Serper ${type} failed (${response.status}): ${text.slice(0, 200)}`);
      }
      return response.json();
    };

    const [searchData, answersData] = await Promise.all([
      makeSerperCall('search'),
      makeSerperCall('answers').catch(() => ({ answers: [] })),
    ]);

    const organic = Array.isArray(searchData?.organic) ? searchData.organic : [];
    const peopleAlsoAsk = Array.isArray(searchData?.peopleAlsoAsk) ? searchData.peopleAlsoAsk : [];
    const relatedSearches = Array.isArray(searchData?.relatedSearches)
      ? searchData.relatedSearches
      : [];

    const domainCounts = {};
    organic.slice(0, 20).forEach((item) => {
      try {
        const host = new URL(item.link || item.url || '').hostname.replace(/^www\./, '');
        if (host) domainCounts[host] = (domainCounts[host] || 0) + 1;
      } catch {
        // ignore
      }
    });
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, count]) => ({ domain, count }));

    const pageResp = await fetchWithSmartAgent(normalizedUrl, {
      headers: {
        'User-Agent': AUTOFILL_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
      // User-supplied landing page URL — tolerate misconfigured certs.
      allowInsecureRetry: true,
    });
    const pageHtml = await pageResp.text();
    const $ = cheerio.load(pageHtml || '');
    const headings = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().toLowerCase();
    const keywordPresent = bodyText.includes(keyword.toLowerCase());

    const gaps = [];
    if (!keywordPresent) gaps.push(`Landing page does not clearly mention "${keyword}".`);
    if (headings.length === 0) gaps.push('No H1–H3 headings detected; add structured headings.');
    if (peopleAlsoAsk.length) {
      const missingQuestions = peopleAlsoAsk
        .filter((q) => !bodyText.includes((q.question || q.title || '').toLowerCase()))
        .slice(0, 5)
        .map((q) => q.question || q.title || '');
      if (missingQuestions.length) {
        gaps.push('Missing coverage for related questions your audience asks.');
      }
    }

    const recommendations = [];
    if (peopleAlsoAsk.length) {
      recommendations.push('Add an FAQ section answering the People Also Ask questions below.');
    }
    if (topDomains.length) {
      recommendations.push('Review top competing domains to mirror intent and structure.');
    }
    recommendations.push(
      'Ensure on-page headings include the primary keyword and intent modifiers.',
    );

    res.json({
      keyword: keyword.trim(),
      url: normalizedUrl,
      location,
      peopleAlsoAsk: peopleAlsoAsk.slice(0, 10),
      relatedSearches: relatedSearches.slice(0, 10),
      answers: Array.isArray(answersData?.answers) ? answersData.answers.slice(0, 10) : [],
      topDomains,
      headings: headings.slice(0, 15),
      gaps,
      recommendations,
    });
  } catch (error) {
    logger.error({ err: error }, 'Answer the AI error');
    // A key the provider rejected is the user's to fix, so report it as such
    // rather than as a server fault.
    if (error?.upstreamAuth) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to run Answer the AI audit.' });
  }
});

router.post('/crawler-access-check', async (req, res) => {
  try {
    const targetInput =
      typeof req.body?.target === 'string'
        ? req.body.target
        : typeof req.body?.domain === 'string'
          ? req.body.domain
          : '';
    const normalized = normalizeDomainTarget(targetInput);
    if (!normalized) {
      return res
        .status(400)
        .json({ error: 'Enter a valid domain or URL to check robots.txt.' });
    }

    const robots = await fetchRobotsTxt(normalized.hostname);
    const groups = parseRobotsTxt(robots.body || '');
    const missingRobots = !robots.body || robots.status === 404 || robots.status === 410;

    const results = AI_CRAWLER_AGENTS.map((bot) => {
      const evaluation = evaluateAgentAccess(groups, bot.userAgents, {
        path: '/',
        missingRobots,
      });
      return {
        id: bot.id,
        label: bot.label,
        allowed: evaluation.allowed,
        matchedAgent: evaluation.matchedAgent,
        matchedAlias: evaluation.matchedAlias,
        matchedRule: evaluation.matchedRule,
        reason: evaluation.reason,
      };
    });

    const summary = {
      total: results.length,
      allowed: results.filter((entry) => entry.allowed).length,
      blocked: results.filter((entry) => !entry.allowed).length,
    };

    const notes = [...(robots.notes || [])];
    if (missingRobots) notes.push('robots.txt not found; default allow semantics applied.');
    if (robots.via === 'http') notes.push('HTTPS robots.txt unavailable; fell back to HTTP.');

    res.json({
      domain: normalized.hostname,
      robotsUrl: robots.url,
      status: robots.status,
      missing: missingRobots,
      results,
      summary,
      notes,
      raw: robots.body || '',
      fetchedVia: robots.via || 'https',
    });
  } catch (error) {
    logger.error({ err: error }, 'Crawler access checker error');
    res
      .status(502)
      .json({ error: 'Unable to check crawler access right now.', detail: error.message });
  }
});

module.exports = router;
