'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const mergeDeep = require('../utils/mergeDeep');
const { ensureDir, USER_FILES_ROOT } = require('./paths');

function getUserDir(userId) {
  return path.join(USER_FILES_ROOT, String(userId));
}

/**
 * Create a complete per-user directory tree.
 *   USERDATA/users/<userId>/
 *     settings.json
 *     projects/  whiteboard/  notes/  heatmaps/  exports/
 */
function ensureUserDir(userId) {
  if (userId === undefined || userId === null) return;
  const userDir = getUserDir(userId);
  ensureDir(userDir);

  for (const sub of ['projects', 'whiteboard', 'notes', 'heatmaps', 'exports']) {
    ensureDir(path.join(userDir, sub));
  }

  const settingsFile = path.join(userDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    const now = new Date().toISOString();
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ createdAt: now, updatedAt: now, apiKeys: {}, preferences: {} }, null, 2),
    );
  }
}

/**
 * @deprecated Disk settings are now a legacy fallback only. The `user_settings`
 * SQLite table is the source of truth for keyed settings (api keys, etc.); the
 * disk file is kept around for preferences mirror + back-compat reads.
 * Migration 005 already copied any disk-only apiKeys into the DB on boot.
 * New code should query `user_settings` directly via dbGet/dbAll.
 */
function readUserSettingsFromDisk(userId) {
  try {
    const file = path.join(getUserDir(userId), 'settings.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    logger.error({ err, userId }, 'Failed to read user settings from disk');
    return null;
  }
}

function writeUserSettingsToDisk(userId, payload) {
  if (userId === undefined || userId === null) return;
  try {
    ensureUserDir(userId);
    const file = path.join(getUserDir(userId), 'settings.json');
    let current = {};
    if (fs.existsSync(file)) {
      try {
        current = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        current = {};
      }
    }
    const merged = mergeDeep(current, payload);
    const now = new Date().toISOString();
    merged.updatedAt = now;
    if (!merged.createdAt) merged.createdAt = now;
    fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  } catch (err) {
    logger.error({ err, userId }, 'Failed to write user settings to disk');
  }
}

function archiveUserDir(userId) {
  if (userId === undefined || userId === null) return;
  try {
    const dir = getUserDir(userId);
    if (!fs.existsSync(dir)) return;
    const archiveName = `${userId}_deleted_${Date.now()}`;
    const target = path.join(USER_FILES_ROOT, archiveName);
    fs.renameSync(dir, target);
  } catch (err) {
    logger.error({ err, userId }, 'Failed to archive user directory');
  }
}

module.exports = {
  getUserDir,
  ensureUserDir,
  readUserSettingsFromDisk,
  writeUserSettingsToDisk,
  archiveUserDir,
};
