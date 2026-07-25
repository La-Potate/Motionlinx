'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { dbAll, dbGet, dbRun } = require('../utils/dbAsync');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { getSystemApiKey } = require('../storage/systemSettings');
const { JWT_SECRET } = require('../config/env');
const ga4 = require('../services/ga4');

const router = express.Router();

// State JWT used during the OAuth round-trip. We sign with the same JWT_SECRET
// the rest of the app uses so we don't need to manage a second key. The state
// carries the user id (so the callback can attribute tokens correctly without
// trusting query params) and a nonce to make replay obvious.
const STATE_TTL_SECONDS = 10 * 60;
const STATE_AUDIENCE = 'ga4-oauth';

function signState(userId) {
  const payload = {
    uid: userId,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  return jwt.sign(payload, JWT_SECRET || 'dev-secret', {
    audience: STATE_AUDIENCE,
    expiresIn: STATE_TTL_SECONDS,
  });
}

function verifyState(state) {
  try {
    return jwt.verify(state, JWT_SECRET || 'dev-secret', { audience: STATE_AUDIENCE });
  } catch {
    return null;
  }
}

// ---- Token storage helpers ----------------------------------------------
// Stored in user_settings under these keys. The two token strings are
// encrypted at rest when MASTER_KEY is configured; the expiry timestamp and
// email are plaintext (no value in encrypting them).
const KEYS = {
  access: 'ga4_access_token',
  refresh: 'ga4_refresh_token',
  expires: 'ga4_expires_at',
  email: 'ga4_google_email',
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

async function deleteUserSettings(userId, keys) {
  if (!keys.length) return;
  const placeholders = keys.map(() => '?').join(',');
  await dbRun(
    `DELETE FROM user_settings WHERE user_id = ? AND setting_key IN (${placeholders})`,
    [userId, ...keys],
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
  await deleteUserSettings(userId, Object.values(KEYS));
}

// ---- OAuth client config -------------------------------------------------
function readOauthClientConfig() {
  const clientId = getSystemApiKey('googleOauthClientId') || '';
  const clientSecret = getSystemApiKey('googleOauthClientSecret') || '';
  return { clientId, clientSecret };
}

function resolveRedirectUri(req) {
  // Build the redirect URI from the request itself so a single deployment
  // works across localhost dev (http://localhost:3000) and production
  // (https://...) without operator config drift.
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/ga4/auth/callback`;
}

function clientReturnUrl(req, params) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const qs = new URLSearchParams(params).toString();
  return `${proto}://${host}/ai-traffic-report${qs ? `?${qs}` : ''}`;
}

// Returns a usable access token, refreshing if necessary. Throws when the
// user is not connected, or when refresh fails (caller should report the
// user as "reauth_required").
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
    const refreshed = await ga4.refreshAccessToken({
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
    });
    await saveTokens(userId, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    });
    return refreshed.accessToken;
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'GA4 token refresh failed');
    const e = new Error('reauth_required');
    e.code = 'reauth_required';
    throw e;
  }
}

// ---- Routes -------------------------------------------------------------

// Public — Google redirects here with ?code & ?state after the user grants
// access. We attribute the tokens to the user via the signed state JWT.
router.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error) {
    return res.redirect(clientReturnUrl(req, { ga4_error: String(error) }));
  }
  if (!code || !state) {
    return res.redirect(clientReturnUrl(req, { ga4_error: 'missing_params' }));
  }
  const payload = verifyState(String(state));
  if (!payload || !payload.uid) {
    return res.redirect(clientReturnUrl(req, { ga4_error: 'invalid_state' }));
  }
  const { clientId, clientSecret } = readOauthClientConfig();
  if (!clientId || !clientSecret) {
    return res.redirect(clientReturnUrl(req, { ga4_error: 'oauth_not_configured' }));
  }
  try {
    const tokens = await ga4.exchangeCodeForTokens({
      code: String(code),
      clientId,
      clientSecret,
      redirectUri: resolveRedirectUri(req),
    });
    let email = '';
    try {
      const info = await ga4.fetchUserInfo(tokens.accessToken);
      if (info?.email) email = info.email;
    } catch (_) {
      /* non-fatal */
    }
    await saveTokens(payload.uid, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      email,
    });
    return res.redirect(clientReturnUrl(req, { ga4_connected: '1' }));
  } catch (err) {
    logger.error({ err: err.message, uid: payload.uid }, 'GA4 OAuth callback failed');
    return res.redirect(clientReturnUrl(req, { ga4_error: 'exchange_failed' }));
  }
});

// All other routes require a JWT — the regular app auth.
router.use(authenticate);

// Returns the authorize URL for the client to open in a new tab / current
// window. We build the URL here so we can sign state with the user's id.
router.post('/auth/start', async (req, res) => {
  const { clientId, clientSecret } = readOauthClientConfig();
  if (!clientId || !clientSecret) {
    return res
      .status(412)
      .json({ error: 'oauth_not_configured', message: 'Admin must configure the Google OAuth client first.' });
  }
  const state = signState(req.user.id);
  const url = ga4.buildAuthorizeUrl({
    clientId,
    redirectUri: resolveRedirectUri(req),
    state,
  });
  res.json({ url });
});

router.post('/disconnect', async (req, res) => {
  try {
    const tokens = await loadTokens(req.user.id);
    // Best-effort revoke at Google (we keep going on failure so the user can
    // still wipe their local state).
    if (tokens.refreshToken) await ga4.revokeToken(tokens.refreshToken);
    else if (tokens.accessToken) await ga4.revokeToken(tokens.accessToken);
    await clearTokens(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, 'GA4 disconnect failed');
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

router.get('/properties', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken(req.user.id);
    const properties = await ga4.listProperties(accessToken);
    res.json({ properties });
  } catch (err) {
    if (err.code === 'not_connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    if (err.code === 'reauth_required') {
      return res.status(401).json({ error: 'reauth_required' });
    }
    if (err.code === 'oauth_not_configured') {
      return res.status(412).json({ error: 'oauth_not_configured' });
    }
    logger.error({ err: err.message }, 'GA4 list properties failed');
    res.status(502).json({ error: 'ga4_error', message: err.message });
  }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/report', async (req, res) => {
  const propertyId = String(req.query.propertyId || '');
  const startDate = String(req.query.startDate || '');
  const endDate = String(req.query.endDate || '');
  if (!/^\d+$/.test(propertyId)) {
    return res.status(400).json({ error: 'invalid_property' });
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return res.status(400).json({ error: 'invalid_date_range' });
  }
  try {
    const accessToken = await getValidAccessToken(req.user.id);
    const report = await ga4.queryAiTraffic({ accessToken, propertyId, startDate, endDate });
    res.json(report);
  } catch (err) {
    if (err.code === 'not_connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    if (err.code === 'reauth_required') {
      return res.status(401).json({ error: 'reauth_required' });
    }
    if (err.code === 'oauth_not_configured') {
      return res.status(412).json({ error: 'oauth_not_configured' });
    }
    logger.error({ err: err.message }, 'GA4 report failed');
    res.status(502).json({ error: 'ga4_error', message: err.message });
  }
});

module.exports = router;
