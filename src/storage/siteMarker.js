'use strict';

const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ensureDir, USERDATA_ROOT } = require('./paths');

const SITE_MARKER_ROOT = path.join(USERDATA_ROOT, 'site-markers');
const LEGACY_SITE_MARKER_ROOT = path.join(USERDATA_ROOT, 'Site Marker Data');
// One-time rename of the legacy spaced directory to the kebab-case name.
try {
  // eslint-disable-next-line no-restricted-syntax
  const fs = require('fs');
  if (fs.existsSync(LEGACY_SITE_MARKER_ROOT) && !fs.existsSync(SITE_MARKER_ROOT)) {
    fs.renameSync(LEGACY_SITE_MARKER_ROOT, SITE_MARKER_ROOT);
    logger.info('Renamed legacy "Site Marker Data" → site-markers');
  }
} catch (err) {
  logger.warn({ err: err.message }, 'Could not rename legacy site-markers dir');
}
ensureDir(SITE_MARKER_ROOT);

// O(1) share-token lookup. Maps shareToken → { userId, pageId, createdAt }.
// Replaces the original O(n*m) walk that scanned every user's directory tree
// for every shared-page request.
const SHARE_INDEX_PATH = path.join(SITE_MARKER_ROOT, 'share-index.json');

async function readShareIndex() {
  try {
    const raw = await fsp.readFile(SHARE_INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    logger.warn({ err: err.message }, 'Failed to read site-marker share index — rebuilding');
    return rebuildShareIndex();
  }
}

async function writeShareIndex(index) {
  try {
    await fsp.writeFile(SHARE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to write site-marker share index');
  }
}

/**
 * Walk every user/page once and rebuild the share-index. Called lazily when
 * the index is missing/corrupt, so users upgrading from the old (O(n) walk)
 * codebase get a free index on first hit.
 */
async function rebuildShareIndex() {
  const index = {};
  try {
    let userEntries;
    try {
      userEntries = await fsp.readdir(SITE_MARKER_ROOT, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return index;
      throw err;
    }
    for (const userEntry of userEntries) {
      if (!userEntry.isDirectory()) continue;
      const userId = userEntry.name;
      const userDir = path.join(SITE_MARKER_ROOT, userId);
      let pageEntries;
      try {
        // eslint-disable-next-line no-await-in-loop
        pageEntries = await fsp.readdir(userDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const pageEntry of pageEntries) {
        if (!pageEntry.isDirectory()) continue;
        const pageId = pageEntry.name;
        // eslint-disable-next-line no-await-in-loop
        const meta = await readSiteMarkerMeta(userId, pageId);
        if (meta?.shareToken) {
          index[meta.shareToken] = {
            userId,
            pageId,
            createdAt: meta.shareCreatedAt || meta.updatedAt || meta.createdAt || null,
          };
        }
      }
    }
    await writeShareIndex(index);
  } catch (err) {
    logger.warn({ err: err.message }, 'Share-index rebuild failed');
  }
  return index;
}

async function setShareToken(userId, pageId, shareToken) {
  const index = await readShareIndex();
  // Remove any previous token for this page (revocation case).
  for (const [token, ref] of Object.entries(index)) {
    if (String(ref.userId) === String(userId) && String(ref.pageId) === String(pageId)) {
      delete index[token];
    }
  }
  if (shareToken) {
    index[shareToken] = {
      userId: String(userId),
      pageId: String(pageId),
      createdAt: new Date().toISOString(),
    };
  }
  await writeShareIndex(index);
}

async function removeShareToken(shareToken) {
  if (!shareToken) return;
  const index = await readShareIndex();
  if (index[shareToken]) {
    delete index[shareToken];
    await writeShareIndex(index);
  }
}

function generateSiteMarkerId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(12).toString('hex');
}

function generateShareToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getSiteMarkerUserDir(userId) {
  return path.join(SITE_MARKER_ROOT, String(userId));
}
function getSiteMarkerPageDir(userId, pageId) {
  return path.join(getSiteMarkerUserDir(userId), String(pageId));
}
function getSiteMarkerMetaPath(userId, pageId) {
  return path.join(getSiteMarkerPageDir(userId, pageId), 'page.json');
}
function getSiteMarkerHtmlPath(userId, pageId) {
  return path.join(getSiteMarkerPageDir(userId, pageId), 'page.html');
}

async function ensureSiteMarkerDirs(userId, pageId = null) {
  await fsp.mkdir(getSiteMarkerUserDir(userId), { recursive: true });
  if (pageId) await fsp.mkdir(getSiteMarkerPageDir(userId, pageId), { recursive: true });
}

function normalizeMarker(marker = {}) {
  const safeId =
    typeof marker.id === 'string' && marker.id.trim().length
      ? marker.id.trim()
      : generateSiteMarkerId();
  const safeText = typeof marker.text === 'string' ? marker.text.trim() : '';
  const safeX = Math.min(Math.max(Number(marker.x) || 0, 0), 1);
  const safeY = Math.min(Math.max(Number(marker.y) || 0, 0), 1);
  const now = new Date().toISOString();
  return {
    id: safeId,
    text: safeText,
    x: Number(safeX.toFixed(4)),
    y: Number(safeY.toFixed(4)),
    createdAt: marker.createdAt || now,
    updatedAt: now,
  };
}

async function readSiteMarkerMeta(userId, pageId) {
  try {
    const metaPath = getSiteMarkerMetaPath(userId, pageId);
    const raw = await fsp.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.markers = Array.isArray(parsed.markers) ? parsed.markers : [];
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    logger.error({ err: err.message }, 'Failed to read site marker meta');
    return null;
  }
}

async function writeSiteMarkerMeta(userId, pageId, page) {
  await ensureSiteMarkerDirs(userId, pageId);
  const metaPath = getSiteMarkerMetaPath(userId, pageId);
  const next = { ...page };
  await fsp.writeFile(metaPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function writeSiteMarkerHtml(userId, pageId, html = '') {
  await ensureSiteMarkerDirs(userId, pageId);
  await fsp.writeFile(getSiteMarkerHtmlPath(userId, pageId), html || '', 'utf8');
}

async function listSiteMarkerPages(userId) {
  try {
    const dir = getSiteMarkerUserDir(userId);
    await fsp.mkdir(dir, { recursive: true });
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const pages = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // eslint-disable-next-line no-await-in-loop
      const meta = await readSiteMarkerMeta(userId, entry.name);
      if (meta) {
        pages.push({
          id: meta.id || entry.name,
          url: meta.url || '',
          title: meta.title || meta.url || 'Untitled page',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || meta.createdAt || null,
          markerCount: Array.isArray(meta.markers) ? meta.markers.length : 0,
          shareToken: meta.shareToken || null,
        });
      }
    }
    return pages.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list site marker pages');
    return [];
  }
}

async function loadSiteMarkerPage(userId, pageId) {
  const meta = await readSiteMarkerMeta(userId, pageId);
  if (!meta) return null;
  try {
    const html = await fsp.readFile(getSiteMarkerHtmlPath(userId, pageId), 'utf8');
    return { page: meta, html };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error({ err: err.message }, 'Failed to load site marker HTML');
    }
    return { page: meta, html: '' };
  }
}

/**
 * Delete a marker page. Two-step: remove the files FIRST, then revoke the
 * share token. If file removal fails, the share token stays valid but the
 * next `findSiteMarkerByShareToken` lookup will detect the missing meta and
 * prune the stale token via `removeShareToken`. The previous order (revoke
 * first) could leave orphan files visible in `listSiteMarkerPages` if the
 * fsp.rm threw after the token was already gone.
 */
async function removeSiteMarkerPage(userId, pageId) {
  const meta = await readSiteMarkerMeta(userId, pageId);

  // 1. Remove files. Retry briefly on transient Windows EBUSY/EPERM.
  const dir = getSiteMarkerPageDir(userId, pageId);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fsp.rm(dir, { recursive: true, force: true });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(err.code)) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  if (lastErr) {
    logger.error({ err: lastErr.message, userId, pageId }, 'Failed to delete site marker folder');
    // Continue to revoke the share token anyway — page is half-gone, the share
    // link must not keep working.
  }

  // 2. Revoke share token if present.
  if (meta?.shareToken) await removeShareToken(meta.shareToken);
}

/**
 * O(1) lookup by share token. Falls back to rebuilding the index on miss
 * (covers upgrades from the legacy walk-everything codebase).
 */
async function findSiteMarkerByShareToken(shareToken) {
  if (!shareToken) return null;

  let index = await readShareIndex();
  let ref = index[shareToken];

  if (!ref) {
    // Could be a legacy share whose meta exists but isn't in the index yet.
    index = await rebuildShareIndex();
    ref = index[shareToken];
    if (!ref) return null;
  }

  const meta = await readSiteMarkerMeta(ref.userId, ref.pageId);
  if (!meta || meta.shareToken !== shareToken) {
    // Index is stale — clean it up.
    await removeShareToken(shareToken);
    return null;
  }
  let html = '';
  try {
    html = await fsp.readFile(getSiteMarkerHtmlPath(ref.userId, ref.pageId), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error({ err: err.message }, 'Failed to load shared site marker HTML');
    }
  }
  return { page: meta, html, userId: ref.userId };
}

module.exports = {
  SITE_MARKER_ROOT,
  generateSiteMarkerId,
  generateShareToken,
  normalizeMarker,
  readSiteMarkerMeta,
  writeSiteMarkerMeta,
  writeSiteMarkerHtml,
  listSiteMarkerPages,
  loadSiteMarkerPage,
  removeSiteMarkerPage,
  findSiteMarkerByShareToken,
  setShareToken,
  removeShareToken,
  rebuildShareIndex,
};
