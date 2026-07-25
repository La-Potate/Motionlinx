'use strict';

const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ensureDir, USERDATA_ROOT } = require('./paths');

const PAGE_COMMENT_ROOT = path.join(USERDATA_ROOT, 'page-comments');
const LEGACY_PAGE_COMMENT_ROOT = path.join(USERDATA_ROOT, 'Page Comment Data');
// One-time rename of the legacy spaced directory to the kebab-case name.
// Safe to leave indefinitely — if neither exists yet, the rename no-ops and
// ensureDir creates the new one.
try {
  // eslint-disable-next-line no-restricted-syntax
  const fs = require('fs');
  if (fs.existsSync(LEGACY_PAGE_COMMENT_ROOT) && !fs.existsSync(PAGE_COMMENT_ROOT)) {
    fs.renameSync(LEGACY_PAGE_COMMENT_ROOT, PAGE_COMMENT_ROOT);
    logger.info('Renamed legacy "Page Comment Data" → page-comments');
  }
} catch (err) {
  logger.warn({ err: err.message }, 'Could not rename legacy page-comments dir');
}
ensureDir(PAGE_COMMENT_ROOT);

function generatePageCommentId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(12).toString('hex');
}

function getPageCommentUserDir(userId) {
  return path.join(PAGE_COMMENT_ROOT, String(userId));
}
function getPageCommentPageDir(userId, pageId) {
  return path.join(getPageCommentUserDir(userId), String(pageId));
}
function getPageCommentMetaPath(userId, pageId) {
  return path.join(getPageCommentPageDir(userId, pageId), 'page.json');
}
function getPageCommentHtmlPath(userId, pageId) {
  return path.join(getPageCommentPageDir(userId, pageId), 'page.html');
}

async function ensurePageCommentDirs(userId, pageId = null) {
  await fsp.mkdir(getPageCommentUserDir(userId), { recursive: true });
  if (pageId) await fsp.mkdir(getPageCommentPageDir(userId, pageId), { recursive: true });
}

function normalizeComment(comment = {}) {
  const safeId =
    typeof comment.id === 'string' && comment.id.trim().length
      ? comment.id.trim()
      : generatePageCommentId();
  const safeText = typeof comment.text === 'string' ? comment.text.trim() : '';
  const safeX = Math.min(Math.max(Number(comment.x) || 0, 0), 1);
  const safeY = Math.min(Math.max(Number(comment.y) || 0, 0), 1);
  const now = new Date().toISOString();
  return {
    id: safeId,
    text: safeText,
    x: Number(safeX.toFixed(4)),
    y: Number(safeY.toFixed(4)),
    createdAt: comment.createdAt || now,
    updatedAt: now,
  };
}

async function readPageCommentMeta(userId, pageId) {
  try {
    const metaPath = getPageCommentMetaPath(userId, pageId);
    const raw = await fsp.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    logger.error({ err: err.message }, 'Failed to read page comment meta');
    return null;
  }
}

async function writePageCommentMeta(userId, pageId, page) {
  await ensurePageCommentDirs(userId, pageId);
  const metaPath = getPageCommentMetaPath(userId, pageId);
  const next = { ...page };
  await fsp.writeFile(metaPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function writePageCommentHtml(userId, pageId, html = '') {
  await ensurePageCommentDirs(userId, pageId);
  await fsp.writeFile(getPageCommentHtmlPath(userId, pageId), html || '', 'utf8');
}

async function listPageCommentPages(userId) {
  try {
    const dir = getPageCommentUserDir(userId);
    await fsp.mkdir(dir, { recursive: true });
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const pages = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pageId = entry.name;
      // eslint-disable-next-line no-await-in-loop
      const meta = await readPageCommentMeta(userId, pageId);
      if (meta) {
        pages.push({
          id: meta.id || pageId,
          url: meta.url || '',
          title: meta.title || meta.url || 'Untitled page',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || meta.createdAt || null,
          commentCount: Array.isArray(meta.comments) ? meta.comments.length : 0,
          lastFetchedAt: meta.lastFetchedAt || meta.createdAt || null,
        });
      }
    }
    return pages.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list page commenter pages');
    return [];
  }
}

async function loadPageCommentPage(userId, pageId) {
  const meta = await readPageCommentMeta(userId, pageId);
  if (!meta) return null;
  try {
    const html = await fsp.readFile(getPageCommentHtmlPath(userId, pageId), 'utf8');
    return { page: meta, html };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error({ err: err.message }, 'Failed to load page commenter HTML');
    }
    return { page: meta, html: '' };
  }
}

async function removePageCommentPage(userId, pageId) {
  const dir = getPageCommentPageDir(userId, pageId);
  // Retry briefly on transient Windows EBUSY/EPERM (file lock from a recent
  // read that hasn't released yet).
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fsp.rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastErr = err;
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err.code)) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  if (lastErr) {
    logger.error({ err: lastErr.message, userId, pageId }, 'Failed to delete page commenter folder');
  }
}

module.exports = {
  PAGE_COMMENT_ROOT,
  generatePageCommentId,
  normalizeComment,
  readPageCommentMeta,
  writePageCommentMeta,
  writePageCommentHtml,
  listPageCommentPages,
  loadPageCommentPage,
  removePageCommentPage,
};
