'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const { resolveClientIp, maskApiKey } = require('../utils/http');
const {
  readUserSettingsFromDisk,
  writeUserSettingsToDisk,
} = require('../storage/userSettings');
const {
  readSystemSettings,
  writeSystemSettings,
  getDefaultSystemSettings,
} = require('../storage/systemSettings');
const { CLAUDE_API_KEY } = require('../config/env');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { getApiUsageSnapshot } = require('../services/apiQuota');

// Setting keys whose values are secrets — encrypted at rest when MASTER_KEY
// is configured. Read sites are responsible for decrypting on the way out.
const SECRET_SETTING_KEYS = new Set([
  'googlePlaces_api_key',
  'google_api_key',
  'google_cx',
  'dataForSeo_login',
  'dataForSeo_password',
  'dataForSeo_api_key',
  'serper_api_key',
  'claude_api_key',
]);

const router = express.Router();
router.use(authenticate);

// ---- /ip ----
router.get('/ip', (req, res) => {
  try {
    res.json({ ip: resolveClientIp(req) });
  } catch (err) {
    logger.error({ err }, 'Failed to detect IP');
    res.status(500).json({ error: 'Failed to detect IP' });
  }
});

// ---- /prompts (admin only) ----
router.get('/prompts', requireAdmin, (req, res) => {
  try {
    const settings = readSystemSettings();
    const prompts = settings.prompts || getDefaultSystemSettings().prompts;
    res.json({ prompts });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch prompts');
    res.status(500).json({ error: 'Failed to fetch prompts.' });
  }
});

router.post('/prompts', requireAdmin, (req, res) => {
  try {
    const { blogPost } = req.body || {};
    const updates = {};
    if (typeof blogPost === 'string' && blogPost.trim()) {
      updates.blogPost = blogPost.trim();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid prompts provided.' });
    }
    const current = readSystemSettings();
    const currentPrompts = current.prompts || {};
    writeSystemSettings({ prompts: { ...currentPrompts, ...updates } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to save prompts');
    res.status(500).json({ error: 'Failed to save prompts.' });
  }
});

// ---- /api-keys (POST = save; GET = read) ----
const USER_SETTING_KEYS = [
  'googlePlaces_api_key',
  'google_api_key',
  'google_cx',
  'dataForSeo_login',
  'dataForSeo_password',
  'dataForSeo_api_key',
  'serper_api_key',
];

async function upsertUserSetting(userId, key, value) {
  // Encrypt secret values at rest. Non-secret keys pass through unchanged.
  const storedValue =
    value && SECRET_SETTING_KEYS.has(key) ? encryptSecret(value) : value;
  await dbRun(
    `INSERT INTO user_settings (user_id, setting_key, setting_value, created_at, updated_at)
     VALUES (?, ?, ?, COALESCE(
       (SELECT created_at FROM user_settings WHERE user_id = ? AND setting_key = ?),
       CURRENT_TIMESTAMP
     ), CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [userId, key, storedValue, userId, key],
  );
}

router.post('/api-keys', requireAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body || {};
    const userUpdates = [];
    const diskPayload = { apiKeys: {} };

    const assignUserSetting = (key, value, diskKey) => {
      const sanitized = typeof value === 'string' ? value.trim() : '';
      userUpdates.push({ key, value: sanitized });
      if (diskKey) diskPayload.apiKeys[diskKey] = sanitized;
      return sanitized;
    };

    if (Object.hasOwn(payload, 'googlePlaces'))
      assignUserSetting('googlePlaces_api_key', payload.googlePlaces, 'googlePlaces');
    if (Object.hasOwn(payload, 'googleApiKey'))
      assignUserSetting('google_api_key', payload.googleApiKey, 'googleApiKey');
    if (Object.hasOwn(payload, 'googleCx'))
      assignUserSetting('google_cx', payload.googleCx, 'googleCx');

    let dataForSeoLogin = null;
    let dataForSeoPassword = null;
    if (Object.hasOwn(payload, 'dataForSeoLogin')) {
      dataForSeoLogin = assignUserSetting(
        'dataForSeo_login',
        payload.dataForSeoLogin,
        'dataForSeoLogin',
      );
    }
    if (Object.hasOwn(payload, 'dataForSeoPassword')) {
      dataForSeoPassword = assignUserSetting(
        'dataForSeo_password',
        payload.dataForSeoPassword,
        'dataForSeoPassword',
      );
    }
    if (dataForSeoLogin !== null || dataForSeoPassword !== null) {
      const legacyValue = [dataForSeoLogin || '', dataForSeoPassword || '']
        .filter((p) => p && p.length)
        .join(':');
      assignUserSetting('dataForSeo_api_key', legacyValue, 'dataForSeo');
    }

    const systemPayload = { apiKeys: {} };
    if (Object.hasOwn(payload, 'serperApiKey')) {
      const v = assignUserSetting('serper_api_key', payload.serperApiKey, 'serper');
      systemPayload.apiKeys.serper = v;
    }
    if (Object.hasOwn(payload, 'claudeApiKey')) {
      const v = assignUserSetting('claude_api_key', payload.claudeApiKey, 'claude');
      systemPayload.apiKeys.claude = v;
    }
    if (Object.hasOwn(payload, 'googleOauthClientId')) {
      const v = typeof payload.googleOauthClientId === 'string' ? payload.googleOauthClientId.trim() : '';
      systemPayload.apiKeys.googleOauthClientId = v;
    }
    if (Object.hasOwn(payload, 'googleOauthClientSecret')) {
      const v = typeof payload.googleOauthClientSecret === 'string' ? payload.googleOauthClientSecret.trim() : '';
      systemPayload.apiKeys.googleOauthClientSecret = v;
    }

    if (!userUpdates.length && !Object.keys(systemPayload.apiKeys).length) {
      return res.status(400).json({ error: 'No API keys provided.' });
    }

    for (const { key, value } of userUpdates) {
      // eslint-disable-next-line no-await-in-loop
      await upsertUserSetting(userId, key, value);
    }
    writeUserSettingsToDisk(userId, diskPayload);

    if (Object.keys(systemPayload.apiKeys).length > 0) {
      writeSystemSettings(systemPayload);
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'API keys save error');
    res.status(500).json({ error: 'Failed to save API keys' });
  }
});

router.get('/api-keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const userRows = await dbAll(
      `SELECT setting_key, setting_value FROM user_settings
       WHERE user_id = ? AND setting_key IN (${USER_SETTING_KEYS.map(() => '?').join(',')})`,
      [userId, ...USER_SETTING_KEYS],
    );
    const userKeys = {};
    userRows.forEach((row) => {
      const raw = row.setting_value || '';
      userKeys[row.setting_key] = SECRET_SETTING_KEYS.has(row.setting_key)
        ? decryptSecret(raw) || ''
        : raw;
    });

    const diskSettings = readUserSettingsFromDisk(userId);
    const userSerperBackup = userKeys.serper_api_key || diskSettings?.apiKeys?.serper || '';
    const userClaudeBackup = userKeys.claude_api_key || diskSettings?.apiKeys?.claude || '';
    const googleKey =
      userKeys.googlePlaces_api_key ||
      userKeys.google_api_key ||
      diskSettings?.apiKeys?.googlePlaces ||
      diskSettings?.apiKeys?.googleApiKey ||
      '';

    const adminRows = await dbAll(
      `SELECT us.setting_key, us.setting_value
       FROM user_settings us
       JOIN users u ON us.user_id = u.id
       WHERE u.role = 'admin' AND us.setting_key IN ('googlePlaces_api_key', 'google_api_key', 'google_cx')
       ORDER BY u.id ASC`,
    );
    const adminKeys = {};
    adminRows.forEach((row) => {
      const raw = row.setting_value || '';
      adminKeys[row.setting_key] = SECRET_SETTING_KEYS.has(row.setting_key)
        ? decryptSecret(raw) || ''
        : raw;
    });

    const response = {
      managed: true,
      isAdmin,
      googlePlaces: googleKey || adminKeys.googlePlaces_api_key || adminKeys.google_api_key || '',
      googleApiKey: googleKey || adminKeys.googlePlaces_api_key || adminKeys.google_api_key || '',
      googleCx: userKeys.google_cx || diskSettings?.apiKeys?.googleCx || adminKeys.google_cx || '',
      dataForSeoLogin: isAdmin
        ? userKeys.dataForSeo_login || diskSettings?.apiKeys?.dataForSeoLogin || ''
        : '',
      dataForSeoPassword: isAdmin
        ? userKeys.dataForSeo_password || diskSettings?.apiKeys?.dataForSeoPassword || ''
        : '',
    };

    const legacyDataForSeo =
      userKeys.dataForSeo_api_key ||
      diskSettings?.apiKeys?.dataForSeo ||
      [response.dataForSeoLogin, response.dataForSeoPassword].filter((p) => p).join(':');
    response.dataForSeo = isAdmin ? legacyDataForSeo : '';
    response.dataForSeoManaged = Boolean(legacyDataForSeo);

    const systemSettings = readSystemSettings();
    const apiKeys =
      systemSettings.apiKeys && typeof systemSettings.apiKeys === 'object'
        ? systemSettings.apiKeys
        : {};

    // Serper: sync system <-> user backup
    let serperKey = apiKeys.serper || '';
    if (isAdmin && serperKey && !userSerperBackup) {
      await upsertUserSetting(userId, 'serper_api_key', serperKey);
      writeUserSettingsToDisk(userId, { apiKeys: { serper: serperKey } });
    }
    if (!serperKey && isAdmin && userSerperBackup) {
      serperKey = userSerperBackup;
      writeSystemSettings({ apiKeys: { serper: serperKey } });
    }
    response.serperStatus = {
      configured: Boolean(serperKey),
      masked: serperKey ? maskApiKey(serperKey) : '',
    };
    response.serperApiKey = isAdmin ? serperKey : '';

    // Claude: same pattern
    let claudeKey = apiKeys.claude || CLAUDE_API_KEY || '';
    if (isAdmin && claudeKey && !userClaudeBackup) {
      await upsertUserSetting(userId, 'claude_api_key', claudeKey);
      writeUserSettingsToDisk(userId, { apiKeys: { claude: claudeKey } });
    }
    if (!claudeKey && isAdmin && userClaudeBackup) {
      claudeKey = userClaudeBackup;
      writeSystemSettings({ apiKeys: { claude: claudeKey } });
    }
    response.claudeStatus = {
      configured: Boolean(claudeKey),
      masked: isAdmin && claudeKey ? maskApiKey(claudeKey) : '',
    };
    response.claudeApiKey = isAdmin ? claudeKey : '';

    response.quotas = {
      serperReviews: await getApiUsageSnapshot(userId, 'serper_reviews'),
    };

    // GA4 OAuth — admin-only client credentials, plus the current user's
    // connection state so the same panel can show "Connect / Disconnect"
    // alongside the rest of the API settings.
    const googleOauthClientId = apiKeys.googleOauthClientId || '';
    const googleOauthClientSecret = apiKeys.googleOauthClientSecret || '';
    response.googleOauthClientId = isAdmin ? googleOauthClientId : '';
    response.googleOauthClientSecret = isAdmin ? googleOauthClientSecret : '';
    response.googleOauthStatus = {
      configured: Boolean(googleOauthClientId && googleOauthClientSecret),
      clientIdMasked: googleOauthClientId ? maskApiKey(googleOauthClientId) : '',
    };

    const ga4Rows = await dbAll(
      `SELECT setting_key, setting_value FROM user_settings
       WHERE user_id = ? AND setting_key IN ('ga4_access_token', 'ga4_refresh_token', 'ga4_google_email')`,
      [userId],
    );
    const ga4Map = {};
    ga4Rows.forEach((row) => {
      ga4Map[row.setting_key] = row.setting_value || '';
    });
    response.ga4Status = {
      connected: Boolean(ga4Map.ga4_access_token || ga4Map.ga4_refresh_token),
      email: ga4Map.ga4_google_email || null,
    };

    const gscRows = await dbAll(
      `SELECT setting_key, setting_value FROM user_settings
       WHERE user_id = ? AND setting_key IN ('gsc_access_token', 'gsc_refresh_token', 'gsc_google_email')`,
      [userId],
    );
    const gscMap = {};
    gscRows.forEach((row) => {
      gscMap[row.setting_key] = row.setting_value || '';
    });
    response.gscStatus = {
      connected: Boolean(gscMap.gsc_access_token || gscMap.gsc_refresh_token),
      email: gscMap.gsc_google_email || null,
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'API keys fetch error');
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

module.exports = router;
