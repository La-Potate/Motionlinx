'use strict';

const bcrypt = require('bcrypt');
const logger = require('../../utils/logger');
const { INITIAL_ADMIN_PASSWORD, isProd } = require('../../config/env');

/**
 * Bootstrap a default admin user on a fresh DB.
 *
 * - Production: requires INITIAL_ADMIN_PASSWORD env. If unset, logs a fatal
 *   warning and leaves the DB without an admin (you must seed one yourself).
 * - Dev: falls back to 'admin123' with a clear log warning.
 *
 * This migration is a no-op if any admin already exists (idempotent).
 */
async function up({ dbGet, dbRun }) {
  const existing = await dbGet("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  if (existing && existing.count > 0) {
    logger.info('Admin already exists — skipping bootstrap');
    return;
  }

  let bootstrapPassword = INITIAL_ADMIN_PASSWORD;
  if (!bootstrapPassword) {
    if (isProd) {
      logger.error(
        'No admin users exist and INITIAL_ADMIN_PASSWORD is not set. ' +
          'Refusing to auto-create an admin in production. Set the env var and ' +
          're-run, or seed an admin manually via the database.',
      );
      return;
    }
    bootstrapPassword = 'admin123';
    logger.warn(
      'No INITIAL_ADMIN_PASSWORD — creating dev admin with placeholder "admin123". ' +
        'Change immediately via Settings → Profile.',
    );
  } else {
    logger.info('Creating default admin from INITIAL_ADMIN_PASSWORD');
  }

  const hash = bcrypt.hashSync(bootstrapPassword, 12);
  await dbRun('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    'admin',
    'admin@seo-toolkit.local',
    hash,
    'admin',
  ]);
  logger.info('Default admin created (username: admin)');
}

module.exports = { up };
