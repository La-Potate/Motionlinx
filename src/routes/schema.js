'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { normalizeUrl } = require('../utils/url');
const { assertPublicUrl } = require('../utils/ssrfGuard');
const { fetchWithSmartAgent } = require('../utils/smartFetch');
const { SCHEMA_AUTOFILL_USER_AGENT: AUTOFILL_USER_AGENT } = require('../config/env');
const { fetchSerperReviews } = require('../integrations/serper');
const { fetchBusinessDetailsDataForSeo } = require('../services/businessDetails');
const {
  MAX_AUTOFILL_CITATIONS,
  extractCidFromMapUrl,
  extractAutofillPayload,
  crawlCitationMetadata,
} = require('../services/schemaAutofill');

const router = express.Router();
const heavyLimit = tieredRateLimit('heavy');

{

  router.post('/autofill', authenticate, heavyLimit, async (req, res) => {
    try {
      const { url, mapUrl } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required for autofill.' });
      }
      const normalized = normalizeUrl(url);
      if (!normalized) {
        return res.status(400).json({ error: 'Provide a valid URL (including http/https).' });
      }
      assertPublicUrl(normalized);
      const normalizedMap = mapUrl ? normalizeUrl(mapUrl) : null;

      const crawlAndExtract = async () => {
        const response = await fetchWithSmartAgent(normalized, {
          headers: {
            'User-Agent': AUTOFILL_USER_AGENT,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          // User-supplied URL — tolerate misconfigured certs on customer sites.
          allowInsecureRetry: true,
        });
        const contentType = response.headers.get('content-type') || '';
        const html = await response.text();
        if (!response.ok && !contentType.includes('text/html')) {
          throw new Error(`Unable to crawl ${normalized}. Received status ${response.status}`);
        }
        return extractAutofillPayload(html, normalized, { mapUrl: normalizedMap });
      };

      if (!normalizedMap) {
        const payload = await crawlAndExtract();
        return res.json(payload);
      }

      const cid = extractCidFromMapUrl(normalizedMap);
      const userId = req.user.id;

      const [crawlResult, bizResult, reviewsResult] = await Promise.allSettled([
        crawlAndExtract(),
        fetchBusinessDetailsDataForSeo({ userId, rawInput: '', mapUrl: normalizedMap, cid }),
        fetchSerperReviews({ cid, num: 5, userId }),
      ]);

      if (crawlResult.status === 'rejected') {
        return res
          .status(400)
          .json({ error: crawlResult.reason?.message || 'Failed to crawl the requested URL.' });
      }
      const payload = crawlResult.value;

      // Merge DataForSEO business info into localBusiness
      if (bizResult.status === 'fulfilled' && bizResult.value) {
        const biz = bizResult.value;
        if (!payload.localBusiness) payload.localBusiness = {};
        const lb = payload.localBusiness;
        lb.name = lb.name || biz.name || '';
        lb.telephone = lb.telephone || biz.phone || '';
        lb.url = lb.url || biz.website || '';
        lb.hasMap = lb.hasMap || biz.mapsUrl || normalizedMap;

        const addrInfo = biz.addressComponents || [];
        const findAddrComponent = (type) => {
          const comp = addrInfo.find((c) => c.types?.includes(type));
          return comp ? comp.long_name : '';
        };
        lb.street = lb.street || findAddrComponent('route') || '';
        lb.city = lb.city || findAddrComponent('locality') || '';
        lb.region = lb.region || findAddrComponent('administrative_area_level_1') || '';
        lb.postalCode = lb.postalCode || findAddrComponent('postal_code') || '';
        lb.country = lb.country || findAddrComponent('country') || '';

        if (biz.coordinates) {
          lb.geoLat = lb.geoLat || String(biz.coordinates.lat || '');
          lb.geoLng = lb.geoLng || String(biz.coordinates.lng || '');
        }

        if (Array.isArray(biz.openingHoursText) && biz.openingHoursText.length) {
          lb.openingHours = lb.openingHours?.length ? lb.openingHours : biz.openingHoursText;
        }

        if (biz.categories?.length) {
          lb.businessType = lb.businessType || biz.categories[0] || '';
        }

        if (Array.isArray(biz.photos) && biz.photos.length) {
          const photoUrls = biz.photos.map((p) => p.url || '').filter(Boolean);
          if (photoUrls.length) {
            const existing = Array.isArray(payload.images) ? payload.images : [];
            payload.images = [...new Set([...existing, ...photoUrls])];
          }
        }
      }

      if (!payload.localBusiness) {
        payload.localBusiness = { hasMap: normalizedMap };
      } else if (!payload.localBusiness.hasMap) {
        payload.localBusiness.hasMap = normalizedMap;
      }
      if (payload.service && !payload.service.hasMap) {
        payload.service.hasMap = normalizedMap;
      }

      // Merge Serper reviews
      if (reviewsResult.status === 'fulfilled' && reviewsResult.value?.reviews?.length) {
        const serperReviews = reviewsResult.value.reviews;
        const bizData = bizResult.status === 'fulfilled' ? bizResult.value : null;
        const itemReviewed =
          payload.localBusiness?.id ||
          payload.localBusiness?.url ||
          bizData?.website ||
          normalized;

        if (!payload.reviews) {
          payload.reviews = {
            itemReviewed,
            aggregateRating: { ratingValue: '', ratingCount: '', bestRating: '', worstRating: '' },
            reviews: [],
          };
        }

        if (bizData && bizData.rating != null) {
          const agg = payload.reviews.aggregateRating;
          agg.ratingValue = agg.ratingValue || String(bizData.rating);
          agg.ratingCount = agg.ratingCount || String(bizData.userRatingsTotal || '');
          agg.bestRating = agg.bestRating || '5';
          agg.worstRating = agg.worstRating || '1';
        }

        const existingReviews = payload.reviews.reviews || [];
        payload.reviews.reviews = [...existingReviews, ...serperReviews];
        payload.reviews.itemReviewed = payload.reviews.itemReviewed || itemReviewed;
      }

      res.json(payload);
    } catch (error) {
      if (error?.code === 'ERR_SSRF_BLOCKED') {
        return res.status(400).json({ error: error.message });
      }
      logger.error({ err: error }, 'Schema autofill error');
      res.status(500).json({ error: 'Failed to crawl the requested URL.' });
    }
  });

  router.post('/citations/autofill', authenticate, heavyLimit, async (req, res) => {
    try {
      const { urls } = req.body || {};
      if (!Array.isArray(urls) || !urls.length) {
        return res.status(400).json({ error: 'Provide at least one citation URL.' });
      }
      const normalized = urls
        .map((raw) => normalizeUrl(typeof raw === 'string' ? raw : ''))
        .filter(Boolean);
      const unique = [...new Set(normalized)];
      if (!unique.length) {
        return res.status(400).json({ error: 'No valid citation URLs detected.' });
      }
      if (unique.length > MAX_AUTOFILL_CITATIONS) {
        return res
          .status(400)
          .json({ error: `Limit ${MAX_AUTOFILL_CITATIONS} citation URLs per request.` });
      }

      const citations = [];
      for (const link of unique) {
        try {
          const metadata = await crawlCitationMetadata(link);
          citations.push(metadata);
        } catch (error) {
          logger.warn({ url: link, err: error }, 'Citation crawl failed');
        }
      }

      if (!citations.length) {
        return res.status(502).json({ error: 'Unable to fetch citation metadata.' });
      }

      res.json({ citations });
    } catch (error) {
      logger.error({ err: error }, 'Citation autofill error');
      res.status(500).json({ error: 'Failed to crawl citations.' });
    }
  });

}

module.exports = router;
