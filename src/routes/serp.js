'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { ensureFetch } = require('../utils/smartFetch');
const { getSystemApiKey } = require('../storage/systemSettings');
const { logApiRequest } = require('../services/apiLog');
const { enforceApiQuota } = require('../services/apiQuota');
const {
  DEFAULT_LOCATION_CONFIG,
  normalizeCountryCode,
  normalizeLanguageCode,
  inferLanguageFromCountry,
} = require('../integrations/dataforseo');
const { getUserGooglePlacesKey, placesTextSearch } = require('../integrations/googlePlaces');
const { rankAtLocation } = require('./../services/heatmap');
const {
  fetchBusinessDetailsDataForSeo,
  saveGbaHistoryItem,
  readGbaHistory,
} = require('../services/businessDetails');

const router = express.Router();
router.use(authenticate);

// Reusable per-tier limiters for this router. History reads stay cheap; live
// API calls (Serper, Google Places, DataForSEO) get the heavy budget.
const heavyLimit = tieredRateLimit('heavy');
const mediumLimit = tieredRateLimit('medium');

// ---- Google Places API connection test ----
router.post('/test-google-places', mediumLimit, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'API key is required' });

    const testUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurant&key=${apiKey}`;
    const fetcher = await ensureFetch();
    const response = await fetcher(testUrl);
    const data = await response.json();

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      res.json({ success: true, message: 'Google Places API connection successful' });
    } else if (data.status === 'REQUEST_DENIED') {
      res.json({ success: false, error: 'API key is invalid or restricted' });
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      res.json({ success: false, error: 'API key has exceeded quota' });
    } else {
      res.json({ success: false, error: `API error: ${data.status}` });
    }
  } catch (error) {
    logger.error({ err: error }, 'Google Places API test error');
    res.status(500).json({ success: false, error: 'Failed to test API connection' });
  }
});

// ---- Google Places text search ----
router.post('/google-places-search', heavyLimit, async (req, res) => {
  try {
    const { query, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'API key is required' });
    if (!query) return res.status(400).json({ success: false, error: 'Search query is required' });

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query,
    )}&key=${apiKey}`;
    const fetcher = await ensureFetch();
    const response = await fetcher(searchUrl);
    const data = await response.json();

    if (data.status === 'OK') {
      const businesses = data.results.map((place) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total,
        types: place.types,
        geometry: place.geometry,
        photos: place.photos,
        businessStatus: place.business_status,
      }));

      res.json({
        success: true,
        data: {
          businesses,
          searchInfo: {
            query,
            totalResults: data.results.length,
            searchTime: new Date().toISOString(),
          },
        },
      });
    } else {
      res.json({ success: false, error: `Search failed: ${data.status}` });
    }
  } catch (error) {
    logger.error({ err: error }, 'Google Places search error');
    res.status(500).json({ success: false, error: 'Failed to search businesses' });
  }
});

// ---- Serper.dev /search (multi-type) proxy ----
router.post('/serper-search', heavyLimit, async (req, res) => {
  try {
    const {
      query,
      apiKey,
      country = 'us',
      location = '',
      language = 'en',
      dateRange = '',
      page = 1,
      autocorrect = true,
      type = 'search',
    } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    let effectiveKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!effectiveKey) effectiveKey = getSystemApiKey('serper');
    if (!effectiveKey) {
      return res.status(400).json({
        success: false,
        error: 'Serper API key not configured. Please ask an administrator to connect it.',
      });
    }

    const payload = { q: query.trim() };
    if (country) payload.gl = country;
    if (language) payload.hl = language;
    if (location) payload.location = location;
    if (dateRange) payload.tbs = dateRange;
    if (typeof page === 'number' && page > 0) payload.page = page;
    if (typeof autocorrect === 'boolean') payload.autocorrect = autocorrect;

    const allowedTypes = new Set([
      'search',
      'news',
      'images',
      'videos',
      'places',
      'maps',
      'shopping',
      'answers',
    ]);
    const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'search';
    const endpointType = allowedTypes.has(normalizedType) ? normalizedType : 'search';

    const fetchFunc = await ensureFetch();
    const response = await fetchFunc(`https://google.serper.dev/${endpointType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': effectiveKey },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: (data && data.error) || (data && data.message) || 'Serper API request failed',
        data,
      });
    }

    logApiRequest(req.user.id, 'serper_search', data?.credits || 1, {
      query,
      type: endpointType,
    }).catch(() => {});
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ err: error }, 'Serper search error');
    res.status(500).json({ success: false, error: 'Failed to execute Serper search' });
  }
});

// ---- Serper.dev /reviews proxy (paginated, sorted) ----
router.post('/serper-reviews', heavyLimit, async (req, res) => {
  try {
    const {
      placeId = '',
      cid = '',
      fid = '',
      sortBy = 'most_relevant',
      topicId = '',
      nextPageToken = '',
      country = '',
      gl = '',
      language = '',
      hl = '',
      num,
      page,
      apiKey,
    } = req.body || {};

    const hasIdentifier =
      (placeId && placeId.trim()) || (cid && cid.trim()) || (fid && fid.trim());
    if (!hasIdentifier) {
      return res.status(400).json({
        success: false,
        error: 'Place ID, CID, or FID is required for Serper reviews.',
      });
    }

    let effectiveKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!effectiveKey) effectiveKey = getSystemApiKey('serper');
    if (!effectiveKey) {
      return res.status(400).json({
        success: false,
        error: 'Serper API key not configured. Please ask an administrator to connect it.',
      });
    }

    const quotaResult = await enforceApiQuota(req.user.id, 'serper_reviews', 1);
    if (quotaResult && quotaResult.allowed === false) {
      return res.status(429).json({
        success: false,
        error:
          'Serper review quota exceeded. Please wait until the quota resets or contact an administrator.',
        quota: quotaResult,
      });
    }

    const payload = {};
    const cleanedPlaceId = placeId && placeId.trim();
    const cleanedCid = cid && cid.trim();
    const cleanedFid = fid && fid.trim();
    if (cleanedPlaceId) payload.placeId = cleanedPlaceId;
    else if (cleanedCid) payload.cid = cleanedCid;
    else if (cleanedFid) payload.fid = cleanedFid;
    if (topicId && topicId.trim()) payload.topicId = topicId.trim();
    if (nextPageToken && nextPageToken.trim()) payload.nextPageToken = nextPageToken.trim();

    const allowedSort = new Set(['most_relevant', 'newest', 'highest_rating', 'lowest_rating']);
    const sortNormalized = (sortBy || '').trim().toLowerCase().replace(/\s+/g, '_');
    const resolvedSort = allowedSort.has(sortNormalized) ? sortNormalized : 'most_relevant';
    payload.sortBy = resolvedSort;

    const resolvedPage = Math.max(parseInt(page, 10) || 1, 1);
    const resolvedNum = Math.min(Math.max(parseInt(num, 10) || 10, 1), 50);
    payload.page = resolvedPage;
    payload.num = resolvedNum;

    const resolvedCountry =
      normalizeCountryCode(country || gl) ||
      DEFAULT_LOCATION_CONFIG.country_iso_code.toLowerCase();
    const resolvedLanguage =
      normalizeLanguageCode(language || hl || inferLanguageFromCountry(resolvedCountry)) ||
      (DEFAULT_LOCATION_CONFIG.language_code || 'en');

    if (resolvedCountry) payload.gl = resolvedCountry;
    if (resolvedLanguage) payload.hl = resolvedLanguage;

    const fetchFunc = await ensureFetch();
    const response = await fetchFunc('https://google.serper.dev/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': effectiveKey },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: (data && (data.error || data.message)) || 'Serper reviews request failed.',
        data,
      });
    }

    logApiRequest(req.user.id, 'serper_reviews', data?.credits || 1, {
      placeId: placeId || '',
      cid: cid || '',
      fid: fid || '',
      pageToken: nextPageToken || '',
      gl: resolvedCountry,
      hl: resolvedLanguage,
      page: resolvedPage,
      num: resolvedNum,
      sortBy: resolvedSort,
    }).catch(() => {});
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ err: error }, 'Serper reviews error');
    res.status(500).json({ success: false, error: 'Failed to fetch Serper reviews' });
  }
});

// ---- Business details (DataForSEO + Google Places enrichment) ----
router.post('/business-details', heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const { placeId, forceRefresh = false, mapUrl, cid } = req.body || {};
    const data = await fetchBusinessDetailsDataForSeo({
      userId,
      rawInput: placeId,
      mapUrl,
      cid,
      forceRefresh,
    });
    await saveGbaHistoryItem(userId, {
      title: data.name,
      placeId: data.placeId,
      cid: data.cid,
      rating: data.rating,
      reviewCount: data.userRatingsTotal,
      data,
      auditAt: new Date().toISOString(),
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || error.httpStatus || 500;
    logger.error({ err: error }, 'Business details error');
    return res
      .status(status)
      .json({ success: false, error: error.message || 'Failed to get business details' });
  }
});

router.get('/business-details/history', async (req, res) => {
  try {
    const history = await readGbaHistory(req.user.id);
    const list = history.map((item) => ({
      id: item.id,
      title: item.title,
      placeId: item.placeId,
      cid: item.cid,
      rating: item.rating,
      reviewCount: item.reviewCount,
      auditAt: item.auditAt,
    }));
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error({ err: error }, 'History list error');
    res.status(500).json({ success: false, error: 'Failed to load history' });
  }
});

router.get('/business-details/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await readGbaHistory(req.user.id);
    const item = history.find((entry) => entry.id === id);
    if (!item) return res.status(404).json({ success: false, error: 'History item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    logger.error({ err: error }, 'History fetch error');
    res.status(500).json({ success: false, error: 'Failed to load history item' });
  }
});

router.post('/google-maps', heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, lat, lng, radius, apiKeys = {} } = req.body || {};
    if (!query) return res.status(400).json({ success: false, error: 'Query is required' });

    const key = apiKeys.googlePlaces || (await getUserGooglePlacesKey(userId));
    if (!key) {
      return res.json({
        success: true,
        data: {
          businesses: [],
          searchInfo: {
            query,
            totalResults: 0,
            searchTime: new Date().toISOString(),
            apiUsed: 'No API key',
          },
        },
      });
    }

    const data = await placesTextSearch({ query, lat, lng, radius, apiKey: key });
    if (data.status !== 'OK') {
      return res.json({ success: false, error: data.error_message || data.status });
    }

    const businesses = (data.results || []).map((r) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address,
      rating: r.rating,
      reviews: r.user_ratings_total,
      geometry: r.geometry,
    }));
    return res.json({
      success: true,
      data: {
        businesses,
        searchInfo: {
          query,
          totalResults: businesses.length,
          searchTime: new Date().toISOString(),
          apiUsed: 'Google Places API',
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Google Maps search error');
    return res.status(500).json({ success: false, error: 'Failed to search Google Maps' });
  }
});

router.get('/business-details/:placeId', heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await fetchBusinessDetailsDataForSeo({
      userId,
      rawInput: req.params.placeId,
      mapUrl: '',
      cid: null,
      forceRefresh: false,
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || error.httpStatus || 500;
    logger.error({ err: error }, 'Business details error');
    return res
      .status(status)
      .json({ success: false, error: error.message || 'Failed to fetch business details' });
  }
});

router.post('/keyword-rankings', heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const { placeId, keywords = [], center, radiusMeters = 3000, apiKey } = req.body || {};
    if (!placeId) return res.status(400).json({ success: false, error: 'placeId is required' });
    const key = apiKey || (await getUserGooglePlacesKey(userId));
    if (!key) {
      return res
        .status(400)
        .json({ success: false, error: 'Google Places API key not configured' });
    }

    const list = keywords.length ? keywords : ['local business near me'];
    const location = center || null;

    const results = [];
    for (const kw of list) {
      // eslint-disable-next-line no-await-in-loop
      const r = await rankAtLocation({
        placeId,
        keyword: kw,
        lat: location?.lat,
        lng: location?.lng,
        radius: radiusMeters,
        apiKey: key,
      });
      results.push({ keyword: kw, position: r.rank });
    }

    return res.json({
      success: true,
      data: { placeId, keywords: results, lastUpdated: new Date().toISOString() },
    });
  } catch (error) {
    logger.error({ err: error }, 'Keyword rankings error');
    return res.status(500).json({ success: false, error: 'Failed to fetch keyword rankings' });
  }
});

// ---- Removed mock endpoints ----
// /api/serp/competitors, /backlinks, /organic-traffic used to return hard-coded
// fake JSON and still charged credits via creditGuard. They had no real data
// source. Removed 2026-05-27. If a real implementation lands, restore them as
// new routes with proper data.
const gone = (_req, res) =>
  res.status(410).json({
    success: false,
    error: 'This endpoint has been removed. It previously returned mock data only.',
  });
router.post('/competitors', gone);
router.post('/backlinks', gone);
router.post('/organic-traffic', gone);

module.exports = router;
