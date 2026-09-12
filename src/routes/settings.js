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
const { getKeyStatuses, resolveApiKey } = require('../services/apiKeys');
const {
  testSerper,
  testClaude,
  testDataForSeo,
  testGooglePlaces,
  testGoogleSearch,
} = require('../services/apiKeyTest');
const { tieredRateLimit } = require('../middleware/rateLimits');

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
    const defaults = getDefaultSystemSettings().prompts;
    const prompts = settings.prompts || defaults;
    // `defaults` ships alongside so the UI can offer "reset to default"
    // without hardcoding a second copy of the prompt text.
    res.json({ prompts, defaults, editable: EDITABLE_PROMPTS });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch prompts');
    res.status(500).json({ error: 'Failed to fetch prompts.' });
  }
});

// Editable content prompts. `beyondIntent` is deliberately absent: that tool
// is a nine-step chain whose prompt for each step is assembled from the
// previous step's output, so it has no single prompt to edit here.
const EDITABLE_PROMPTS = ['blogPost', 'pressRelease'];

router.post('/prompts', requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    for (const key of EDITABLE_PROMPTS) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        updates[key] = value.trim();
      }
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

// ---- /api-keys/test ----
// Validate a credential against the real provider. Accepts a value to test
// an unsaved key straight from the form; with none, tests what is stored for
// this user, so "does my saved key still work?" is answerable too.
router.post('/api-keys/test', tieredRateLimit('medium'), async (req, res) => {
  const userId = req.user.id;
  const { service, value, login, password, cx } = req.body || {};

  const resolved = async (name) =>
    typeof value === 'string' && value.trim()
      ? value.trim()
      : (await resolveApiKey(userId, name)).value;

  try {
    let result;
    switch (service) {
      case 'serper':
        result = await testSerper(await resolved('serper'));
        break;
      case 'claude':
        result = await testClaude(await resolved('claude'));
        break;
      case 'dataForSeo': {
        const useLogin =
          typeof login === 'string' && login.trim()
            ? login.trim()
            : (await resolveApiKey(userId, 'dataForSeoLogin')).value;
        const usePassword =
          typeof password === 'string' && password.trim()
            ? password.trim()
            : (await resolveApiKey(userId, 'dataForSeoPassword')).value;
        result = await testDataForSeo({ login: useLogin, password: usePassword });
        break;
      }
      case 'googlePlaces':
        result = await testGooglePlaces(await resolved('googlePlaces'));
        break;
      case 'googleSearch': {
        const useCx =
          typeof cx === 'string' && cx.trim()
            ? cx.trim()
            : (await resolveApiKey(userId, 'googleCx')).value;
        result = await testGoogleSearch({ key: await resolved('googleApiKey'), cx: useCx });
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown service.' });
    }
    // Always 200: the test ran. Whether the KEY is good is in the body, so a
    // rejected key is not reported as a failed request.
    res.json(result);
  } catch (err) {
    logger.error({ err, service }, 'API key test failed');
    res.status(500).json({ ok: false, reason: 'error', message: 'Test could not be run.' });
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

// Bring-your-own-key: every user saves keys onto their own account. Only the
// workspace-level OAuth client and the optional "share with the workspace"
// step stay admin-gated below.
router.post('/api-keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const payload = req.body || {};
    const userUpdates = [];
    const diskPayload = { apiKeys: {} };

    const assignUserSetting = (key, value, diskKey) => {
      const sanitized = typeof value === 'string' ? value.trim() : '';
      userUpdates.push({ key, value: sanitized });
      if (diskKey) {
        // The database row is encrypted by upsertUserSetting, but this disk
        // mirror was being written in the clear — so every user's provider
        // keys sat as plaintext in USERDATA_PATH/users/<id>/settings.json,
        // where a backup or filesystem read exposed them and MASTER_KEY
        // protected nothing. Encrypt here too; readers decrypt on the way out.
        diskPayload.apiKeys[diskKey] = sanitized ? encryptSecret(sanitized) : '';
      }
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
      // Admin keys double as the workspace fallback; a member's key is
      // theirs alone and must not overwrite it.
      if (isAdmin) systemPayload.apiKeys.serper = v;
    }
    if (Object.hasOwn(payload, 'claudeApiKey')) {
      const v = assignUserSetting('claude_api_key', payload.claudeApiKey, 'claude');
      if (isAdmin) systemPayload.apiKeys.claude = v;
    }
    if (isAdmin && Object.hasOwn(payload, 'googleOauthClientId')) {
      const v = typeof payload.googleOauthClientId === 'string' ? payload.googleOauthClientId.trim() : '';
      systemPayload.apiKeys.googleOauthClientId = v;
    }
    if (isAdmin && Object.hasOwn(payload, 'googleOauthClientSecret')) {
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

/** OAuth connection state for a user. Tokens are never returned — only
 *  whether one exists and which Google account it belongs to. */
async function connectionStatus(userId, prefix) {
  const rows = await dbAll(
    `SELECT setting_key, setting_value FROM user_settings
     WHERE user_id = ? AND setting_key IN (?, ?, ?)`,
    [userId, `${prefix}_access_token`, `${prefix}_refresh_token`, `${prefix}_google_email`],
  );
  const map = {};
  rows.forEach((row) => {
    map[row.setting_key] = row.setting_value || '';
  });
  return {
    connected: Boolean(map[`${prefix}_access_token`] || map[`${prefix}_refresh_token`]),
    email: map[`${prefix}_google_email`] || null,
  };
}

router.get('/api-keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Status only — never the key itself. Previously this returned raw
    // values, and the Google fields fell back to the ADMIN's key, so any
    // logged-in user could read the workspace admin's Google API key and CX
    // in plaintext from this endpoint.
    const keys = await getKeyStatuses(userId);

    const systemSettings = readSystemSettings();
    const apiKeys =
      systemSettings.apiKeys && typeof systemSettings.apiKeys === 'object'
        ? systemSettings.apiKeys
        : {};

    res.json({
      managed: true,
      isAdmin,
      // Per-service: { configured, masked, source: 'user'|'workspace'|'env' }.
      keys,
      quotas: {
        serperReviews: await getApiUsageSnapshot(userId, 'serper_reviews'),
      },
      // Workspace OAuth client — genuinely app-level, not a per-user key.
      // Only its presence is reported, never the secret.
      googleOauthStatus: {
        configured: Boolean(apiKeys.googleOauthClientId && apiKeys.googleOauthClientSecret),
        clientIdMasked: apiKeys.googleOauthClientId
          ? maskApiKey(apiKeys.googleOauthClientId)
          : '',
        canEdit: isAdmin,
      },
      ga4Status: await connectionStatus(userId, 'ga4'),
      gscStatus: await connectionStatus(userId, 'gsc'),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load API key status');
    res.status(500).json({ error: 'Failed to load API keys.' });
  }
});


module.exports = router;
