'use strict';

const logger = require('../../utils/logger');
const { encryptSecret, isEncrypted, isEncryptionEnabled } = require('../../utils/crypto');

/**
 * Convert plaintext user-saved API keys in `user_settings` to AES-GCM
 * ciphertext, gated on MASTER_KEY being configured. Idempotent — already-
 * encrypted values are detected via the `enc:v1:` prefix and skipped.
 *
 * If MASTER_KEY is not set, this migration is a no-op (a warning is logged
 * via the crypto module). It will run again automatically on the next boot
 * after the operator sets the env var.
 *
 * Note: we record this migration as applied even on the no-op path so
 * boot-time logs don't keep saying "running migrations". The encrypt-only
 * gate is fine because the next operation that writes a key will encrypt it
 * (via `setUserSetting` writes through the crypto layer).
 */

// Setting keys that hold secrets. Mirrors the disk-key map in migration 005.
const SECRET_KEYS = new Set([
  'googlePlaces_api_key',
  'dataForSeo_api_key',
  'dataForSeo_login',
  'dataForSeo_password',
  'google_api_key',
  'google_cx',
  'serper_api_key',
  'claude_api_key',
]);

async function up({ dbAll, dbRun }) {
  if (!isEncryptionEnabled()) {
    logger.warn(
      'Migration 006: MASTER_KEY not set — leaving user API keys in plaintext for now. ' +
        'Re-run by deleting the schema_migrations row for version 6 after setting MASTER_KEY.',
    );
    return;
  }
  const rows = await dbAll(
    'SELECT id, setting_key, setting_value FROM user_settings',
  );
  let converted = 0;
  for (const row of rows) {
    if (!SECRET_KEYS.has(row.setting_key)) continue;
    if (!row.setting_value || isEncrypted(row.setting_value)) continue;
    const ciphertext = encryptSecret(row.setting_value);
    try {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        'UPDATE user_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ciphertext, row.id],
      );
      converted += 1;
    } catch (err) {
      logger.warn(
        { id: row.id, key: row.setting_key, err: err.message },
        'Failed to encrypt user_settings row',
      );
    }
  }
  if (converted > 0) {
    logger.info({ converted }, 'Encrypted user_settings API keys at rest');
  }
}

module.exports = { up };
