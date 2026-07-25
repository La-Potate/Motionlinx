'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { USER_FILES_ROOT } = require('../../storage/paths');

/**
 * Settings have lived in two places forever:
 *   - `user_settings` SQLite table (canonical)
 *   - `users/<id>/settings.json` on disk (per-user JSON, also stores apiKeys)
 *
 * Every credential lookup reads DB first then falls back to disk. This
 * migration copies any disk-only apiKeys into `user_settings` so the DB
 * becomes the single source of truth. The disk file is left alone (still
 * holds profile mirror + preferences; future cleanup can deprecate it
 * fully). Idempotent — uses ON CONFLICT DO NOTHING.
 */

// Map disk `apiKeys.<diskKey>` → DB `user_settings.setting_key`. Mirrors
// API_KEY_DISK_MAP in src/routes/settings.js (inverted).
const DISK_TO_DB_KEYS = {
  googlePlaces: 'googlePlaces_api_key',
  dataForSeo: 'dataForSeo_api_key',
  dataForSeoLogin: 'dataForSeo_login',
  dataForSeoPassword: 'dataForSeo_password',
  googleApiKey: 'google_api_key',
  googleCx: 'google_cx',
  serper: 'serper_api_key',
  claude: 'claude_api_key',
};

async function up({ dbRun }) {
  if (!fs.existsSync(USER_FILES_ROOT)) return;

  let userDirs;
  try {
    userDirs = fs.readdirSync(USER_FILES_ROOT, { withFileTypes: true });
  } catch (err) {
    logger.warn({ err: err.message }, 'apikeys disk→DB: failed to read users dir');
    return;
  }

  let copied = 0;
  for (const entry of userDirs) {
    if (!entry.isDirectory()) continue;
    const userId = Number.parseInt(entry.name, 10);
    if (!Number.isFinite(userId)) continue;
    const settingsFile = path.join(USER_FILES_ROOT, entry.name, 'settings.json');
    if (!fs.existsSync(settingsFile)) continue;

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch (err) {
      logger.warn({ userId, err: err.message }, 'apikeys disk→DB: invalid settings.json');
      continue;
    }

    const apiKeys = parsed?.apiKeys || {};
    for (const [diskKey, dbKey] of Object.entries(DISK_TO_DB_KEYS)) {
      const value = apiKeys[diskKey];
      if (typeof value !== 'string' || !value.trim()) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(
          `INSERT INTO user_settings (user_id, setting_key, setting_value)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, setting_key) DO NOTHING`,
          [userId, dbKey, value],
        );
        copied += 1;
      } catch (err) {
        logger.warn(
          { userId, dbKey, err: err.message },
          'apikeys disk→DB: insert failed',
        );
      }
    }
  }
  if (copied > 0) {
    logger.info({ copied }, 'apikeys disk→DB: copied legacy keys into user_settings');
  }
}

module.exports = { up };
