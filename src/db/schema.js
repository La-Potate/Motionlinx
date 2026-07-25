'use strict';

const logger = require('../utils/logger');
const { runMigrations } = require('./migrate');

const USER_LEVELS = ['trial', 'personal', 'business', 'agency', 'admin'];
const DEFAULT_USER_LEVEL = 'personal';

/**
 * Apply every pending DB migration. The promise resolves AFTER all migrations
 * have committed — so the legacy race where ALTER TABLEs were still in flight
 * when initSchema resolved is gone.
 *
 * `hooks` is kept for backward compatibility with src/app.js. Currently
 * unused — the bootstrap-admin migration handles what these hooks used to do.
 */
async function initSchema(_hooks = {}) {
  await runMigrations();
  // After migrations, normalize any user rows with an unknown role to the
  // default user level. Cheap, idempotent, and protects against stale data.
  const { dbRun } = require('../utils/dbAsync');
  try {
    const placeholders = USER_LEVELS.map(() => '?').join(', ');
    await dbRun(`UPDATE users SET role = ? WHERE role NOT IN (${placeholders})`, [
      DEFAULT_USER_LEVEL,
      ...USER_LEVELS,
    ]);
  } catch (err) {
    logger.warn({ err }, 'Failed to normalize user roles after migrations');
  }
}

module.exports = {
  initSchema,
  USER_LEVELS,
  DEFAULT_USER_LEVEL,
};
