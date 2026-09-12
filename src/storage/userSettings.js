'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const mergeDeep = require('../utils/mergeDeep');
const { ensureDir, USER_FILES_ROOT } = require('./paths');
const { decryptSecret } = require('../utils/crypto');

function getUserDir(userId) {
  return path.join(USER_FILES_ROOT, String(userId));
}

/**
 * Create a complete per-user directory tree.
 *   USERDATA/users/<userId>/
 *     settings.json
 *     projects/  notes/  heatmaps/  exports/
 */
function ensureUserDir(userId) {
  if (userId === undefined || userId === null) return;
  const userDir = getUserDir(userId);
  ensureDir(userDir);

  for (const sub of ['projects', 'notes', 'heatmaps', 'exports']) {
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

/**
 * The `apiKeys` block from a user's settings.json, decrypted.
 *
 * This file is a legacy mirror of the `user_settings` table and is consulted
 * only when the database has no value. Its secrets used to be written in the
 * clear while the database rows were encrypted, so anyone reading the data
 * volume or a backup could lift every user's provider keys. They are encrypted
 * on write now, and every read goes through here.
 *
 * decryptSecret passes plaintext through untouched, so files written before
 * that change keep working and upgrade themselves the next time they are saved.
 */
function readUserApiKeysFromDisk(userId) {
  const disk = readUserSettingsFromDisk(userId);
  const raw = disk && typeof disk.apiKeys === 'object' && disk.apiKeys ? disk.apiKeys : {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = typeof value === 'string' ? decryptSecret(value) || '' : value;
  }
  return out;
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
  readUserApiKeysFromDisk,
  writeUserSettingsToDisk,
  archiveUserDir,
};
