'use strict';

const logger = require('../utils/logger');
const { db } = require('../utils/dbAsync');
const { readSystemSettings, writeSystemSettings } = require('../storage/systemSettings');
const { encryptSecret, decryptSecret } = require('../utils/crypto');

/**
 * On startup, restore service API keys (Claude, Serper) from the most recent
 * admin's `user_settings` row if they're missing from system-settings.json.
 * Keeps keys persistent across app-data wipes / container rebuilds.
 */
function syncApiKeysFromDatabase() {
  const settings = readSystemSettings();
  const currentApiKeys =
    settings.apiKeys && typeof settings.apiKeys === 'object' ? settings.apiKeys : {};

  if (!currentApiKeys.claude && !process.env.CLAUDE_API_KEY) {
    db.get(
      `SELECT us.setting_value FROM user_settings us
       JOIN users u ON us.user_id = u.id
       WHERE u.role = 'admin' AND us.setting_key = 'claude_api_key'
       ORDER BY us.updated_at DESC LIMIT 1`,
      [],
      (err, row) => {
        if (!err && row?.setting_value) {
          const plaintext = decryptSecret(row.setting_value);
          if (!plaintext) return;
          logger.info('[startup] Restoring Claude API key from database backup');
          writeSystemSettings({
            apiKeys: { ...currentApiKeys, claude: encryptSecret(plaintext) },
          });
        }
      },
    );
  }

  if (!currentApiKeys.serper) {
    db.get(
      `SELECT us.setting_value FROM user_settings us
       JOIN users u ON us.user_id = u.id
       WHERE u.role = 'admin' AND us.setting_key = 'serper_api_key'
       ORDER BY us.updated_at DESC LIMIT 1`,
      [],
      (err, row) => {
        if (!err && row?.setting_value) {
          const plaintext = decryptSecret(row.setting_value);
          if (!plaintext) return;
          logger.info('[startup] Restoring Serper API key from database backup');
          const freshSettings = readSystemSettings();
          const freshApiKeys =
            freshSettings.apiKeys && typeof freshSettings.apiKeys === 'object'
              ? freshSettings.apiKeys
              : {};
          writeSystemSettings({
            apiKeys: { ...freshApiKeys, serper: encryptSecret(plaintext) },
          });
        }
      },
    );
  }
}

module.exports = { syncApiKeysFromDatabase };
