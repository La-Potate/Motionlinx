'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { normalizeUrl } = require('../utils/url');
const {
  generatePageCommentId,
  normalizeComment,
  writePageCommentMeta,
  writePageCommentHtml,
  listPageCommentPages,
  loadPageCommentPage,
  removePageCommentPage,
} = require('../storage/pageCommenter');
const {
  parseTitleFromHtml,
  applyBaseHref,
  inlineStylesServerSide,
  fetchPageCommentHtml,
  injectCommentOverlay,
} = require('../services/pageCommenter');

const router = express.Router();
router.use(authenticate);

router.get('/pages', async (req, res) => {
  try {
    res.json({ pages: await listPageCommentPages(req.user.id) });
  } catch (err) {
    logger.error({ err }, 'Page commenter list error');
    res.status(500).json({ error: 'Failed to load page comments.' });
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
    const pageId = generatePageCommentId();
    const now = new Date().toISOString();
    const pageTitle =
      (title && title.trim()) || parseTitleFromHtml(htmlWithInlineStyles) || normalizedUrl;
    const record = {
      id: pageId,
      url: normalizedUrl,
      title: pageTitle,
      createdAt: now,
      updatedAt: now,
      lastFetchedAt: now,
      comments: [],
    };
    await writePageCommentHtml(req.user.id, pageId, htmlWithInlineStyles);
    await writePageCommentMeta(req.user.id, pageId, record);
    res.json({ page: { ...record, commentCount: 0 }, html: htmlWithInlineStyles });
  } catch (err) {
    logger.error({ err }, 'Page commenter create error');
    res.status(err.status || 500).json({
      error: err.message || 'Failed to capture page.',
      detail: err.detail || undefined,
    });
  }
});

router.get('/pages/:id', async (req, res) => {
  try {
    const record = await loadPageCommentPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const count = Array.isArray(record.page.comments) ? record.page.comments.length : 0;
    res.json({
      page: { ...record.page, commentCount: count },
      html: record.html || '',
    });
  } catch (err) {
    logger.error({ err }, 'Page commenter fetch error');
    res.status(500).json({ error: 'Failed to load page.' });
  }
});

router.put('/pages/:id/comments', async (req, res) => {
  try {
    const { comments } = req.body || {};
    if (!Array.isArray(comments)) {
      return res.status(400).json({ error: 'Comments payload must be an array.' });
    }
    const record = await loadPageCommentPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const normalized = comments.map(normalizeComment);
    const updated = {
      ...record.page,
      comments: normalized,
      updatedAt: new Date().toISOString(),
    };
    await writePageCommentMeta(req.user.id, req.params.id, updated);
    res.json({ page: { ...updated, commentCount: normalized.length } });
  } catch (err) {
    logger.error({ err }, 'Page commenter save error');
    res.status(500).json({ error: 'Failed to save comments.' });
  }
});

router.get('/pages/:id/download', async (req, res) => {
  try {
    const record = await loadPageCommentPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    const decoratedHtml = injectCommentOverlay(record.html || '', record.page.comments || [], {
      title: record.page.title,
      url: record.page.url,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="page-${req.params.id}.html"`);
    res.send(decoratedHtml);
  } catch (err) {
    logger.error({ err }, 'Page commenter download error');
    res.status(500).json({ error: 'Failed to generate download.' });
  }
});

router.delete('/pages/:id', async (req, res) => {
  try {
    const record = await loadPageCommentPage(req.user.id, req.params.id);
    if (!record) return res.status(404).json({ error: 'Page not found.' });
    await removePageCommentPage(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Page commenter delete error');
    res.status(500).json({ error: 'Failed to delete page.' });
  }
});

module.exports = router;
