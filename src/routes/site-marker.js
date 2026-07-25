'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { normalizeUrl } = require('../utils/url');
const {
  generateSiteMarkerId,
  generateShareToken,
  normalizeMarker,
  writeSiteMarkerMeta,
  writeSiteMarkerHtml,
  listSiteMarkerPages,
  loadSiteMarkerPage,
  removeSiteMarkerPage,
  findSiteMarkerByShareToken,
  setShareToken,
} = require('../storage/siteMarker');
const {
  parseTitleFromHtml,
  applyBaseHref,
  inlineStylesServerSide,
  fetchPageCommentHtml,
} = require('../services/pageCommenter');

const router = express.Router();

// Rate-limit the public share endpoint. Mounted before auth-protected routes
// because shares are intentionally unauthenticated. Keyed by share TOKEN
// (not IP) so that:
//   - A popular share doesn't DOS itself from any one office's NAT'd IP
//   - An unpopular share isn't a 30/min free hit for crawlers per IP
//   - Requests without a token (or with a garbage path) fall back to per-IP
const sharedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 req/min PER SHARE TOKEN
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests for this shared page. Try again in a minute.' },
  keyGenerator: (req) => {
    const token = req.params && req.params.shareToken;
    if (typeof token === 'string' && token.length) return `tok:${token}`;
    // Falls back to client IP for malformed requests.
    return `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
  },
});

router.get('/shared/:shareToken', sharedLimiter, async (req, res) => {
  try {
    const { shareToken } = req.params;
    if (!shareToken) return res.status(400).json({ error: 'Share token is required.' });
    const result = await findSiteMarkerByShareToken(shareToken);
    if (!result) {
      return res
        .status(404)
        .json({ error: 'Shared page not found or link has been revoked.' });
    }
    const count = Array.isArray(result.page.markers) ? result.page.markers.length : 0;
    res.json({
      page: {
        id: result.page.id,
        url: result.page.url,
        title: result.page.title,
        markers: result.page.markers || [],
        markerCount: count,
        createdAt: result.page.createdAt,
        updatedAt: result.page.updatedAt,
      },
      html: result.html || '',
    });
  } catch (err) {
    logger.error({ err }, 'Site marker shared view error');
    res.status(500).json({ error: 'Failed to load shared page.' });
  }
});

// All remaining routes require auth.
router.use(authenticate);

router.get('/pages', async (req, res) => {
  try {
    res.json({ pages: await listSiteMarkerPages(req.user.id) });
  } catch (err) {
    logger.error({ err }, 'Site marker list error');
    res.status(500).json({ error: 'Failed to load site markers.' });
  }
});

router.post('/pages', tieredRateLimit('heavy'), async (req, res) => {
  try {
    const { url, title } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A valid URL is required.' });
    }
    const { html, finalUrl } = await fetchPageCommentHtml(url.trim());
    const normalizedUrl = normalizeUrl(finalUrl || url.trim()) || url.trim();
    const htmlWithBase = applyBaseHref(html, normalizedUrl);
    const htmlWithInlineStyles = await inlineStylesServerSide(htmlWithBase, normalizedUrl);
    const pageId = generateSiteMarkerId();
    const now = new Date().toISOString();
    const pageTitle =
      (title && title.trim()) || parseTitleFromHtml(htmlWithInlineStyles) || normalizedUrl;
    const record = {
      id: pageId,
      url: normalizedUrl,
      title: pageTitle,
      createdAt: now,
      updatedAt: now,
      markers: [],
      shareToken: null,
    };
    await writeSiteMarkerHtml(req.user.id, pageId, htmlWithInlineStyles);
    await writeSiteMarkerMeta(req.user.id, pageId, record);
    res.json({ page: { ...record, markerCount: 0 }, html: htmlWithInlineStyles });
  } catch (err) {
    logger.error({ err }, 'Site marker create error');
    res.status(err.status || 500).json({
      error: err.message || 'Failed to capture page.',
      detail: err.detail || undefined,
    });
  }
});

router.get('/pages/:id', async (req, res) => {
  try {
    const record = await loadSiteMarkerPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const count = Array.isArray(record.page.markers) ? record.page.markers.length : 0;
    res.json({
      page: { ...record.page, markerCount: count },
      html: record.html || '',
    });
  } catch (err) {
    logger.error({ err }, 'Site marker fetch error');
    res.status(500).json({ error: 'Failed to load page.' });
  }
});

router.put('/pages/:id/markers', async (req, res) => {
  try {
    const { markers } = req.body || {};
    if (!Array.isArray(markers)) {
      return res.status(400).json({ error: 'Markers payload must be an array.' });
    }
    const record = await loadSiteMarkerPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const normalized = markers.map(normalizeMarker);
    const updated = {
      ...record.page,
      markers: normalized,
      updatedAt: new Date().toISOString(),
    };
    await writeSiteMarkerMeta(req.user.id, req.params.id, updated);
    res.json({ page: { ...updated, markerCount: normalized.length } });
  } catch (err) {
    logger.error({ err }, 'Site marker save error');
    res.status(500).json({ error: 'Failed to save markers.' });
  }
});

router.delete('/pages/:id', async (req, res) => {
  try {
    const record = await loadSiteMarkerPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    await removeSiteMarkerPage(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Site marker delete error');
    res.status(500).json({ error: 'Failed to delete page.' });
  }
});

router.post('/pages/:id/share', async (req, res) => {
  try {
    const record = await loadSiteMarkerPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const shareToken = record.page.shareToken || generateShareToken();
    const updated = {
      ...record.page,
      shareToken,
      shareCreatedAt: record.page.shareCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeSiteMarkerMeta(req.user.id, req.params.id, updated);
    await setShareToken(req.user.id, req.params.id, shareToken);
    res.json({ shareToken });
  } catch (err) {
    logger.error({ err }, 'Site marker share error');
    res.status(500).json({ error: 'Failed to generate share link.' });
  }
});

router.delete('/pages/:id/share', async (req, res) => {
  try {
    const record = await loadSiteMarkerPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const updated = {
      ...record.page,
      shareToken: null,
      shareCreatedAt: null,
      updatedAt: new Date().toISOString(),
    };
    await writeSiteMarkerMeta(req.user.id, req.params.id, updated);
    await setShareToken(req.user.id, req.params.id, null);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Site marker revoke share error');
    res.status(500).json({ error: 'Failed to revoke share link.' });
  }
});

module.exports = router;
