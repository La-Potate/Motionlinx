'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { dbAll, dbRun } = require('../utils/dbAsync');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { getSystemApiKey } = require('../storage/systemSettings');
const { JWT_SECRET } = require('../config/env');
const gsc = require('../services/gsc');

const router = express.Router();

// State JWT (signed with JWT_SECRET, aud=gsc-oauth) attributes the OAuth
// callback to a user without trusting query params.
const STATE_TTL_SECONDS = 10 * 60;
const STATE_AUDIENCE = 'gsc-oauth';

function signState(userId) {
  return jwt.sign(
    { uid: userId, nonce: crypto.randomBytes(8).toString('hex') },
    JWT_SECRET || 'dev-secret',
    { audience: STATE_AUDIENCE, expiresIn: STATE_TTL_SECONDS },
  );
}

function verifyState(state) {
  try {
    return jwt.verify(state, JWT_SECRET || 'dev-secret', { audience: STATE_AUDIENCE });
  } catch {
    return null;
  }
}

// ---- Token storage ------------------------------------------------------
const KEYS = {
  access: 'gsc_access_token',
  refresh: 'gsc_refresh_token',
  expires: 'gsc_expires_at',
  email: 'gsc_google_email',
};

async function upsertUserSetting(userId, key, value, encrypted) {
  const stored = value && encrypted ? encryptSecret(value) : value;
  await dbRun(
    `INSERT INTO user_settings (user_id, setting_key, setting_value, created_at, updated_at)
     VALUES (?, ?, ?, COALESCE(
       (SELECT created_at FROM user_settings WHERE user_id = ? AND setting_key = ?),
       CURRENT_TIMESTAMP
     ), CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [userId, key, stored, userId, key],
  );
}

async function loadTokens(userId) {
  const rows = await dbAll(
    `SELECT setting_key, setting_value FROM user_settings
     WHERE user_id = ? AND setting_key IN (?, ?, ?, ?)`,
    [userId, KEYS.access, KEYS.refresh, KEYS.expires, KEYS.email],
  );
  const out = {};
  rows.forEach((row) => {
    out[row.setting_key] = row.setting_value || '';
  });
  return {
    accessToken: out[KEYS.access] ? decryptSecret(out[KEYS.access]) || '' : '',
    refreshToken: out[KEYS.refresh] ? decryptSecret(out[KEYS.refresh]) || '' : '',
    expiresAt: out[KEYS.expires] ? Number(out[KEYS.expires]) : 0,
    email: out[KEYS.email] || '',
  };
}

async function saveTokens(userId, { accessToken, refreshToken, expiresAt, email }) {
  if (accessToken) await upsertUserSetting(userId, KEYS.access, accessToken, true);
  if (refreshToken) await upsertUserSetting(userId, KEYS.refresh, refreshToken, true);
  if (expiresAt) await upsertUserSetting(userId, KEYS.expires, String(expiresAt), false);
  if (email) await upsertUserSetting(userId, KEYS.email, email, false);
}

async function clearTokens(userId) {
  await dbRun(
    `DELETE FROM user_settings WHERE user_id = ? AND setting_key IN (?, ?, ?, ?)`,
    [userId, KEYS.access, KEYS.refresh, KEYS.expires, KEYS.email],
  );
  await dbRun(`DELETE FROM gsc_properties WHERE user_id = ?`, [userId]);
}

function readOauthClientConfig() {
  return {
    clientId: getSystemApiKey('googleOauthClientId') || '',
    clientSecret: getSystemApiKey('googleOauthClientSecret') || '',
  };
}

function resolveRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/gsc/auth/callback`;
}

function clientReturnUrl(req, params) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const qs = new URLSearchParams(params).toString();
  return `${proto}://${host}/AI-Assistant${qs ? `?${qs}` : ''}`;
}

async function getValidAccessToken(userId) {
  const tokens = await loadTokens(userId);
  if (!tokens.accessToken && !tokens.refreshToken) {
    const err = new Error('not_connected');
    err.code = 'not_connected';
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);
  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt - now > 60) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    const err = new Error('reauth_required');
    err.code = 'reauth_required';
    throw err;
  }
  const { clientId, clientSecret } = readOauthClientConfig();
  if (!clientId || !clientSecret) {
    const err = new Error('oauth_not_configured');
    err.code = 'oauth_not_configured';
    throw err;
  }
  try {
    const refreshed = await gsc.refreshAccessToken({ refreshToken: tokens.refreshToken, clientId, clientSecret });
    await saveTokens(userId, refreshed);
    return refreshed.accessToken;
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'GSC token refresh failed');
    const e = new Error('reauth_required');
    e.code = 'reauth_required';
    throw e;
  }
}

// ---- Routes -------------------------------------------------------------

router.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error) return res.redirect(clientReturnUrl(req, { gsc_error: String(error) }));
  if (!code || !state) return res.redirect(clientReturnUrl(req, { gsc_error: 'missing_params' }));
  const payload = verifyState(String(state));
  if (!payload || !payload.uid) return res.redirect(clientReturnUrl(req, { gsc_error: 'invalid_state' }));
  const { clientId, clientSecret } = readOauthClientConfig();
  if (!clientId || !clientSecret) return res.redirect(clientReturnUrl(req, { gsc_error: 'oauth_not_configured' }));
  try {
    const tokens = await gsc.exchangeCodeForTokens({
      code: String(code),
      clientId,
      clientSecret,
      redirectUri: resolveRedirectUri(req),
    });
    let email = '';
    try {
      const info = await gsc.fetchUserInfo(tokens.accessToken);
      if (info?.email) email = info.email;
    } catch (_) {
      /* best-effort */
    }
    await saveTokens(payload.uid, { ...tokens, email });
    return res.redirect(clientReturnUrl(req, { gsc_connected: '1' }));
  } catch (err) {
    logger.error({ err: err.message, uid: payload.uid }, 'GSC OAuth callback failed');
    return res.redirect(clientReturnUrl(req, { gsc_error: 'exchange_failed' }));
  }
});

router.use(authenticate);

router.post('/auth/start', async (req, res) => {
  const { clientId, clientSecret } = readOauthClientConfig();
  if (!clientId || !clientSecret) {
    return res
      .status(412)
      .json({ error: 'oauth_not_configured', message: 'Admin must configure the Google OAuth client first.' });
  }
  const state = signState(req.user.id);
  const url = gsc.buildAuthorizeUrl({
    clientId,
    redirectUri: resolveRedirectUri(req),
    state,
  });
  res.json({ url });
});

router.post('/disconnect', async (req, res) => {
  try {
    const tokens = await loadTokens(req.user.id);
    if (tokens.refreshToken) await gsc.revokeToken(tokens.refreshToken);
    else if (tokens.accessToken) await gsc.revokeToken(tokens.accessToken);
    await clearTokens(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'GSC disconnect failed');
    res.status(500).json({ error: 'disconnect_failed' });
  }
});

router.get('/status', async (req, res) => {
  const { clientId, clientSecret } = readOauthClientConfig();
  const tokens = await loadTokens(req.user.id);
  res.json({
    oauthConfigured: Boolean(clientId && clientSecret),
    connected: Boolean(tokens.accessToken || tokens.refreshToken),
    email: tokens.email || null,
  });
});

// Cached property list. ?refresh=1 forces a fresh sites.list call.
router.get('/sites', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  try {
    const userId = req.user.id;
    const cacheStale = await isPropertyCacheStale(userId);
    if (forceRefresh || cacheStale) {
      const accessToken = await getValidAccessToken(userId);
      const sites = await gsc.listSites({ accessToken, userId });
      await syncPropertyCache(userId, sites);
    }
    const rows = await dbAll(
      `SELECT site_url AS siteUrl, permission_level AS permissionLevel, verified, last_synced_at AS lastSyncedAt
       FROM gsc_properties WHERE user_id = ? ORDER BY site_url ASC`,
      [userId],
    );
    res.json({ properties: rows });
  } catch (err) {
    if (err.code === 'not_connected') return res.status(401).json({ error: 'not_connected' });
    if (err.code === 'reauth_required') return res.status(401).json({ error: 'reauth_required' });
    if (err.code === 'oauth_not_configured') return res.status(412).json({ error: 'oauth_not_configured' });
    logger.error({ err: err.message }, 'GSC list sites failed');
    res.status(502).json({ error: 'gsc_error', message: err.message });
  }
});

const PROPERTY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
async function isPropertyCacheStale(userId) {
  const row = await dbAll(
    `SELECT last_synced_at FROM gsc_properties WHERE user_id = ? ORDER BY last_synced_at DESC LIMIT 1`,
    [userId],
  );
  if (!row.length) return true;
  const last = new Date(row[0].last_synced_at).getTime();
  return Date.now() - last > PROPERTY_CACHE_TTL_MS;
}

async function syncPropertyCache(userId, sites) {
  await dbRun('BEGIN');
  try {
    await dbRun('DELETE FROM gsc_properties WHERE user_id = ?', [userId]);
    for (const s of sites) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        `INSERT INTO gsc_properties (user_id, site_url, permission_level, verified, last_synced_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, s.siteUrl, s.permissionLevel || '', s.verified ? 1 : 0],
      );
    }
    await dbRun('COMMIT');
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

module.exports = router;
module.exports.getValidAccessToken = getValidAccessToken;
module.exports.loadTokens = loadTokens;
