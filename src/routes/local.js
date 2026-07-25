'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { dbRun } = require('../utils/dbAsync');
const {
  DEFAULT_LOCATION_KEY,
  DATAFORSEO_LOCATIONS_LIMIT,
  filterFallbackLocations,
  buildLocationSettings,
  getUserDataForSeoCredentials,
  fetchDataForSeoLocations,
  fetchDataForSeoKeywordIdeas,
  fetchDataForSeoKeywordVolume,
} = require('../integrations/dataforseo');

const router = express.Router();
const heavyLimit = tieredRateLimit('heavy');
const mediumLimit = tieredRateLimit('medium');

router.get('/locations', authenticate, mediumLimit, async (req, res) => {
  const query = (req.query.q || '').trim();
  const type = (req.query.type || '').trim().toLowerCase();
  const loadAll = req.query.all === 'true';
  const fallback = filterFallbackLocations(query);
  const userId = req.user.id;
  const creds = await getUserDataForSeoCredentials(userId);
  if (!creds.login || !creds.password) {
    return res.json({ locations: fallback, source: 'fallback' });
  }
  try {
    const results = await fetchDataForSeoLocations(query, creds, { type, loadAll });
    const filtered =
      type === 'country'
        ? results.filter((loc) => (loc.location_type || '').toLowerCase() === 'country')
        : results;
    const limited = loadAll ? filtered : filtered.slice(0, DATAFORSEO_LOCATIONS_LIMIT);
    if (!results.length) {
      return res.json({ locations: fallback, source: 'fallback' });
    }
    return res.json({ locations: limited });
  } catch (error) {
    logger.error({ err: error }, 'Location search failed');
    return res.json({
      locations: fallback,
      warning: 'Unable to reach DataForSEO. Showing defaults.',
    });
  }
});

router.post('/keyword-ideas', authenticate, heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'personal';
    if (role === 'trial') {
      return res.status(403).json({ error: 'Service unavailable for trial accounts.' });
    }
    const {
      keywords = [],
      pageUrl = '',
      locationKey = DEFAULT_LOCATION_KEY,
      location = {},
    } = req.body || {};

    const keywordList = Array.isArray(keywords)
      ? keywords.map((kw) => (typeof kw === 'string' ? kw.trim() : '')).filter(Boolean)
      : [];
    const sanitizedUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';

    if (!keywordList.length && !sanitizedUrl) {
      return res.status(400).json({ error: 'Provide at least one keyword or a landing page URL.' });
    }

    const creds = await getUserDataForSeoCredentials(userId);
    if (!creds.login || !creds.password) {
      return res.status(400).json({
        error: 'DataForSEO credentials are missing. Update them in Settings → Saved APIs.',
      });
    }

    const locationSettings = buildLocationSettings(
      Object.keys(location || {}).length ? location : { location_key: locationKey },
    );
    const ideas = [];
    if (keywordList.length) {
      const keywordIdeas = await fetchDataForSeoKeywordIdeas(
        {
          keywords: keywordList,
          location_code: locationSettings.location_code,
          location_name: locationSettings.location_name,
          language_code: locationSettings.language_code || 'en',
        },
        creds,
      );
      ideas.push(...keywordIdeas);
    }

    const uniqueIdeas = [];
    const seen = new Set();
    ideas.forEach((idea) => {
      const key = idea.keyword?.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      uniqueIdeas.push(idea);
    });

    const cap = role === 'admin' || role === 'business' ? 2000 : 200;
    const cappedIdeas = uniqueIdeas.slice(0, cap);

    if (cappedIdeas.length && role !== 'admin') {
      await dbRun('UPDATE users SET credits = COALESCE(credits,0) - 2 WHERE id = ?', [userId]);
    }

    res.json({ count: cappedIdeas.length, ideas: cappedIdeas, location: locationSettings });
  } catch (error) {
    logger.error({ err: error }, 'Local keyword research failed');
    res.status(500).json({ error: 'Failed to fetch keyword ideas', details: error.message });
  }
});

router.post('/keyword-volume', authenticate, heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'personal';
    if (role === 'trial') {
      return res.status(403).json({ error: 'Service unavailable for trial accounts.' });
    }
    const { keywords = [], locationKey = DEFAULT_LOCATION_KEY, location = {} } = req.body || {};
    const keywordList = Array.isArray(keywords)
      ? keywords.map((kw) => (typeof kw === 'string' ? kw.trim() : '')).filter(Boolean)
      : [];
    if (!keywordList.length) {
      return res.status(400).json({ error: 'Provide at least one keyword.' });
    }
    const creds = await getUserDataForSeoCredentials(userId);
    if (!creds.login || !creds.password) {
      return res.status(400).json({
        error: 'DataForSEO credentials are missing. Update them in Settings → Saved APIs.',
      });
    }
    const locationSettings = buildLocationSettings(
      Object.keys(location || {}).length ? location : { location_key: locationKey },
    );
    const cap = role === 'admin' || role === 'business' ? 2000 : 200;
    const results = await fetchDataForSeoKeywordVolume(
      {
        keywords: keywordList,
        location_code: locationSettings.location_code,
        location_name: locationSettings.location_name,
        language_code: locationSettings.language_code || 'en',
      },
      creds,
      cap,
    );
    if (results.length && role !== 'admin') {
      await dbRun('UPDATE users SET credits = COALESCE(credits,0) - 2 WHERE id = ?', [userId]);
    }
    return res.json({ count: results.length, ideas: results, location: locationSettings });
  } catch (error) {
    logger.error({ err: error }, 'Keyword volume fetch failed');
    return res
      .status(500)
      .json({ error: 'Failed to fetch keyword volume', details: error.message });
  }
});

module.exports = router;
